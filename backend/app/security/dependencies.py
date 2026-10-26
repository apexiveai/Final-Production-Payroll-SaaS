from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company
from app.models.user import User
from app.security.jwt import decode_access_token
import jwt


bearer_scheme = HTTPBearer()

DBSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials,
        Depends(bearer_scheme),
    ],
    db: DBSession,
) -> User:

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(credentials.credentials)

        user_id = payload.get("user_id")
        token_version = payload.get("token_version")

        if not user_id or not isinstance(token_version, int):
            raise credentials_exception

        user_uuid = UUID(user_id)

    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(
        User.id == user_uuid,
        User.is_active.is_(True),
        User.token_version == token_version,
    ).first()

    if (
        not user
        or (
            user.company_id is not None
            and not db.query(Company.id)
            .filter(
                Company.id == user.company_id,
                Company.is_active.is_(True),
            )
            .first()
        )
    ):
        raise credentials_exception

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]