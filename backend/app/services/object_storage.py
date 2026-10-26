
import boto3
from botocore.config import Config

from app.core.config import settings


def get_object_store():
    client_options = {
        "service_name": "s3",
        "region_name": settings.object_storage_region,
        "endpoint_url": settings.object_storage_endpoint_url,
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={
                "max_attempts": 3,
                "mode": "standard",
            },
        ),
    }

    # Explicit credentials take precedence when configured.
    # If absent in development, boto3 may use its normal credential chain.
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        client_options["aws_access_key_id"] = settings.aws_access_key_id
        client_options["aws_secret_access_key"] = (
            settings.aws_secret_access_key
        )

    return boto3.client(**client_options)


def get_object_storage_bucket() -> str:
    bucket = settings.object_storage_bucket

    if not bucket or not bucket.strip():
        raise RuntimeError(
            "Employee object storage bucket is not configured"
        )

    return bucket.strip()
