from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import date
import uuid
from app.common.validators import validate_mobile_10_digits

class EnquiryBase(BaseModel):
    student_name: str = Field(..., min_length=2, max_length=150)
    mobile: Optional[str] = None
    purpose: str = Field(default="Admission Enquiry", max_length=150)
    interested_subject: str = Field(..., max_length=150)
    demo_start_date: Optional[date] = None
    demo_duration_days: int = Field(default=3, ge=1, le=30)
    notes: Optional[str] = None
    status: str = Field(default="PENDING", pattern="^(PENDING|ACTIVE_DEMO|INTERESTED|NOT_INTERESTED|CONVERTED|EXPIRED)$")

    @field_validator("mobile", mode="before")
    @classmethod
    def validate_mobile(cls, v):
        return validate_mobile_10_digits(v, required=False)

class EnquiryCreate(EnquiryBase):
    pass

class EnquiryUpdate(BaseModel):
    student_name: Optional[str] = None
    mobile: Optional[str] = None
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

    model_config = ConfigDict(from_attributes=True)

class ConvertEnquiryRequest(BaseModel):
    father_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
