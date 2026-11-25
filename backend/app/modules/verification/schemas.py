from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

class VerificationCourseItem(BaseModel):
    course_name: str
    subject_name: Optional[str] = None
    batch_name: Optional[str] = None
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    timing: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    validity_period: str
    days_remaining: Optional[int] = None
    status: str = "ACTIVE"
    admission_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class StudentVerificationData(BaseModel):
    name: str
    student_code: str
    admission_number: str
    photo_url: Optional[str] = None
    status: str

    model_config = ConfigDict(from_attributes=True)

class IDCardDemoItem(BaseModel):
    demo_reference_number: str
    subject_name: str
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
    demo_start_date: Optional[date] = None
    demo_end_date: Optional[date] = None
    days_remaining: Optional[int] = None
    status: str = "SCHEDULED"

    model_config = ConfigDict(from_attributes=True)

class PublicVerificationResponse(BaseModel):
    verified: bool = True
    is_valid: bool = True
    student: StudentVerificationData
    active_courses: List[VerificationCourseItem] = []
    total_active_courses: int = 0
    active_demos: List[IDCardDemoItem] = []
    total_active_demos: int = 0
    institute_name: str = "Thakurdwara Coaching Institute"
    institute_address: str = "Civil Lines, Thakurdwara (U.P.)"
    institute_phone: str = "+91 98765 43210"
    institute_logo_url: Optional[str] = None
    verified_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True)

class IDCardCourseItem(BaseModel):
    course_name: str
    subject_name: Optional[str] = None
    batch_name: Optional[str] = None
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    timing: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    validity_period: str
    days_remaining: Optional[int] = None
    status: str = "ACTIVE"
    admission_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class IDCardStudentData(BaseModel):
    name: str
    student_code: str
    admission_number: str
    photo_url: Optional[str] = None
    status: str = "ACTIVE"
    due_balance: Decimal = Decimal("0.00")

    model_config = ConfigDict(from_attributes=True)

class PublicIDCardResponse(BaseModel):
    verified: bool = True
    is_valid: bool = True
    student: IDCardStudentData
    active_courses: List[IDCardCourseItem] = []
    total_active_courses: int = 0
    active_demos: List[IDCardDemoItem] = []
    total_active_demos: int = 0
    due_balance: Decimal = Decimal("0.00")
    institute_name: str = "THAKURDWARA COACHING INSTITUTE"
    institute_tagline: str = "Civil Lines, Thakurdwara (U.P.) • ISO 9001:2015 Certified"
    institute_address: str = "Civil Lines, Thakurdwara (U.P.)"
    institute_phone: str = "+91 98765 43210"
    institute_logo_url: Optional[str] = None
    issued_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True)
