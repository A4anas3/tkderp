import uuid
from datetime import date
from typing import Optional
from sqlalchemy import String, Date, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Enquiry(BaseModel):
    __tablename__ = "enquiries"

    enquiry_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    student_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    purpose: Mapped[str] = mapped_column(String(150), nullable=False, default="Admission Enquiry")
    interested_subject: Mapped[str] = mapped_column(String(150), nullable=False)
    demo_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    demo_duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    demo_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True) 
    # PENDING, ACTIVE_DEMO, CONVERTED, EXPIRED, NOT_INTERESTED

    converted_student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
