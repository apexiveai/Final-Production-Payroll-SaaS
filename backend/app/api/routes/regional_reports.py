from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.models.company import Company
from app.models.site import Site
from app.models.user import User
from app.models.workforce import Attendance, Employee, PayrollItem, PayrollRun
from app.schemas.regional_reports import (
    AdministrativeLevel,
    RegionalInsight,
    RegionalMetric,
    RegionalWorkforceResponse,
)
from app.security.dependencies import CurrentUser, DBSession


router = APIRouter(prefix="/reports", tags=["Regional Workforce Reports"])
REPORT_ROLES = {"SUPER_ADMIN", "COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR"}
ADMIN_FIELDS = (
    "region",
    "district",
    "township",
    "ward_village_tract",
)
ATTENDANCE_WORKED_STATUSES = {"PRESENT", "LATE"}
ATTENDANCE_NON_WORK_STATUSES = {"LEAVE", "HOLIDAY"}
FINALIZED_PAYROLL_STATUSES = {"LOCKED", "PAID"}


def _scope(
    current_user: User,
    company_id: UUID | None,
    site_id: UUID | None,
) -> tuple[UUID | None, UUID | None]:
    if current_user.role not in REPORT_ROLES:
        raise HTTPException(status_code=403, detail="Regional report access denied")

    if current_user.role == "SUPER_ADMIN":
        target_company_id = company_id
        target_site_id = site_id
    else:
        if current_user.company_id is None:
            raise HTTPException(status_code=403, detail="No company assigned")
        if company_id is not None and company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company access denied")
        target_company_id = current_user.company_id
        target_site_id = site_id

    if current_user.role == "SUPERVISOR":
        if current_user.site_id is None:
            raise HTTPException(status_code=403, detail="No site assigned")
        if site_id is not None and site_id != current_user.site_id:
            raise HTTPException(status_code=403, detail="Site access denied")
        target_site_id = current_user.site_id
    return target_company_id, target_site_id


def _currency_amounts(values: dict[str, Decimal]) -> list[dict]:
    return [
        {"currency": currency, "amount": float(amount)}
        for currency, amount in sorted(values.items())
    ]


def _metric(
    *,
    key: str,
    name: str,
    level: str,
    hierarchy: dict[str, str | None],
    site_ids: list[UUID],
    raw: dict,
) -> dict:
    attendance_rows = raw["attendance_record_count"]
    denominator = raw["attendance_denominator"]
    rate = (
        round(raw["attended_count"] * 100 / denominator, 2)
        if denominator
        else None
    )
    payroll_currencies = raw["labor_cost_by_currency"]
    cost_available = bool(payroll_currencies)
    single_currency = len(payroll_currencies) == 1
    currency = next(iter(payroll_currencies)) if single_currency else None
    return {
        "key": key,
        "name": name,
        "level": level,
        "hierarchy": hierarchy,
        "site_ids": site_ids,
        "site_count": len(site_ids),
        "active_employee_count": raw["active_employee_count"],
        "data_available": {
            "active_employee_count": True,
            "attendance": attendance_rows > 0,
            "attendance_rate": denominator > 0,
            "overtime_minutes": attendance_rows > 0,
            "labor_cost": single_currency,
            "overtime_cost": single_currency,
            "payroll_cost_breakdown": cost_available,
        },
        "attendance_record_count": attendance_rows if attendance_rows else None,
        "attendance_opportunity_count": denominator,
        "attendance_data_available": attendance_rows > 0,
        "attendance_rate": rate,
        "overtime_minutes": raw["overtime_minutes"] if attendance_rows else None,
        "payroll_data_available": raw["payroll_data_available"],
        "cost_availability_reason": (
            "Finalized payroll contains multiple currencies; use the currency breakdown."
            if cost_available and not single_currency
            else None
        ),
        "labor_cost": (
            float(payroll_currencies[currency]) if single_currency else None
        ),
        "overtime_cost": (
            float(raw["overtime_cost_by_currency"][currency])
            if single_currency
            else None
        ),
        "currency": currency,
        "labor_cost_by_currency": _currency_amounts(payroll_currencies),
        "overtime_cost_by_currency": _currency_amounts(
            raw["overtime_cost_by_currency"]
        ),
    }


def _empty_raw() -> dict:
    return {
        "active_employee_count": 0,
        "attendance_record_count": 0,
        "attendance_denominator": 0,
        "attended_count": 0,
        "overtime_minutes": 0,
        "payroll_data_available": False,
        "labor_cost_by_currency": defaultdict(Decimal),
        "overtime_cost_by_currency": defaultdict(Decimal),
    }


def _build_metrics(
    db,
    *,
    sites: list[Site],
    company_id: UUID | None,
    starts_on: date,
    ends_on: date,
    grouping_level: AdministrativeLevel,
) -> tuple[list[dict], list[dict]]:
    site_by_id = {site.id: site for site in sites}
    raw_by_site = {site_id: _empty_raw() for site_id in site_by_id}
    if not site_by_id:
        return [], []

    def apply_site_scope(query, model_site_id):
        query = query.filter(model_site_id.in_(site_by_id))
        if company_id is not None:
            query = query.filter(Site.company_id == company_id)
        return query

    employee_rows = (
        db.query(Employee.site_id, Employee.employment_status)
        .join(Site, Site.id == Employee.site_id)
        .filter(Employee.company_id == Site.company_id)
    )
    employee_rows = apply_site_scope(employee_rows, Employee.site_id).all()
    for employee_site_id, employment_status in employee_rows:
        if employment_status == "ACTIVE":
            raw_by_site[employee_site_id]["active_employee_count"] += 1

    attendance_rows = (
        db.query(Attendance, Employee.site_id)
        .join(Employee, Employee.id == Attendance.employee_id)
        .join(Site, Site.id == Employee.site_id)
        .filter(
            Employee.company_id == Site.company_id,
            Attendance.work_date >= starts_on,
            Attendance.work_date <= ends_on,
        )
    )
    attendance_rows = apply_site_scope(attendance_rows, Employee.site_id).all()
    for attendance, attendance_site_id in attendance_rows:
        raw = raw_by_site[attendance_site_id]
        raw["attendance_record_count"] += 1
        if attendance.status not in ATTENDANCE_NON_WORK_STATUSES:
            raw["attendance_denominator"] += 1
            if attendance.status in ATTENDANCE_WORKED_STATUSES:
                raw["attended_count"] += 1
        if attendance.status not in {"ABSENT", "LEAVE", "HOLIDAY"}:
            raw["overtime_minutes"] += attendance.overtime_minutes or 0

    payroll_rows = (
        db.query(
            Employee.site_id,
            PayrollRun.currency,
            PayrollItem.gross_pay,
            PayrollItem.overtime_pay,
        )
        .join(PayrollRun, PayrollRun.id == PayrollItem.run_id)
        .join(Employee, Employee.id == PayrollItem.employee_id)
        .join(Site, Site.id == Employee.site_id)
        .filter(
            Employee.company_id == Site.company_id,
            PayrollRun.company_id == Employee.company_id,
            PayrollRun.status.in_(FINALIZED_PAYROLL_STATUSES),
            PayrollRun.reverses_run_id.is_(None),
            PayrollRun.period_start >= starts_on,
            PayrollRun.period_end <= ends_on,
        )
    )
    payroll_rows = apply_site_scope(payroll_rows, Employee.site_id).all()
    for employee_site_id, currency, gross_pay, overtime_pay in payroll_rows:
        raw = raw_by_site[employee_site_id]
        raw["payroll_data_available"] = True
        raw["labor_cost_by_currency"][currency] += gross_pay
        raw["overtime_cost_by_currency"][currency] += overtime_pay

    site_metrics = []
    grouped_site_ids: dict[str, list[UUID]] = defaultdict(list)
    grouped_hierarchy: dict[str, dict[str, str | None]] = {}
    grouped_names: dict[str, str] = {}
    group_field = grouping_level
    for site in sites:
        hierarchy = {field: getattr(site, field) for field in ADMIN_FIELDS}
        raw_name = hierarchy[group_field]
        group_key = raw_name.strip().casefold() if raw_name else "__unspecified__"
        display_name = raw_name.strip() if raw_name else "Unspecified"
        grouped_site_ids[group_key].append(site.id)
        grouped_hierarchy[group_key] = hierarchy
        grouped_names[group_key] = display_name
        site_metrics.append(
            _metric(
                key=str(site.id),
                name=site.name,
                level="site",
                hierarchy=hierarchy,
                site_ids=[site.id],
                raw=raw_by_site[site.id],
            )
        )

    regions = []
    for group_key, group_site_ids in grouped_site_ids.items():
        combined = _empty_raw()
        for site_id in group_site_ids:
            raw = raw_by_site[site_id]
            for key in (
                "active_employee_count",
                "attendance_record_count",
                "attendance_denominator",
                "attended_count",
                "overtime_minutes",
            ):
                combined[key] += raw[key]
            combined["payroll_data_available"] |= raw["payroll_data_available"]
            for currency, amount in raw["labor_cost_by_currency"].items():
                combined["labor_cost_by_currency"][currency] += amount
            for currency, amount in raw["overtime_cost_by_currency"].items():
                combined["overtime_cost_by_currency"][currency] += amount
        regions.append(
            _metric(
                key=group_key,
                name=grouped_names[group_key],
                level=grouping_level,
                hierarchy=grouped_hierarchy[group_key],
                site_ids=group_site_ids,
                raw=combined,
            )
        )
    regions.sort(key=lambda item: item["name"].casefold())
    site_metrics.sort(key=lambda item: item["name"].casefold())
    return regions, site_metrics


def _insights(
    current: list[dict],
    previous: list[dict],
    comparison_starts_on: date,
    comparison_ends_on: date,
) -> list[dict]:
    previous_by_key = {item["key"]: item for item in previous}
    result = []
    for item in current:
        prior = previous_by_key.get(item["key"])
        if prior is None:
            continue
        if (
            item["attendance_data_available"]
            and prior["attendance_data_available"]
            and item["attendance_rate"] is not None
            and prior["attendance_rate"] is not None
        ):
            change = round(item["attendance_rate"] - prior["attendance_rate"], 2)
            trend = "increased" if change > 0 else "decreased" if change < 0 else "was unchanged"
            result.append(
                {
                    "entity_name": item["name"],
                    "metric": "attendance_rate",
                    "title": f"Attendance {trend}",
                    "detail": (
                        f"{item['name']} attendance rate {trend} by "
                        f"{abs(change):.2f} percentage points versus the immediately "
                        "preceding equal-length period."
                    ),
                    "change": change,
                    "unit": "percentage_points",
                    "currency": None,
                    "comparison_starts_on": comparison_starts_on,
                    "comparison_ends_on": comparison_ends_on,
                }
            )
        if (
            item["payroll_data_available"]
            and prior["payroll_data_available"]
            and item["currency"] is not None
            and item["currency"] == prior["currency"]
            and item["overtime_cost"] is not None
            and prior["overtime_cost"] is not None
        ):
            change = float(item["overtime_cost"] - prior["overtime_cost"])
            trend = "increased" if change > 0 else "decreased" if change < 0 else "was unchanged"
            result.append(
                {
                    "entity_name": item["name"],
                    "metric": "overtime_cost",
                    "title": f"Finalized payroll overtime cost {trend}",
                    "detail": (
                        f"{item['name']} finalized payroll overtime cost {trend} by "
                        f"{abs(change):.2f} {item['currency']} versus the immediately "
                        "preceding equal-length period."
                    ),
                    "change": change,
                    "unit": "currency",
                    "currency": item["currency"],
                    "comparison_starts_on": comparison_starts_on,
                    "comparison_ends_on": comparison_ends_on,
                }
            )
    return result


@router.get("/regional-workforce", response_model=RegionalWorkforceResponse)
def regional_workforce_report(
    current_user: CurrentUser,
    db: DBSession,
    starts_on: date = Query(...),
    ends_on: date = Query(...),
    grouping_level: AdministrativeLevel = Query(default="region"),
    company_id: UUID | None = Query(default=None),
    site_id: UUID | None = Query(default=None),
):
    if starts_on > ends_on:
        raise HTTPException(status_code=422, detail="starts_on must be on or before ends_on")
    target_company_id, target_site_id = _scope(current_user, company_id, site_id)
    if target_company_id is not None and not db.query(Company.id).filter(
        Company.id == target_company_id
    ).first():
        raise HTTPException(status_code=404, detail="Company not found")

    sites_query = db.query(Site)
    if target_company_id is not None:
        sites_query = sites_query.filter(Site.company_id == target_company_id)
    if target_site_id is not None:
        sites_query = sites_query.filter(Site.id == target_site_id)
    sites = sites_query.order_by(Site.name).all()
    if target_site_id is not None and not sites:
        raise HTTPException(status_code=404, detail="Site not found")

    current_regions, current_sites = _build_metrics(
        db,
        sites=sites,
        company_id=target_company_id,
        starts_on=starts_on,
        ends_on=ends_on,
        grouping_level=grouping_level,
    )
    duration = (ends_on - starts_on).days + 1
    comparison_ends_on = starts_on - timedelta(days=1)
    comparison_starts_on = comparison_ends_on - timedelta(days=duration - 1)
    previous_regions, _ = _build_metrics(
        db,
        sites=sites,
        company_id=target_company_id,
        starts_on=comparison_starts_on,
        ends_on=comparison_ends_on,
        grouping_level=grouping_level,
    )
    scope_company_name = None
    if target_company_id is not None:
        scope_company_name = db.query(Company.name).filter(
            Company.id == target_company_id
        ).scalar()
    return {
        "starts_on": starts_on,
        "ends_on": ends_on,
        "comparison_starts_on": comparison_starts_on,
        "comparison_ends_on": comparison_ends_on,
        "grouping_level": grouping_level,
        "selected_scope": {
            "company_id": target_company_id,
            "company_name": scope_company_name,
            "site_id": target_site_id,
        },
        "regions": current_regions,
        "sites": current_sites,
        "insights": _insights(
            current_regions,
            previous_regions,
            comparison_starts_on,
            comparison_ends_on,
        ),
    }
