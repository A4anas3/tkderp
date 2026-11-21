from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import uuid
from app.common.validators import validate_mobile_10_digits

class TeacherBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    mobile: str = Field(...)
    email: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    photo_url: Optional[str] = None
    joining_date: date = Field(default_factory=date.today)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")
    share_type: str = Field(default="PERCENT", pattern="^(PERCENT|FIXED_MONTHLY|PER_STUDENT)$")
    share_value: Decimal = Field(default=Decimal("0.00"), ge=0)

    @field_validator("qualification", "specialization", mode="before")
    @classmethod
    def sanitize_empty_strings(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=True)

class TeacherCreate(TeacherBase):
    pass

class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    photo_url: Optional[str] = None
    joining_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    share_type: Optional[str] = Field(default=None, pattern="^(PERCENT|FIXED_MONTHLY|PER_STUDENT)$")
    share_value: Optional[Decimal] = Field(default=None, ge=0)

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class TeacherResponse(TeacherBase):
    id: uuid.UUID
    teacher_code: str
    user_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)

class TeacherEnrollmentItem(BaseModel):
    item_id: uuid.UUID
    admission_id: uuid.UUID
    admission_number: str
    admission_date: date
    student_id: uuid.UUID
    student_code: str
    student_name: str
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    photo_url: Optional[str] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    subject_code: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: str
    hall_number: str
    fee_billed: float
    fee_collected: float
    balance_due: float
    payment_status: str
    admission_status: str
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    days_remaining: int
    cycle_status: str  # ACTIVE, INACTIVE, CANCELLED
    status_label: str
    badge_variant: str
    status_subtext: str
    billing_day: Optional[int] = None
    cycle_period_label: str

class TeacherRosterMetrics(BaseModel):
    total_enrollments: int
    active_enrollments: int
    inactive_enrollments: int
    cancelled_enrollments: int
    unique_students_count: int

class TeacherSubjectOption(BaseModel):
    id: uuid.UUID
    name: str

class TeacherRosterResponse(BaseModel):
    items: list[TeacherEnrollmentItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    metrics: TeacherRosterMetrics
    subjects: list[TeacherSubjectOption] = []

class TeacherPayoutCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payout_mode: str = Field(default="CASH", pattern="^(CASH|UPI|BANK_TRANSFER|CHEQUE|OTHER)$")
    payment_date: Optional[date] = None
    notes: Optional[str] = None
    reference: Optional[str] = None

class TeacherPayoutResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    amount: Decimal
    payout_mode: str
    earning_date: datetime
    salary_record_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TeacherSubjectEarningItem(BaseModel):
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    earned: Decimal
    reversed: Decimal
    net_earned: Decimal

class TeacherEarningsResponse(BaseModel):
    teacher_id: uuid.UUID
    teacher_name: str
    teacher_code: str
    share_type: str
    share_value: Decimal
    basis: str
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    total_earned: Decimal
    total_reversed: Decimal
    net_earned: Decimal
    total_paid: Decimal
    payable: Decimal
    by_subject: List[TeacherSubjectEarningItem]
    payouts: List[dict]
