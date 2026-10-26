from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.security.password import hash_password


def seed_super_admin(db: Session) -> None:
    if not all(
        (
            settings.seed_admin_username,
            settings.seed_admin_email,
            settings.seed_admin_password,
        )
    ):
        return

    existing = db.query(User).filter(
        User.username == settings.seed_admin_username
    ).first()

    if existing:
        return

    admin = User(
        username=settings.seed_admin_username,
        email=settings.seed_admin_email,
        password_hash=hash_password(settings.seed_admin_password),
        full_name="ApexiveAI Super Administrator",
        role="SUPER_ADMIN",
        company_id=None,
        is_active=True,
    )

    db.add(admin)
    db.commit()