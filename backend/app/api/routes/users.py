from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from app.models.company import Company
from app.models.site import Site
from app.models.user import User
from app.schemas.auth import ManagedUserCreate, UserResponse, UserStatusUpdate
from app.security.dependencies import CurrentUser, DBSession
from app.security.password import hash_password
from app.security.permissions import require_role, resolve_company_id
from app.services.audit import record_audit


router = APIRouter(prefix="/users", tags=["User management"])
MANAGER_ROLES = {"SUPER_ADMIN", "COMPANY_ADMIN"}
ASSIGNABLE_ROLES = {"COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR"}


@router.get("", response_model=list[UserResponse])
def list_users(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = None,
    role: str | None = Query(
        default=None,
        pattern="^(SUPER_ADMIN|COMPANY_ADMIN|HR|PAYROLL|SUPERVISOR|EMPLOYEE)$",
    ),
    is_active: bool | None = None,
    search: str | None = Query(default=None, max_length=255),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    require_role(current_user, MANAGER_ROLES)
    query = db.query(User)
    if current_user.role == "SUPER_ADMIN":
        if company_id is not None:
            query = query.filter(User.company_id == company_id)
    else:
        query = query.filter(
            User.company_id == resolve_company_id(current_user, company_id)
        )
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            User.username.ilike(pattern)
            | User.email.ilike(pattern)
            | User.full_name.ilike(pattern)
        )
    return query.order_by(User.full_name).offset(offset).limit(limit).all()


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    payload: ManagedUserCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, MANAGER_ROLES)
    if current_user.role == "SUPER_ADMIN":
        company_id = payload.company_id
        if payload.role == "SUPER_ADMIN":
            if company_id is not None or payload.site_id is not None:
                raise HTTPException(
                    status_code=422,
                    detail="Super Admin accounts cannot be assigned to a company or site",
                )
        elif company_id is None:
            raise HTTPException(status_code=422, detail="company_id is required")
    else:
        if payload.role not in ASSIGNABLE_ROLES - {"COMPANY_ADMIN"}:
            raise HTTPException(status_code=403, detail="Role assignment denied")
        company_id = resolve_company_id(current_user, payload.company_id)

    if company_id is not None and not db.query(Company.id).filter(
        Company.id == company_id,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(status_code=404, detail="Active company not found")

    if payload.site_id is not None:
        if company_id is None or not db.query(Site.id).filter(
            Site.id == payload.site_id,
            Site.company_id == company_id,
            Site.is_active.is_(True),
        ).first():
            raise HTTPException(status_code=422, detail="Site does not belong to the company")
    if payload.role == "SUPERVISOR" and payload.site_id is None:
        raise HTTPException(status_code=422, detail="Supervisors must be assigned to a site")

    user = User(
        company_id=company_id,
        site_id=payload.site_id,
        username=payload.username.strip(),
        email=str(payload.email).strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.flush()
        record_audit(
            db,
            current_user,
            "user.created",
            "user",
            user.id,
            company_id=company_id,
        )
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username or email is already in use",
        ) from exc
    return user


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: UUID,
    payload: UserStatusUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    require_role(current_user, MANAGER_ROLES)
    query = db.query(User).filter(User.id == user_id)
    if current_user.role == "COMPANY_ADMIN":
        query = query.filter(
            User.company_id == resolve_company_id(current_user, None),
            User.role != "SUPER_ADMIN",
        )
    target = query.first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id and not payload.is_active:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own account")
    if target.is_active != payload.is_active:
        target.is_active = payload.is_active
        target.token_version += 1
        record_audit(
            db,
            current_user,
            "user.activated" if payload.is_active else "user.deactivated",
            "user",
            target.id,
            company_id=target.company_id,
        )
        db.commit()
        db.refresh(target)
    return target
