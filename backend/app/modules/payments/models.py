import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, DateTime, Date, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Payment(BaseModel):
    __tablename__ = "payments"

    payment_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    admission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admissions.id"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="CASH") # CASH, UPI, BANK_TRANSFER, CARD, OTHER
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    
    collected_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    collector_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Date-to-date fee period coverage
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    fee_period: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    allocations: Mapped[List["PaymentAllocation"]] = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan", lazy="selectin")
    admission: Mapped["app.modules.admissions.models.Admission"] = relationship("app.modules.admissions.models.Admission", lazy="joined")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")
    collector_user: Mapped[Optional["app.modules.users.models.User"]] = relationship(
        "app.modules.users.models.User",
        foreign_keys=[collected_by],
        lazy="joined"
    )

class PaymentAllocation(BaseModel):
    __tablename__ = "payment_allocations"

    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=True, index=True)
    refund_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("refunds.id", ondelete="CASCADE"), nullable=True, index=True)
    admission_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admission_items.id"), nullable=False, index=True)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="PAYMENT", server_default="PAYMENT") # PAYMENT, REVERSAL
    reverses_allocation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_allocations.id"), nullable=True)

    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="allocations")
    refund: Mapped[Optional["Refund"]] = relationship("Refund", lazy="selectin")
    reverses_allocation: Mapped[Optional["PaymentAllocation"]] = relationship("PaymentAllocation", remote_side="PaymentAllocation.id", lazy="selectin")

class FinancialTransaction(BaseModel):
    __tablename__ = "financial_transactions"

    txn_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    txn_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True) # PAYMENT, REFUND, REVERSAL, WAIVER, ADJUSTMENT
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    admission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admissions.id"), nullable=False, index=True)
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True)
    refund_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("refunds.id"), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, default="CASH")
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    signed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    txn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    admission: Mapped["app.modules.admissions.models.Admission"] = relationship("app.modules.admissions.models.Admission", lazy="joined")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", lazy="joined")
    refund: Mapped[Optional["Refund"]] = relationship("Refund", lazy="joined")

class Refund(BaseModel):
    __tablename__ = "refunds"

    refund_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    admission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admissions.id"), nullable=False, index=True)
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False) # net paid out
    refund_amount_requested: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00") # gross
    deduction_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    deduction_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refund_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="CASH") # CASH, UPI, BANK_TRANSFER, OTHER
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    processed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    processor_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    admission: Mapped["app.modules.admissions.models.Admission"] = relationship("app.modules.admissions.models.Admission", lazy="joined")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", lazy="joined")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")
