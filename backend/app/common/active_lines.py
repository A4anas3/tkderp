import zoneinfo
from datetime import date, datetime
from typing import Optional, Any, List

def today_kolkata() -> date:
    tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    return datetime.now(tz).date()

def compute_days_remaining(
    valid_to: Optional[date],
    valid_from: Optional[date] = None,
    today: Optional[date] = None,
) -> Optional[int]:
    """
    Compute remaining days for an enrollment as valid_to minus max(today, valid_from).
    Ensures a future-starting enrollment never exceeds its own validity length.
    """
    if valid_to is None:
        return None
    t = today or today_kolkata()
    effective_start = max(t, valid_from) if valid_from is not None else t
    return (valid_to - effective_start).days

def is_active_line(item: Any, today: Optional[date] = None) -> bool:
    """
    Active line rule:
    access_status ACTIVE and valid_from <= today <= valid_to and document_status VALID.
    One function, used everywhere.
    """
    t = today or today_kolkata()
    
    doc_status = "VALID"
    adm_status = "ACTIVE"
    # Check __dict__ to avoid triggering lazy load in async session
    if hasattr(item, "__dict__") and "admission" in item.__dict__:
        adm = item.__dict__["admission"]
        if adm is not None:
            doc_status = getattr(adm, "document_status", "VALID")
            adm_status = getattr(adm, "status", "ACTIVE")
    elif hasattr(item, "document_status"):
        doc_status = getattr(item, "document_status", "VALID")
    
    if doc_status != "VALID":
        return False
    
    if adm_status in ("REVOKED", "CANCELLED", "DISCONTINUED"):
        return False
    
    access_status = getattr(item, "access_status", "ACTIVE")
    if access_status in ("REVOKED", "CANCELLED", "DISCONTINUED"):
        return False
    if access_status != "ACTIVE":
        return False
    
    item_status = getattr(item, "status", "ACTIVE")
    if item_status in ("REVOKED", "CANCELLED", "DISCONTINUED"):
        return False
    
    if item.valid_from is not None and item.valid_from > t:
        return False
    if item.valid_to is not None and item.valid_to < t:
        return False
    
    return True

def derive_student_status(items: List[Any], today: Optional[date] = None) -> str:
    """
    Student status derived from lines:
    ACTIVE if any line is active, otherwise ACTIVE.
    A student is only REVOKED if explicitly revoked at the student level.
    """
    if not items:
        return "ACTIVE"
    
    t = today or today_kolkata()
    if any(is_active_line(itm, t) for itm in items):
        return "ACTIVE"
    
    return "ACTIVE"
