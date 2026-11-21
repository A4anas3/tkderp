import zoneinfo
from datetime import date, datetime
from typing import Optional, Any, List

def today_kolkata() -> date:
    tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    return datetime.now(tz).date()

def is_active_line(item: Any, today: Optional[date] = None) -> bool:
    """
    Active line rule:
    access_status ACTIVE and valid_from <= today <= valid_to and document_status VALID.
    One function, used everywhere.
    """
    t = today or today_kolkata()
    
    doc_status = "VALID"
    # Check __dict__ to avoid triggering lazy load in async session
    if hasattr(item, "__dict__") and "admission" in item.__dict__:
        adm = item.__dict__["admission"]
        if adm is not None:
            doc_status = getattr(adm, "document_status", "VALID")
    elif hasattr(item, "document_status"):
        doc_status = getattr(item, "document_status", "VALID")
    
    if doc_status != "VALID":
        return False
    
    access_status = getattr(item, "access_status", "ACTIVE")
    if access_status != "ACTIVE":
        return False
    
    if item.valid_from is not None and item.valid_from > t:
        return False
    if item.valid_to is not None and item.valid_to < t:
        return False
    
    return True

def derive_student_status(items: List[Any], today: Optional[date] = None) -> str:
    """
    Student status derived from lines:
    ACTIVE if any line is active,
    EXPIRED if all lines expired,
    REVOKED if all revoked.
    """
    if not items:
        return "ACTIVE"
    
    t = today or today_kolkata()
    if any(is_active_line(itm, t) for itm in items):
        return "ACTIVE"
    
    # Check if all lines are revoked
    if all(getattr(itm, "access_status", "ACTIVE") == "REVOKED" for itm in items):
        return "REVOKED"
    
    return "EXPIRED"
