from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Dict, Any
from datetime import date
import uuid
from app.common.validators import validate_mobile_10_digits

class EnquiryDemoItemCreate(BaseModel):
    subject_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    subject_name: Optional[str] = None
    subject_name_snapshot: Optional[str] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number_snapshot: Optional[str] = None
    demo_start_date: Optional[date] = None
    demo_end_date: Optional[date] = None
    demo_duration_days: int = Field(default=3, ge=1, le=30)
    notes: Optional[str] = None

class EnquiryDemoItemResponse(BaseModel):
    id: uuid.UUID
    enquiry_id: uuid.UUID
    demo_reference_number: str
    subject_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    subject_name_snapshot: str
    teacher_name_snapshot: Optional[str] = None
    hall_number_snapshot: Optional[str] = None
    demo_start_date: date
    demo_end_date: date
    demo_duration_days: int
    status: str
    drop_reason: Optional[str] = None
    notes: Optional[str] = None
    converted_admission_item_id: Optional[uuid.UUID] = None
    days_remaining: Optional[int] = None
    status_label: Optional[str] = None
    badge_variant: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class EnquiryDemoItemStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(ACTIVE|SCHEDULED|ATTENDED|CONVERTED|DROPPED|EXPIRED)$")
    drop_reason: Optional[str] = None
    notes: Optional[str] = None

class EnquiryBase(BaseModel):
    student_name: str = Field(..., min_length=2, max_length=150)
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    school_college: Optional[str] = None
    purpose: str = Field(default="Admission Enquiry", max_length=150)
    interested_subject: Optional[str] = None
    demo_start_date: Optional[date] = None
    demo_duration_days: int = Field(default=3, ge=1, le=30)
    notes: Optional[str] = None
    status: str = Field(default="PENDING", pattern="^(PENDING|ACTIVE_DEMO|INTERESTED|NOT_INTERESTED|CONVERTED|EXPIRED)$")

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class EnquiryCreate(EnquiryBase):
    demo_items: Optional[List[EnquiryDemoItemCreate]] = None

class EnquiryUpdate(BaseModel):
    student_name: Optional[str] = None
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    school_college: Optional[str] = None
    purpose: Optional[str] = None
    interested_subject: Optional[str] = None
    demo_start_date: Optional[date] = None
    demo_duration_days: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(PENDING|ACTIVE_DEMO|INTERESTED|NOT_INTERESTED|CONVERTED|EXPIRED)$")

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class EnquiryResponse(EnquiryBase):
    id: uuid.UUID
    enquiry_code: str
    demo_deadline: Optional[date] = None
    remaining_days: Optional[int] = None
    converted_student_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    demo_items: List[EnquiryDemoItemResponse] = []

    model_config = ConfigDict(from_attributes=True)

class ConvertEnquiryRequest(BaseModel):
    father_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    demo_item_ids: Optional[List[uuid.UUID]] = None  # Selective conversion of specific demo subjects

# Register Row for individual demo passes / tickets
class EnquiryDemoRegisterItem(BaseModel):
    demo_item_id: uuid.UUID
    enquiry_id: uuid.UUID
    enquiry_code: str
    demo_reference_number: str
    student_name: str
    mobile: Optional[str] = None
    father_name: Optional[str] = None
    school_college: Optional[str] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
    demo_start_date: date
    demo_end_date: date
    demo_duration_days: int
    days_remaining: int
    status: str
    status_label: str
    badge_variant: str
    drop_reason: Optional[str] = None
    notes: Optional[str] = None
    converted_admission_item_id: Optional[uuid.UUID] = None

# Analytics schemas
class TeacherDemoMetric(BaseModel):
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: str
    total_demos: int
    active_demos: int
    attended_demos: int
    converted_admissions: int
    dropped_demos: int
    expired_demos: int
    conversion_rate_percentage: float

class SubjectDemoMetric(BaseModel):
    subject_id: Optional[uuid.UUID] = None
    subject_name: str
    total_demos: int
    active_demos: int
    converted_admissions: int
    dropped_demos: int
    conversion_rate_percentage: float

class DemoAnalyticsSummary(BaseModel):
    total_demos: int
    active_demos: int
    attended_demos: int
    converted_admissions: int
    dropped_demos: int
    overall_conversion_rate: float

class DemoAnalyticsResponse(BaseModel):
    summary: DemoAnalyticsSummary
    by_teacher: List[TeacherDemoMetric]
    by_subject: List[SubjectDemoMetric]
    filters: Dict[str, Any]
