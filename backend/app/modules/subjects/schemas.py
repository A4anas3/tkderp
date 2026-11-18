from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
import uuid

class SubjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    default_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")

class SubjectCreate(SubjectBase):
    subject_code: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_fee: Optional[Decimal] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")

class SubjectResponse(SubjectBase):
    id: uuid.UUID
    subject_code: str

    model_config = ConfigDict(from_attributes=True)
