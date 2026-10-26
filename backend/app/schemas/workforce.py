from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class EmployeeCreate(BaseModel):
    company_id: UUID | None = None
    site_id: UUID | None = None
    department_id: UUID | None = None
    position_id: UUID | None = None
    employee_code: str = Field(min_length=1, max_length=100)
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    photo_url: str | None = Field(default=None, max_length=1000)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=50)
    hire_date: date
    employment_status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE|TERMINATED)$")
    contract_type: str = Field(default="PERMANENT", pattern="^(PERMANENT|CONTRACT|TEMPORARY|CASUAL)$")
    base_salary: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    monthly_allowances: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    monthly_bonus: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    monthly_deductions: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="MMK", min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    payment_method: str | None = Field(default=None, max_length=30)
    bank_account_last4: str | None = Field(default=None, pattern="^[0-9]{4}$")

    @field_validator("employee_code", "full_name", mode="before")
    @classmethod
    def strip_employee_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class EmployeeUpdate(BaseModel):
    site_id: UUID | None = None
    department_id: UUID | None = None
    position_id: UUID | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    photo_url: str | None = Field(default=None, max_length=1000)
    emergency_contact_name: str | None = Field(default=None, max_length=255)
    emergency_contact_phone: str | None = Field(default=None, max_length=50)
    hire_date: date | None = None
    employment_status: str | None = Field(default=None, pattern="^(ACTIVE|INACTIVE|TERMINATED)$")
    contract_type: str | None = Field(default=None, pattern="^(PERMANENT|CONTRACT|TEMPORARY|CASUAL)$")
    base_salary: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    monthly_allowances: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    monthly_bonus: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    monthly_deductions: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    payment_method: str | None = Field(default=None, max_length=30)
    bank_account_last4: str | None = Field(default=None, pattern="^[0-9]{4}$")

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_employee_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    site_id: UUID | None
    department_id: UUID | None
    position_id: UUID | None
    user_id: UUID | None
    employee_code: str
    full_name: str
    email: str | None
    phone: str | None
    photo_url: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    hire_date: date
    employment_status: str
    contract_type: str
    currency: str


class EmployeeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: UUID
    uploaded_by_user_id: UUID | None
    category: str
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class EmployeeAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern="^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=128)


class DepartmentCreate(BaseModel):
    company_id: UUID | None = None
    name: str = Field(min_length=2, max_length=150)


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str


class PositionCreate(BaseModel):
    company_id: UUID | None = None
    title: str = Field(min_length=2, max_length=150)


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    title: str


class ShiftCreate(BaseModel):
    company_id: UUID | None = None
    name: str = Field(min_length=2, max_length=100)
    shift_type: str = Field(pattern="^(DAY|NIGHT|JOKER)$")
    starts_at: time
    ends_at: time


class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    shift_type: str
    starts_at: time
    ends_at: time


class ShiftAssignmentCreate(BaseModel):
    employee_id: UUID
    shift_id: UUID
    work_date: date


class ShiftAssignmentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_code: str
    employee_name: str
    site_id: UUID | None
    shift_id: UUID
    shift_name: str
    shift_type: str
    starts_at: time
    ends_at: time
    work_date: date


class AttendanceCreate(BaseModel):
    employee_id: UUID
    work_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    status: str = Field(default="PRESENT", pattern="^(PRESENT|ABSENT|LATE|LEAVE|HOLIDAY)$")
    overtime_minutes: int = Field(default=0, ge=0, le=1440)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_punch_order(self) -> "AttendanceCreate":
        if any(
            stamp is not None and stamp.utcoffset() is None
            for stamp in (self.check_in, self.check_out)
        ):
            raise ValueError("check_in and check_out must include a timezone")
        if self.check_in and self.check_out and self.check_out <= self.check_in:
            raise ValueError("check_out must be later than check_in")
        return self


class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: UUID
    work_date: date
    check_in: datetime | None
    check_out: datetime | None
    status: str
    overtime_minutes: int
    notes: str | None


class LeaveTypeCreate(BaseModel):
    company_id: UUID | None = None
    name: str = Field(min_length=2, max_length=100)
    annual_allowance_days: Decimal = Field(default=Decimal("0"), ge=0, max_digits=6, decimal_places=2)
    is_paid: bool = True


class LeaveTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    name: str
    annual_allowance_days: Decimal
    is_paid: bool


class LeaveRequestCreate(BaseModel):
    employee_id: UUID | None = None
    leave_type_id: UUID
    starts_on: date
    ends_on: date
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_dates(self) -> "LeaveRequestCreate":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class LeaveDecision(BaseModel):
    status: str = Field(pattern="^(APPROVED|REJECTED)$")


class PayrollItemAdjustment(BaseModel):
    allowances: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    bonus: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    deductions: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class AttendanceCorrection(BaseModel):
    check_in: datetime | None = None
    check_out: datetime | None = None
    status: str = Field(pattern="^(PRESENT|ABSENT|LATE|LEAVE|HOLIDAY)$")
    overtime_minutes: int = Field(ge=0, le=1440)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_punch_order(self) -> "AttendanceCorrection":
        if any(
            stamp is not None and stamp.utcoffset() is None
            for stamp in (self.check_in, self.check_out)
        ):
            raise ValueError("check_in and check_out must include a timezone")
        if self.check_in and self.check_out and self.check_out <= self.check_in:
            raise ValueError("check_out must be later than check_in")
        return self


class LeaveRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: UUID
    leave_type_id: UUID
    starts_on: date
    ends_on: date
    reason: str | None
    status: str
    reviewed_by: UUID | None
    reviewed_at: datetime | None


class PayrollRunCreate(BaseModel):
    company_id: UUID | None = None
    period_start: date
    period_end: date
    currency: str = Field(default="MMK", min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    overtime_multiplier: Decimal = Field(default=Decimal("1.5"), gt=0, le=5, max_digits=4, decimal_places=2)
    standard_hours_per_day: Decimal = Field(default=Decimal("8"), gt=0, le=24, max_digits=4, decimal_places=2)
    allowances: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    deductions: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)

    @model_validator(mode="after")
    def validate_period(self) -> "PayrollRunCreate":
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self


class PayrollRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    period_start: date
    period_end: date
    currency: str
    status: str


class PayrollItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    employee_id: UUID
    base_pay: Decimal
    overtime_pay: Decimal
    allowances: Decimal
    bonus_pay: Decimal
    deductions: Decimal
    unpaid_leave_deduction: Decimal
    gross_pay: Decimal
    net_pay: Decimal
    payment_status: str
