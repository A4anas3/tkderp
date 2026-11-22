from datetime import date, datetime, timezone
import uuid
from typing import Optional, List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.modules.students.models import Student
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.batches.models import Batch
from app.modules.verification.schemas import (
    PublicVerificationResponse,
    StudentVerificationData,
    VerificationCourseItem,
)
from app.common.active_lines import today_kolkata

router = APIRouter(tags=["Public Verification"])

def format_period(v_from: Optional[date], v_to: Optional[date]) -> str:
    if v_from and v_to:
        return f"Valid: {v_from.strftime('%d %b %Y')} to {v_to.strftime('%d %b %Y')}"
    elif v_to:
        return f"Valid until: {v_to.strftime('%d %b %Y')}"
    elif v_from:
        return f"Valid from: {v_from.strftime('%d %b %Y')}"
    return "Valid: Active Academic Session"

@router.get("/api/verify/{identifier}", response_model=PublicVerificationResponse)
@router.get("/api/public/verify/{identifier}", response_model=PublicVerificationResponse)
async def verify_student_credential(
    identifier: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Public verification endpoint (no authentication required).
    Verifies a student identity card and returns active course validity.
    Supports lookup by admission number, student ID code, or UUID.
    """
    ident = identifier.strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Identifier cannot be empty")

    today = today_kolkata()
    student = None
    matched_adm_number = None

    # 1. Lookup by Admission Number
    adm_stmt = (
        select(Admission)
        .options(selectinload(Admission.student), selectinload(Admission.items))
        .where(func.lower(Admission.admission_number) == ident.lower())
    )
    adm_res = await db.execute(adm_stmt)
    adm_record = adm_res.scalar_one_or_none()

    if adm_record:
        student = adm_record.student
        matched_adm_number = adm_record.admission_number

    # 2. Lookup by Student Code if not found by admission number
    if not student:
        stu_stmt = select(Student).where(func.lower(Student.student_code) == ident.lower())
        stu_res = await db.execute(stu_stmt)
        student = stu_res.scalar_one_or_none()

    # 3. Lookup by UUID if identifier is valid UUID
    if not student:
        try:
            val_uuid = uuid.UUID(ident)
            # Try student by ID
            stu_by_id = (await db.execute(select(Student).where(Student.id == val_uuid))).scalar_one_or_none()
            if stu_by_id:
                student = stu_by_id
            else:
                # Try admission by ID
                adm_by_id = (await db.execute(
                    select(Admission)
                    .options(selectinload(Admission.student), selectinload(Admission.items))
                    .where(Admission.id == val_uuid)
                )).scalar_one_or_none()
                if adm_by_id:
                    student = adm_by_id.student
                    matched_adm_number = adm_by_id.admission_number
        except ValueError:
            pass

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No matching student or admission record found for identifier '{identifier}'."
        )

    # Load all admissions and items for this student to determine active courses
    items_stmt = (
        select(AdmissionItem, Admission)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(Admission.student_id == student.id)
        .order_by(
            desc(func.coalesce(AdmissionItem.valid_to, Admission.valid_to)),
            desc(Admission.admission_date)
        )
    )
    rows = (await db.execute(items_stmt)).all()

    # Collect batch names
    batch_ids = [itm.batch_id for itm, _ in rows if itm.batch_id]
    batch_names = {}
    if batch_ids:
        b_res = await db.execute(select(Batch.id, Batch.name).where(Batch.id.in_(batch_ids)))
        batch_names = {b_id: b_name for b_id, b_name in b_res.all()}

    active_courses_dict = {}
    active_green_card = None
    latest_adm_seen = None

    for item, adm in rows:
        if not latest_adm_seen:
            latest_adm_seen = adm.admission_number

        # Check if line is active
        is_adm_active = (
            adm.status not in ["REVOKED", "CANCELLED"]
            and getattr(adm, "document_status", "VALID") != "VOID"
        )
        is_item_active = (
            item.status == "ACTIVE"
            and getattr(item, "access_status", "ACTIVE") == "ACTIVE"
            and (item.valid_to is None or item.valid_to >= today)
        )

        if not (is_adm_active and is_item_active):
            continue

        raw_name = item.item_name_snapshot or "Enrolled Course"
        if raw_name.startswith("[Renewal] "):
            raw_name = raw_name[len("[Renewal] "):]

        if item.item_type == "GREEN_CARD":
            if not active_green_card:
                v_from = item.valid_from or adm.valid_from
                v_to = item.valid_to or adm.valid_to
                days_rem = (v_to - today).days if v_to else None
                active_green_card = VerificationCourseItem(
                    course_name=raw_name,
                    subject_name="Green Card Membership",
                    batch_name="All Access Pass",
                    teacher_name=item.teacher_name_snapshot,
                    hall_number=item.hall_number_snapshot,
                    valid_from=v_from,
                    valid_to=v_to,
                    validity_period=format_period(v_from, v_to),
                    days_remaining=days_rem,
                    status="ACTIVE",
                    admission_number=adm.admission_number
                )
        else:
            clean_key = str(item.subject_id) if item.subject_id else raw_name.strip().lower()
            if clean_key not in active_courses_dict:
                active_courses_dict[clean_key] = []
            active_courses_dict[clean_key].append((item, adm, raw_name))

    # Consolidate chained active cycles for each subject
    active_courses_list: List[VerificationCourseItem] = []
    for clean_key, cycle_list in active_courses_dict.items():
        # Sort chronologically by valid_from
        cycle_list.sort(key=lambda x: (x[0].valid_from or x[1].valid_from or x[1].admission_date or date.min))

        valid_froms = [x[0].valid_from or x[1].valid_from for x in cycle_list if (x[0].valid_from or x[1].valid_from)]
        earliest_start = min(valid_froms) if valid_froms else (cycle_list[0][0].valid_from or cycle_list[0][1].admission_date)

        valid_tos = [x[0].valid_to or x[1].valid_to for x in cycle_list if (x[0].valid_to or x[1].valid_to)]
        latest_end = max(valid_tos) if valid_tos else None

        latest_item, latest_adm, raw_name = cycle_list[-1]
        days_rem = (latest_end - today).days if latest_end else None

        b_name = batch_names.get(latest_item.batch_id) if latest_item.batch_id else None

        active_courses_list.append(
            VerificationCourseItem(
                course_name=raw_name,
                subject_name=raw_name,
                batch_name=b_name,
                teacher_name=latest_item.teacher_name_snapshot,
                hall_number=latest_item.hall_number_snapshot,
                valid_from=earliest_start,
                valid_to=latest_end,
                validity_period=format_period(earliest_start, latest_end),
                days_remaining=days_rem,
                status="ACTIVE",
                admission_number=latest_adm.admission_number
            )
        )

    if active_green_card:
        active_courses_list.insert(0, active_green_card)

    # Determine matched admission number if not established
    if not matched_adm_number:
        if active_courses_list and active_courses_list[0].admission_number:
            matched_adm_number = active_courses_list[0].admission_number
        elif latest_adm_seen:
            matched_adm_number = latest_adm_seen
        else:
            matched_adm_number = student.student_code

    is_overall_valid = (
        student.status == "ACTIVE"
        and len(active_courses_list) > 0
    )

    student_data = StudentVerificationData(
        name=student.name,
        student_code=student.student_code,
        admission_number=matched_adm_number,
        photo_url=student.photo_url,
        father_name=student.father_name,
        status=student.status,
        registration_date=student.registration_date
    )

    return PublicVerificationResponse(
        verified=True,
        is_valid=is_overall_valid,
        student=student_data,
        active_courses=active_courses_list,
        total_active_courses=len(active_courses_list),
        verified_at=datetime.now(timezone.utc)
    )
