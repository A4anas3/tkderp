import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator

class EnrollmentItemResponse(BaseModel):
    id: uuid.UUID
    admission_id: uuid.UUID
    admission_number: str
    student_id: uuid.UUID
    student_name: str
    student_code: str
    student_mobile: Optional[str] = None
    father_name: Optional[str] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    hall_number: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    days_left: Optional[int] = None
    net_price: Decimal = Decimal("0.00")
    amount_collected: Decimal = Decimal("0.00")
    balance_due: Decimal = Decimal("0.00")
    last_paid_date: Optional[date] = None
    last_paid_amount: Optional[Decimal] = None
    payment_status: str = "UNPAID" # PAID, PARTIAL, UNPAID
    access_status: str = "ACTIVE" # ACTIVE, SUSPENDED, EXPIRED, REVOKED
    item_type: str = "BATCH_SUBJECT"

    @field_validator("last_paid_date", mode="before")
    @classmethod
    def parse_last_paid_date(cls, v):
        if isinstance(v, datetime):
            return v.date()
        return v

    model_config = ConfigDict(from_attributes=True)

class EnrollmentListResponse(BaseModel):
    items: List[EnrollmentItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
