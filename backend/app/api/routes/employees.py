import csv
import logging
import re
from io import StringIO
from uuid import UUID, uuid4
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings
from app.models.company import Company
from app.models.site import Site
from app.models.user import User
from app.models.workforce import Department, Employee, EmployeeDocument, Position
from app.schemas.workforce import (
    DepartmentCreate,
    DepartmentResponse,
    EmployeeAccountCreate,
    EmployeeCreate,
    EmployeeDocumentResponse,
    EmployeeResponse,
    EmployeeUpdate,
    PositionCreate,
    PositionResponse,
)
from pydantic import ValidationError
from app.security.dependencies import CurrentUser, DBSession
from app.security.password import hash_password
from app.security.permissions import (
    HR_ROLES,
    WORKFORCE_ROLES,
    ensure_site_scope,
    require_role,
    resolve_company_id,
)
from app.services.audit import record_audit
from app.services.csv_export import safe_csv_cell
from app.services.object_storage import get_object_storage_bucket, get_object_store


router = APIRouter(tags=["Workforce"])
logger = logging.getLogger(__name__)
MAX_EMPLOYEE_DOCUMENT_BYTES = 10 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": (".pdf", b"%PDF-"),
    "image/jpeg": (".jpg", b"\xff\xd8\xff"),
    "image/png": (".png", b"\x89PNG\r\n\x1a\n"),
}


def employee_document_access(db, employee_id: UUID, current_user: User) -> Employee:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role == "EMPLOYEE":
        if employee.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(current_user, HR_ROLES)
        resolve_company_id(current_user, employee.company_id)
    return employee


def safe_document_filename(filename: str | None) -> str:
    normalized = (filename or "upload").replace("\\", "/").rsplit("/", 1)[-1]
    normalized = "".join(
        character
        for character in normalized
        if character.isprintable() and character not in {'"', "'", "`"}
    )
    normalized = re.sub(r"[^\w.\- ()]", "_", normalized, flags=re.UNICODE).strip(" .")
    return (normalized or "upload")[:180]


def ensure_reference_scope(db, company_id: UUID, site_id, department_id, position_id):
    if site_id and not db.query(Site.id).filter(
        Site.id == site_id, Site.company_id == company_id
    ).first():
        raise HTTPException(status_code=422, detail="Site does not belong to the company")
    if department_id and not db.query(Department.id).filter(
        Department.id == department_id, Department.company_id == company_id
    ).first():
        raise HTTPException(status_code=422, detail="Department does not belong to the company")
    if position_id and not db.query(Position.id).filter(
        Position.id == position_id, Position.company_id == company_id
    ).first():
        raise HTTPException(status_code=422, detail="Position does not belong to the company")


@router.get("/departments", response_model=list[DepartmentResponse])
def list_departments(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
):
    target_company = resolve_company_id(current_user, company_id)
    return db.query(Department).filter(
        Department.company_id == target_company
    ).order_by(Department.name).all()


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
def create_department(
    payload: DepartmentCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    company_id = resolve_company_id(current_user, payload.company_id)
    if not db.query(Company.id).filter(
        Company.id == company_id,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")
    department = Department(company_id=company_id, name=payload.name.strip())
    db.add(department)
    try:
        db.commit()
        db.refresh(department)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Department already exists") from exc
    record_audit(
        db, current_user, "department.created", "department", department.id,
        company_id=company_id,
    )
    db.commit()
    return department


@router.get("/positions", response_model=list[PositionResponse])
def list_positions(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
):
    target_company = resolve_company_id(current_user, company_id)
    return db.query(Position).filter(
        Position.company_id == target_company
    ).order_by(Position.title).all()


@router.post("/positions", response_model=PositionResponse, status_code=201)
def create_position(
    payload: PositionCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    company_id = resolve_company_id(current_user, payload.company_id)
    if not db.query(Company.id).filter(
        Company.id == company_id,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")
    position = Position(company_id=company_id, title=payload.title.strip())
    db.add(position)
    try:
        db.commit()
        db.refresh(position)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position already exists") from exc
    record_audit(
        db, current_user, "position.created", "position", position.id,
        company_id=company_id,
    )
    db.commit()
    return position


@router.get("/employees", response_model=list[EmployeeResponse])
def list_employees(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    site_id: UUID | None = None,
    search: str | None = Query(default=None, max_length=255),
    employment_status: str | None = Query(default=None, pattern="^(ACTIVE|INACTIVE|TERMINATED)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    if current_user.role == "EMPLOYEE":
        return db.query(Employee).filter(
            Employee.user_id == current_user.id
        ).all()
    require_role(current_user, WORKFORCE_ROLES)
    target_company = resolve_company_id(current_user, company_id)
    query = db.query(Employee).filter(Employee.company_id == target_company)
    if current_user.role == "SUPERVISOR":
        if current_user.site_id is None:
            raise HTTPException(status_code=403, detail="Supervisor site is not configured")
        if site_id is not None and site_id != current_user.site_id:
            raise HTTPException(status_code=403, detail="Site access denied")
        query = query.filter(Employee.site_id == current_user.site_id)
    if site_id:
        query = query.filter(Employee.site_id == site_id)
    if employment_status:
        query = query.filter(Employee.employment_status == employment_status)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Employee.full_name.ilike(pattern)
            | Employee.employee_code.ilike(pattern)
            | Employee.email.ilike(pattern)
        )
    return query.order_by(Employee.full_name).offset(offset).limit(limit).all()


@router.post("/employees", response_model=EmployeeResponse, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    company_id = resolve_company_id(current_user, payload.company_id)
    if not db.query(Company.id).filter(
        Company.id == company_id, Company.is_active.is_(True)
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")
    ensure_reference_scope(
        db, company_id, payload.site_id, payload.department_id, payload.position_id
    )
    employee = Employee(
        **payload.model_dump(
            exclude={"company_id", "employee_code", "full_name", "email"}
        ),
        company_id=company_id,
        employee_code=payload.employee_code.strip().upper(),
        full_name=payload.full_name.strip(),
        email=str(payload.email) if payload.email else None,
    )
    db.add(employee)
    try:
        db.flush()
        record_audit(
            db,
            current_user,
            "employee.created",
            "employee",
            employee.id,
            company_id=company_id,
        )
        db.commit()
        db.refresh(employee)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Employee code or account is already in use"
        ) from exc
    return employee


@router.get("/employees/export.csv")
def export_employees(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
):
    require_role(current_user, HR_ROLES)
    target_company = resolve_company_id(current_user, company_id)
    employees = db.query(Employee).filter(
        Employee.company_id == target_company
    ).order_by(Employee.employee_code).limit(10001).all()
    if len(employees) > 10000:
        raise HTTPException(
            status_code=413,
            detail="Employee export is limited to 10,000 rows per request",
        )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "employee_code",
            "full_name",
            "email",
            "phone",
            "emergency_contact_name",
            "emergency_contact_phone",
            "hire_date",
            "employment_status",
            "contract_type",
            "currency",
        ]
    )
    for employee in employees:
        writer.writerow(
            [
                safe_csv_cell(employee.employee_code),
                safe_csv_cell(employee.full_name),
                safe_csv_cell(employee.email),
                safe_csv_cell(employee.phone),
                safe_csv_cell(employee.emergency_contact_name),
                safe_csv_cell(employee.emergency_contact_phone),
                employee.hire_date.isoformat(),
                safe_csv_cell(employee.employment_status),
                safe_csv_cell(employee.contract_type),
                safe_csv_cell(employee.currency),
            ]
        )
    record_audit(
        db,
        current_user,
        "employee.csv_exported",
        "employee_export",
        company_id=target_company,
    )
    db.commit()
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="employees-{target_company}.csv"'
        },
    )


@router.post("/employees/import.csv", status_code=status.HTTP_201_CREATED)
async def import_employees_csv(
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
    company_id: UUID | None = None,
):
    require_role(current_user, HR_ROLES)
    target_company = resolve_company_id(current_user, company_id)
    if not db.query(Company.id).filter(
        Company.id == target_company,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Upload a CSV file")
    raw_content = await file.read(5 * 1024 * 1024 + 1)
    if len(raw_content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV file must be 5 MB or smaller")
    try:
        content = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="CSV must use UTF-8 encoding") from exc
    reader = csv.DictReader(StringIO(content))
    required_columns = {"employee_code", "full_name", "hire_date", "base_salary", "currency"}
    fieldnames = [name.strip() if name else "" for name in (reader.fieldnames or [])]
    if not fieldnames or len(set(fieldnames)) != len(fieldnames):
        raise HTTPException(status_code=422, detail="CSV column names must be present and unique")
    reader.fieldnames = fieldnames
    if not required_columns.issubset(set(fieldnames)):
        raise HTTPException(
            status_code=422,
            detail=f"CSV must include columns: {', '.join(sorted(required_columns))}",
        )
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=422, detail="CSV contains no employee rows")
    if len(rows) > 5000:
        raise HTTPException(status_code=413, detail="CSV is limited to 5,000 rows")

    pending: list[Employee] = []
    seen_codes: set[str] = set()
    for row_number, row in enumerate(rows, start=2):
        if None in row:
            raise HTTPException(
                status_code=422,
                detail=f"Row {row_number}: unexpected extra CSV columns",
            )
        try:
            payload = EmployeeCreate(
                employee_code=row.get("employee_code"),
                full_name=row.get("full_name"),
                email=(row.get("email") or "").strip() or None,
                phone=(row.get("phone") or "").strip() or None,
                photo_url=(row.get("photo_url") or "").strip() or None,
                emergency_contact_name=(row.get("emergency_contact_name") or "").strip() or None,
                emergency_contact_phone=(row.get("emergency_contact_phone") or "").strip() or None,
                hire_date=(row.get("hire_date") or "").strip(),
                employment_status=(row.get("employment_status") or "ACTIVE").strip().upper(),
                contract_type=(row.get("contract_type") or "PERMANENT").strip().upper(),
                base_salary=Decimal((row.get("base_salary") or "").strip()),
                monthly_allowances=Decimal((row.get("monthly_allowances") or "0").strip()),
                monthly_bonus=Decimal((row.get("monthly_bonus") or "0").strip()),
                monthly_deductions=Decimal((row.get("monthly_deductions") or "0").strip()),
                currency=(row.get("currency") or "").strip().upper(),
                payment_method=(row.get("payment_method") or "").strip() or None,
                bank_account_last4=(row.get("bank_account_last4") or "").strip() or None,
                site_id=(row.get("site_id") or "").strip() or None,
                department_id=(row.get("department_id") or "").strip() or None,
                position_id=(row.get("position_id") or "").strip() or None,
            )
        except (ValueError, ArithmeticError, ValidationError) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Row {row_number}: invalid employee data",
            ) from exc
        code = payload.employee_code.strip().upper()
        if code in seen_codes or db.query(Employee.id).filter(
            Employee.company_id == target_company,
            Employee.employee_code == code,
        ).first():
            raise HTTPException(
                status_code=409,
                detail=f"Row {row_number}: employee code already exists",
            )
        ensure_reference_scope(
            db, target_company, payload.site_id, payload.department_id, payload.position_id
        )
        seen_codes.add(code)
        pending.append(
            Employee(
                **payload.model_dump(
                    exclude={"company_id", "employee_code", "full_name", "email"}
                ),
                company_id=target_company,
                employee_code=code,
                full_name=payload.full_name.strip(),
                email=str(payload.email) if payload.email else None,
            )
        )
    db.add_all(pending)
    try:
        db.flush()
        record_audit(
            db,
            current_user,
            "employee.csv_imported",
            "employee_import",
            company_id=target_company,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee import conflicts with existing company records",
        ) from exc
    return {"imported": len(pending)}


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role == "EMPLOYEE":
        if employee.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(current_user, WORKFORCE_ROLES)
        resolve_company_id(current_user, employee.company_id)
        ensure_site_scope(current_user, employee.site_id)
    return employee


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    changes = payload.model_dump(exclude_unset=True)
    if current_user.role == "EMPLOYEE":
        if employee.user_id != current_user.id or set(changes) - {
            "phone", "photo_url", "emergency_contact_name", "emergency_contact_phone"
        }:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(current_user, HR_ROLES)
        resolve_company_id(current_user, employee.company_id)
        ensure_reference_scope(
            db,
            employee.company_id,
            changes.get("site_id", employee.site_id),
            changes.get("department_id", employee.department_id),
            changes.get("position_id", employee.position_id),
        )
    for key, value in changes.items():
        if key == "email" and value is not None:
            value = str(value)
        setattr(employee, key, value)
    record_audit(
        db, current_user, "employee.updated", "employee", employee.id, company_id=employee.company_id
    )
    try:
        db.commit()
        db.refresh(employee)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Employee data conflicts with an existing record") from exc
    return employee


@router.post("/employees/{employee_id}/account", response_model=EmployeeResponse, status_code=201)
def create_employee_account(
    employee_id: UUID,
    payload: EmployeeAccountCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    resolve_company_id(current_user, employee.company_id)
    if employee.user_id:
        raise HTTPException(status_code=409, detail="Employee already has an account")
    if not employee.email:
        raise HTTPException(status_code=422, detail="Employee email is required")
    user = User(
        company_id=employee.company_id,
        username=payload.username,
        email=employee.email,
        password_hash=hash_password(payload.password),
        full_name=employee.full_name,
        role="EMPLOYEE",
    )
    db.add(user)
    try:
        db.flush()
        employee.user_id = user.id
        record_audit(
            db, current_user, "employee.account_created", "employee", employee.id, company_id=employee.company_id
        )
        db.commit()
        db.refresh(employee)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already in use") from exc
    return employee


@router.get(
    "/employees/{employee_id}/documents",
    response_model=list[EmployeeDocumentResponse],
)
def list_employee_documents(
    employee_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    employee = employee_document_access(db, employee_id, current_user)
    return (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.employee_id == employee_id)
        .order_by(EmployeeDocument.created_at.desc())
        .all()
    )


@router.post(
    "/employees/{employee_id}/documents",
    response_model=EmployeeDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_employee_document(
    employee_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
    category: str = Form(default="DOCUMENT", pattern="^(PHOTO|DOCUMENT)$"),
):
    employee = employee_document_access(db, employee_id, current_user)
    if employee.employment_status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Documents cannot be added to an inactive employee")
    content_type = (file.content_type or "").lower()
    file_type = ALLOWED_DOCUMENT_TYPES.get(content_type)
    if (
        file_type is None
        or (category == "PHOTO" and not content_type.startswith("image/"))
    ):
        raise HTTPException(status_code=415, detail="Only PDF, JPEG, and PNG files are accepted")
    raw_content = await file.read(MAX_EMPLOYEE_DOCUMENT_BYTES + 1)
    if len(raw_content) > MAX_EMPLOYEE_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Employee files must be 10 MB or smaller")
    if not raw_content.startswith(file_type[1]):
        raise HTTPException(status_code=415, detail="File content does not match the declared file type")
    filename = safe_document_filename(file.filename)
    if not filename.lower().endswith(file_type[0]):
        raise HTTPException(status_code=415, detail="Filename extension does not match the file content")
    try:
        bucket = get_object_storage_bucket()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Employee document storage is not configured",
        ) from exc

    document = EmployeeDocument(
        employee_id=employee.id,
        uploaded_by_user_id=current_user.id,
        category=category,
        original_filename=filename,
        content_type=content_type,
        object_key=(
            f"companies/{employee.company_id}/employees/{employee.id}/"
            f"{uuid4().hex}{file_type[0]}"
        ),
        size_bytes=len(raw_content),
    )
    db.add(document)
    try:
        db.flush()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save employee document metadata") from exc

    put_options = {
        "Bucket": bucket,
        "Key": document.object_key,
        "Body": raw_content,
        "ContentType": content_type,
        "Tagging": f"category={category.lower()}",
    }
    if settings.object_storage_kms_key_id:
        put_options.update(
            {
                "ServerSideEncryption": "aws:kms",
                "SSEKMSKeyId": settings.object_storage_kms_key_id,
            }
        )
    else:
        put_options["ServerSideEncryption"] = "AES256"
    try:
        get_object_store().put_object(**put_options)
    except (BotoCoreError, ClientError) as exc:
        db.rollback()
        logger.exception(
            "Employee document upload failed",
            extra={"employee_id": str(employee.id), "document_id": str(document.id)},
        )
        raise HTTPException(status_code=502, detail="Employee document storage upload failed") from exc

    record_audit(
        db,
        current_user,
        "employee.document_uploaded",
        "employee_document",
        document.id,
        company_id=employee.company_id,
    )
    try:
        db.commit()
        db.refresh(document)
    except SQLAlchemyError as exc:
        db.rollback()
        try:
            storage.delete_object(Bucket=bucket, Key=document.object_key)
        except (BotoCoreError, ClientError):
            logger.exception(
                "Orphaned employee document cleanup failed",
                extra={"employee_id": str(employee.id), "document_id": str(document.id)},
            )
        raise HTTPException(status_code=500, detail="Could not save employee document metadata") from exc
    return document


@router.get("/employees/{employee_id}/documents/{document_id}/download")
def get_employee_document_download(
    employee_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    employee = employee_document_access(db, employee_id, current_user)
    document = db.query(EmployeeDocument).filter(
        EmployeeDocument.id == document_id,
        EmployeeDocument.employee_id == employee_id,
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Employee document not found")
    try:
        bucket = get_object_storage_bucket()
        url = get_object_store().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": document.object_key,
                "ResponseContentType": document.content_type,
                "ResponseContentDisposition": (
                    f'attachment; filename="{document.original_filename}"'
                ),
            },
            ExpiresIn=60,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Employee document storage is not configured",
        ) from exc
    except (BotoCoreError, ClientError) as exc:
        logger.exception(
            "Employee document download signing failed",
            extra={"employee_id": str(employee.id), "document_id": str(document.id)},
        )
        raise HTTPException(status_code=502, detail="Could not prepare employee document download") from exc
    record_audit(
        db,
        current_user,
        "employee.document_downloaded",
        "employee_document",
        document.id,
        company_id=employee.company_id,
    )
    db.commit()
    return {"url": url, "expires_in": 60}
