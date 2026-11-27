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
    timing: Optional[str] = None
    demo_start_date: date
    demo_end_date: date
    demo_duration_days: int
    status: str
    drop_reason: Optional[str] = None
    notes: Optional[str] = None
    converted_admission_item_id: Optional[uuid.UUID] = None
    converted_admission_id: Optional[uuid.UUID] = None
    converted_student_id: Optional[uuid.UUID] = None
    converted_student_code: Optional[str] = None
    converted_course_name: Optional[str] = None
    converted_admission_number: Optional[str] = None
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
    source: Optional[str] = Field(default="Direct Walk-in", max_length=100)
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
    student_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    student_id: Optional[uuid.UUID] = None
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
    converted_student_id: Optional[uuid.UUID] = None

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
    converted_student_code: Optional[str] = None
    has_student_admission: bool = False
    has_course_purchase: bool = False
    course_admission_id: Optional[uuid.UUID] = None
    course_admission_number: Optional[str] = None
    course_items_count: int = 0
    created_by: Optional[uuid.UUID] = None
    demo_items: List[EnquiryDemoItemResponse] = []

    model_config = ConfigDict(from_attributes=True)

class ConvertEnquiryRequest(BaseModel):
    father_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    demo_item_ids: Optional[List[uuid.UUID]] = None  # Selective conversion of specific demo subjects
    admission_id: Optional[uuid.UUID] = None

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
    timing: Optional[str] = None
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
    converted_admission_id: Optional[uuid.UUID] = None
    converted_student_id: Optional[uuid.UUID] = None
    converted_student_code: Optional[str] = None
    converted_course_name: Optional[str] = None
    converted_admission_number: Optional[str] = None

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

# Student Registration from Enquiry schemas
class RegisterStudentFromEnquiryRequest(BaseModel):
    selected_student_id: Optional[uuid.UUID] = None
    force_create: bool = False

class RegisterStudentStandaloneRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    mobile: str
    father_name: Optional[str] = None
    school_college: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    dob: Optional[date] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    selected_student_id: Optional[uuid.UUID] = None
    force_create: bool = False

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=True)

class StudentMatchItem(BaseModel):
    id: uuid.UUID
    student_code: str
    name: str
    father_name: Optional[str] = None
    mobile: Optional[str] = None
    registration_date: Optional[date] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class StudentMobileCheckResponse(BaseModel):
    valid: bool = True
    exists: bool = False
    multiple_matches: bool = False
    normalized_mobile: Optional[str] = None
    student: Optional[StudentMatchItem] = None
    matches: List[StudentMatchItem] = []
    message: str = ""

class RegisterStudentResponse(BaseModel):
    success: bool = True
    already_registered: bool = False
    multiple_matches: bool = False
    student_id: Optional[uuid.UUID] = None
    student_code: Optional[str] = None
    student_name: Optional[str] = None
    mobile: Optional[str] = None
    message: str
    matches: List[StudentMatchItem] = []
