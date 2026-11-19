import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import (
    Admission, AdmissionItem, Student, Payment, PaymentAllocation, GreenCardProduct, User, BatchSubject
)
from app.modules.admissions.schemas import (
    AdmissionCreate, AdmissionResponse, AdmissionCalculatePreviewRequest, AdmissionItemResponse
)
from app.common.calculations import (
    calculate_admission_financials, allocate_payment_proportionally
)
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/admissions", tags=["Admissions"])

@router.post("/preview")
async def preview_admission_calculation(
    payload: AdmissionCalculatePreviewRequest,
    current_user: User = Depends(require_staff)
):
    items_data = [
        {
            "price": itm.original_price,
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value,
            "item_name_snapshot": itm.item_name_snapshot,
            "item_type": itm.item_type
        }
        for itm in payload.items
    ]
    calc = calculate_admission_financials(
        items=items_data,
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        gst_enabled=payload.gst_enabled,
        gst_rate=payload.gst_rate
    )
    return calc

@router.get("", response_model=PageResponse[AdmissionResponse])
async def list_admissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    payment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Admission).options(selectinload(Admission.items))
    count_query = select(func.count(Admission.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Admission.admission_number.ilike(search_pattern),
            Admission.student_name_snapshot.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Admission.student_id == student_id)
        count_query = count_query.where(Admission.student_id == student_id)

    if payment_status:
        query = query.where(Admission.payment_status == payment_status)
        count_query = count_query.where(Admission.payment_status == payment_status)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Admission.admission_date), desc(Admission.created_at)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    admissions = items_result.scalars().all()

    return PageResponse.create(items=admissions, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_admission(
    payload: AdmissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Verify student
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id))
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Generate admission number
    year_str = payload.admission_date.strftime("%Y")
    cnt_res = await db.execute(select(func.count(Admission.id)))
    seq = cnt_res.scalar_one() + 1
    adm_no = f"ADM{year_str}{seq:04d}"

    # Calculate item financials
    raw_items = [
        {
            "raw_item": itm,
            "price": itm.original_price,
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value
        }
        for itm in payload.items
    ]
    calc = calculate_admission_financials(
        items=raw_items,
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        gst_enabled=payload.gst_enabled,
        gst_rate=payload.gst_rate
    )

    admission = Admission(
        admission_number=adm_no,
        student_id=student.id,
        student_name_snapshot=student.full_name,
        admission_date=payload.admission_date,
        subtotal=calc["subtotal"],
        individual_discount_total=calc["individual_discount_total"],
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        overall_discount_amount=calc["overall_discount_amount"],
        total_discount=calc["total_discount"],
        gst_enabled=calc["gst_enabled"],
        gst_rate=calc["gst_rate"],
        taxable_base=calc["taxable_base"],
        gst_amount=calc["gst_amount"],
        total_payable=calc["total_payable"],
        amount_paid=Decimal("0.00"),
        balance_due=calc["total_payable"],
        payment_status="UNPAID",
        status="ACTIVE",
        notes=payload.notes,
        created_by=current_user.id
    )
    db.add(admission)
    await db.flush()

    # Create Admission Items
    has_gc = False
    gc_validity_days = 365
    db_items = []
    for c_itm in calc["items"]:
        raw = c_itm["raw_item"]
        if raw.item_type == "GREEN_CARD":
            has_gc = True
            if raw.green_card_id:
                gc_res = await db.execute(select(GreenCardProduct).where(GreenCardProduct.id == raw.green_card_id))
                gc_prod = gc_res.scalar_one_or_none()
                if gc_prod:
                    gc_validity_days = gc_prod.validity_days

        # Resolve teacher and hall snapshots
        t_id = raw.teacher_id
        t_name = raw.teacher_name_snapshot
        h_no = raw.hall_number_snapshot

        if (not t_name or not h_no) and raw.batch_id and raw.subject_id:
            bs_res = await db.execute(
                select(BatchSubject).where(
                    BatchSubject.batch_id == raw.batch_id,
                    BatchSubject.subject_id == raw.subject_id
                )
            )
            bs_obj = bs_res.scalar_one_or_none()
            if bs_obj:
                if not t_id and bs_obj.teacher_id:
                    t_id = bs_obj.teacher_id
                if not t_name and bs_obj.teacher_name_snapshot:
                    t_name = bs_obj.teacher_name_snapshot
                if not h_no and bs_obj.hall_number:
                    h_no = bs_obj.hall_number

        ai = AdmissionItem(
            admission_id=admission.id,
            item_type=raw.item_type,
            batch_id=raw.batch_id,
            subject_id=raw.subject_id,
            green_card_id=raw.green_card_id,
            teacher_id=t_id,
            teacher_name_snapshot=t_name,
            hall_number_snapshot=h_no,
            item_name_snapshot=raw.item_name_snapshot,
            original_price=c_itm["original_price"],
            discount_type=raw.discount_type,
            discount_value=raw.discount_value,
            discount_amount=c_itm["individual_discount"],
            overall_discount_share=c_itm["overall_discount_share"],
            net_price=c_itm["net_price"],
            amount_collected=Decimal("0.00"),
            balance_due=c_itm["net_price"]
        )
        db.add(ai)
        db_items.append(ai)

    await db.flush()

    if has_gc:
        student.has_green_card = True
        student.green_card_expiry = payload.admission_date + timedelta(days=gc_validity_days)

    # Process Initial Payment if provided
    if payload.initial_payment and payload.initial_payment.amount > Decimal("0.00"):
        pay_amount = min(payload.initial_payment.amount, admission.total_payable)
        p_cnt_res = await db.execute(select(func.count(Payment.id)))
        p_seq = p_cnt_res.scalar_one() + 1
        pay_no = f"PAY{year_str}{p_seq:04d}"

        payment = Payment(
            payment_number=pay_no,
            admission_id=admission.id,
            student_id=student.id,
            amount=pay_amount,
            payment_mode=payload.initial_payment.payment_mode,
            transaction_reference=payload.initial_payment.transaction_reference,
            payment_date=datetime.now(timezone.utc),
            collected_by=current_user.id,
            collector_name_snapshot=current_user.full_name,
            notes=payload.initial_payment.notes or "Initial payment at admission"
        )
        db.add(payment)
        await db.flush()

        # Proportional Allocation
        items_payload = [{"id": ai.id, "balance_due": ai.balance_due} for ai in db_items]
        allocations = allocate_payment_proportionally(pay_amount, items_payload)
        
        for ai_id, alloc_amt in allocations:
            pa = PaymentAllocation(
                payment_id=payment.id,
                admission_item_id=ai_id,
                allocated_amount=alloc_amt
            )
            db.add(pa)
            # Update item balance
            for itm in db_items:
                if itm.id == ai_id:
                    itm.amount_collected += alloc_amt
                    itm.balance_due -= alloc_amt

        admission.amount_paid = pay_amount
        admission.balance_due = max(Decimal("0.00"), admission.total_payable - pay_amount)
        if admission.balance_due == Decimal("0.00"):
            admission.payment_status = "PAID"
        else:
            admission.payment_status = "PARTIALLY_PAID"

    await db.commit()

    return await get_admission(admission.id, db, current_user)

@router.get("/{admission_id}", response_model=AdmissionResponse)
async def get_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Admission).options(selectinload(Admission.items)).where(Admission.id == admission_id)
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")
    return admission

@router.post("/{admission_id}/cancel", response_model=AdmissionResponse)
async def cancel_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = select(Admission).options(selectinload(Admission.items)).where(Admission.id == admission_id)
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission.status = "CANCELLED"
    await db.commit()
    return admission
