from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import date, datetime

class VerificationCourseItem(BaseModel):
    course_name: str
    subject_name: Optional[str] = None
    batch_name: Optional[str] = None
    teacher_name: Optional[str] = None
    hall_number: Optional[str] = None
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
    father_name: Optional[str] = None
    status: str
    registration_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)

class PublicVerificationResponse(BaseModel):
    verified: bool = True
    is_valid: bool = True
    student: StudentVerificationData
    active_courses: List[VerificationCourseItem] = []
    total_active_courses: int = 0
    institute_name: str = "Thakurdwara Coaching Institute"
    institute_address: str = "Civil Lines, Thakurdwara (U.P.)"
    institute_phone: str = "+91 98765 43210"
    verified_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(from_attributes=True)
