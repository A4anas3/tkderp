import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List, Dict
from pydantic import BaseModel

class RenewalValidityPeriod(BaseModel):
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class RenewalItemResponse(BaseModel):
    item_id: uuid.UUID
    admission_id: uuid.UUID
    admission_number: str
    student_id: uuid.UUID
    student_name: str
    student_code: str
    student_mobile: Optional[str] = None
    father_name: Optional[str] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    hall_number: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: date
    validity_periods: List[RenewalValidityPeriod] = []
    days_diff: int
    days_remaining: Optional[int] = None
    days_ago: Optional[int] = None
    status_label: str
    category: str # "EXPIRING" | "EXPIRED"
    whatsapp_url: str
    whatsapp_message: str
    balance_due: Decimal = Decimal("0.00")
    net_price: Decimal = Decimal("0.00")
    amount_collected: Decimal = Decimal("0.00")
    payment_status: Optional[str] = None
    status: Optional[str] = None

class RenewalCounts(BaseModel):
    expiring_count: int = 0
    recently_expired_count: int = 0
    total_count: int = 0

class RenewalsSummaryResponse(BaseModel):
    as_of_date: date
    expiring: List[RenewalItemResponse]
    recently_expired: List[RenewalItemResponse]
    counts: RenewalCounts
    total: int = 0
    total_pages: int = 1
    page: int = 1
    page_size: int = 20
