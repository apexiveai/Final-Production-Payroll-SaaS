# ApexiveAI Workforce Payroll SaaS
https://apexive-ai-multi-vendor.vercel.app/
FastAPI/PostgreSQL backend and Next.js responsive web client for multi-company
workforce, attendance, leave, and payroll operations.
KC_BOOTSTRAP_ADMIN_USERNAME=keycloak-admin
## Local setup
Bucket Name: employee-documents
Region: ap-southeast-1
 https://idle-hispanic-finish-nsw.trycloudflare.com 
 curl.exe -i --max-time 20 https://example.trycloudflare.com/realms/apexiveai/.well-known/openid-configuration
 kc.bat start-dev --http-port=8081 --hostname=https://example.trycloudflare.com --proxy-headers=xforwarded
S3 Endpoint: https://xxxxx.supabase.co/storage/v1/s3
Access Key ID: sb_...
Secret Access Key: [မပို့ပါ]
1. Create `backend/.env` using `backend/.env.example` as a reference. Set a
   PostgreSQL URL and a random `JWT_SECRET_KEY` of at least 32 characters.
2. Install backend dependencies and migrate the database:

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -m alembic upgrade head
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8014 --reload
   ```

3. Create the initial administrator explicitly:

   ```powershell
   .\.venv\Scripts\python.exe -m app.cli.create_admin
   ```

   The command prompts for credentials. The application has no built-in
   production username or password.
4. Install and start the frontend:

   ```powershell
   cd frontend
   npm.cmd install
   $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8014/api/v1"
   npm.cmd run dev
   ```

The API docs are available at `/docs`. `GET /api/v1/health` is a liveness
check; `GET /api/v1/health/ready` executes a database query and returns HTTP
503 if PostgreSQL is unavailable.

## Implemented API areas

- Company and site CRUD, activation/deactivation, search, filters, offset/limit
  pagination, and company/site role enforcement.
- Department and position records; employee profiles, salary components,
  masked bank-account suffix, self-service account provisioning, and
  HR-authorized employee CSV import/export.
- Shift definitions and dated assignments; attendance entry, correction,
  employee check-in/out, leave requests, leave balances, and approval.
- Payroll draft calculation, item adjustments, review/approval/lock transitions,
  payment status, reversal drafts, payslips, CSV and XLSX exports, summary
  metrics, generic balanced accounting-journal CSV exports, and audit records.
- Regional workforce reporting at `GET /api/v1/reports/regional-workforce`
  with region/state, district, township, and ward/village-tract groupings.
  Site administrative fields are optional for existing sites and can be set
  through site create/update APIs.
- Employee document/photo upload, metadata listing, and short-lived private
  downloads. The API accepts PDF/JPEG/PNG files up to 10 MB and scopes access
  to the employee or authorized company HR users.
- JWT expiry and active-account checks, tenant-scoped database queries, a
  per-process login failure limiter, and removal of default login credentials.

## Payroll and attendance rules currently applied

- Salary and recurring allowance/bonus/deduction values are monthly amounts,
  prorated by calendar days in each month touched by a payroll period.
- Overtime defaults to 1.5x and divides prorated base salary by calendar days
  in the period times the configured standard hours/day. Both values can be
  supplied when creating a payroll draft.
- Approved unpaid leave and attendance entries marked absent are deducted by
  unique calendar day. The API counts calendar days (including weekends) for
  leave balances and unpaid leave.
- Each payroll run has one currency and includes only active employees paid in
  that currency; a company can create separate runs for each currency in the
  same period. There is no exchange-rate conversion or consolidated
  multi-currency accounting export.
- Employee check-in/out stores UTC timestamps and uses the UTC date as its
  attendance date. Site-local time zones and configurable work calendars are
  not yet implemented.

These defaults must be reviewed against the client's labor rules and payroll
policy before production use.

## Regional workforce metrics and insights

Apply the Alembic migration `c814e376b9f0` before using site administrative
location fields and regional reports. The report requires `starts_on` and
`ends_on`; it optionally accepts `company_id`, `site_id`, and `grouping_level`.
Company Admin, HR, Payroll, and Supervisor access is tenant-scoped; supervisors
are constrained to their assigned site. Super Admin may select a company or
omit it to aggregate all companies.

Attendance metrics are calculated from recorded attendance in the selected
date window; attendance rate counts `PRESENT` and `LATE` records over eligible
records, excluding `LEAVE` and `HOLIDAY`. Each response series includes
per-metric `data_available` flags, so a true zero is distinct from missing
records. Attendance rate and overtime are null when there are no usable
records. Labor and overtime costs are read only from
`LOCKED` or `PAID` payroll runs whose complete payroll period is within the
selected date range. Draft, reversed, and partially overlapping runs are not
included. Multi-currency results are returned as currency-specific breakdowns
and are not added together. Employee-to-site attribution uses the employee's
current site assignment because historical site transfers are not tracked.

Regional insights are deterministic `analytics-derived` comparisons against
the immediately preceding equal-length period. They are omitted when the
current and comparison periods do not both have relevant attendance or
finalized payroll data. They are descriptive comparisons, not forecasts or
external-AI outputs. The dashboard heatmap visualizes site metrics only; a
geographic boundary map is intentionally unavailable until approved, licensed
administrative-boundary GeoJSON is supplied. No boundary geometry is inferred
or bundled.

## Configuration and operations

- Keep `backend/.env` out of source control. Production secrets belong in the
  deployment secret manager. `JWT_SECRET_KEY` is mandatory and validated.
- Production API startup also requires the private document bucket, KMS key
  ID, and the compliance-approved `EMPLOYEE_DOCUMENT_RETENTION_DAYS`. Do not
  use an unreviewed example retention period.
- Optional `SEED_ADMIN_*` settings are intended only for controlled development
  bootstrap; production configuration rejects them. Use the explicit admin
  CLI for production provisioning.
- Login throttling is process-local. Production deployments with multiple
  workers/replicas must replace it with a shared Redis or gateway rate limiter.
- Run Alembic migrations as a deployment step; the API does not create schema
  automatically at startup.

## Phase 11 — Production deployment foundation

The repository includes provider-neutral application containers and AWS
storage/backup infrastructure scaffolding. These files do not provision a
hosting account, managed PostgreSQL instance, DNS, cloud roles, or monitoring
service; production launch still requires an operator with the relevant
accounts and approved compliance settings.

### Container deployment

1. Build the frontend and API containers with Docker Compose. Set the public
   DNS name in a root `.env` copied from `.env.production.example`.
2. Create `backend/.env` from `backend/.env.example` using the deployment
   secret manager. Set a managed PostgreSQL `DATABASE_URL` with TLS required,
   a unique random JWT secret, the Terraform document bucket and KMS key
   outputs, and the retention period approved by the organization. Do not put
   production secrets in either example file.
3. Point DNS to the host and allow inbound TCP 80/443. Caddy obtains and
   renews HTTPS certificates; the frontend and API are not published directly.
   API documentation endpoints are disabled in production.
4. Run the one-off schema migration before starting the API:

   ```sh
   docker compose -f compose.production.yaml --profile maintenance run --rm migrate
   docker compose -f compose.production.yaml up -d --build
   ```

   Compose health checks monitor the frontend and database-backed API
   readiness. Containers restart on failure and emit logs to stdout; API
   request logs contain route templates, status, duration, and a request ID,
   but not query strings or request bodies. Forward these logs to a managed
   log service and configure retention, access controls, and alerts.

### AWS documents and PostgreSQL backups

1. In `infra/aws`, copy `terraform.tfvars.example` to `terraform.tfvars`.
   Choose globally unique bucket names and set both retention-day variables
   only after legal/compliance approval. No production retention duration is
   assumed by the template.
2. Review and run `terraform fmt -check`, `terraform validate`, and `terraform
   plan`. Inspect the plan and IAM permissions. Never apply it without cloud
   owner approval. The template creates private, versioned document and
   backup buckets with separate KMS keys, TLS-only bucket policies, lifecycle
   rules, and scoped workload IAM policies. Use the separate Terraform KMS
   outputs for `OBJECT_STORAGE_KMS_KEY_ID` and `BACKUP_KMS_KEY_ID`.
3. Attach the document policy to the backend workload role. Use workload
   identity/instance roles; never install static AWS credentials in the API.
   Attach the backup writer policy only to the scheduled backup job and the
   separate restore policy only to an authorized restore-drill role.
4. Schedule `ops/backup-postgres.sh` in a Linux job/container with PostgreSQL
   client tools, AWS CLI, `curl`, managed-database credentials from a secret
   manager, the backup bucket/KMS outputs, and a heartbeat-monitor URL. Keep
   its temporary archive on an in-memory filesystem. Alert on a missing
   heartbeat and failed jobs.
5. Schedule the metadata retention cleanup using the production backend image:

   ```sh
   docker compose -f compose.production.yaml --profile maintenance run --rm \
     purge-expired-documents
   ```

   Run it at least daily with the backend workload identity. It deletes
   expired S3 objects and database metadata in audited batches; S3 lifecycle
   expiration is an independent backstop. Before the first scheduled
   execution, run a dry-run and verify the returned count with the compliance
   owner:

   ```sh
   docker compose -f compose.production.yaml --profile maintenance run --rm \
     purge-expired-documents python -m \
     app.cli.purge_expired_employee_documents --dry-run
   ```
6. Conduct and document restore drills in a separate, explicitly selected
   recovery database. `ops/restore-postgres.sh` verifies the archive and
   requires `RESTORE_CONFIRMATION=RESTORE:<target database name>`; `pg_restore
   --clean` replaces existing objects in that selected database. Never point
   it at production during a drill. Test backup readability, recovery time,
   data loss window, and the operational runbook.

Managed PostgreSQL, DNS, role attachment, cloud resource creation, monitoring
rules, restore drills, and final retention decisions are deployment tasks, not
completed by this repository scaffold. Review database TLS/firewall policy,
KMS key rotation/access, backup restore procedures, alert delivery, and the
organization's employee-data retention/legal requirements before launch.

## Known delivery gaps

The current work establishes backend APIs and responsive company/site,
user, employee, attendance/leave, and payroll screens, but it is not a
completed production payroll platform.
Remaining requirements include PDF payslips, payment-provider integration and
payment batches, organization-specific accounting chart-of-accounts mapping
and accounting-system integration, configurable site-local calendars and leave
policies, refresh-token support, shared login throttling,
geofencing/GPS or camera attendance, offline synchronization, backup/restore
drill automation and alert integration, load testing, dependency/security
scanning, and client UAT. Storage and backup scripts are scaffolding only;
they are not provisioned, scheduled, monitored, or restore-tested here. Only
bank-account last-four digits are stored; do not submit full bank data.

## Validation

Backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend checks:

```powershell
cd frontend
npm.cmd run lint
.\node_modules\.bin\tsc.cmd --noEmit
```