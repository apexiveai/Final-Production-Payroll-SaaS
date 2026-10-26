
from contextlib import asynccontextmanager
import json
import logging
from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.auth import router as auth_router
from app.api.routes.companies import router as companies_router
from app.api.routes.employees import router as employees_router
from app.api.routes.operations import router as operations_router
from app.api.routes.payroll import router as payroll_router
from app.api.routes.regional_reports import router as regional_reports_router
from app.api.routes.sites import router as sites_router
from app.api.routes.users import router as users_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.seed import seed_super_admin


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if all(
        (
            settings.seed_admin_username,
            settings.seed_admin_email,
            settings.seed_admin_password,
        )
    ):
        db = SessionLocal()
        try:
            seed_super_admin(db)
        finally:
            db.close()
    yield


app = FastAPI(
    title=settings.app_name,
    description="Enterprise Workforce Attendance & Payroll SaaS API",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url=None if settings.app_env.lower() == "production" else "/docs",
    redoc_url=None if settings.app_env.lower() == "production" else "/redoc",
    openapi_url=None if settings.app_env.lower() == "production" else "/openapi.json",
)
logger = logging.getLogger("workforce.api")


@app.middleware("http")
async def log_request(request: Request, call_next):
    request_id = str(uuid4())
    started_at = perf_counter()
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        route = request.scope.get("route")
        logger.info(
            json.dumps(
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "request_id": request_id,
                    "method": request.method,
                    "route": getattr(route, "path", "unmatched"),
                    "status_code": status_code,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                },
                separators=(",", ":"),
            )
        )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router, prefix="/api/v1")
app.include_router(companies_router, prefix="/api/v1")
app.include_router(sites_router, prefix="/api/v1")
app.include_router(employees_router, prefix="/api/v1")
app.include_router(operations_router, prefix="/api/v1")
app.include_router(payroll_router, prefix="/api/v1")
app.include_router(regional_reports_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "application": settings.app_name,
        "status": "running",
        "version": settings.app_version,
    }


@app.get("/api/v1/health")
def health():
    return {
        "status": "healthy",
        "service": "workforce-payroll-api",
    }


@app.get("/api/v1/health/ready")
def readiness():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc

    return {
        "status": "ready",
        "service": "workforce-payroll-api",
        "database": "connected",
    }
