from decimal import Decimal
from typing import Optional, List
from datetime import date
from pydantic import BaseModel, Field, ConfigDict
import uuid

class BatchSubjectItem(BaseModel):
    subject_id: uuid.UUID
    fee: Decimal = Field(..., ge=0)
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1)
    share_type: Optional[str] = Field(default=None, pattern="^(PERCENT|FIXED_MONTHLY|PER_STUDENT)$")
    share_value: Optional[Decimal] = Field(default=None, ge=0)

class BatchSubjectResponse(BaseModel):
    id: uuid.UUID
    subject_id: uuid.UUID
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    fee: Decimal
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    capacity: Optional[int] = None
    share_type: Optional[str] = None
    share_value: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)

class BatchBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    teacher_id: Optional[uuid.UUID] = None
    class_category: str = Field(default="General", max_length=100)
    hall_number: str = Field(..., max_length=50)
    schedule: Optional[str] = None
    capacity: int = Field(default=50, ge=1)
    start_date: date = Field(default_factory=date.today)
    end_date: Optional[date] = None
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|UPCOMING|COMPLETED|INACTIVE)$")

class BatchCreate(BatchBase):
    batch_code: Optional[str] = None
    subjects: List[BatchSubjectItem] = Field(default_factory=list)

class BatchUpdate(BaseModel):
    name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    class_category: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|UPCOMING|COMPLETED|INACTIVE)$")
    subjects: Optional[List[BatchSubjectItem]] = None

class BatchResponse(BatchBase):
    id: uuid.UUID
    batch_code: str
    teacher_name_snapshot: str
    teacher_mobile_snapshot: Optional[str] = None
    subjects: List[BatchSubjectResponse] = Field(default_factory=list)
    enrolled_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

class BatchSubjectActiveSummaryItem(BaseModel):
    batch_subject_id: uuid.UUID
    subject_id: uuid.UUID
    subject_name: str
    subject_code: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: str
    hall_number: str
    schedule: Optional[str] = None
    capacity: int
    active_students: int
    expiring_in_7_days: int
    unpaid_or_partial_count: int
    seats_left: int

class BatchActiveSummaryResponse(BaseModel):
    batch_id: uuid.UUID
    batch_code: str
    batch_name: str
    status: str
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: str
    hall_number: str
    schedule: Optional[str] = None
    capacity: int
    active_students: int
    expiring_in_7_days: int
    unpaid_or_partial_count: int
    seats_left: int
    subjects: List[BatchSubjectActiveSummaryItem] = Field(default_factory=list)
