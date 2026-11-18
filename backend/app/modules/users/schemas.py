from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
import uuid

class CreateUserRequest(BaseModel):
    employee_id: str = Field(..., min_length=2, max_length=50)
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field(default="CASHIER", pattern="^(ADMIN|CASHIER|TEACHER)$")

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern="^(ADMIN|CASHIER|TEACHER)$")
    status: Optional[str] = Field(default=None, pattern="^(ACTIVE|INACTIVE)$")

class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)
