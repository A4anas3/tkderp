import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, Date, Numeric, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Admission(BaseModel):
    __tablename__ = "admissions"

    admission_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    student_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    admission_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    
    # Financials
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    individual_discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    overall_discount_type: Mapped[str] = mapped_column(String(20), nullable=False, default="NONE") # NONE, FIXED, PERCENTAGE
    overall_discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    overall_discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    total_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    # GST (Inclusive)
    gst_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("18.00"))
    taxable_base: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    total_payable: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    payment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="UNPAID", index=True) # UNPAID, PARTIALLY_PAID, PAID
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, CANCELLED
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    items: Mapped[List["AdmissionItem"]] = relationship("AdmissionItem", back_populates="admission", cascade="all, delete-orphan", lazy="selectin")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")

class AdmissionItem(BaseModel):
    __tablename__ = "admission_items"

    admission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False, index=True)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False, default="BATCH_SUBJECT") # BATCH_SUBJECT, GREEN_CARD
    
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True, index=True)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True, index=True)
    green_card_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("green_card_products.id"), nullable=True)
    
    # Subject-wise Faculty and Hall snapshot (stored directly - no runtime joins required)
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True, index=True)
    teacher_name_snapshot: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hall_number_snapshot: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    item_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    original_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False, default="NONE") # NONE, FIXED, PERCENTAGE
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    overall_discount_share: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    net_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    amount_collected: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    admission: Mapped["Admission"] = relationship("Admission", back_populates="items")
