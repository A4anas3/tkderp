from decimal import Decimal
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
import uuid

class PaymentCreate(BaseModel):
    admission_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CARD|OTHER)$")
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

class PaymentAllocationResponse(BaseModel):
    id: uuid.UUID
    admission_item_id: uuid.UUID
    item_name: Optional[str] = None
    allocated_amount: Decimal

    model_config = ConfigDict(from_attributes=True)

class PaymentResponse(BaseModel):
    id: uuid.UUID
    payment_number: str
    admission_id: uuid.UUID
    student_id: uuid.UUID
    student_name: Optional[str] = None
    admission_number: Optional[str] = None
    amount: Decimal
    payment_mode: str
    transaction_reference: Optional[str] = None
    payment_date: datetime
    collected_by: Optional[uuid.UUID] = None
    collector_name_snapshot: str
    notes: Optional[str] = None
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
    admission_number: str
    total_admission_payable: Decimal
    total_amount_paid_so_far: Decimal
    remaining_balance_due: Decimal
    allocations: List[dict] = Field(default_factory=list)
