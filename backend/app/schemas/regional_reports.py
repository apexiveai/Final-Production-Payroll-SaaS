from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


AdministrativeLevel = Literal["region", "district", "township", "ward_village_tract"]


class CurrencyAmount(BaseModel):
    currency: str
    amount: float


class RegionalMetric(BaseModel):
    key: str
    name: str
    level: str
    hierarchy: dict[str, str | None]
    site_ids: list[UUID]
    site_count: int
    active_employee_count: int
    data_available: dict[str, bool]
    attendance_record_count: int | None
    attendance_opportunity_count: int
    attendance_data_available: bool
    attendance_rate: float | None
    overtime_minutes: int | None
    payroll_data_available: bool
    cost_availability_reason: str | None
    labor_cost: float | None
    overtime_cost: float | None
    currency: str | None
    labor_cost_by_currency: list[CurrencyAmount]
    overtime_cost_by_currency: list[CurrencyAmount]


class RegionalInsight(BaseModel):
    entity_name: str
    metric: Literal["attendance_rate", "overtime_cost"]
    title: str
    detail: str
    change: float
    unit: str
    currency: str | None
    source: Literal["analytics-derived"] = "analytics-derived"
    is_forecast: Literal[False] = False
    comparison_starts_on: date
    comparison_ends_on: date


class RegionalWorkforceResponse(BaseModel):
    starts_on: date
    ends_on: date
    comparison_starts_on: date
    comparison_ends_on: date
    grouping_level: AdministrativeLevel
    selected_scope: dict[str, UUID | None | str]
    regions: list[RegionalMetric]
    sites: list[RegionalMetric]
    insights: list[RegionalInsight]
