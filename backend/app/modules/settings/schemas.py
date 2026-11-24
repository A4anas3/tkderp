from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal
from typing import Optional

class InstituteSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str = "institute_profile"
    gstin: str
    gst_rate: Decimal
    institute_name: str
    address: str
    phone: str
    email: str
    logo_url: Optional[str] = None
    govt_regd_no: Optional[str] = None
    iso_certification: Optional[str] = None

class InstituteSettingsUpdate(BaseModel):
    gstin: Optional[str] = Field(None, min_length=1, max_length=50)
    gst_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    institute_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    govt_regd_no: Optional[str] = Field(None, max_length=100)
    iso_certification: Optional[str] = Field(None, max_length=150)

class PublicInstituteProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    institute_name: str
    address: str
    phone: str
    email: str
    logo_url: Optional[str] = None
    govt_regd_no: Optional[str] = None
    iso_certification: Optional[str] = None
