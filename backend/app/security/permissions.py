from uuid import UUID

from fastapi import HTTPException, status

from app.models.user import User


WORKFORCE_ROLES = {
    "SUPER_ADMIN",
    "COMPANY_ADMIN",
    "HR",
    "PAYROLL",
    "SUPERVISOR",
}
HR_ROLES = {"SUPER_ADMIN", "COMPANY_ADMIN", "HR"}
PAYROLL_ROLES = {"SUPER_ADMIN", "COMPANY_ADMIN", "PAYROLL"}
REVIEW_ROLES = {"SUPER_ADMIN", "COMPANY_ADMIN", "HR", "SUPERVISOR"}


def require_role(user: User, roles: set[str]) -> None:
    if user.role not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


def ensure_site_scope(user: User, site_id: UUID | None) -> None:
    if user.role == "SUPERVISOR" and (
        user.site_id is None or site_id != user.site_id
    ):
        raise HTTPException(status_code=403, detail="Site access denied")


def resolve_company_id(user: User, requested: UUID | None) -> UUID:
    if user.role == "SUPER_ADMIN":
        if requested is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="company_id is required",
            )
        return requested
    if user.role == "EMPLOYEE" and user.company_id is not None:
        if requested is not None and requested != user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company access denied")
        return user.company_id
    if user.role not in WORKFORCE_ROLES or user.company_id is None:
        raise HTTPException(status_code=403, detail="Company access denied")
    if requested is not None and requested != user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")
    return user.company_id
