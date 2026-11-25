from decimal import Decimal
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict
import uuid
from app.common.pagination import PageResponse

# Categories
class ExpenseCategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: bool = True

class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass

class ExpenseCategoryResponse(ExpenseCategoryBase):
    id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

# Daily Expenses
class ExpenseBase(BaseModel):
    category_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=200)
    amount: Decimal = Field(..., gt=0)
    expense_date: date = Field(default_factory=date.today)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseResponse(ExpenseBase):
    id: uuid.UUID
    category_name: Optional[str] = None
    added_by: Optional[uuid.UUID] = None
    model_config = ConfigDict(from_attributes=True)

class ExpensePageResponse(PageResponse[ExpenseResponse]):
    total_amount: Decimal = Decimal("0.00")

# Salary Records
class SalaryRecordBase(BaseModel):
    employee_id: Optional[uuid.UUID] = None
    employee_type: str = Field(default="TEACHER", pattern="^(TEACHER|STAFF)$")
    employee_name_snapshot: str = Field(..., min_length=2, max_length=150)
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$") # e.g. 2026-11
    salary_amount: Decimal = Field(..., gt=0)
    due_date: date
    notes: Optional[str] = None
    base_salary: Optional[Decimal] = None
    holidays_count: Optional[int] = 0

class SalaryRecordCreate(SalaryRecordBase):
    pass

class PaySalaryRequest(BaseModel):
    paid_amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(default="BANK_TRANSFER", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    payment_date: date = Field(default_factory=date.today)
    notes: Optional[str] = None

class SalaryRecordResponse(SalaryRecordBase):
    id: uuid.UUID
    paid_amount: Decimal
    status: str
    payment_date: Optional[date] = None
    payment_mode: Optional[str] = None
    absent_days_count: Optional[int] = None
    base_salary: Optional[Decimal] = None
    holidays_count: Optional[int] = 0
    model_config = ConfigDict(from_attributes=True)

class SalaryFilterStaffOption(BaseModel):
    key: str
    label: str
    employee_id: Optional[uuid.UUID] = None
    employee_name: str
    employee_type: Optional[str] = None

class SalaryFilterOptionsResponse(BaseModel):
    staff: list[SalaryFilterStaffOption]
    months: list[str]

class SalaryPageResponse(PageResponse[SalaryRecordResponse]):
    total_amount: Decimal = Decimal("0.00")
    total_paid_amount: Decimal = Decimal("0.00")
    total_salary_amount: Decimal = Decimal("0.00")


class SalarySlipResponse(BaseModel):
    id: uuid.UUID
    slip_number: str
    employee_id: Optional[uuid.UUID] = None
    employee_type: str
    employee_name: str
    employee_code: Optional[str] = None
    employee_mobile: Optional[str] = None
    employee_email: Optional[str] = None
    employee_qualification: Optional[str] = None
    employee_specialization: Optional[str] = None
    month_year: str
    month_label: str
    base_salary: Optional[Decimal] = None
    salary_amount: Decimal
    paid_amount: Decimal
    balance_due: Decimal
    payment_mode: Optional[str] = None
    payment_date: Optional[date] = None
    due_date: date
    status: str
    absent_days_count: Optional[int] = None
    holidays_count: int = 0
    calendar_days: int = 30
    notes: Optional[str] = None
    disbursed_by: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
