import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin
from app.database.models import (
    Payment, PaymentAllocation, Admission, AdmissionItem, Student, User
)
from app.modules.payments.schemas import (
    PaymentCreate, PaymentResponse, PaymentAllocationResponse, PaymentReceiptResponse
)
from app.common.calculations import allocate_payment_proportionally
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/payments", tags=["Payments"])

@router.get("", response_model=PageResponse[PaymentResponse])
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    payment_mode: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.admission),
            selectinload(Payment.student)
        )
    )
    count_query = select(func.count(Payment.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Payment.payment_number.ilike(search_pattern),
            Payment.collector_name_snapshot.ilike(search_pattern),
            Payment.transaction_reference.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Payment.student_id == student_id)
        count_query = count_query.where(Payment.student_id == student_id)

    if admission_id:
        query = query.where(Payment.admission_id == admission_id)
        count_query = count_query.where(Payment.admission_id == admission_id)

    if payment_mode:
        query = query.where(Payment.payment_mode == payment_mode)
        count_query = count_query.where(Payment.payment_mode == payment_mode)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Payment.payment_date)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    payments = items_result.scalars().all()

    response_items = []
    for p in payments:
        alloc_resps = [
            PaymentAllocationResponse(
                id=a.id,
                admission_item_id=a.admission_item_id,
                allocated_amount=a.allocated_amount
            )
            for a in p.allocations
        ]
        response_items.append(
            PaymentResponse(
                id=p.id,
                payment_number=p.payment_number,
                admission_id=p.admission_id,
                student_id=p.student_id,
                student_name=p.student.full_name if p.student else None,
                admission_number=p.admission.admission_number if p.admission else None,
                amount=p.amount,
                payment_mode=p.payment_mode,
                transaction_reference=p.transaction_reference,
                payment_date=p.payment_date,
                collected_by=p.collected_by,
                collector_name_snapshot=p.collector_name_snapshot,
                notes=p.notes,
                allocations=alloc_resps
            )
        )

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Fetch admission
    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payload.admission_id)
    )
    admission = adm_res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    if admission.balance_due <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="This admission is already fully paid")

    if payload.amount > admission.balance_due:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ₹{payload.amount} exceeds outstanding balance ₹{admission.balance_due}"
        )

    year_str = datetime.now().strftime("%Y")
    p_cnt_res = await db.execute(select(func.count(Payment.id)))
    seq = p_cnt_res.scalar_one() + 1
    pay_no = f"PAY{year_str}{seq:04d}"

    payment = Payment(
        payment_number=pay_no,
        admission_id=admission.id,
        student_id=admission.student_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        transaction_reference=payload.transaction_reference,
        payment_date=datetime.now(timezone.utc),
        collected_by=current_user.id,
        collector_name_snapshot=current_user.full_name,
        notes=payload.notes
    )
    db.add(payment)
    await db.flush()

    # Allocate proportionally across admission items with remaining balance
    unpaid_items = [
        {"id": itm.id, "balance_due": itm.balance_due}
        for itm in admission.items
        if itm.balance_due > Decimal("0.00")
    ]
    allocations = allocate_payment_proportionally(payload.amount, unpaid_items)

    pa_objs = []
    for itm_id, alloc_amt in allocations:
        pa = PaymentAllocation(
            payment_id=payment.id,
            admission_item_id=itm_id,
            allocated_amount=alloc_amt
        )
        db.add(pa)
        pa_objs.append(pa)
        for ai in admission.items:
            if ai.id == itm_id:
                ai.amount_collected += alloc_amt
                ai.balance_due -= alloc_amt

    await db.flush()

    alloc_resps = [
        PaymentAllocationResponse(
            id=pa.id,
            admission_item_id=pa.admission_item_id,
            allocated_amount=pa.allocated_amount
        )
        for pa in pa_objs
    ]

    # Update admission totals
    admission.amount_paid += payload.amount
    admission.balance_due = max(Decimal("0.00"), admission.total_payable - admission.amount_paid)
    if admission.balance_due == Decimal("0.00"):
        admission.payment_status = "PAID"
    else:
        admission.payment_status = "PARTIALLY_PAID"

    await db.commit()

    return PaymentResponse(
        id=payment.id,
        payment_number=payment.payment_number,
        admission_id=payment.admission_id,
        student_id=payment.student_id,
        student_name=admission.student.full_name,
        admission_number=admission.admission_number,
        amount=payment.amount,
        payment_mode=payment.payment_mode,
        transaction_reference=payment.transaction_reference,
        payment_date=payment.payment_date,
        collected_by=payment.collected_by,
        collector_name_snapshot=payment.collector_name_snapshot,
        notes=payment.notes,
        allocations=alloc_resps
    )

@router.get("/{payment_id}/receipt", response_model=PaymentReceiptResponse)
async def get_payment_receipt(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.admission).selectinload(Admission.items),
            selectinload(Payment.student)
        )
        .where(Payment.id == payment_id)
    )
    res = await db.execute(query)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    item_names = {itm.id: itm.item_name_snapshot for itm in p.admission.items}
    alloc_data = [
        {
            "item_name": item_names.get(a.admission_item_id, "Item"),
            "amount": a.allocated_amount
        }
        for a in p.allocations
    ]

    return PaymentReceiptResponse(
        payment_number=p.payment_number,
        payment_date=p.payment_date,
        amount=p.amount,
        payment_mode=p.payment_mode,
        transaction_reference=p.transaction_reference,
        collector_name=p.collector_name_snapshot,
        student_name=p.student.full_name,
        student_reg_no=p.student.registration_no,
        student_mobile=p.student.mobile,
        admission_number=p.admission.admission_number,
        total_admission_payable=p.admission.total_payable,
        total_amount_paid_so_far=p.admission.amount_paid,
        remaining_balance_due=p.admission.balance_due,
        allocations=alloc_data
    )
