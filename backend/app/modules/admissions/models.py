import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, Date, DateTime, Numeric, Boolean, Text, ForeignKey, Index, Integer
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
    
    payment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="UNPAID", index=True) # UNPAID, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, REVOKED, CANCELLED
    previous_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    access_status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", server_default="ACTIVE", index=True) # ACTIVE, SUSPENDED, EXPIRED, REVOKED
    previous_access_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    document_status: Mapped[str] = mapped_column(String(30), nullable=False, default="VALID", server_default="VALID", index=True) # VALID, VOID
    revoke_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True) # DROPOUT_NO_REFUND, DROPOUT_WITH_REFUND, ENTRY_MISTAKE
    forfeited_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    written_off_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Date-to-date validity / fee period coverage (when to when)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    # Batch / Course Revocation tracking
    revocation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    @property
    def purchase_transaction_id(self) -> str:
        return self.admission_number

    @property
    def student_reg_no(self) -> Optional[str]:
        return self.student.student_code if self.student else None

    @property
    def student_mobile(self) -> Optional[str]:
        return self.student.mobile if self.student else None

    @property
    def student_father_name(self) -> Optional[str]:
        return self.student.father_name if self.student else None

    @property
    def can_cancel(self) -> bool:
        today = date.today()
        if getattr(self, "document_status", "VALID") == "VOID":
            return False
        if self.status in ("CANCELLED", "REVOKED", "EXPIRED", "COMPLETED"):
            return False
        if getattr(self, "access_status", "ACTIVE") in ("EXPIRED", "REVOKED"):
            return False
        if self.valid_to and self.valid_to < today:
            return False
        if "items" in self.__dict__ and self.items:
            for itm in self.items:
                if itm.status in ("EXPIRED", "COMPLETED") or getattr(itm, "access_status", "ACTIVE") == "EXPIRED" or (itm.valid_to and itm.valid_to < today):
                    return False
            if not any(itm.can_cancel for itm in self.items):
                return False
        return True

    # Relationships
    items: Mapped[List["AdmissionItem"]] = relationship("AdmissionItem", back_populates="admission", cascade="all, delete-orphan", lazy="selectin")
    student: Mapped["app.modules.students.models.Student"] = relationship("app.modules.students.models.Student", lazy="joined")

class AdmissionItem(BaseModel):
    __tablename__ = "admission_items"
    __table_args__ = (
        Index("ix_admission_items_student_subject_access", "student_id", "subject_id", "access_status"),
        Index("ix_admission_items_subject_valid_to", "subject_id", "valid_to"),
        Index("ix_admission_items_teacher_valid_to", "teacher_id", "valid_to"),
        Index("ix_admission_items_batch_valid_to", "batch_id", "valid_to"),
        Index("ix_admission_items_access_valid_to", "access_status", "valid_to"),
    )

    admission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
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

    # Date-to-date validity / fee period coverage (when to when)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Subject Lifecycle Status & Tracking
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", index=True) # ACTIVE, UPCOMING, ON_HOLD, SUSPENDED, DISCONTINUED, EXPIRED, COMPLETED
    is_on_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    previous_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    access_status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE", server_default="ACTIVE", index=True) # ACTIVE, SUSPENDED, EXPIRED, REVOKED
    previous_access_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    revoke_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    forfeited_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    written_off_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    keep_due: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    discontinued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    lifecycle_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Renewal Tracking & Price Override
    renewed_from_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("admission_items.id", ondelete="SET NULL"), nullable=True, index=True)
    renewal_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    price_override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Teacher Compensation Snapshot at sale time (never recalculated later)
    share_type: Mapped[str] = mapped_column(String(30), nullable=False, default="PERCENT", server_default="PERCENT")
    share_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    share_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)

    admission: Mapped["Admission"] = relationship("Admission", back_populates="items")
    student: Mapped[Optional["app.modules.students.models.Student"]] = relationship("app.modules.students.models.Student", lazy="joined")
    renewed_from_item: Mapped[Optional["AdmissionItem"]] = relationship("AdmissionItem", remote_side="AdmissionItem.id", lazy="selectin")

    @property
    def can_cancel(self) -> bool:
        today = date.today()
        if self.status in ("EXPIRED", "COMPLETED", "DISCONTINUED"):
            return False
        if getattr(self, "access_status", "ACTIVE") in ("EXPIRED", "REVOKED"):
            return False
        if self.valid_to and self.valid_to < today:
            return False
        return True
