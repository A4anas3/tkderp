import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, asc
from sqlalchemy.orm import lazyload

from app.database.session import get_db
from app.core.dependencies import require_staff
from app.database.models import Admission, AdmissionItem, Student, Batch, Payment, PaymentAllocation
from app.common.active_lines import today_kolkata
from app.modules.enrollments.schemas import EnrollmentItemResponse, EnrollmentListResponse

router = APIRouter(tags=["Enrollments"])

@router.get("/api/enrollments", response_model=EnrollmentListResponse)
@router.get("/enrollments", response_model=EnrollmentListResponse)
async def list_enrollments(
    student_id: Optional[uuid.UUID] = Query(None),
    subject_id: Optional[uuid.UUID] = Query(None),
    teacher_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    access_status: Optional[str] = Query(None),
    expiring_in_days: Optional[int] = Query(None),
    expired_since_days: Optional[int] = Query(None),
    payment_status: Optional[str] = Query(None),
    has_balance: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query("valid_to_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    today = today_kolkata()

    # Base query joined with Admission and Student
    stmt = (
        select(AdmissionItem, Admission, Student, Batch.name.label("batch_name"))
        .options(lazyload(Admission.items))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, AdmissionItem.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
    )
    count_stmt = (
        select(func.count(AdmissionItem.id))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, AdmissionItem.student_id == Student.id)
    )

    filters = []

    if student_id:
        filters.append(AdmissionItem.student_id == student_id)
    if subject_id:
        filters.append(AdmissionItem.subject_id == subject_id)
    if teacher_id:
        filters.append(AdmissionItem.teacher_id == teacher_id)
    if batch_id:
        filters.append(AdmissionItem.batch_id == batch_id)

    if access_status:
        if access_status.upper() == "ACTIVE":
            filters.append(
                and_(
                    AdmissionItem.access_status == "ACTIVE",
                    Admission.document_status == "VALID",
                    or_(AdmissionItem.valid_to == None, AdmissionItem.valid_to >= today)
                )
            )
        elif access_status.upper() == "EXPIRED":
            filters.append(
                or_(
                    AdmissionItem.access_status == "EXPIRED",
                    and_(
                        AdmissionItem.valid_to != None,
                        AdmissionItem.valid_to < today,
                        AdmissionItem.access_status != "REVOKED"
                    )
                )
            )
        else:
            filters.append(AdmissionItem.access_status == access_status.upper())

    if expiring_in_days is not None:
        target_date = today + timedelta(days=expiring_in_days)
        filters.append(
            and_(
                AdmissionItem.access_status == "ACTIVE",
                Admission.document_status == "VALID",
                AdmissionItem.valid_to != None,
                AdmissionItem.valid_to >= today,
                AdmissionItem.valid_to <= target_date
            )
        )

    if expired_since_days is not None:
        since_date = today - timedelta(days=expired_since_days)
        filters.append(
            and_(
                AdmissionItem.valid_to != None,
                AdmissionItem.valid_to < today,
                AdmissionItem.valid_to >= since_date
            )
        )

    if has_balance is not None:
        if has_balance:
            filters.append(AdmissionItem.balance_due > Decimal("0.00"))
        else:
            filters.append(AdmissionItem.balance_due == Decimal("0.00"))

    if payment_status:
        ps = payment_status.upper()
        if ps == "PAID":
            filters.append(and_(AdmissionItem.balance_due == Decimal("0.00"), AdmissionItem.amount_collected > Decimal("0.00")))
        elif ps in ["PARTIAL", "PARTIALLY_PAID"]:
            filters.append(and_(AdmissionItem.balance_due > Decimal("0.00"), AdmissionItem.amount_collected > Decimal("0.00")))
        elif ps == "UNPAID":
            filters.append(AdmissionItem.amount_collected == Decimal("0.00"))

    if search:
        s = f"%{search.strip()}%"
        filters.append(
            or_(
                Student.name.ilike(s),
                Student.student_code.ilike(s),
                Student.mobile.ilike(s),
                Admission.admission_number.ilike(s),
                AdmissionItem.item_name_snapshot.ilike(s)
            )
        )

    if filters:
        stmt = stmt.where(and_(*filters))
        count_stmt = count_stmt.where(and_(*filters))

    # Total count (1 query)
    total = (await db.execute(count_stmt)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Sorting
    if sort == "valid_to_asc":
        stmt = stmt.order_by(AdmissionItem.valid_to.asc().nulls_last(), AdmissionItem.created_at.asc())
    elif sort == "student_name_asc":
        stmt = stmt.order_by(Student.name.asc(), AdmissionItem.valid_to.desc().nulls_last())
    else: # default valid_to_desc
        stmt = stmt.order_by(AdmissionItem.valid_to.desc().nulls_last(), AdmissionItem.created_at.desc())

    # Paginated items (1 query)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    # Batch load latest payments in 1 query for paginated slice (O(1) database queries)
    item_ids = [row[0].id for row in rows]
    last_payment_map = {}
    if item_ids:
        pa_stmt = (
            select(PaymentAllocation.admission_item_id, Payment.payment_date, PaymentAllocation.allocated_amount)
            .join(Payment, PaymentAllocation.payment_id == Payment.id)
            .where(
                PaymentAllocation.admission_item_id.in_(item_ids),
                PaymentAllocation.kind == "PAYMENT"
            )
            .order_by(Payment.payment_date.desc(), PaymentAllocation.created_at.desc())
        )
        pa_rows = (await db.execute(pa_stmt)).all()
        for i_id, p_date, p_amt in pa_rows:
            if i_id not in last_payment_map:
                last_payment_map[i_id] = (p_date, p_amt)

    items = []
    for itm, adm, st, b_name in rows:
        last_p_date, last_p_amt = last_payment_map.get(itm.id, (None, None))
        if isinstance(last_p_date, datetime):
            last_p_date = last_p_date.date()
        days_left = (itm.valid_to - today).days if itm.valid_to else None

        if itm.amount_collected >= itm.net_price:
            pay_st = "PAID"
        elif itm.amount_collected > Decimal("0.00"):
            pay_st = "PARTIAL"
        else:
            pay_st = "UNPAID"

        items.append(
            EnrollmentItemResponse(
                id=itm.id,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                student_id=st.id,
                student_name=st.name,
                student_code=st.student_code,
                student_mobile=st.mobile,
                father_name=st.father_name,
                subject_id=itm.subject_id,
                subject_name=itm.item_name_snapshot,
                teacher_id=itm.teacher_id,
                teacher_name=itm.teacher_name_snapshot,
                batch_id=itm.batch_id,
                batch_name=b_name,
                hall_number=itm.hall_number_snapshot,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                days_left=days_left,
                net_price=itm.net_price,
                amount_collected=itm.amount_collected,
                balance_due=itm.balance_due,
                last_paid_date=last_p_date,
                last_paid_amount=last_p_amt,
                payment_status=pay_st,
                access_status=itm.access_status,
                item_type=itm.item_type
            )
        )

    return EnrollmentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
