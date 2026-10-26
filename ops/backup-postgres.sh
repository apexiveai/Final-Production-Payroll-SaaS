#!/usr/bin/env sh
set -eu
umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD must come from the deployment secret manager}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_KMS_KEY_ID:?BACKUP_KMS_KEY_ID is required}"
: "${BACKUP_HEARTBEAT_URL:?Configure a success/failure heartbeat monitor}"

if ! command -v pg_dump >/dev/null 2>&1 || ! command -v aws >/dev/null 2>&1; then
  echo "pg_dump and AWS CLI are required" >&2
  exit 1
fi

if [ ! -d /dev/shm ]; then
  echo "An in-memory /dev/shm temporary filesystem is required for backup staging" >&2
  exit 1
fi

tmpdir="$(mktemp -d /dev/shm/workforce-pg-backup.XXXXXX)"
archive="${tmpdir}/postgres.dump"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object_key="postgres/${PGDATABASE}/${timestamp}.dump"

cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    curl --fail --silent --show-error --max-time 10 \
      --request POST "${BACKUP_HEARTBEAT_URL}/fail" >/dev/null ||
      echo "Warning: backup failure heartbeat could not be sent" >&2
  fi
  rm -f "$archive" || echo "Warning: could not remove temporary backup archive" >&2
  rmdir "$tmpdir" 2>/dev/null || echo "Warning: could not remove temporary backup directory" >&2
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$archive"

aws s3 cp "$archive" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
  --sse aws:kms \
  --sse-kms-key-id "$BACKUP_KMS_KEY_ID" \
  --only-show-errors

curl --fail --silent --show-error --max-time 10 \
  "$BACKUP_HEARTBEAT_URL" >/dev/null
echo "PostgreSQL backup uploaded: s3://${BACKUP_S3_BUCKET}/${object_key}"
