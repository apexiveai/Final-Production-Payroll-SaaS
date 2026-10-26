
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class SiteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    code: str = Field(min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    region: str | None = Field(default=None, min_length=1, max_length=100)
    district: str | None = Field(default=None, min_length=1, max_length=100)
    township: str | None = Field(default=None, min_length=1, max_length=100)
    ward_village_tract: str | None = Field(default=None, min_length=1, max_length=150)

    @field_validator("name", "code", mode="before")
    @classmethod
    def strip_required_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(
        "region", "district", "township", "ward_village_tract", mode="before"
    )
    @classmethod
    def strip_optional_admin_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    code: str | None = Field(default=None, min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    region: str | None = Field(default=None, min_length=1, max_length=100)
    district: str | None = Field(default=None, min_length=1, max_length=100)
    township: str | None = Field(default=None, min_length=1, max_length=100)
    ward_village_tract: str | None = Field(default=None, min_length=1, max_length=150)
    is_active: bool | None = None

    @field_validator("name", "code", mode="before")
    @classmethod
    def strip_optional_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator(
        "region", "district", "township", "ward_village_tract", mode="before"
    )
    @classmethod
    def strip_optional_admin_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class SiteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    code: str
    address: str | None
    phone: str | None
    email: str | None
    region: str | None
    district: str | None
    township: str | None
    ward_village_tract: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
