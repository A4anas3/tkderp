import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, DateTime, Numeric, Text, ForeignKey
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

    allocations: Mapped[List["PaymentAllocation"]] = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan", lazy="selectin")
    admission: Mapped["app.modules.admissions.models.Admission"] = relationship("app.modules.admissions.models.Admission", lazy="joined")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")

class PaymentAllocation(BaseModel):
    __tablename__ = "payment_allocations"

    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True)
    admission_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admission_items.id"), nullable=False, index=True)
    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    payment: Mapped["Payment"] = relationship("Payment", back_populates="allocations")
