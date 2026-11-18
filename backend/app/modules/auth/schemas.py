from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
import uuid

class LoginRequest(BaseModel):
    username: str # Employee ID or Email
    password: str

class UserResponse(BaseModel):
    id: uuid.UUID
    employee_id: str
    full_name: str
    email: str
    role: str
    status: str

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
