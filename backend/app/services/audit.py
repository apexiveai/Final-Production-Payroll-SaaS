from uuid import UUID

from sqlalchemy.orm import Session

from app.models.workforce import AuditLog
from app.models.user import User


def record_audit(
    db: Session,
    actor: User,
    action: str,
    resource_type: str,
    resource_id: UUID | None = None,
    company_id: UUID | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor.id,
            company_id=company_id or actor.company_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
        )
    )
