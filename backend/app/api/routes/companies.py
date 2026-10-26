
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from app.models.company import Company
from app.models.user import User
from app.schemas.company import (
    CompanyCreate,
    CompanyResponse,
    CompanyUpdate,
)
from app.security.dependencies import CurrentUser, DBSession
from app.services.audit import record_audit


router = APIRouter(prefix="/companies", tags=["Companies"])


def require_super_admin(user: User) -> None:
    if user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SUPER_ADMIN permission required",
        )


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    current_user: CurrentUser,
    db: DBSession,
    search: str | None = Query(default=None, max_length=255),
    is_active: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    if current_user.role == "SUPER_ADMIN":
        query = db.query(Company)
    elif current_user.role in {"COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR"} and current_user.company_id is not None:
        query = db.query(Company).filter(
            Company.id == current_user.company_id
        )
    else:
        raise HTTPException(
            status_code=403,
            detail="No company is assigned to this user",
        )

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Company.name.ilike(pattern)
            | Company.code.ilike(pattern)
            | Company.email.ilike(pattern)
        )
    if is_active is not None:
        query = query.filter(Company.is_active.is_(is_active))

    return (
        query.order_by(Company.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_company(
    payload: CompanyCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_super_admin(current_user)

    company = Company(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        address=payload.address,
    )

    db.add(company)

    try:
        db.flush()
        record_audit(
            db, current_user, "company.created", "company", company.id, company_id=company.id
        )
        db.commit()
        db.refresh(company)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Company code already exists",
        ) from exc

    return company


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    query = db.query(Company).filter(Company.id == company_id)

    if current_user.role not in {"SUPER_ADMIN", "COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR"}:
        raise HTTPException(status_code=403, detail="Company access denied")
    if current_user.role != "SUPER_ADMIN":
        if current_user.company_id != company_id:
            raise HTTPException(status_code=403, detail="Access denied")

    company = query.first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company


@router.patch("/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: UUID,
    payload: CompanyUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_super_admin(current_user)

    company = db.query(Company).filter(
        Company.id == company_id
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()

    if "code" in changes and changes["code"] is not None:
        changes["code"] = changes["code"].strip().upper()

    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"])

    for field, value in changes.items():
        if field == "is_active" and value is None:
            continue
        setattr(company, field, value)

    try:
        record_audit(
            db, current_user, "company.updated", "company", company.id, company_id=company.id
        )
        db.commit()
        db.refresh(company)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Company code already exists",
        ) from exc

    return company


@router.delete("/{company_id}", response_model=CompanyResponse)
def deactivate_company(
    company_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    require_super_admin(current_user)

    company = db.query(Company).filter(
        Company.id == company_id
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company.is_active = False
    record_audit(
        db, current_user, "company.deactivated", "company", company.id, company_id=company.id
    )
    db.commit()
    db.refresh(company)

    return company
