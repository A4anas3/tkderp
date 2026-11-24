from datetime import date, datetime, timezone
import re
import uuid
from typing import Optional, List, Tuple
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, and_
from sqlalchemy.orm import selectinload, joinedload

from app.database.session import get_db
from app.modules.students.models import Student
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.batches.models import Batch
from app.modules.subjects.models import Subject
from app.modules.enquiries.models import Enquiry, EnquiryDemoItem
from app.modules.verification.schemas import (
    PublicVerificationResponse,
    StudentVerificationData,
    VerificationCourseItem,
    PublicIDCardResponse,
    IDCardStudentData,
    IDCardCourseItem,
    IDCardDemoItem,
)
from app.common.active_lines import today_kolkata
from app.common.validators import normalize_mobile
from app.core.rate_limit import RateLimiter

router = APIRouter(tags=["Public Verification & ID Card"])

# Rate limiter for public ID card lookup: 60 requests per minute per IP
id_card_rate_limiter = RateLimiter(times=60, seconds=60, prefix="id_card")

def format_period(v_from: Optional[date], v_to: Optional[date]) -> str:
    if v_from and v_to:
        return f"Valid: {v_from.strftime('%d %b %Y')} to {v_to.strftime('%d %b %Y')}"
    elif v_to:
        return f"Valid until: {v_to.strftime('%d %b %Y')}"
    elif v_from:
        return f"Valid from: {v_from.strftime('%d %b %Y')}"
    return "Valid: Active Academic Session"

async def get_student_and_active_courses(
    identifier: str,
    db: AsyncSession
) -> Tuple[Optional[Student], Optional[str], List[VerificationCourseItem], bool]:
    """
    Look up student by admission number, student code/ID, UUID, or registered phone number,
    and resolve active enrolled course items.
    Returns: (student, matched_adm_number, active_courses_list, is_overall_valid)
    """
    ident = identifier.strip()
    if not ident:
        return None, None, [], False

    today = today_kolkata()
    student = None
    matched_adm_number = None

    # 1. Lookup by Admission Number
    adm_stmt = (
        select(Admission)
        .options(selectinload(Admission.student), selectinload(Admission.items))
        .where(
            or_(
                func.lower(Admission.admission_number) == ident.lower(),
                func.lower(func.replace(Admission.admission_number, "-", "")) == ident.lower().replace("-", "")
            )
        )
    )
    adm_res = await db.execute(adm_stmt)
    adm_record = adm_res.scalar_one_or_none()

    if adm_record:
        student = adm_record.student
        matched_adm_number = adm_record.admission_number

    # 2. Lookup by Student Code / Student ID if not found by admission number
    if not student:
        stu_stmt = select(Student).where(
            or_(
                func.lower(Student.student_code) == ident.lower(),
                func.lower(func.replace(Student.student_code, "-", "")) == ident.lower().replace("-", "")
            )
        )
        stu_res = await db.execute(stu_stmt)
        student = stu_res.scalar_one_or_none()

    # 3. Lookup by UUID if identifier is valid UUID
    if not student:
        try:
            val_uuid = uuid.UUID(ident)
            stu_by_id = (await db.execute(select(Student).where(Student.id == val_uuid))).scalar_one_or_none()
            if stu_by_id:
                student = stu_by_id
            else:
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

    # 4. Lookup by Registered Phone Number (mobile on student's record)
    if not student:
        norm_phone = normalize_mobile(ident)
        clean_digits = re.sub(r"\D", "", ident)
        phone_matches = set()
        phone_matches.add(ident)
        if norm_phone:
            phone_matches.add(norm_phone)
            phone_matches.add(f"+91{norm_phone}")
            phone_matches.add(f"91{norm_phone}")
            phone_matches.add(f"0{norm_phone}")
        if clean_digits:
            phone_matches.add(clean_digits)

        # Build conditions for Student.mobile
        mobile_conds = [
            func.lower(Student.mobile) == m.lower() for m in phone_matches if m
        ]
        if norm_phone and len(norm_phone) >= 7:
            mobile_conds.append(Student.mobile.ilike(f"%{norm_phone}%"))

        stu_phone_stmt = (
            select(Student)
            .where(or_(*mobile_conds))
            .order_by(
                desc(Student.status == "ACTIVE"),
                desc(Student.created_at)
            )
        )
        stu_phone_res = await db.execute(stu_phone_stmt)
        student = stu_phone_res.scalars().first()

    if not student:
        return None, None, [], False

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

    # Collect batch names and subject models
    batch_ids = [itm.batch_id for itm, _ in rows if itm.batch_id]
    batch_names = {}
    if batch_ids:
        b_res = await db.execute(select(Batch.id, Batch.name).where(Batch.id.in_(batch_ids)))
        batch_names = {b_id: b_name for b_id, b_name in b_res.all()}

    subject_ids = [itm.subject_id for itm, _ in rows if itm.subject_id]
    subjects_map = {}
    if subject_ids:
        s_res = await db.execute(
            select(Subject)
            .options(joinedload(Subject.teacher))
            .where(Subject.id.in_(subject_ids))
        )
        subjects_map = {s.id: s for s in s_res.scalars().all()}

    subjects_by_name = {s.name.lower().strip(): s for s in subjects_map.values()}
    all_raw_names = list({(itm.item_name_snapshot or "").replace("[Renewal] ", "").strip().lower() for itm, _ in rows if itm.item_name_snapshot})
    missing_names = [name for name in all_raw_names if name and name not in subjects_by_name]
    if missing_names:
        sn_res = await db.execute(
            select(Subject)
            .options(joinedload(Subject.teacher))
            .where(func.lower(Subject.name).in_(missing_names))
        )
        for s in sn_res.scalars().all():
            subjects_by_name[s.name.lower().strip()] = s

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
                sub = subjects_map.get(item.subject_id) or (subjects_by_name.get(raw_name.lower().strip()) if raw_name else None)
                v_from = item.valid_from or adm.valid_from
                v_to = item.valid_to or adm.valid_to
                days_rem = (v_to - today).days if v_to else None
                teach_name = (sub.teacher_name if sub and sub.teacher_name else item.teacher_name_snapshot)
                hall_num = (sub.hall_number if sub and sub.hall_number else item.hall_number_snapshot)
                class_sched = (sub.schedule if sub and sub.schedule else None)
                active_green_card = VerificationCourseItem(
                    course_name=raw_name,
                    subject_name="Green Card Membership",
                    batch_name="All Access Pass",
                    teacher_name=teach_name,
                    hall_number=hall_num,
                    schedule=class_sched,
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
        cycle_list.sort(key=lambda x: (x[0].valid_from or x[1].valid_from or x[1].admission_date or date.min))

        valid_froms = [x[0].valid_from or x[1].valid_from for x in cycle_list if (x[0].valid_from or x[1].valid_from)]
        earliest_start = min(valid_froms) if valid_froms else (cycle_list[0][0].valid_from or cycle_list[0][1].admission_date)

        valid_tos = [x[0].valid_to or x[1].valid_to for x in cycle_list if (x[0].valid_to or x[1].valid_to)]
        latest_end = max(valid_tos) if valid_tos else None

        latest_item, latest_adm, raw_name = cycle_list[-1]
        days_rem = (latest_end - today).days if latest_end else None

        b_name = batch_names.get(latest_item.batch_id) if latest_item.batch_id else None
        sub = subjects_map.get(latest_item.subject_id) or (subjects_by_name.get(raw_name.lower().strip()) if raw_name else None)

        hall_num = (sub.hall_number if sub and sub.hall_number else latest_item.hall_number_snapshot)
        class_sched = (sub.schedule if sub and sub.schedule else (latest_item.schedule if hasattr(latest_item, "schedule") else None))
        teach_name = (sub.teacher_name if sub and sub.teacher_name else latest_item.teacher_name_snapshot)

        active_courses_list.append(
            VerificationCourseItem(
                course_name=raw_name,
                subject_name=raw_name,
                batch_name=b_name,
                teacher_name=teach_name,
                hall_number=hall_num,
                schedule=class_sched,
                timing=class_sched,
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

    return student, matched_adm_number, active_courses_list, is_overall_valid

@router.get("/api/verify/{identifier}", response_model=PublicVerificationResponse)
@router.get("/api/public/verify/{identifier}", response_model=PublicVerificationResponse)
@router.get("/api/verify", response_model=PublicVerificationResponse)
@router.get("/api/public/verify", response_model=PublicVerificationResponse)
async def verify_student_credential(
    identifier: Optional[str] = None,
    admission_no: Optional[str] = Query(None),
    student_id: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    mobile: Optional[str] = Query(None),
    phone_number: Optional[str] = Query(None),
    ident_param: Optional[str] = Query(None, alias="identifier"),
    request: Request = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Public verification endpoint (no authentication required).
    Verifies a student identity card and returns active course validity.
    Supports lookup by admission number, student ID code, UUID, or registered phone number.
    Protected with sliding-window rate limiting.
    Only returns verification data when student has active enrolment.
    """
    if request:
        await id_card_rate_limiter(request)

    target_ident = identifier or admission_no or student_id or phone or mobile or phone_number or ident_param
    if not target_ident or not target_ident.strip():
        raise HTTPException(status_code=400, detail="Identifier cannot be empty")

    target_ident = target_ident.strip()
    student, matched_adm_number, active_courses_list, is_overall_valid = await get_student_and_active_courses(target_ident, db)

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No matching student or admission record found for identifier '{target_ident}'."
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

    today = today_kolkata()
    active_demos_list = await _get_active_demos_for_student(db, student, today)

    return PublicVerificationResponse(
        verified=True,
        is_valid=is_overall_valid or len(active_demos_list) > 0,
        student=student_data,
        active_courses=active_courses_list,
        total_active_courses=len(active_courses_list),
        active_demos=active_demos_list,
        total_active_demos=len(active_demos_list),
        verified_at=datetime.now(timezone.utc)
    )

async def _get_active_demos_for_student(db: AsyncSession, student: Student, today: date) -> List[IDCardDemoItem]:
    """
    Returns active demo items for a student.
    Active demo means a demo item with status SCHEDULED or ATTENDED
    (or an enquiry with status ACTIVE_DEMO), with demo_end_date today or later,
    and NOT CONVERTED, DROPPED or EXPIRED.
    """
    cond = (Enquiry.converted_student_id == student.id)
    norm_mob = normalize_mobile(student.mobile) if student.mobile else None
    if norm_mob and len(norm_mob) >= 10:
        last10 = norm_mob[-10:]
        cond = or_(
            Enquiry.converted_student_id == student.id,
            and_(Enquiry.converted_student_id.is_(None), Enquiry.mobile.like(f"%{last10}%"))
        )

    q = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .where(cond)
        .order_by(EnquiryDemoItem.demo_start_date.asc(), EnquiryDemoItem.created_at.asc())
    )
    rows = (await db.execute(q)).all()

    active_demos: List[IDCardDemoItem] = []
    seen_refs = set()

    for ditm, enq in rows:
        ref_no = ditm.demo_reference_number
        if not ref_no or ref_no in seen_refs:
            continue

        item_status = (ditm.status or "").upper()
        # Active demo criteria
        if item_status in ["CONVERTED", "DROPPED", "EXPIRED"]:
            continue
        if ditm.converted_admission_item_id is not None:
            continue
        if ditm.demo_end_date < today:
            continue

        enq_status = (enq.status or "").upper()
        if not (item_status in ["SCHEDULED", "ATTENDED"] or enq_status == "ACTIVE_DEMO"):
            continue

        seen_refs.add(ref_no)
        days_rem = (ditm.demo_end_date - today).days

        active_demos.append(
            IDCardDemoItem(
                demo_reference_number=ref_no,
                subject_name=ditm.subject_name_snapshot,
                teacher_name=ditm.teacher_name_snapshot,
                hall_number=ditm.hall_number_snapshot,
                demo_start_date=ditm.demo_start_date,
                demo_end_date=ditm.demo_end_date,
                days_remaining=days_rem,
                status=ditm.status,
            )
        )

    return active_demos

@router.get("/api/public/id-card/{identifier}", response_model=PublicIDCardResponse)
@router.get("/api/id-card/{identifier}", response_model=PublicIDCardResponse)
@router.get("/api/public/idcard/{identifier}", response_model=PublicIDCardResponse)
@router.get("/api/idcard/{identifier}", response_model=PublicIDCardResponse)
@router.get("/api/public/id-card", response_model=PublicIDCardResponse)
@router.get("/api/id-card", response_model=PublicIDCardResponse)
@router.get("/api/public/idcard", response_model=PublicIDCardResponse)
@router.get("/api/idcard", response_model=PublicIDCardResponse)
@router.get("/api/students/{identifier}/id-card", response_model=PublicIDCardResponse)
@router.get("/api/students/{identifier}/idcard", response_model=PublicIDCardResponse)
async def get_public_id_card(
    identifier: Optional[str] = None,
    admission_no: Optional[str] = Query(None),
    student_id: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    mobile: Optional[str] = Query(None),
    phone_number: Optional[str] = Query(None),
    ident_param: Optional[str] = Query(None, alias="identifier"),
    db: AsyncSession = Depends(get_db),
    _limiter: None = Depends(id_card_rate_limiter),
):
    """
    Public student ID card endpoint (no authentication required).
    Returns the student ID card data ONLY if that student has an active subject/enrolment.
    Accepts student ID (code or UUID), registered phone number, or admission number.
    If the student has no active subject, returns 404 with a clear message and leaks no student data.
    Equipped with rate limiting and returns only non-sensitive card-visible attributes.
    """
    target_ident = (identifier or admission_no or student_id or phone or mobile or phone_number or ident_param or "").strip()
    if not target_ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifier (student ID, phone number, or admission number) cannot be empty."
        )

    student, matched_adm_number, active_courses_list, is_overall_valid = await get_student_and_active_courses(target_ident, db)

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No matching student or admission record found for '{target_ident}'."
        )

    today = today_kolkata()
    active_demos_list = await _get_active_demos_for_student(db, student, today)

    # Return ID card data ONLY if the student has an active subject/enrolment or active demo
    if (not is_overall_valid or len(active_courses_list) == 0) and len(active_demos_list) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active enrolment or ID card is available for this student."
        )

    # Calculate live due balance from backend (total booked minus collected minus waived)
    adm_rows = (await db.execute(
        select(Admission)
        .where(
            Admission.student_id == student.id,
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
            func.coalesce(Admission.document_status, "VALID") != "VOID"
        )
    )).scalars().all()
    live_due_balance = sum((adm.balance_due for adm in adm_rows), Decimal("0.00"))

    student_data = IDCardStudentData(
        name=student.name,
        student_code=student.student_code,
        admission_number=matched_adm_number or student.student_code,
        photo_url=student.photo_url,
        father_name=student.father_name,
        status=student.status,
        due_balance=live_due_balance,
    )

    course_items = [
        IDCardCourseItem(
            course_name=c.course_name,
            subject_name=c.subject_name,
            batch_name=c.batch_name,
            teacher_name=c.teacher_name,
            hall_number=c.hall_number,
            schedule=c.schedule,
            valid_from=c.valid_from,
            valid_to=c.valid_to,
            validity_period=c.validity_period,
            days_remaining=c.days_remaining,
            status=c.status,
            admission_number=c.admission_number,
        )
        for c in active_courses_list
    ]

    return PublicIDCardResponse(
        verified=True,
        is_valid=True,
        student=student_data,
        active_courses=course_items,
        total_active_courses=len(course_items),
        active_demos=active_demos_list,
        total_active_demos=len(active_demos_list),
        due_balance=live_due_balance,
        institute_name="THAKURDWARA COACHING INSTITUTE",
        institute_tagline="Civil Lines, Thakurdwara (U.P.) • ISO 9001:2015 Certified",
        institute_address="Civil Lines, Thakurdwara (U.P.)",
        institute_phone="+91 98765 43210",
        issued_at=datetime.now(timezone.utc)
    )
