import uuid
from datetime import date
from typing import Optional, List
from sqlalchemy import String, Date, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Enquiry(BaseModel):
    __tablename__ = "enquiries"

    enquiry_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    student_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    father_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    school_college: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    purpose: Mapped[str] = mapped_column(String(150), nullable=False, default="Admission Enquiry")
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Direct Walk-in", server_default="Direct Walk-in")
    interested_subject: Mapped[str] = mapped_column(String(150), nullable=False)
    demo_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    demo_duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    demo_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True) 
    # PENDING, ACTIVE_DEMO, INTERESTED, NOT_INTERESTED, CONVERTED, EXPIRED

    converted_student_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    demo_items: Mapped[List["EnquiryDemoItem"]] = relationship("EnquiryDemoItem", back_populates="enquiry", cascade="all, delete-orphan", lazy="selectin")


class EnquiryDemoItem(BaseModel):
    __tablename__ = "enquiry_demo_items"

    enquiry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)
    demo_reference_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)  # e.g. DEM-2026-0001
    
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True, index=True)
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True)
    
    subject_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    teacher_name_snapshot: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hall_number_snapshot: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    demo_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    demo_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    demo_duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SCHEDULED", index=True)
    # SCHEDULED, ATTENDED, CONVERTED, DROPPED, EXPIRED
    drop_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    converted_admission_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("admission_items.id", ondelete="SET NULL"), nullable=True)

    enquiry: Mapped["Enquiry"] = relationship("Enquiry", back_populates="demo_items")
    subject: Mapped[Optional["app.modules.subjects.models.Subject"]] = relationship(
        "app.modules.subjects.models.Subject",
        lazy="joined"
    )
    batch: Mapped[Optional["app.modules.batches.models.Batch"]] = relationship(
        "app.modules.batches.models.Batch",
        lazy="joined"
    )
    admission_item: Mapped[Optional["app.modules.admissions.models.AdmissionItem"]] = relationship(
        "app.modules.admissions.models.AdmissionItem",
        back_populates="demo_item",
        foreign_keys=[converted_admission_item_id],
        lazy="selectin"
    )


def resolve_demo_timing_and_hall(
    itm: EnquiryDemoItem,
    subject: Optional[object] = None,
    batch: Optional[object] = None,
) -> tuple[Optional[str], str]:
    """Resolve demo timing from subject/batch schedule and hall with snapshot -> batch -> subject fallback."""
    sub = subject if subject is not None else itm.__dict__.get("subject")
    bch = batch if batch is not None else itm.__dict__.get("batch")

    sub_sched = (getattr(sub, "schedule", None) or "").strip() if sub else ""
    bch_sched = (getattr(bch, "schedule", None) or "").strip() if bch else ""
    itm_sched = (getattr(itm, "schedule", None) or "").strip()
    timing = sub_sched or bch_sched or itm_sched or None

    snap_hall = (getattr(itm, "hall_number_snapshot", None) or "").strip()
    bch_hall = (getattr(bch, "hall_number", None) or "").strip() if bch else ""
    sub_hall = (getattr(sub, "hall_number", None) or "").strip() if sub else ""
    hall = snap_hall or bch_hall or sub_hall or "Main Hall"

    return timing, hall
