import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class ReminderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    student_code: str
    student_mobile: Optional[str] = None
    admission_id: uuid.UUID
    admission_number: str
    course_name: str
    due_amount: Decimal
    formatted_due_amount: str
    kind: str  # due, due_soon, due_today, overdue_3, overdue_7, expired_due
    is_expired: bool
    message: str
    whatsapp_url: str
    has_mobile: bool
    status: str  # pending, sent, skipped
    created_at: datetime
    handled_at: Optional[datetime] = None
    handled_by_name: Optional[str] = None

class ReminderCounts(BaseModel):
    pending: int
    sent: int
    expired_dues: int
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
