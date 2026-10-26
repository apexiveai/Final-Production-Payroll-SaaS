#!/usr/bin/env sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD must come from the deployment secret manager}"
: "${RESTORE_ARCHIVE:?RESTORE_ARCHIVE must point to the downloaded backup archive}"
: "${RESTORE_CONFIRMATION:?Set RESTORE_CONFIRMATION to RESTORE:<target database name>}"

expected_confirmation="RESTORE:${PGDATABASE}"
if [ "$RESTORE_CONFIRMATION" != "$expected_confirmation" ]; then
  echo "Restore refused: confirmation does not match the explicitly selected target database" >&2
  exit 1
fi

if [ ! -f "$RESTORE_ARCHIVE" ] || [ -L "$RESTORE_ARCHIVE" ]; then
  echo "Restore archive must be an existing regular file, not a symlink" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required" >&2
  exit 1
fi

pg_restore --list "$RESTORE_ARCHIVE" >/dev/null
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  "$RESTORE_ARCHIVE"
