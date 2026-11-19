from decimal import Decimal
from typing import Optional, List
from datetime import date
from pydantic import BaseModel, Field, ConfigDict
import uuid

class AdmissionItemCreate(BaseModel):
    item_type: str = Field(default="BATCH_SUBJECT", pattern="^(BATCH_SUBJECT|GREEN_CARD)$")
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

    model_config = ConfigDict(from_attributes=True)

class InitialPaymentData(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class AdmissionCreate(BaseModel):
    student_id: uuid.UUID
    admission_date: date = Field(default_factory=date.today)
    items: List[AdmissionItemCreate] = Field(..., min_length=1)
    overall_discount_type: str = Field(default="NONE", pattern="^(NONE|FIXED|PERCENTAGE)$")
    overall_discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    gst_enabled: bool = False
    gst_rate: Decimal = Field(default=Decimal("18.00"), ge=0)
    notes: Optional[str] = None
    initial_payment: Optional[InitialPaymentData] = None

class AdmissionResponse(BaseModel):
    id: uuid.UUID
    admission_number: str
    student_id: uuid.UUID
    student_name_snapshot: str
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
    notes: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    items: List[AdmissionItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

class AdmissionCalculatePreviewRequest(BaseModel):
    items: List[AdmissionItemCreate]
    overall_discount_type: str = "NONE"
    overall_discount_value: Decimal = Decimal("0.00")
    gst_enabled: bool = False
    gst_rate: Decimal = Decimal("18.00")
