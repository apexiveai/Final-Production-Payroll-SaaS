from getpass import getpass

from sqlalchemy import or_

from app.db.session import SessionLocal
from app.models.user import User
from app.security.password import hash_password


def main() -> None:
    username = input("Administrator username: ").strip()
    email = input("Administrator email: ").strip().lower()
    full_name = input("Administrator full name: ").strip()
    password = getpass("Password (minimum 12 characters): ")
    confirmation = getpass("Confirm password: ")

    if len(username) < 3 or len(username) > 100:
        raise SystemExit("Username must be between 3 and 100 characters.")
    if not email or not full_name:
        raise SystemExit("Email and full name are required.")
    if len(password) < 12 or len(password) > 128:
        raise SystemExit("Password must be between 12 and 128 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")

    with SessionLocal() as db:
        existing = db.query(User.id).filter(
            or_(User.username == username, User.email == email)
        ).first()
        if existing:
            raise SystemExit("Username or email is already registered.")
        db.add(
            User(
                username=username,
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                role="SUPER_ADMIN",
                company_id=None,
                is_active=True,
            )
        )
        db.commit()
    print("Super administrator created.")


if __name__ == "__main__":
    main()
