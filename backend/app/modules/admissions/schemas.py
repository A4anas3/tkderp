from decimal import Decimal
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator
import uuid

class AdmissionItemCreate(BaseModel):
    item_type: str = Field(default="SUBJECT", pattern="^(SUBJECT|BATCH_SUBJECT|GREEN_CARD)$")
    batch_id: Optional[uuid.UUID] = None
    subject_id: Optional[uuid.UUID] = None
    green_card_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number_snapshot: Optional[str] = None
    item_name_snapshot: str = Field(..., min_length=2, max_length=200)
    original_price: Decimal = Field(..., ge=0)
    discount_type: str = Field(default="NONE", pattern="^(NONE|FIXED|PERCENTAGE)$")
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    renewed_from_item_id: Optional[uuid.UUID] = None
    price_override_reason: Optional[str] = None

class AdmissionItemResponse(BaseModel):
    id: uuid.UUID
    admission_id: uuid.UUID
    item_type: str
    batch_id: Optional[uuid.UUID] = None
    subject_id: Optional[uuid.UUID] = None
    green_card_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number_snapshot: Optional[str] = None
    item_name_snapshot: str
    original_price: Decimal
    discount_type: str
    discount_value: Decimal
    discount_amount: Decimal
    overall_discount_share: Decimal
    net_price: Decimal
    amount_collected: Decimal
    balance_due: Decimal
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    status: str = "ACTIVE"
    previous_status: Optional[str] = None
    access_status: str = "ACTIVE"
    previous_access_status: Optional[str] = None
    revoke_type: Optional[str] = None
    forfeited_amount: Decimal = Decimal("0.00")
    written_off_amount: Decimal = Decimal("0.00")
    keep_due: bool = False
    suspended_at: Optional[datetime] = None
    discontinued_at: Optional[datetime] = None
    lifecycle_reason: Optional[str] = None
    renewed_from_item_id: Optional[uuid.UUID] = None
    renewal_count: int = 0
    price_override_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ManualAllocationItem(BaseModel):
    admission_item_id: Optional[uuid.UUID] = None
    item_id: Optional[uuid.UUID] = None
    allocated_amount: Decimal = Field(..., ge=0)

class InitialPaymentData(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    allocation_mode: str = Field(default="PROPORTIONAL", pattern="^(PROPORTIONAL|SEQUENTIAL|MANUAL)$")
    manual_allocations: Optional[List[ManualAllocationItem]] = None

class AdmissionCreate(BaseModel):
    student_id: uuid.UUID
    admission_date: date = Field(default_factory=date.today)
    items: List[AdmissionItemCreate] = Field(..., min_length=1)
    overall_discount_type: str = Field(default="NONE", pattern="^(NONE|FIXED|PERCENTAGE)$")
    overall_discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_enabled: bool = False
    gst_rate: Decimal = Field(default=Decimal("18.00"), ge=0)
    notes: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    initial_payment: Optional[InitialPaymentData] = None

    @field_validator("initial_payment", mode="before")
    @classmethod
    def parse_initial_payment(cls, v):
        if v is None:
            return None
        if isinstance(v, (int, float, Decimal, str)):
            return {"amount": Decimal(str(v)), "payment_mode": "CASH"}
        return v

class LineRefundAmount(BaseModel):
    item_id: uuid.UUID
    refund_amount: Decimal = Field(..., ge=0)

class AdmissionRevokeRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    revoke_type: str = Field(default="DROPOUT_NO_REFUND", pattern="^(DROPOUT_NO_REFUND|DROPOUT_WITH_REFUND|ENTRY_MISTAKE)$")
    scope: str = Field(default="WHOLE_SLIP", pattern="^(WHOLE_SLIP|SELECTED_ITEMS)$")
    item_ids: Optional[List[uuid.UUID]] = None
    effective_date: Optional[date] = None
    pending_due_action: str = Field(default="WAIVE", pattern="^(KEEP_DUE|WAIVE)$")
    refund_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    refund_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|OTHER)$")
    line_refunds: Optional[List[LineRefundAmount]] = None

class AdmissionResponse(BaseModel):
    id: uuid.UUID
    admission_number: str
    purchase_transaction_id: Optional[str] = None
    student_id: uuid.UUID
    student_name_snapshot: str
    student_reg_no: Optional[str] = None
    student_mobile: Optional[str] = None
    student_father_name: Optional[str] = None
    admission_date: date
    subtotal: Decimal
    individual_discount_total: Decimal
    overall_discount_type: str
    overall_discount_value: Decimal
    overall_discount_amount: Decimal
    total_discount: Decimal
    gst_enabled: bool
    gst_rate: Decimal
    taxable_base: Decimal
    gst_amount: Decimal
    total_payable: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    payment_status: str
    status: str
    access_status: str = "ACTIVE"
    previous_access_status: Optional[str] = None
    document_status: str = "VALID"
    revoke_type: Optional[str] = None
    forfeited_amount: Decimal = Decimal("0.00")
    written_off_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    revocation_reason: Optional[str] = None
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    items: List[AdmissionItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

class AdmissionCalculatePreviewRequest(BaseModel):
    items: List[AdmissionItemCreate]
    overall_discount_type: str = "NONE"
    overall_discount_value: Decimal = Decimal("0.00")
    gst_enabled: bool = False
    gst_rate: Decimal = Decimal("18.00")

class SlipItemResponse(BaseModel):
    id: uuid.UUID
    slip_type: str  # "ADMISSION_INVOICE", "PAYMENT_RECEIPT", "REFUND_VOUCHER"
    slip_number: str
    date: datetime
    title: str
    amount: Decimal
    mode: Optional[str] = None
    ref: Optional[str] = None
    collector_or_processor: Optional[str] = None
    notes: Optional[str] = None
    status_badge: str
    data: dict

class AdmissionSlipsResponse(BaseModel):
    admission_id: uuid.UUID
    admission_number: str
    admission_date: date
    student_id: uuid.UUID
    student_name: str
    student_reg_no: Optional[str] = None
    student_mobile: Optional[str] = None
    student_father_name: Optional[str] = None
    total_payable: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    payment_status: str
    status: str
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    items: List[AdmissionItemResponse] = Field(default_factory=list)
    slips: List[SlipItemResponse] = Field(default_factory=list)

class AdmissionValidityUpdate(BaseModel):
    item_ids: Optional[List[uuid.UUID]] = None
    apply_to_all: bool = False
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    notes: Optional[str] = None

class AdmissionLifecycleAction(BaseModel):
    reason: Optional[str] = None

class AdmissionItemValidityUpdate(BaseModel):
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    notes: Optional[str] = None

class AdmissionItemLifecycleAction(BaseModel):
    action: str = Field(..., pattern="^(SUSPEND|RESUME|DISCONTINUE)$")
    reason: Optional[str] = None

class SubjectRenewalRequest(BaseModel):
    student_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    months: int = Field(default=1, ge=1)
    fee: Optional[Decimal] = Field(default=None, ge=0)
    price_override_reason: Optional[str] = None
    discount_type: str = Field(default="NONE", pattern="^(NONE|FIXED|PERCENTAGE)$")
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    initial_payment: Optional[InitialPaymentData] = None
    notes: Optional[str] = None

class ItemRenewalSpec(BaseModel):
    item_id: uuid.UUID
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    months: Optional[int] = None
    fee: Optional[Decimal] = None
    price_override_reason: Optional[str] = None
    discount_type: Optional[str] = "NONE"
    discount_value: Optional[Decimal] = Decimal("0.00")
    batch_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None

class ItemRenewalRequest(BaseModel):
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    months: Optional[int] = 1
    fee: Optional[Decimal] = None
    price_override_reason: Optional[str] = None
    discount_type: str = Field(default="NONE", pattern="^(NONE|FIXED|PERCENTAGE)$")
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    batch_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    
    # Renewing multiple subjects of one student on one slip
    additional_item_ids: Optional[List[uuid.UUID]] = Field(default_factory=list)
    items: Optional[List[ItemRenewalSpec]] = None

    initial_payment: Optional[InitialPaymentData] = None
    notes: Optional[str] = None

class RenewalsDueItemResponse(BaseModel):
    item_id: uuid.UUID
    admission_id: uuid.UUID
    admission_number: str
    student_id: uuid.UUID
    student_name: str
    student_mobile: Optional[str] = None
    student_code: Optional[str] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    days_remaining: int
    balance_due: Decimal
    net_price: Decimal
    amount_collected: Decimal
    payment_status: str
    status: str
    renewed: bool


