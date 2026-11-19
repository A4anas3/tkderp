from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import uuid

class StudentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    dob: Optional[date] = None
    registration_date: date = Field(default_factory=date.today)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE|REVOKED)$")
    has_green_card: bool = False
    green_card_expiry: Optional[date] = None
    notes: Optional[str] = None

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
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE|REVOKED)$")
    notes: Optional[str] = None

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

class StudentDetailResponse(StudentResponse):
    total_billed: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    total_refunded: Decimal = Decimal("0.00")
    net_paid: Decimal = Decimal("0.00")
    total_balance_due: Decimal = Decimal("0.00")
    admissions_count: int = 0
    active_admissions_count: int = 0
    revoked_admissions_count: int = 0
