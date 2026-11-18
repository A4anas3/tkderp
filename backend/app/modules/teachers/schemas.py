from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import date
import uuid

class TeacherBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    mobile: str = Field(..., min_length=10, max_length=15)
    email: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    photo_url: Optional[str] = None
    joining_date: date = Field(default_factory=date.today)
    status: str = Field(default="ACTIVE", pattern="^(ACTIVE|INACTIVE)$")

class TeacherCreate(TeacherBase):
    pass

class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    photo_url: Optional[str] = None
    joining_date: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")

class TeacherResponse(TeacherBase):
    id: uuid.UUID
    teacher_code: str
    user_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)
