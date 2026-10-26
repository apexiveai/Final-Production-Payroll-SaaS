
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ApexiveAI Workforce Payroll API"
    app_env: str = "development"
    app_version: str = "1.0.0"

    host: str = "127.0.0.1"
    port: int = 8014

    database_url: str = Field(min_length=1)

    jwt_secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    cors_origins: str = ""

    # S3-compatible object storage (Supabase Storage)
    object_storage_bucket: str | None = None
    object_storage_region: str = "ap-southeast-1"
    object_storage_endpoint_url: str | None = None

    # AWS-compatible S3 credentials.
    # For Supabase, use the S3 Access Key ID and Secret Access Key.
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # Retained for backward compatibility.
    # Supabase Storage does not support AWS SSE-KMS headers.
    object_storage_kms_key_id: str | None = None

    employee_document_retention_days: int | None = None

    seed_admin_username: str | None = None
    seed_admin_email: str | None = None
    seed_admin_password: str | None = None

    @model_validator(mode="after")
    def validate_configuration(self) -> "Settings":
        is_production = self.app_env.lower() == "production"

        seed_values = (
            self.seed_admin_username,
            self.seed_admin_email,
            self.seed_admin_password,
        )

        if any(seed_values) and not all(seed_values):
            raise ValueError(
                "SEED_ADMIN_USERNAME, SEED_ADMIN_EMAIL, and "
                "SEED_ADMIN_PASSWORD must be configured together"
            )

        if is_production and any(seed_values):
            raise ValueError(
                "Initial admin seeding must be performed explicitly, "
                "not at startup"
            )

        if bool(self.aws_access_key_id) != bool(
            self.aws_secret_access_key
        ):
            raise ValueError(
                "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY "
                "must be configured together"
            )

        if is_production:
            if not self.object_storage_bucket:
                raise ValueError(
                    "OBJECT_STORAGE_BUCKET must be configured in production"
                )

            if not self.object_storage_endpoint_url:
                raise ValueError(
                    "OBJECT_STORAGE_ENDPOINT_URL must be configured "
                    "in production"
                )

            if not self.aws_access_key_id or not self.aws_secret_access_key:
                raise ValueError(
                    "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY "
                    "must be configured in production"
                )

            if (
                self.employee_document_retention_days is None
                or self.employee_document_retention_days < 1
            ):
                raise ValueError(
                    "EMPLOYEE_DOCUMENT_RETENTION_DAYS must be set "
                    "to the approved positive retention period"
                )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
