import uuid
from datetime import date
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Date, Numeric, Text, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class ExpenseCategory(BaseModel):
    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

class Expense(BaseModel):
    __tablename__ = "expenses"

    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    payment_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="CASH") # CASH, UPI, BANK_TRANSFER, CARD, OTHER
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    added_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    category: Mapped["ExpenseCategory"] = relationship("ExpenseCategory", lazy="joined")

class SalaryRecord(BaseModel):
    __tablename__ = "salary_records"

    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    employee_type: Mapped[str] = mapped_column(String(30), nullable=False, default="TEACHER") # TEACHER, STAFF
    employee_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    month_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True) # e.g. "2026-11"
    salary_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True) # PENDING, PARTIALLY_PAID, PAID
    payment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payment_mode: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    base_salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    holidays_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
