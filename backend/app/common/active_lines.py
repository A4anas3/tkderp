import zoneinfo
from datetime import date, datetime, timedelta
from typing import Optional, Any, List, Sequence, Tuple

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


def compute_days_remaining_for_periods(
    periods: Sequence[Tuple[Optional[date], Optional[date]]],
    today: Optional[date] = None,
) -> Optional[int]:
    """
    Compute remaining active days across one or more (valid_from, valid_to) validity periods.
    Only days actually covered by a validity period from `today` onward are counted;
    gap days between disjoint periods (and days before a future valid_from) are excluded.
    Contiguous or overlapping periods (next_start <= prev_end + 1 day) merge seamlessly
    so a single/contiguous span matches compute_days_remaining(latest_end, earliest_start, today).
    """
    if not periods:
        return None
    if any(v_to is None for _, v_to in periods):
        return None

    t = today or today_kolkata()

    # Keep only periods that haven't already ended before today
    non_expired = [(v_from, v_to) for v_from, v_to in periods if v_to is not None and v_to >= t]
    if not non_expired:
        # All periods are expired: match single-interval negative days behavior
        latest_end = max(v_to for _, v_to in periods if v_to is not None)
        starts = [v_from for v_from, _ in periods if v_from is not None]
        earliest_start = min(starts) if starts else None
        return compute_days_remaining(latest_end, earliest_start, t)

    intervals: List[Tuple[date, date]] = []
    for v_from, v_to in non_expired:
        eff_start = max(t, v_from) if v_from is not None else t
        if eff_start <= v_to:
            intervals.append((eff_start, v_to))

    if not intervals:
        return 0

    intervals.sort(key=lambda pair: (pair[0], pair[1]))

    merged: List[List[date]] = [[intervals[0][0], intervals[0][1]]]
    for s, e in intervals[1:]:
        prev_e = merged[-1][1]
        if s <= prev_e + timedelta(days=1):
            if e > prev_e:
                merged[-1][1] = e
        else:
            merged.append([s, e])

    covered_days = sum((e - s).days + 1 for s, e in merged)
    return max(0, covered_days - 1)

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
