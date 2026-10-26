from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    email: EmailStr
    full_name: str
    role: str
    company_id: UUID | None
    site_id: UUID | None = None
    is_active: bool


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ManagedUserCreate(BaseModel):
    company_id: UUID | None = None
    site_id: UUID | None = None
    username: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    role: str = Field(pattern="^(SUPER_ADMIN|COMPANY_ADMIN|HR|PAYROLL|SUPERVISOR)$")


class UserStatusUpdate(BaseModel):
    is_active: bool