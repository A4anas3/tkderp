from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
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

class SubjectCreate(SubjectBase):
    subject_code: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_fee: Optional[Decimal] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name_snapshot: Optional[str] = None
    hall_number: Optional[str] = None
    schedule: Optional[str] = None
    class_category: Optional[str] = None
    default_discount_percentage: Optional[Decimal] = Field(default=None, ge=0, le=100)
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")

class SubjectResponse(SubjectBase):
    id: uuid.UUID
    subject_code: str

    model_config = ConfigDict(from_attributes=True)
