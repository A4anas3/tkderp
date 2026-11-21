from decimal import Decimal
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel, Field, ConfigDict
import uuid

class ManualAllocationItem(BaseModel):
    admission_item_id: uuid.UUID
    allocated_amount: Decimal = Field(..., ge=0)

class PaymentCreate(BaseModel):
    admission_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    fee_period: Optional[str] = None
    allocation_mode: str = Field(default="PROPORTIONAL", pattern="^(PROPORTIONAL|SEQUENTIAL|MANUAL)$")
    manual_allocations: Optional[List[ManualAllocationItem]] = None

class PaymentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(default=None, gt=0)
    payment_mode: Optional[str] = Field(default=None, pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    edit_reason: str = Field(..., min_length=3, max_length=500)

class RefundCreate(BaseModel):
    admission_id: uuid.UUID
    payment_id: Optional[uuid.UUID] = None
    item_id: Optional[uuid.UUID] = None
    amount: Decimal = Field(..., gt=0)
    refund_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    reason: str = Field(..., min_length=3, max_length=500)
    deduction_amount: Optional[Decimal] = Field(default=None, ge=0)
    deduction_reason: Optional[str] = None
    notes: Optional[str] = None
    revoke_admission: bool = False

class RefundResponse(BaseModel):
    id: uuid.UUID
    refund_number: str
    admission_id: uuid.UUID
    payment_id: Optional[uuid.UUID] = None
    student_id: uuid.UUID
    student_name: Optional[str] = None
    admission_number: Optional[str] = None
    course_name: Optional[str] = None
    amount: Decimal
    refund_mode: str
    reason: str
    refund_date: datetime
    processed_by: Optional[uuid.UUID] = None
    processor_name_snapshot: str
    notes: Optional[str] = None
    admission_status: Optional[str] = None
    revoked: bool = False

    model_config = ConfigDict(from_attributes=True)

class RefundReceiptResponse(BaseModel):
    refund_number: str
    refund_date: datetime
    amount: Decimal
    refund_mode: str
    reason: str
    processor_name: str
    student_name: str
    student_reg_no: str
    student_mobile: Optional[str] = None
    student_father_name: Optional[str] = None
    admission_number: str
    course_name: Optional[str] = None
    admission_total_payable: Decimal
    net_amount_paid_after_refund: Decimal
    remaining_balance_due: Decimal
    notes: Optional[str] = None

class PaymentAllocationResponse(BaseModel):
    id: uuid.UUID
    admission_item_id: uuid.UUID
    item_name: Optional[str] = None
    allocated_amount: Decimal
    kind: str = "PAYMENT"
    reverses_allocation_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)

class PaymentResponse(BaseModel):
    id: uuid.UUID
    payment_number: str
    admission_id: uuid.UUID
    student_id: uuid.UUID
    student_name: Optional[str] = None
    admission_number: Optional[str] = None
    course_name: Optional[str] = None
    amount: Decimal
    payment_mode: str
    transaction_reference: Optional[str] = None
    payment_date: datetime
    collected_by: Optional[uuid.UUID] = None
    collector_name_snapshot: str
    notes: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    fee_period: Optional[str] = None
    allocations: List[PaymentAllocationResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

class PaymentReceiptResponse(BaseModel):
    payment_number: str
    payment_date: datetime
    amount: Decimal
    payment_mode: str
    transaction_reference: Optional[str] = None
    collector_name: str
    student_name: str
    student_reg_no: str
    student_mobile: Optional[str] = None
    student_father_name: Optional[str] = None
    admission_number: str
    total_admission_payable: Decimal
    total_amount_paid_so_far: Decimal
    remaining_balance_due: Decimal
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    fee_period: Optional[str] = None
    allocations: List[dict] = Field(default_factory=list)

class TransactionResponse(BaseModel):
    id: uuid.UUID
    type: str  # "PAYMENT" or "REFUND"
    number: str
    date: datetime
    amount: Decimal
    mode: str
    ref: Optional[str] = None
    notes: Optional[str] = None
    collector: Optional[str] = None
    admission_id: Optional[uuid.UUID] = None
    admission_number: Optional[str] = None
    course_name: Optional[str] = None
    fee_period: Optional[str] = None
    payment_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)

class FinancialTransactionResponse(BaseModel):
    id: uuid.UUID
    txn_number: str
    txn_type: str
    student_id: uuid.UUID
    admission_id: Optional[uuid.UUID] = None
    payment_id: Optional[uuid.UUID] = None
    refund_id: Optional[uuid.UUID] = None
    mode: str
    reference: Optional[str] = None
    signed_amount: Decimal
    txn_at: datetime
    reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
