import re
import uuid
from typing import Optional, Set, List, Dict, Any
from datetime import date
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.database.models import Batch, BatchSubject

DAY_MAP = {
    "mon": 0, "monday": 0,
    "tue": 1, "tuesday": 1,
    "wed": 2, "wednesday": 2,
    "thu": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6
}

def parse_time(t_str: Optional[str]) -> Optional[int]:
    """
    Parses a time string like '04:00 PM', '4PM', '09:00', '16:30' into minutes from midnight (0-1439).
    """
    if not t_str:
        return None
    t_str = t_str.strip().upper()
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$", t_str)
    if not m:
        return None
    hr = int(m.group(1))
    mn = int(m.group(2) or 0)
    meridiem = m.group(3)
    if meridiem == "PM" and hr < 12:
        hr += 12
    elif meridiem == "AM" and hr == 12:
        hr = 0
    return hr * 60 + mn

def parse_days(text: Optional[str]) -> Set[int]:
    """
    Parses days string like 'Mon-Sat', 'Daily', 'Mon,Wed,Fri', 'Tue-Thu' into a set of day numbers (0=Mon..6=Sun).
    """
    if not text:
        return set(range(7))
    text_lower = text.lower().strip()
    if "daily" in text_lower:
        return set(range(7))
    
    # Check ranges like mon-sat, mon-fri
    range_match = re.search(r"(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*-\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*", text_lower)
    if range_match:
        d1 = DAY_MAP[range_match.group(1)]
        d2 = DAY_MAP[range_match.group(2)]
        if d1 <= d2:
            return set(range(d1, d2 + 1))
        else:
            return set(range(d1, 7)) | set(range(0, d2 + 1))
            
    days = set()
    for token in re.split(r"[,/\s]+", text_lower):
        clean = re.sub(r"[^a-z]", "", token)
        if clean in DAY_MAP:
            days.add(DAY_MAP[clean])
            
    return days or set(range(7))

def schedules_overlap(s1: Optional[str], s2: Optional[str]) -> bool:
    """
    Returns True if two schedule strings have overlapping days and overlapping time intervals.
    """
    if not s1 or not s2:
        return False
    
    s1_clean = s1.strip().lower()
    s2_clean = s2.strip().lower()
    if s1_clean == s2_clean:
        return True
    
    time_pat = r"(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)"
    m1 = re.search(time_pat, s1)
    m2 = re.search(time_pat, s2)
    
    if not m1 or not m2:
        # Fallback to exact match check
        return s1_clean == s2_clean
    
    t1_start = parse_time(m1.group(1))
    t1_end = parse_time(m1.group(2))
    t2_start = parse_time(m2.group(1))
    t2_end = parse_time(m2.group(2))
    
    if None in (t1_start, t1_end, t2_start, t2_end):
        return s1_clean == s2_clean
        
    days1 = parse_days(s1[:m1.start()])
    days2 = parse_days(s2[:m2.start()])
    
    days_clash = bool(days1 & days2)
    time_clash = (t1_start < t2_end) and (t2_start < t1_end)
    return days_clash and time_clash

async def check_hall_clash(
    db: AsyncSession,
    hall_number: Optional[str],
    schedule: Optional[str],
    batch_start_date: date,
    batch_end_date: Optional[date] = None,
    exclude_batch_id: Optional[uuid.UUID] = None,
    subject_label: Optional[str] = None
) -> None:
    """
    Validates that hall_number is not double-booked for an overlapping schedule
    across active or upcoming batches in the database.
    Raises HTTPException(400) if a clash is detected.
    """
    if not hall_number or not schedule:
        return
        
    target_hall = hall_number.strip().lower()
    target_schedule = schedule.strip()
    
    # Query other active/upcoming batches
    batch_query = select(Batch).where(
        Batch.status.in_(["ACTIVE", "UPCOMING"]),
        Batch.start_date <= (batch_end_date or date(2099, 12, 31))
    )
    if exclude_batch_id:
        batch_query = batch_query.where(Batch.id != exclude_batch_id)
        
    b_res = await db.execute(batch_query)
    other_batches = b_res.scalars().all()
    
    for ob in other_batches:
        # Check date overlap with other batch
        ob_end = ob.end_date or date(2099, 12, 31)
        if ob_end < batch_start_date:
            continue
            
        # 1. Check batch-level hall
        if ob.hall_number and ob.hall_number.strip().lower() == target_hall:
            if schedules_overlap(target_schedule, ob.schedule):
                subj_str = f" for '{subject_label}'" if subject_label else ""
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Hall clash detected{subj_str}: Hall '{hall_number.strip()}' is already booked "
                        f"for batch '{ob.name}' with schedule '{ob.schedule}'"
                    )
                )
                
        # 2. Check batch subjects for this other batch
        for obs in ob.subjects:
            obs_hall = obs.hall_number or ob.hall_number
            obs_sched = obs.schedule or ob.schedule
            if obs_hall and obs_hall.strip().lower() == target_hall:
                if schedules_overlap(target_schedule, obs_sched):
                    subj_str = f" for '{subject_label}'" if subject_label else ""
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Hall clash detected{subj_str}: Hall '{hall_number.strip()}' is already booked "
                            f"for batch '{ob.name}' ({obs.teacher_name_snapshot or 'Faculty'}) with schedule '{obs_sched}'"
                        )
                    )
