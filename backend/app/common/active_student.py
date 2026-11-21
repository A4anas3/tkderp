import zoneinfo
from datetime import date, datetime
from typing import Optional, Any
from sqlalchemy import and_, case, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AdmissionItem, Admission

def today_kolkata() -> date:
    tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    return datetime.now(tz).date()

def is_active_student_in_subject(
    item: Any,
    admission: Optional[Any] = None,
    today: Optional[date] = None
) -> bool:
    """
    Single canonical definition of 'active student in subject':
    item.status == ACTIVE and valid_from <= today <= valid_to and admission.status == ACTIVE.
    """
    t = today or today_kolkata()
    
    # 1. Item status check
    if getattr(item, "status", None) != "ACTIVE":
        return False
    
    # 2. Admission status check
    adm = admission
    if adm is None and hasattr(item, "__dict__") and "admission" in item.__dict__:
        adm = item.__dict__["admission"]
    elif adm is None and hasattr(item, "admission"):
        adm = getattr(item, "admission", None)
        
    if adm is not None and getattr(adm, "status", None) != "ACTIVE":
        return False
        
    # 3. Validity range check
    if item.valid_from is not None and item.valid_from > t:
        return False
    if item.valid_to is not None and item.valid_to < t:
        return False
        
    return True

def active_student_subject_filter(
    item_cls=AdmissionItem,
    adm_cls=Admission,
    today: Optional[date] = None
):
    """
    Database-level SQL clause for the single canonical definition:
    item.status == ACTIVE and valid_from <= today <= valid_to and admission.status == ACTIVE.
    """
    t = today or today_kolkata()
    return and_(
        item_cls.status == "ACTIVE",
        adm_cls.status == "ACTIVE",
        item_cls.valid_from.isnot(None),
        item_cls.valid_from <= t,
        item_cls.valid_to.isnot(None),
        item_cls.valid_to >= t
    )

def active_student_subject_case(
    item_cls=AdmissionItem,
    adm_cls=Admission,
    today: Optional[date] = None
):
    """
    Conditional case expression for counting active students in aggregate SQL queries.
    """
    return case((active_student_subject_filter(item_cls, adm_cls, today), 1), else_=None)
