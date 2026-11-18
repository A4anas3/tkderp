from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
import uuid

class GreenCardBase(BaseModel):
    name: str = Field(default="Green Card - All Access Pass", max_length=150)
    price: Decimal = Field(default=Decimal("15000.00"), ge=0)
    validity_days: int = Field(default=365, ge=1, le=3650)
    description: Optional[str] = None
    is_active: bool = True

class GreenCardCreate(GreenCardBase):
    pass

class GreenCardUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[Decimal] = None
    validity_days: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class GreenCardResponse(GreenCardBase):
    id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)
