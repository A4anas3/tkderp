from decimal import Decimal
from typing import Optional, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator
import uuid

class SubjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    default_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    class_category: Optional[str] = None
    default_discount_percentage: Optional[Decimal] = Field(default=Decimal("10.00"), ge=0, le=100)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")
    timing: Optional[str] = None
    teacher_name: Optional[str] = None
    teacher: Optional[str] = None
    code: Optional[str] = None

    @field_validator("teacher", mode="before")
    @classmethod
    def convert_teacher(cls, v: Any):
        if hasattr(v, "name"):
            return getattr(v, "name")
        return v

class SubjectCreate(SubjectBase):
    subject_code: Optional[str] = None
    code: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_fee: Optional[Decimal] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    timing: Optional[str] = None
    class_category: Optional[str] = None
    default_discount_percentage: Optional[Decimal] = Field(default=None, ge=0, le=100)
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")
    teacher_name: Optional[str] = None
    teacher: Optional[str] = None
    code: Optional[str] = None

class SubjectResponse(SubjectBase):
    id: uuid.UUID
    subject_code: str
    code: Optional[str] = None

    @model_validator(mode="after")
    def populate_timing_and_teacher(self):
        if not self.code and self.subject_code:
            self.code = self.subject_code
        if not self.subject_code and self.code:
            self.subject_code = self.code
        if not self.timing and self.schedule:
            self.timing = self.schedule
        if not self.schedule and self.timing:
            self.schedule = self.timing
        if not self.teacher_name and self.teacher_name_snapshot:
            self.teacher_name = self.teacher_name_snapshot
        if not self.teacher and self.teacher_name:
            self.teacher = self.teacher_name
        elif not self.teacher_name and self.teacher:
            self.teacher_name = self.teacher
        return self

    model_config = ConfigDict(from_attributes=True)
