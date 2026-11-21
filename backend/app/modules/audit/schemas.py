import uuid
from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    user_id: Optional[uuid.UUID] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    user_email: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID] = None
    details: Optional[str] = None
    parsed_details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None


class AuditUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    role: str


class AuditStatsResponse(BaseModel):
    total_events: int
    financial_events: int
    student_events: int
    today_events: int
