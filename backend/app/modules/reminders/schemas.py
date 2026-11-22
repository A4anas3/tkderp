import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

class ReminderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    student_code: str
    student_mobile: Optional[str] = None
    father_name: Optional[str] = None
    admission_id: uuid.UUID
    admission_number: str
    admission_item_id: Optional[uuid.UUID] = None
    subject_id: Optional[uuid.UUID] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    batch_id: Optional[uuid.UUID] = None
    batch_name: Optional[str] = None
    course_name: str
    due_date: Optional[date] = None
    formatted_due_date: Optional[str] = None
    due_amount: Decimal
    formatted_due_amount: str
    due_age_days: int = 0
    ageing_bucket: str = "0-30"  # 0-30, 31-60, 61-90, 90+
    kind: str = "due"  # due, due_soon, due_today, overdue_3, overdue_7
    is_expired: bool = False
    message: str
    whatsapp_url: str
    has_mobile: bool
    status: str  # pending, sent, failed
    error_reason: Optional[str] = None
    created_at: datetime
    handled_at: Optional[datetime] = None
    handled_by_name: Optional[str] = None

class ReminderCounts(BaseModel):
    pending: int
    sent: int
    failed: int
    expired_dues: int = 0
    total_due_amount: Decimal
    formatted_total_due: str

class ReminderListResponse(BaseModel):
    items: List[ReminderItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    counts: ReminderCounts

class ReminderGenerateResponse(BaseModel):
    message: str
    count: int

class ReminderMarkFailedRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500, description="Optional failure reason")

class ReminderSendStudentResponse(BaseModel):
    reminder: ReminderItemResponse
    whatsapp_url: str
    message: str
