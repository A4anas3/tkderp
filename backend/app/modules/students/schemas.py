from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Any
from datetime import date, datetime
from decimal import Decimal
import uuid
from app.common.validators import validate_mobile_10_digits

class StudentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    dob: Optional[date] = None
    registration_date: date = Field(default_factory=date.today)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE|EXPIRED|REVOKED)$")
    has_green_card: bool = False
    green_card_expiry: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class StudentCreate(StudentBase):
    pass

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    dob: Optional[date] = None
    registration_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE|EXPIRED|REVOKED)$")
    notes: Optional[str] = None

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class StudentRevokeRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)

class StudentResponse(StudentBase):
    id: uuid.UUID
    student_code: str
    latest_admission_number: Optional[str] = None
    revoke_reason: Optional[str] = None
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)

class StudentLineResponse(BaseModel):
    id: uuid.UUID
    admission_id: uuid.UUID
    slip_number: str
    subject_id: Optional[uuid.UUID] = None
    subject_name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    days_left: Optional[int] = None
    net_price: Decimal = Decimal("0.00")
    amount_collected: Decimal = Decimal("0.00")
    balance_due: Decimal = Decimal("0.00")
    last_paid_date: Optional[date] = None
    last_paid_amount: Optional[Decimal] = None
    payment_status: str = "UNPAID"
    access_status: str = "ACTIVE"
    item_type: str = "BATCH_SUBJECT"
    is_expired: bool = False
    is_overdue: bool = False

    @field_validator("last_paid_date", mode="before")
    @classmethod
    def parse_last_paid_date(cls, v):
        if isinstance(v, datetime):
            return v.date()
        return v

    model_config = ConfigDict(from_attributes=True)

class StudentDemoLinkedCourse(BaseModel):
    admission_item_id: uuid.UUID
    subject: str
    admission_number: str

    model_config = ConfigDict(from_attributes=True)

class StudentDemoItemResponse(BaseModel):
    id: uuid.UUID
    demo_reference_number: str
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    hall: Optional[str] = None
    demo_start_date: date
    demo_end_date: date
    demo_duration_days: int
    status: str
    notes: Optional[str] = None
    drop_reason: Optional[str] = None
    enquiry_id: uuid.UUID
    enquiry_code: Optional[str] = None
    converted_admission_item_id: Optional[uuid.UUID] = None
    linked_course: Optional[StudentDemoLinkedCourse] = None

    model_config = ConfigDict(from_attributes=True)

class StudentDetailResponse(StudentResponse):
    total_billed: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    total_refunded: Decimal = Decimal("0.00")
    net_paid: Decimal = Decimal("0.00")
    total_balance_due: Decimal = Decimal("0.00")
    expired_balance_due: Decimal = Decimal("0.00")
    admissions_count: int = 0
    active_admissions_count: int = 0
    revoked_admissions_count: int = 0

    # P3 grouped lines and history
    active: List[StudentLineResponse] = []
    expiring: List[StudentLineResponse] = []
    expired: List[StudentLineResponse] = []
    revoked: List[StudentLineResponse] = []
    slips: List[Any] = []
    transactions: List[Any] = []
    demos: List[StudentDemoItemResponse] = []
