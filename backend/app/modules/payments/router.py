import uuid
import json
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, delete
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import (
    Payment, PaymentAllocation, Admission, AdmissionItem, Student, User, Refund, AuditLog, FinancialTransaction
)
from app.modules.payments.schemas import (
    PaymentCreate, PaymentUpdate, PaymentResponse, PaymentAllocationResponse, PaymentReceiptResponse,
    RefundCreate, RefundResponse, RefundReceiptResponse, TransactionResponse
)
from app.common.calculations import allocate_payment_proportionally
from app.common.pagination import PaginationParams, PageResponse
from app.common.numbering import next_number
from app.common.idempotency import get_idempotency_record, save_idempotency_record, build_idempotent_response
from app.modules.ledger.service import (
    record_payment_service, edit_payment_service, process_refund_service, recompute_admission_totals
)

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
            selectinload(Payment.admission).selectinload(Admission.items),
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
        c_str = None
        if p.admission and p.admission.items:
            c_str = ", ".join(i.item_name_snapshot for i in p.admission.items)
        response_items.append(
            PaymentResponse(
                id=p.id,
                payment_number=p.payment_number,
                admission_id=p.admission_id,
                student_id=p.student_id,
                student_name=p.student.full_name if p.student else None,
                admission_number=p.admission.admission_number if p.admission else None,
                course_name=c_str,
                amount=p.amount,
                payment_mode=p.payment_mode,
                transaction_reference=p.transaction_reference,
                payment_date=p.payment_date,
                collected_by=p.collected_by,
                collector_name_snapshot=p.collector_name_snapshot,
                notes=p.notes,
                valid_from=p.valid_from,
                valid_to=p.valid_to,
                fee_period=p.fee_period,
                allocations=alloc_resps
            )
        )

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/transactions", response_model=PageResponse[TransactionResponse])
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    payment_mode: Optional[str] = None,
    txn_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Append-only Financial Transactions Ledger paginated directly in SQL on financial_transactions.
    """
    query = (
        select(FinancialTransaction)
        .options(
            selectinload(FinancialTransaction.admission).selectinload(Admission.items),
            selectinload(FinancialTransaction.student),
            selectinload(FinancialTransaction.payment)
        )
    )

    if student_id:
        query = query.where(FinancialTransaction.student_id == student_id)
    if admission_id:
        query = query.where(FinancialTransaction.admission_id == admission_id)
    if payment_mode and payment_mode != "ALL":
        query = query.where(FinancialTransaction.mode == payment_mode)
    if txn_type and txn_type != "ALL":
        query = query.where(FinancialTransaction.txn_type == txn_type)
    if search:
        s_pat = f"%{search.strip()}%"
        query = query.where(
            or_(
                FinancialTransaction.txn_number.ilike(s_pat),
                FinancialTransaction.reference.ilike(s_pat),
                FinancialTransaction.reason.ilike(s_pat),
                FinancialTransaction.admission.has(Admission.admission_number.ilike(s_pat)),
                FinancialTransaction.student.has(Student.name.ilike(s_pat))
            )
        )

    # Count total in SQL
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one() or 0

    # Paginate in SQL
    offset = (page - 1) * page_size
    items_query = query.order_by(desc(FinancialTransaction.txn_at)).offset(offset).limit(page_size)
    res = await db.execute(items_query)
    txns = res.scalars().all()

    response_items = []
    for t in txns:
        c_str = None
        if t.admission and t.admission.items:
            c_str = ", ".join(i.item_name_snapshot for i in t.admission.items)

        collector_name = None
        if t.payment:
            collector_name = t.payment.collector_name_snapshot

        response_items.append(
            TransactionResponse(
                id=t.id,
                type=t.txn_type,
                number=t.txn_number,
                date=t.txn_at,
                amount=t.signed_amount,
                mode=t.mode,
                ref=t.reference,
                notes=t.reason,
                collector=collector_name,
                admission_id=t.admission_id,
                admission_number=t.admission.admission_number if t.admission else None,
                course_name=c_str,
                fee_period=t.payment.fee_period if t.payment else None,
                payment_id=t.payment_id
            )
        )

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    payload: PaymentCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    if idempotency_key:
        cached = await get_idempotency_record(db, idempotency_key, "POST /api/payments")
        if cached:
            return build_idempotent_response(cached)

    # Fetch admission with row-level lock
    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payload.admission_id)
        .with_for_update()
    )
    admission = adm_res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    if idempotency_key:
        cached = await get_idempotency_record(db, idempotency_key, "POST /api/payments")
        if cached:
            return build_idempotent_response(cached)

    payment, f_txn = await record_payment_service(
        db=db,
        admission=admission,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        collected_by_user=current_user,
        transaction_reference=payload.transaction_reference,
        notes=payload.notes,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        fee_period=payload.fee_period,
        allocation_mode=payload.allocation_mode,
        manual_allocations=payload.manual_allocations
    )

    alloc_resps = [
        PaymentAllocationResponse(
            id=pa.id,
            admission_item_id=pa.admission_item_id,
            allocated_amount=pa.allocated_amount,
            kind=pa.kind,
            reverses_allocation_id=pa.reverses_allocation_id
        )
        for pa in payment.allocations
    ]

    resp_obj = PaymentResponse(
        id=payment.id,
        payment_number=payment.payment_number,
        admission_id=payment.admission_id,
        student_id=payment.student_id,
        student_name=admission.student.full_name if admission.student else None,
        admission_number=admission.admission_number,
        amount=payment.amount,
        payment_mode=payment.payment_mode,
        transaction_reference=payment.transaction_reference,
        payment_date=payment.payment_date,
        collected_by=payment.collected_by,
        collector_name_snapshot=payment.collector_name_snapshot,
        notes=payment.notes,
        valid_from=payment.valid_from,
        valid_to=payment.valid_to,
        fee_period=payment.fee_period,
        allocations=alloc_resps
    )

    if idempotency_key:
        await save_idempotency_record(
            db,
            idempotency_key,
            "POST /api/payments",
            status.HTTP_201_CREATED,
            resp_obj.model_dump(mode="json")
        )

    await db.commit()
    return resp_obj

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
        student_father_name=p.student.father_name,
        admission_number=p.admission.admission_number,
        total_admission_payable=p.admission.total_payable,
        total_amount_paid_so_far=p.admission.amount_paid,
        remaining_balance_due=p.admission.balance_due,
        valid_from=p.valid_from,
        valid_to=p.valid_to,
        fee_period=p.fee_period,
        allocations=alloc_data
    )

@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
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
    payment = res.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payment.admission_id)
        .with_for_update()
    )
    admission = adm_res.scalar_one()

    if payload.amount is not None and payload.amount != payment.amount:
        if not payload.edit_reason or not payload.edit_reason.strip():
            raise HTTPException(status_code=400, detail="edit_reason is required when changing payment amount")

    payment, rev_txn = await edit_payment_service(
        db=db,
        payment=payment,
        admission=admission,
        current_user=current_user,
        edit_reason=payload.edit_reason or "Payment updated",
        new_amount=payload.amount,
        new_mode=payload.payment_mode,
        new_ref=payload.transaction_reference,
        new_notes=payload.notes
    )

    await db.commit()

    # Re-fetch payment and allocations fresh from DB
    res = await db.execute(
        select(Payment)
        .options(selectinload(Payment.admission), selectinload(Payment.student))
        .where(Payment.id == payment_id)
    )
    updated_payment = res.scalar_one()

    alloc_res = await db.execute(
        select(PaymentAllocation)
        .where(PaymentAllocation.payment_id == payment_id)
        .order_by(PaymentAllocation.created_at)
    )
    allocations_list = alloc_res.scalars().all()

    alloc_resps = [
        PaymentAllocationResponse(
            id=a.id,
            admission_item_id=a.admission_item_id,
            allocated_amount=a.allocated_amount,
            kind=a.kind,
            reverses_allocation_id=a.reverses_allocation_id
        )
        for a in allocations_list
    ]
    return PaymentResponse(
        id=updated_payment.id,
        payment_number=updated_payment.payment_number,
        admission_id=updated_payment.admission_id,
        student_id=updated_payment.student_id,
        student_name=updated_payment.student.full_name if updated_payment.student else None,
        admission_number=updated_payment.admission.admission_number if updated_payment.admission else None,
        amount=updated_payment.amount,
        payment_mode=updated_payment.payment_mode,
        transaction_reference=updated_payment.transaction_reference,
        payment_date=updated_payment.payment_date,
        collected_by=updated_payment.collected_by,
        collector_name_snapshot=updated_payment.collector_name_snapshot,
        notes=updated_payment.notes,
        valid_from=updated_payment.valid_from,
        valid_to=updated_payment.valid_to,
        fee_period=updated_payment.fee_period,
        allocations=alloc_resps
    )

@router.post("/refund", response_model=RefundResponse, status_code=status.HTTP_201_CREATED)
async def process_refund(
    payload: RefundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payload.admission_id)
        .with_for_update()
    )
    admission = adm_res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    refund, f_txn = await process_refund_service(
        db=db,
        admission=admission,
        amount=payload.amount,
        refund_mode=payload.refund_mode,
        reason=payload.reason,
        current_user=current_user,
        payment_id=payload.payment_id,
        target_item_id=payload.item_id,
        deduction_amount=payload.deduction_amount,
        deduction_reason=payload.deduction_reason,
        notes=payload.notes
    )

    is_revoked = False
    if payload.revoke_admission:
        admission.access_status = "REVOKED"
        admission.status = "REVOKED"
        admission.revocation_reason = f"Full refund issued: {payload.reason.strip()}"
        admission.revoked_at = datetime.now(timezone.utc)
        admission.revoked_by = current_user.id
        is_revoked = True
        for itm in admission.items:
            itm.access_status = "REVOKED"
            itm.status = "DISCONTINUED"
            itm.written_off_amount = itm.balance_due
            itm.balance_due = Decimal("0.00")
            itm.keep_due = False

        has_gc = any(itm.item_type == "GREEN_CARD" for itm in admission.items)
        if has_gc and admission.student:
            admission.student.has_green_card = False

        await recompute_admission_totals(admission, db)

    await db.commit()
    await db.refresh(refund)

    return RefundResponse(
        id=refund.id,
        refund_number=refund.refund_number,
        admission_id=refund.admission_id,
        payment_id=refund.payment_id,
        student_id=refund.student_id,
        student_name=admission.student.full_name if admission.student else None,
        admission_number=admission.admission_number,
        amount=refund.amount,
        refund_mode=refund.refund_mode,
        reason=refund.reason,
        refund_date=refund.refund_date,
        processed_by=refund.processed_by,
        processor_name_snapshot=refund.processor_name_snapshot,
        notes=refund.notes,
        admission_status=admission.status,
        revoked=is_revoked
    )

@router.get("/refunds", response_model=PageResponse[RefundResponse])
async def list_refunds(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Refund)
        .options(
            selectinload(Refund.admission).selectinload(Admission.items),
            selectinload(Refund.student)
        )
    )
    count_query = select(func.count(Refund.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Refund.refund_number.ilike(search_pattern),
            Refund.processor_name_snapshot.ilike(search_pattern),
            Refund.reason.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Refund.student_id == student_id)
        count_query = count_query.where(Refund.student_id == student_id)

    if admission_id:
        query = query.where(Refund.admission_id == admission_id)
        count_query = count_query.where(Refund.admission_id == admission_id)

    if from_date:
        query = query.where(Refund.refund_date >= datetime.combine(from_date, datetime.min.time()))
        count_query = count_query.where(Refund.refund_date >= datetime.combine(from_date, datetime.min.time()))

    if to_date:
        query = query.where(Refund.refund_date <= datetime.combine(to_date, datetime.max.time()))
        count_query = count_query.where(Refund.refund_date <= datetime.combine(to_date, datetime.max.time()))

    total = (await db.execute(count_query)).scalar_one()
    offset = (page - 1) * page_size
    query = query.order_by(desc(Refund.refund_date)).offset(offset).limit(page_size)
    refunds = (await db.execute(query)).scalars().all()

    items = []
    for r in refunds:
        c_str = None
        if r.admission and r.admission.items:
            c_str = ", ".join(i.item_name_snapshot for i in r.admission.items)
        items.append(
            RefundResponse(
                id=r.id,
                refund_number=r.refund_number,
                admission_id=r.admission_id,
                payment_id=r.payment_id,
                student_id=r.student_id,
                student_name=r.student.full_name if r.student else None,
                admission_number=r.admission.admission_number if r.admission else None,
                course_name=c_str,
                amount=r.amount,
                refund_mode=r.refund_mode,
                reason=r.reason,
                refund_date=r.refund_date,
                processed_by=r.processed_by,
                processor_name_snapshot=r.processor_name_snapshot,
                notes=r.notes
            )
        )
    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/refunds/{refund_id}/receipt", response_model=RefundReceiptResponse)
async def get_refund_receipt(
    refund_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Refund)
        .options(
            selectinload(Refund.admission).selectinload(Admission.items),
            selectinload(Refund.student)
        )
        .where(Refund.id == refund_id)
    )
    res = await db.execute(query)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Refund record not found")

    c_str = None
    if r.admission and r.admission.items:
        c_str = ", ".join(i.item_name_snapshot for i in r.admission.items)

    return RefundReceiptResponse(
        refund_number=r.refund_number,
        refund_date=r.refund_date,
        amount=r.amount,
        refund_mode=r.refund_mode,
        reason=r.reason,
        processor_name=r.processor_name_snapshot,
        student_name=r.student.full_name,
        student_reg_no=r.student.registration_no,
        student_mobile=r.student.mobile,
        student_father_name=r.student.father_name,
        admission_number=r.admission.admission_number,
        course_name=c_str,
        admission_total_payable=r.admission.total_payable,
        net_amount_paid_after_refund=r.admission.amount_paid,
        remaining_balance_due=r.admission.balance_due,
        notes=r.notes
    )
