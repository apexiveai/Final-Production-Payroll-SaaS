from datetime import date, datetime, timezone
from decimal import Decimal
import csv
from io import StringIO
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.company import Company
from app.models.site import Site
from app.models.user import User
from app.models.workforce import (
    Attendance,
    AuditLog,
    Employee,
    LeaveRequest,
    LeaveType,
    Shift,
    ShiftAssignment,
)
from app.schemas.workforce import (
    AttendanceCorrection,
    AttendanceCreate,
    AttendanceResponse,
    LeaveDecision,
    LeaveRequestCreate,
    LeaveRequestResponse,
    LeaveTypeCreate,
    LeaveTypeResponse,
    ShiftAssignmentCreate,
    ShiftAssignmentResponse,
    ShiftCreate,
    ShiftResponse,
)
from app.security.dependencies import CurrentUser, DBSession
from app.security.permissions import (
    HR_ROLES,
    REVIEW_ROLES,
    WORKFORCE_ROLES,
    ensure_site_scope,
    require_role,
    resolve_company_id,
)
from app.services.audit import record_audit
from app.services.csv_export import safe_csv_cell


router = APIRouter(tags=["Attendance, Shifts, Leave, Audit"])


def employee_access(db, employee_id: UUID, user: User) -> Employee:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if user.role == "EMPLOYEE":
        if employee.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(user, WORKFORCE_ROLES)
        resolve_company_id(user, employee.company_id)
        ensure_site_scope(user, employee.site_id)
    return employee


def ensure_active_company(db, company_id: UUID) -> None:
    if not db.query(Company.id).filter(
        Company.id == company_id,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")


def days_inclusive(first: date, last: date) -> int:
    return (last - first).days + 1


@router.get("/shifts", response_model=list[ShiftResponse])
def list_shifts(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
):
    target_company = resolve_company_id(current_user, company_id)
    return db.query(Shift).filter(
        Shift.company_id == target_company
    ).order_by(Shift.name).all()


@router.post("/shifts", response_model=ShiftResponse, status_code=201)
def create_shift(
    payload: ShiftCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    company_id = resolve_company_id(current_user, payload.company_id)
    ensure_active_company(db, company_id)
    shift = Shift(company_id=company_id, **payload.model_dump(exclude={"company_id"}))
    db.add(shift)
    try:
        db.flush()
        record_audit(db, current_user, "shift.created", "shift", shift.id, company_id=company_id)
        db.commit()
        db.refresh(shift)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Shift name already exists") from exc
    return shift


@router.post("/shifts/assignments", status_code=201)
def assign_shift(
    payload: ShiftAssignmentCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    employee = employee_access(db, payload.employee_id, current_user)
    shift = db.query(Shift).filter(
        Shift.id == payload.shift_id,
        Shift.company_id == employee.company_id,
    ).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found for employee company")
    assignment = ShiftAssignment(**payload.model_dump())
    db.add(assignment)
    try:
        db.flush()
        record_audit(
            db, current_user, "shift.assigned", "shift_assignment", assignment.id,
            company_id=employee.company_id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Employee already has a shift that day") from exc
    return {"id": str(assignment.id), "employee_id": str(employee.id), "shift_id": str(shift.id), "work_date": assignment.work_date}


@router.get("/shifts/assignments", response_model=list[ShiftAssignmentResponse])
def list_shift_assignments(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    site_id: UUID | None = None,
    employee_id: UUID | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    target_company = resolve_company_id(current_user, company_id)
    query = (
        db.query(ShiftAssignment, Employee, Shift)
        .join(Employee, ShiftAssignment.employee_id == Employee.id)
        .join(Shift, ShiftAssignment.shift_id == Shift.id)
        .filter(Employee.company_id == target_company)
    )
    if current_user.role == "SUPERVISOR":
        if current_user.site_id is None:
            raise HTTPException(status_code=403, detail="Supervisor site is not configured")
        if site_id is not None and site_id != current_user.site_id:
            raise HTTPException(status_code=403, detail="Site access denied")
        query = query.filter(Employee.site_id == current_user.site_id)
    elif current_user.role == "EMPLOYEE":
        query = query.filter(Employee.user_id == current_user.id)
    elif current_user.role not in WORKFORCE_ROLES:
        raise HTTPException(status_code=403, detail="Shift access denied")
    if site_id is not None:
        query = query.filter(Employee.site_id == site_id)
    if employee_id is not None:
        query = query.filter(ShiftAssignment.employee_id == employee_id)
    if starts_on is not None:
        query = query.filter(ShiftAssignment.work_date >= starts_on)
    if ends_on is not None:
        query = query.filter(ShiftAssignment.work_date <= ends_on)
    if starts_on is not None and ends_on is not None and starts_on > ends_on:
        raise HTTPException(status_code=422, detail="starts_on must be on or before ends_on")
    return [
        {
            "id": assignment.id,
            "employee_id": employee.id,
            "employee_code": employee.employee_code,
            "employee_name": employee.full_name,
            "site_id": employee.site_id,
            "shift_id": shift.id,
            "shift_name": shift.name,
            "shift_type": shift.shift_type,
            "starts_at": shift.starts_at,
            "ends_at": shift.ends_at,
            "work_date": assignment.work_date,
        }
        for assignment, employee, shift in query.order_by(
            ShiftAssignment.work_date.desc(), Employee.employee_code
        ).offset(offset).limit(limit).all()
    ]


@router.get("/attendance", response_model=list[AttendanceResponse])
def list_attendance(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    site_id: UUID | None = None,
    employee_id: UUID | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    query = db.query(Attendance).join(Employee)
    if current_user.role == "EMPLOYEE":
        query = query.filter(Employee.user_id == current_user.id)
    else:
        require_role(current_user, WORKFORCE_ROLES)
        target_company = resolve_company_id(current_user, company_id)
        query = query.filter(Employee.company_id == target_company)
        if current_user.role == "SUPERVISOR":
            if current_user.site_id is None:
                raise HTTPException(status_code=403, detail="Supervisor site is not configured")
            if site_id is not None and site_id != current_user.site_id:
                raise HTTPException(status_code=403, detail="Site access denied")
            query = query.filter(Employee.site_id == current_user.site_id)
    if site_id:
        query = query.filter(Employee.site_id == site_id)
    if employee_id:
        query = query.filter(Attendance.employee_id == employee_id)
    if starts_on:
        query = query.filter(Attendance.work_date >= starts_on)
    if ends_on:
        query = query.filter(Attendance.work_date <= ends_on)
    return query.order_by(Attendance.work_date.desc()).offset(offset).limit(limit).all()


@router.post("/attendance", response_model=AttendanceResponse, status_code=201)
def create_attendance(
    payload: AttendanceCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES | {"SUPERVISOR"})
    employee_access(db, payload.employee_id, current_user)
    attendance = Attendance(**payload.model_dump())
    db.add(attendance)
    try:
        db.flush()
        record_audit(
            db, current_user, "attendance.created", "attendance", attendance.id,
            company_id=db.query(Employee.company_id).filter(
                Employee.id == attendance.employee_id
            ).scalar(),
        )
        db.commit()
        db.refresh(attendance)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Attendance already exists for this date") from exc
    return attendance


@router.post("/attendance/import.csv")
async def import_attendance_csv(
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
    company_id: UUID | None = None,
):
    require_role(current_user, HR_ROLES | {"SUPERVISOR"})
    target_company = resolve_company_id(current_user, company_id)
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
    required_columns = {
        "employee_code",
        "work_date",
        "check_in",
        "check_out",
        "status",
        "overtime_minutes",
        "notes",
    }
    if not reader.fieldnames or not required_columns.issubset(
        {name.strip() for name in reader.fieldnames if name}
    ):
        raise HTTPException(
            status_code=422,
            detail=f"CSV must include columns: {', '.join(sorted(required_columns))}",
        )
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=422, detail="CSV contains no attendance rows")
    if len(rows) > 5000:
        raise HTTPException(status_code=413, detail="CSV is limited to 5,000 rows")

    employee_codes = {
        (row.get("employee_code") or "").strip().upper() for row in rows
    }
    employee_query = db.query(Employee).filter(
        Employee.company_id == target_company,
        Employee.employee_code.in_(employee_codes),
    )
    if current_user.role == "SUPERVISOR":
        if current_user.site_id is None:
            raise HTTPException(status_code=403, detail="Supervisor site is not configured")
        employee_query = employee_query.filter(Employee.site_id == current_user.site_id)
    employees = employee_query.all()
    employee_by_code = {employee.employee_code.upper(): employee for employee in employees}
    pending: list[Attendance] = []
    seen: set[tuple[UUID, date]] = set()
    for row_number, row in enumerate(rows, start=2):
        code = (row.get("employee_code") or "").strip().upper()
        employee = employee_by_code.get(code)
        if not employee:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Row {row_number}: employee_code is outside your assigned site"
                    if current_user.role == "SUPERVISOR"
                    else f"Row {row_number}: employee_code does not belong to this company"
                ),
            )
        try:
            work_date = date.fromisoformat((row.get("work_date") or "").strip())
            check_in_raw = (row.get("check_in") or "").strip()
            check_out_raw = (row.get("check_out") or "").strip()
            check_in = datetime.fromisoformat(check_in_raw) if check_in_raw else None
            check_out = datetime.fromisoformat(check_out_raw) if check_out_raw else None
            minutes = int((row.get("overtime_minutes") or "0").strip())
            payload = AttendanceCreate(
                employee_id=employee.id,
                work_date=work_date,
                check_in=check_in,
                check_out=check_out,
                status=(row.get("status") or "PRESENT").strip().upper(),
                overtime_minutes=minutes,
                notes=(row.get("notes") or "").strip() or None,
            )
        except (ValueError, ValidationError) as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Row {row_number}: invalid date, punch, status, or overtime value",
            ) from exc
        key = (employee.id, payload.work_date)
        if key in seen or db.query(Attendance.id).filter(
            Attendance.employee_id == employee.id,
            Attendance.work_date == payload.work_date,
        ).first():
            raise HTTPException(
                status_code=409,
                detail=f"Row {row_number}: attendance already exists for this employee and date",
            )
        seen.add(key)
        pending.append(Attendance(**payload.model_dump()))

    db.add_all(pending)
    db.flush()
    record_audit(
        db,
        current_user,
        "attendance.csv_imported",
        "attendance_import",
        company_id=target_company,
    )
    db.commit()
    return {"imported": len(pending)}


@router.post("/attendance/check-in", response_model=AttendanceResponse)
def check_in(current_user: CurrentUser, db: DBSession):
    if current_user.role != "EMPLOYEE":
        raise HTTPException(status_code=403, detail="Employee account required")
    employee = db.query(Employee).filter(
        Employee.user_id == current_user.id,
        Employee.employment_status == "ACTIVE",
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Active employee profile not found")
    now = datetime.now(timezone.utc)
    today = now.date()
    previous_open = db.query(Attendance.id).filter(
        Attendance.employee_id == employee.id,
        Attendance.work_date == date.fromordinal(today.toordinal() - 1),
        Attendance.check_in.is_not(None),
        Attendance.check_out.is_(None),
    ).first()
    if previous_open:
        raise HTTPException(
            status_code=409,
            detail="Check out of the previous shift before starting a new shift",
        )
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee.id,
        Attendance.work_date == today,
    ).first()
    if attendance:
        if attendance.check_in:
            raise HTTPException(status_code=409, detail="Already checked in today")
        attendance.check_in = now
        attendance.status = "PRESENT"
    else:
        attendance = Attendance(
            employee_id=employee.id,
            work_date=today,
            check_in=now,
            status="PRESENT",
        )
        db.add(attendance)
    db.flush()
    record_audit(
        db, current_user, "attendance.checked_in", "attendance", attendance.id,
        company_id=employee.company_id,
    )
    db.commit()
    db.refresh(attendance)
    return attendance


@router.post("/attendance/check-out", response_model=AttendanceResponse)
def check_out(current_user: CurrentUser, db: DBSession):
    if current_user.role != "EMPLOYEE":
        raise HTTPException(status_code=403, detail="Employee account required")
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if not employee or employee.employment_status != "ACTIVE":
        raise HTTPException(status_code=404, detail="Active employee profile not found")
    now = datetime.now(timezone.utc)
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee.id,
        Attendance.work_date >= date.fromordinal(now.date().toordinal() - 1),
        Attendance.work_date <= now.date(),
        Attendance.check_in.is_not(None),
        Attendance.check_out.is_(None),
    ).order_by(Attendance.work_date.desc()).first()
    if not attendance or not attendance.check_in:
        raise HTTPException(status_code=409, detail="Check in before checking out")
    if attendance.check_out:
        raise HTTPException(status_code=409, detail="Already checked out today")
    attendance.check_out = now
    record_audit(
        db, current_user, "attendance.checked_out", "attendance", attendance.id,
        company_id=employee.company_id,
    )
    db.commit()
    db.refresh(attendance)
    return attendance


@router.patch("/attendance/{attendance_id}", response_model=AttendanceResponse)
def correct_attendance(
    attendance_id: UUID,
    payload: AttendanceCorrection,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES | {"SUPERVISOR"})
    attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not attendance:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    employee = employee_access(db, attendance.employee_id, current_user)
    for key, value in payload.model_dump().items():
        setattr(attendance, key, value)
    record_audit(
        db, current_user, "attendance.corrected", "attendance", attendance.id,
        company_id=employee.company_id,
    )
    db.commit()
    db.refresh(attendance)
    return attendance


@router.get("/leave/types", response_model=list[LeaveTypeResponse])
def list_leave_types(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
):
    target_company = resolve_company_id(current_user, company_id)
    return db.query(LeaveType).filter(
        LeaveType.company_id == target_company
    ).order_by(LeaveType.name).all()


@router.post("/leave/types", response_model=LeaveTypeResponse, status_code=201)
def create_leave_type(
    payload: LeaveTypeCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, HR_ROLES)
    company_id = resolve_company_id(current_user, payload.company_id)
    ensure_active_company(db, company_id)
    leave_type = LeaveType(
        company_id=company_id,
        **payload.model_dump(exclude={"company_id"}),
    )
    db.add(leave_type)
    try:
        db.flush()
        record_audit(
            db, current_user, "leave_type.created", "leave_type", leave_type.id,
            company_id=company_id,
        )
        db.commit()
        db.refresh(leave_type)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Leave type already exists") from exc
    return leave_type


@router.get("/leave/requests", response_model=list[LeaveRequestResponse])
def list_leave_requests(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    request_status: str | None = Query(default=None, pattern="^(PENDING|APPROVED|REJECTED)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    query = db.query(LeaveRequest).join(Employee)
    if current_user.role == "EMPLOYEE":
        query = query.filter(Employee.user_id == current_user.id)
    else:
        require_role(current_user, WORKFORCE_ROLES)
        query = query.filter(
            Employee.company_id == resolve_company_id(current_user, company_id)
        )
        if current_user.role == "SUPERVISOR":
            if current_user.site_id is None:
                raise HTTPException(status_code=403, detail="Supervisor site is not configured")
            query = query.filter(Employee.site_id == current_user.site_id)
    if request_status:
        query = query.filter(LeaveRequest.status == request_status)
    return query.order_by(LeaveRequest.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/leave/balance")
def leave_balance(
    current_user: CurrentUser,
    db: DBSession,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2200),
    employee_id: UUID | None = None,
):
    if current_user.role == "EMPLOYEE":
        employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee profile not found")
        if employee_id and employee_id != employee.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(current_user, WORKFORCE_ROLES)
        if employee_id is None:
            raise HTTPException(status_code=422, detail="employee_id is required")
        employee = employee_access(db, employee_id, current_user)

    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    types = db.query(LeaveType).filter(
        LeaveType.company_id == employee.company_id
    ).order_by(LeaveType.name).all()
    balances = []
    for leave_type in types:
        approved = db.query(LeaveRequest).filter(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.leave_type_id == leave_type.id,
            LeaveRequest.status == "APPROVED",
            LeaveRequest.starts_on <= year_end,
            LeaveRequest.ends_on >= year_start,
        ).all()
        used_days = sum(
            days_inclusive(max(year_start, item.starts_on), min(year_end, item.ends_on))
            for item in approved
        )
        balances.append(
            {
                "leave_type_id": str(leave_type.id),
                "leave_type": leave_type.name,
                "annual_allowance_days": leave_type.annual_allowance_days,
                "used_days": used_days,
                "remaining_days": max(
                    Decimal("0"),
                    leave_type.annual_allowance_days - Decimal(used_days),
                ),
                "is_paid": leave_type.is_paid,
            }
        )
    return {"employee_id": str(employee.id), "year": year, "balances": balances}


@router.post("/leave/requests", response_model=LeaveRequestResponse, status_code=201)
def create_leave_request(
    payload: LeaveRequestCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    if current_user.role == "EMPLOYEE":
        employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee profile not found")
        if payload.employee_id and payload.employee_id != employee.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        require_role(current_user, HR_ROLES | {"SUPERVISOR"})
        if payload.employee_id is None:
            raise HTTPException(status_code=422, detail="employee_id is required")
        employee = employee_access(db, payload.employee_id, current_user)
    leave_type = db.query(LeaveType).filter(
        LeaveType.id == payload.leave_type_id,
        LeaveType.company_id == employee.company_id,
    ).first()
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")
    overlap = db.query(LeaveRequest.id).filter(
        LeaveRequest.employee_id == employee.id,
        LeaveRequest.status.in_(("PENDING", "APPROVED")),
        LeaveRequest.starts_on <= payload.ends_on,
        LeaveRequest.ends_on >= payload.starts_on,
    ).first()
    if overlap:
        raise HTTPException(
            status_code=409,
            detail="Leave dates overlap an existing pending or approved request",
        )
    request = LeaveRequest(
        employee_id=employee.id,
        leave_type_id=payload.leave_type_id,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        reason=payload.reason,
    )
    db.add(request)
    db.flush()
    record_audit(
        db, current_user, "leave.requested", "leave_request", request.id,
        company_id=employee.company_id,
    )
    db.commit()
    db.refresh(request)
    return request


@router.patch("/leave/requests/{request_id}", response_model=LeaveRequestResponse)
def decide_leave_request(
    request_id: UUID,
    payload: LeaveDecision,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, REVIEW_ROLES)
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    employee = db.query(Employee).filter(
        Employee.id == request.employee_id
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee_access(db, employee.id, current_user)
    if employee.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="You cannot approve your own leave")
    if request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Leave request is already decided")
    request.status = payload.status
    request.reviewed_by = current_user.id
    request.reviewed_at = datetime.now(timezone.utc)
    record_audit(
        db, current_user, f"leave.{payload.status.lower()}", "leave_request", request.id,
        company_id=employee.company_id,
    )
    db.commit()
    db.refresh(request)
    return request


@router.get("/audit-logs")
def list_audit_logs(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    require_role(current_user, HR_ROLES | {"PAYROLL"})
    query = db.query(AuditLog)
    if current_user.role != "SUPER_ADMIN":
        query = query.filter(AuditLog.company_id == current_user.company_id)
    elif company_id:
        query = query.filter(AuditLog.company_id == company_id)
    return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/reports/attendance.csv")
def export_attendance_csv(
    current_user: CurrentUser,
    db: DBSession,
    starts_on: date,
    ends_on: date,
    company_id: UUID | None = None,
    site_id: UUID | None = None,
):
    require_role(current_user, WORKFORCE_ROLES)
    if starts_on > ends_on:
        raise HTTPException(status_code=422, detail="starts_on must be on or before ends_on")
    target_company = resolve_company_id(current_user, company_id)
    query = (
        db.query(Attendance, Employee)
        .join(Employee, Attendance.employee_id == Employee.id)
        .filter(
            Employee.company_id == target_company,
            Attendance.work_date >= starts_on,
            Attendance.work_date <= ends_on,
        )
    )
    if current_user.role == "SUPERVISOR":
        if current_user.site_id is None:
            raise HTTPException(status_code=403, detail="Supervisor site is not configured")
        if site_id is not None and site_id != current_user.site_id:
            raise HTTPException(status_code=403, detail="Site access denied")
        query = query.filter(Employee.site_id == current_user.site_id)
    elif site_id is not None:
        if not db.query(Site.id).filter(
            Site.id == site_id,
            Site.company_id == target_company,
        ).first():
            raise HTTPException(status_code=422, detail="Site does not belong to the company")
        query = query.filter(Employee.site_id == site_id)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "employee_code",
            "employee_name",
            "site_id",
            "work_date",
            "check_in",
            "check_out",
            "status",
            "overtime_minutes",
        ]
    )
    for attendance, employee in query.order_by(
        Attendance.work_date, Employee.employee_code
    ).all():
        writer.writerow(
            [
                safe_csv_cell(employee.employee_code),
                safe_csv_cell(employee.full_name),
                employee.site_id or "",
                attendance.work_date.isoformat(),
                attendance.check_in.isoformat() if attendance.check_in else "",
                attendance.check_out.isoformat() if attendance.check_out else "",
                attendance.status,
                attendance.overtime_minutes,
            ]
        )
    record_audit(
        db,
        current_user,
        "attendance.report_exported",
        "attendance_report",
        company_id=target_company,
    )
    db.commit()
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="attendance-{starts_on}-{ends_on}.csv"'
            )
        },
    )
