import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, Text, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class Assessment(BaseModel):
    __tablename__ = "assessments"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True)
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True)
    
    exam_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    max_marks: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("100.00"))
    passing_marks: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True, default=Decimal("40.00"))
    
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    subject: Mapped["app.modules.subjects.models.Subject"] = relationship("app.modules.subjects.models.Subject", lazy="joined")
    batch: Mapped[Optional["app.modules.batches.models.Batch"]] = relationship("app.modules.batches.models.Batch", lazy="joined")
    teacher: Mapped[Optional["app.modules.teachers.models.Teacher"]] = relationship("app.modules.teachers.models.Teacher", lazy="joined")
    marks: Mapped[List["StudentMark"]] = relationship("StudentMark", back_populates="assessment", cascade="all, delete-orphan", lazy="selectin")


class StudentMark(BaseModel):
    __tablename__ = "student_marks"

    assessment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    
    marks_obtained: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    grade: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    recorded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    assessment: Mapped["Assessment"] = relationship("Assessment", back_populates="marks")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")
