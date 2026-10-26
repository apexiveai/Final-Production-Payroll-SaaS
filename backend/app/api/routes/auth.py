from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import APIRouter, HTTPException, Request, status

from app.models.company import Company
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserResponse
from app.security.dependencies import CurrentUser, DBSession
from app.security.jwt import create_access_token
from app.security.password import hash_password, verify_password
from app.services.audit import record_audit
from pydantic import BaseModel, Field, model_validator


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

_LOGIN_WINDOW_SECONDS = 300
_LOGIN_MAX_ATTEMPTS = 5
_login_attempts: dict[str, deque[float]] = defaultdict(deque)
_login_attempts_lock = Lock()


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def validate_new_password(self) -> "PasswordChangeRequest":
        if self.current_password == self.new_password:
            raise ValueError("New password must be different")
        return self


def login_rate_limit_keys(request: Request, username: str) -> tuple[str, str]:
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}", f"identity:{username.strip().casefold()}"


def enforce_login_rate_limit(keys: tuple[str, str]) -> None:
    now = monotonic()
    with _login_attempts_lock:
        for key in keys:
            attempts = _login_attempts[key]
            while attempts and now - attempts[0] >= _LOGIN_WINDOW_SECONDS:
                attempts.popleft()
            if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many login attempts. Try again later.",
                )


def record_login_failure(keys: tuple[str, str]) -> None:
    now = monotonic()
    with _login_attempts_lock:
        for key in keys:
            attempts = _login_attempts[key]
            while attempts and now - attempts[0] >= _LOGIN_WINDOW_SECONDS:
                attempts.popleft()
            attempts.append(now)


def clear_login_failures(keys: tuple[str, str]) -> None:
    with _login_attempts_lock:
        for key in keys:
            _login_attempts.pop(key, None)


@router.post(
    "/login",
    response_model=LoginResponse,
)
def login(
    payload: LoginRequest,
    db: DBSession,
    request: Request,
):
    rate_limit_keys = login_rate_limit_keys(request, payload.username)
    enforce_login_rate_limit(rate_limit_keys)

    user = db.query(User).filter(
        User.username == payload.username
    ).first()

    if not user:
        record_login_failure(rate_limit_keys)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active:
        record_login_failure(rate_limit_keys)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    if not verify_password(
        payload.password,
        user.password_hash,
    ):
        record_login_failure(rate_limit_keys)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if user.company_id and not db.query(Company.id).filter(
        Company.id == user.company_id,
        Company.is_active.is_(True),
    ).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company account is inactive",
        )

    clear_login_failures(rate_limit_keys)
    access_token = create_access_token(
        subject=user.username,
        user_id=str(user.id),
        role=user.role,
        company_id=(
            str(user.company_id)
            if user.company_id
            else None
        ),
        token_version=user.token_version,
    )

    return LoginResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
def me(current_user: CurrentUser):
    return current_user


@router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(payload.new_password)
    current_user.token_version += 1
    record_audit(
        db,
        current_user,
        "auth.password_changed",
        "user",
        current_user.id,
        company_id=current_user.company_id,
    )
    db.commit()
    return {"status": "password_changed", "reauthentication_required": True}


@router.post("/logout")
def logout(current_user: CurrentUser, db: DBSession):
    current_user.token_version += 1
    record_audit(
        db,
        current_user,
        "auth.sessions_revoked",
        "user",
        current_user.id,
        company_id=current_user.company_id,
    )
    db.commit()
    return {"status": "logged_out"}