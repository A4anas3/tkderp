import uuid
from decimal import Decimal
from datetime import date, datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Date, DateTime, Numeric, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Teacher(BaseModel):
    __tablename__ = "teachers"

    teacher_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    mobile: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    qualification: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    specialization: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, INACTIVE

    # Teacher compensation settings
    share_type: Mapped[str] = mapped_column(String(30), nullable=False, default="PERCENT", server_default="PERCENT") # PERCENT, FIXED_MONTHLY, PER_STUDENT
    share_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    earnings: Mapped[List["TeacherEarning"]] = relationship(
        "TeacherEarning", back_populates="teacher", cascade="all, delete-orphan", lazy="selectin"
    )
    attendance_records: Mapped[List["TeacherAttendance"]] = relationship(
        "TeacherAttendance", back_populates="teacher", cascade="all, delete-orphan", lazy="select"
    )

class TeacherAttendance(BaseModel):
    __tablename__ = "teacher_attendance"
    __table_args__ = (
        Index("ix_teacher_attendance_teacher_month", "teacher_id", "month_year"),
        Index("ix_teacher_attendance_teacher_date", "teacher_id", "date", unique=True),
    )

    teacher_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    month_year: Mapped[str] = mapped_column(String(7), nullable=False, index=True) # e.g. "2026-11"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ABSENT", server_default="ABSENT") # ABSENT
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="attendance_records")

class TeacherEarning(BaseModel):
    __tablename__ = "teacher_earnings"

    teacher_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    earning_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True) # EARNED, REVERSAL, PAYOUT
    basis: Mapped[str] = mapped_column(String(20), nullable=False, default="CASH", server_default="CASH") # CASH, ACCRUAL
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    payment_allocation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_allocations.id", ondelete="SET NULL"), nullable=True, index=True)
    admission_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("admission_items.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    refund_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("refunds.id", ondelete="SET NULL"), nullable=True)
    salary_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("salary_records.id", ondelete="SET NULL"), nullable=True)
    expense_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True)
    
    payout_mode: Mapped[Optional[str]] = mapped_column(String(30), nullable=True) # CASH, UPI, BANK_TRANSFER, CHEQUE, OTHER
    earning_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="earnings")
