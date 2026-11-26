from datetime import date
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List
import uuid
from app.common.validators import validate_mobile_10_digits

class CreateUserRequest(BaseModel):
    employee_id: Optional[str] = None
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: str = Field(...)
    password: str = Field(..., min_length=6)
    role: str = Field(default="CASHIER", pattern="^(ADMIN|CASHIER|TEACHER)$")

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v):
        return validate_mobile_10_digits(v, required=True)

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = Field(default=None, pattern="^(ADMIN|CASHIER|TEACHER)$")
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    new_password: Optional[str] = Field(default=None, min_length=6)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("new_password", mode="before")
    @classmethod
    def empty_password_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)


class LinkedTeacherDetail(BaseModel):
    id: uuid.UUID
    teacher_code: str
    name: str
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    assigned_subjects: List[str] = []
    joining_date: Optional[date] = None
    monthly_salary: Optional[float] = None
    share_type: Optional[str] = None
    share_value: Optional[float] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class LinkedTeacherLookupResponse(BaseModel):
    found: bool
    teacher: Optional[LinkedTeacherDetail] = None
