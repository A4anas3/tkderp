import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, Date, Numeric, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Batch(BaseModel):
    __tablename__ = "batches"

    batch_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True, index=True)
    
    # Teacher snapshot per section 9 requirements
    teacher_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    teacher_mobile_snapshot: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    class_category: Mapped[str] = mapped_column(String(100), nullable=False, default="General") # e.g. 9-10, 11-12, Foundation
    hall_number: Mapped[str] = mapped_column(String(50), nullable=False)
    schedule: Mapped[Optional[str]] = mapped_column(String(200), nullable=True) # e.g. Mon-Fri 9:00 AM - 10:00 AM
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=50, server_default="50")
    start_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, UPCOMING, COMPLETED, INACTIVE

    # Relationships
    subjects: Mapped[List["BatchSubject"]] = relationship("BatchSubject", back_populates="batch", cascade="all, delete-orphan", lazy="selectin")

class BatchSubject(BaseModel):
    __tablename__ = "batch_subjects"

    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False, index=True)
    fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    # Subject-wise Faculty, Hall, Schedule & Capacity
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True, index=True)
    teacher_name_snapshot: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hall_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    schedule: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Optional teacher compensation override per batch subject
    share_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True) # PERCENT, FIXED_MONTHLY, PER_STUDENT
    share_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)

    batch: Mapped["Batch"] = relationship("Batch", back_populates="subjects")
    subject: Mapped["Subject"] = relationship("app.modules.subjects.models.Subject", lazy="joined")
    teacher: Mapped[Optional["app.modules.teachers.models.Teacher"]] = relationship("app.modules.teachers.models.Teacher", lazy="joined")
