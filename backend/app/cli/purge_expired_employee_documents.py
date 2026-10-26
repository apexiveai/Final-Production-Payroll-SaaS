import argparse
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.workforce import AuditLog, EmployeeDocument
from app.services.object_storage import get_object_storage_bucket, get_object_store


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove expired employee document objects and metadata."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report how many expired records would be removed without changing data.",
    )
    args = parser.parse_args()

    retention_days = settings.employee_document_retention_days
    if retention_days is None or retention_days < 1:
        raise SystemExit(
            "EMPLOYEE_DOCUMENT_RETENTION_DAYS must be set to an approved positive value."
        )

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    bucket = get_object_storage_bucket()
    object_store = get_object_store()
    purged_count = 0

    with SessionLocal() as db:
        while True:
            expired_documents = db.scalars(
                select(EmployeeDocument)
                .where(EmployeeDocument.created_at < cutoff)
                .order_by(EmployeeDocument.created_at, EmployeeDocument.id)
                .limit(500)
            ).all()
            if not expired_documents:
                break

            if args.dry_run:
                purged_count += len(expired_documents)
                break

            for document in expired_documents:
                object_store.delete_object(Bucket=bucket, Key=document.object_key)
                db.delete(document)

            batch_count = len(expired_documents)
            db.add(
                AuditLog(
                    action="employee.documents_retention_purged",
                    resource_type="employee_document",
                    details=f"Expired document records purged: {batch_count}",
                )
            )
            db.commit()
            purged_count += batch_count

    if args.dry_run:
        print(f"Expired employee documents that would be purged: {purged_count}")
    else:
        print(f"Expired employee documents purged: {purged_count}")


if __name__ == "__main__":
    main()
