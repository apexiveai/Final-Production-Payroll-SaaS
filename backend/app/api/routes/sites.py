
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from app.models.company import Company
from app.models.site import Site
from app.models.user import User
from app.schemas.site import SiteCreate, SiteResponse, SiteUpdate
from app.security.dependencies import CurrentUser, DBSession
from app.services.audit import record_audit


router = APIRouter(prefix="/sites", tags=["Sites"])


def resolve_company_id(
    user: User,
    requested_company_id: UUID | None,
) -> UUID:
    if user.role == "SUPER_ADMIN":
        if requested_company_id is None:
            raise HTTPException(
                status_code=400,
                detail="company_id is required for SUPER_ADMIN",
            )
        return requested_company_id

    if user.role == "COMPANY_ADMIN":
        if user.company_id is None:
            raise HTTPException(status_code=403, detail="No company assigned")

        if (
            requested_company_id is not None
            and requested_company_id != user.company_id
        ):
            raise HTTPException(status_code=403, detail="Access denied")

        return user.company_id

    raise HTTPException(
        status_code=403,
        detail="Site management permission required",
    )


def ensure_site_access(user: User, site: Site) -> None:
    if user.role == "SUPER_ADMIN":
        return

    if (
        user.role != "COMPANY_ADMIN"
        or user.company_id is None
        or site.company_id != user.company_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("", response_model=list[SiteResponse])
def list_sites(
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    is_active: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    query = db.query(Site)

    if current_user.role == "SUPER_ADMIN":
        if company_id is not None:
            query = query.filter(Site.company_id == company_id)
    elif current_user.role == "COMPANY_ADMIN":
        if current_user.company_id is None:
            raise HTTPException(status_code=403, detail="No company assigned")

        query = query.filter(Site.company_id == current_user.company_id)
    else:
        raise HTTPException(status_code=403, detail="Site access denied")

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Site.name.ilike(pattern)
            | Site.code.ilike(pattern)
            | Site.address.ilike(pattern)
            | Site.region.ilike(pattern)
            | Site.district.ilike(pattern)
            | Site.township.ilike(pattern)
            | Site.ward_village_tract.ilike(pattern)
        )
    if is_active is not None:
        query = query.filter(Site.is_active.is_(is_active))

    return (
        query.order_by(Site.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "",
    response_model=SiteResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_site(
    payload: SiteCreate,
    current_user: CurrentUser,
    db: DBSession,
    company_id: UUID | None = Query(default=None),
):
    target_company_id = resolve_company_id(current_user, company_id)

    company = db.query(Company).filter(
        Company.id == target_company_id,
        Company.is_active.is_(True),
    ).first()

    if not company:
        raise HTTPException(
            status_code=404,
            detail="Active company not found",
        )

    site = Site(
        company_id=target_company_id,
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        address=payload.address,
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        region=payload.region,
        district=payload.district,
        township=payload.township,
        ward_village_tract=payload.ward_village_tract,
    )

    db.add(site)

    try:
        db.flush()
        record_audit(
            db, current_user, "site.created", "site", site.id, company_id=target_company_id
        )
        db.commit()
        db.refresh(site)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Site code already exists in this company",
        ) from exc

    return site


@router.get("/{site_id}", response_model=SiteResponse)
def get_site(
    site_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    site = db.query(Site).filter(Site.id == site_id).first()

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    ensure_site_access(current_user, site)
    return site


@router.patch("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: UUID,
    payload: SiteUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    site = db.query(Site).filter(Site.id == site_id).first()

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    ensure_site_access(current_user, site)

    company = db.query(Company).filter(
        Company.id == site.company_id,
        Company.is_active.is_(True),
    ).first()

    if not company:
        raise HTTPException(status_code=409, detail="Company is inactive")

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
        setattr(site, field, value)

    try:
        record_audit(
            db, current_user, "site.updated", "site", site.id, company_id=site.company_id
        )
        db.commit()
        db.refresh(site)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Site code already exists in this company",
        ) from exc

    return site


@router.delete("/{site_id}", response_model=SiteResponse)
def deactivate_site(
    site_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    site = db.query(Site).filter(Site.id == site_id).first()

    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    ensure_site_access(current_user, site)
    site.is_active = False
    record_audit(
        db, current_user, "site.deactivated", "site", site.id, company_id=site.company_id
    )

    db.commit()
    db.refresh(site)

    return site
