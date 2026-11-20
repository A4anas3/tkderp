import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field


class StudentMarkEntry(BaseModel):
    student_id: uuid.UUID
    marks_obtained: Decimal = Field(..., ge=0)
    remarks: Optional[str] = None


class StudentMarkBulkUpdate(BaseModel):
    marks: List[StudentMarkEntry]


class StudentMarkResponse(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    student_name: Optional[str] = None
    student_code: Optional[str] = None
    marks_obtained: Decimal
    percentage: Decimal
    grade: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    subject_id: uuid.UUID
    batch_id: Optional[uuid.UUID] = None
    teacher_id: Optional[uuid.UUID] = None
    exam_date: date = Field(default_factory=date.today)
    max_marks: Decimal = Field(default=Decimal("100.00"), gt=0)
    passing_marks: Optional[Decimal] = Field(default=Decimal("40.00"), ge=0)


class AssessmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    exam_date: Optional[date] = None
    max_marks: Optional[Decimal] = None
    passing_marks: Optional[Decimal] = None


class AssessmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    subject_id: uuid.UUID
    subject_name: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    teacher_id: Optional[uuid.UUID] = None
    teacher_name: Optional[str] = None
    exam_date: date
    max_marks: Decimal
    passing_marks: Optional[Decimal] = None
    total_students_assessed: int = 0
    average_percentage: Optional[Decimal] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentDetailResponse(AssessmentResponse):
    marks: List[StudentMarkResponse] = []
