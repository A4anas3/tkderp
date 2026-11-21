import uuid
import json
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Admission, AdmissionItem, Payment, PaymentAllocation, Refund, FinancialTransaction, AuditLog, Student, User
)
from app.common.numbering import next_number
from app.common.calculations import allocate_payment_proportionally, round_money
from app.core.config import settings

async def _ensure_items_loaded(admission: Admission, db: AsyncSession) -> List[AdmissionItem]:
    """Ensures admission.items is eagerly loaded in async context without lazy loading triggers."""
    state = sa_inspect(admission)
    if "items" in state.unloaded:
        res = await db.execute(select(AdmissionItem).where(AdmissionItem.admission_id == admission.id))
        items = list(res.scalars().all())
        set_committed_value(admission, "items", items)
        return items
    return list(admission.items)

async def recompute_admission_totals(admission: Admission, db: AsyncSession) -> None:
    """
    Derives item.amount_collected, item.balance_due, admission.amount_paid,
    admission.balance_due, and payment_status strictly from the allocation ledger and refunds.
    Never assigns statuses manually.
    """
    items = await _ensure_items_loaded(admission, db)
    # Fetch all allocations for all items in this admission
    item_ids = [itm.id for itm in items]
    if not item_ids:
        return

    stmt = select(PaymentAllocation).where(PaymentAllocation.admission_item_id.in_(item_ids))
    res = await db.execute(stmt)
    allocations = res.scalars().all()

    # Sum signed allocations per item
    alloc_sums: Dict[uuid.UUID, Decimal] = {iid: Decimal("0.00") for iid in item_ids}
    for pa in allocations:
        alloc_sums[pa.admission_item_id] = alloc_sums.get(pa.admission_item_id, Decimal("0.00")) + pa.allocated_amount

    # Update item caches
    is_void = getattr(admission, "document_status", "VALID") == "VOID"
    for itm in items:
        net_collected = max(Decimal("0.00"), alloc_sums.get(itm.id, Decimal("0.00")))
        itm.amount_collected = net_collected
        w_off = itm.written_off_amount or Decimal("0.00")
        itm.balance_due = Decimal("0.00") if is_void else max(Decimal("0.00"), itm.net_price - net_collected - w_off)

    # Check if real refund rows exist for this admission
    ref_stmt = select(func.count(Refund.id)).where(Refund.admission_id == admission.id)
    ref_count = (await db.execute(ref_stmt)).scalar_one() or 0

    # Total admission collections
    total_collected = sum((itm.amount_collected for itm in items), Decimal("0.00"))
    total_written_off = sum((itm.written_off_amount or Decimal("0.00") for itm in items), Decimal("0.00"))
    
    admission.amount_paid = total_collected
    admission.written_off_amount = total_written_off

    if is_void:
        admission.balance_due = Decimal("0.00")
        admission.payment_status = "VOID"
    else:
        admission.balance_due = max(Decimal("0.00"), admission.total_payable - total_collected - total_written_off)
        if ref_count > 0:
            if admission.amount_paid <= Decimal("0.00"):
                admission.payment_status = "REFUNDED"
            else:
                admission.payment_status = "PARTIALLY_REFUNDED"
        else:
            if admission.amount_paid >= admission.total_payable:
                admission.payment_status = "PAID"
            elif admission.amount_paid > Decimal("0.00"):
                admission.payment_status = "PARTIALLY_PAID"
            else:
                admission.payment_status = "UNPAID"

    # Derive admission valid_from and valid_to as min/max of items
    item_froms = [i.valid_from for i in items if i.valid_from]
    item_tos = [i.valid_to for i in items if i.valid_to]
    if item_froms:
        admission.valid_from = min(item_froms)
    if item_tos:
        admission.valid_to = max(item_tos)

async def record_payment_service(
    db: AsyncSession,
    admission: Admission,
    amount: Decimal,
    payment_mode: str,
    collected_by_user: User,
    transaction_reference: Optional[str] = None,
    notes: Optional[str] = None,
    valid_from: Optional[date] = None,
    valid_to: Optional[date] = None,
    fee_period: Optional[str] = None,
    allocation_mode: str = "PROPORTIONAL",
    manual_allocations: Optional[Any] = None
) -> Tuple[Payment, FinancialTransaction]:
    """
    Single source of truth for payment creation.
    Creates Payment, PaymentAllocation rows, FinancialTransaction (TXN series),
    recomputes admission totals, and records an AuditLog.
    """
    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=400, detail="Cannot accept payment on a VOID admission document")

    items = await _ensure_items_loaded(admission, db)
    has_keep_due = any(getattr(itm, "keep_due", False) for itm in items)
    if admission.status != "ACTIVE" and not (admission.status == "REVOKED" and has_keep_due):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot record payment: admission status is {admission.status} (must be ACTIVE)"
        )

    amount = round_money(amount)
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    allow_suspended = getattr(settings, "ALLOW_PAY_WHEN_SUSPENDED", False)

    # Validate target items when in MANUAL mode
    if allocation_mode == "MANUAL" and manual_allocations:
        item_map = {itm.id: itm for itm in items}
        for ma in manual_allocations:
            m_id = (
                getattr(ma, "admission_item_id", None)
                or getattr(ma, "item_id", None)
                or (ma.get("admission_item_id") if isinstance(ma, dict) else None)
                or (ma.get("item_id") if isinstance(ma, dict) else None)
            )
            if m_id and m_id in item_map:
                target_itm = item_map[m_id]
                if target_itm.status == "DISCONTINUED" or getattr(target_itm, "access_status", "ACTIVE") == "DISCONTINUED":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot record payment: subject line '{target_itm.item_name_snapshot}' is DISCONTINUED"
                    )
                if (target_itm.status == "SUSPENDED" or getattr(target_itm, "access_status", "ACTIVE") == "SUSPENDED") and not allow_suspended:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot record payment: subject line '{target_itm.item_name_snapshot}' is SUSPENDED"
                    )

    active_candidates = [
        itm for itm in items
        if not getattr(itm, "keep_due", False)
        and not (getattr(itm, "access_status", "ACTIVE") == "REVOKED" and not getattr(itm, "keep_due", False))
    ]
    if active_candidates and all((itm.status == "DISCONTINUED" or getattr(itm, "access_status", "ACTIVE") == "DISCONTINUED") for itm in active_candidates):
        raise HTTPException(status_code=400, detail="Cannot record payment: target subject line is DISCONTINUED")
    if active_candidates and not allow_suspended and all((itm.status == "SUSPENDED" or getattr(itm, "access_status", "ACTIVE") == "SUSPENDED") for itm in active_candidates):
        raise HTTPException(status_code=400, detail="Cannot record payment: target subject line is SUSPENDED")

    # Only lines that are not REVOKED (or REVOKED with KEEP_DUE), not DISCONTINUED, and not SUSPENDED (unless allowed)
    payable_items = []
    for itm in items:
        is_revoked = getattr(itm, "access_status", "ACTIVE") == "REVOKED"
        keep_due = getattr(itm, "keep_due", False)
        if is_revoked and not keep_due:
            continue
        if (itm.status == "DISCONTINUED" or getattr(itm, "access_status", "ACTIVE") == "DISCONTINUED") and not keep_due:
            continue
        if (itm.status == "SUSPENDED" or getattr(itm, "access_status", "ACTIVE") == "SUSPENDED") and not allow_suspended:
            continue
        if itm.balance_due > Decimal("0.00"):
            payable_items.append({"id": itm.id, "balance_due": itm.balance_due})

    total_available_balance = sum((itm["balance_due"] for itm in payable_items), Decimal("0.00"))
    if total_available_balance <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="This admission has no outstanding balance to pay")

    if amount > total_available_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ₹{amount} exceeds outstanding balance ₹{total_available_balance}"
        )

    # 1. Sequential Payment number
    pay_no = await next_number(db, "PAY")

    p_from = valid_from or admission.valid_from
    p_to = valid_to or admission.valid_to
    p_fee_period = fee_period or (f"{p_from} to {p_to}" if p_from and p_to else None)

    payment = Payment(
        payment_number=pay_no,
        admission_id=admission.id,
        student_id=admission.student_id,
        amount=amount,
        payment_mode=payment_mode,
        transaction_reference=transaction_reference,
        payment_date=datetime.now(timezone.utc),
        collected_by=collected_by_user.id,
        collector_name_snapshot=collected_by_user.full_name,
        notes=notes,
        valid_from=p_from,
        valid_to=p_to,
        fee_period=p_fee_period
    )
    db.add(payment)
    await db.flush()

    # 2. Allocations via largest-remainder method
    try:
        alloc_tuples = allocate_payment_proportionally(
            amount,
            payable_items,
            mode=allocation_mode,
            manual_allocations=manual_allocations
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    alloc_objs = []
    for itm_id, alloc_amt in alloc_tuples:
        pa = PaymentAllocation(
            payment_id=payment.id,
            admission_item_id=itm_id,
            allocated_amount=alloc_amt,
            kind="PAYMENT"
        )
        db.add(pa)
        alloc_objs.append(pa)

    set_committed_value(payment, "allocations", alloc_objs)
    await db.flush()

    # 3. Append-only FinancialTransaction (TXN series)
    txn_no = await next_number(db, "TXN")
    f_txn = FinancialTransaction(
        txn_number=txn_no,
        txn_type="PAYMENT",
        student_id=admission.student_id,
        admission_id=admission.id,
        payment_id=payment.id,
        mode=payment_mode,
        reference=transaction_reference,
        signed_amount=amount,
        txn_at=datetime.now(timezone.utc),
        created_by=collected_by_user.id,
        reason=notes or f"Fee payment for {admission.admission_number}"
    )
    db.add(f_txn)
    await db.flush()

    # 4. Recompute cached totals from ledger
    await recompute_admission_totals(admission, db)

    # 5. Audit Log
    audit = AuditLog(
        user_id=collected_by_user.id,
        action="PAYMENT_RECORDED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details=json.dumps({
            "payment_number": pay_no,
            "admission_number": admission.admission_number,
            "amount": float(amount),
            "payment_mode": payment_mode,
            "txn_number": txn_no
        })
    )
    db.add(audit)

    return payment, f_txn

async def edit_payment_service(
    db: AsyncSession,
    payment: Payment,
    admission: Admission,
    current_user: User,
    edit_reason: str,
    new_amount: Optional[Decimal] = None,
    new_mode: Optional[str] = None,
    new_ref: Optional[str] = None,
    new_notes: Optional[str] = None
) -> Tuple[Payment, Optional[FinancialTransaction]]:
    """
    Edits an existing payment.
    - Mode / reference / notes change in place (audited).
    - Amount change = reversal rows for the old allocations + new allocation rows,
      with edit_reason required and history preserved.
    """
    old_amount = payment.amount
    old_mode = payment.payment_mode
    old_ref = payment.transaction_reference

    reversal_txn = None
    if new_mode is not None:
        payment.payment_mode = new_mode
    if new_ref is not None:
        payment.transaction_reference = new_ref
    if new_notes is not None:
        payment.notes = new_notes

    if new_amount is not None and new_amount != old_amount:
        new_amount = round_money(new_amount)
        if new_amount <= Decimal("0.00"):
            raise HTTPException(status_code=400, detail="New payment amount must be greater than zero")

        # 1. Create reversal rows for the active positive allocations not yet reversed
        alloc_res = await db.execute(
            select(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id)
        )
        existing_allocations = list(alloc_res.scalars().all())

        reversed_ids = {
            pa.reverses_allocation_id
            for pa in existing_allocations
            if pa.kind == "REVERSAL" and pa.reverses_allocation_id is not None
        }

        for pa in existing_allocations:
            if pa.kind == "PAYMENT" and pa.allocated_amount > Decimal("0.00") and pa.id not in reversed_ids:
                rev_pa = PaymentAllocation(
                    payment=payment,
                    payment_id=payment.id,
                    admission_item_id=pa.admission_item_id,
                    allocated_amount=-pa.allocated_amount,
                    kind="REVERSAL",
                    reverses_allocation_id=pa.id
                )
                db.add(rev_pa)

        await db.flush()

        # Reversal transaction header
        rev_txn_no = await next_number(db, "TXN")
        reversal_txn = FinancialTransaction(
            txn_number=rev_txn_no,
            txn_type="REVERSAL",
            student_id=admission.student_id,
            admission_id=admission.id,
            payment_id=payment.id,
            mode=old_mode,
            reference=old_ref,
            signed_amount=-old_amount,
            txn_at=datetime.now(timezone.utc),
            created_by=current_user.id,
            reason=f"Reversal for payment edit: {edit_reason}"
        )
        db.add(reversal_txn)
        await db.flush()

        # Temporarily recompute to see open balances without this payment
        await recompute_admission_totals(admission, db)

        items = await _ensure_items_loaded(admission, db)
        # 2. Check maximum allowable
        payable_items = [
            {"id": itm.id, "balance_due": itm.balance_due}
            for itm in items
            if (getattr(itm, "access_status", "ACTIVE") != "REVOKED" or getattr(itm, "keep_due", False))
            and itm.balance_due > Decimal("0.00")
        ]
        available_cap = sum((itm["balance_due"] for itm in payable_items), Decimal("0.00"))
        if new_amount > available_cap:
            raise HTTPException(
                status_code=400,
                detail=f"New amount ₹{new_amount} exceeds maximum allowed balance ₹{available_cap}"
            )

        # 3. Create fresh allocation rows for the new amount
        try:
            alloc_tuples = allocate_payment_proportionally(
                new_amount,
                payable_items,
                mode="PROPORTIONAL"
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        for itm_id, alloc_amt in alloc_tuples:
            new_pa = PaymentAllocation(
                payment=payment,
                payment_id=payment.id,
                admission_item_id=itm_id,
                allocated_amount=alloc_amt,
                kind="PAYMENT"
            )
            db.add(new_pa)

        # New transaction header
        new_txn_no = await next_number(db, "TXN")
        new_txn = FinancialTransaction(
            txn_number=new_txn_no,
            txn_type="PAYMENT",
            student_id=admission.student_id,
            admission_id=admission.id,
            payment_id=payment.id,
            mode=payment.payment_mode,
            reference=payment.transaction_reference,
            signed_amount=new_amount,
            txn_at=datetime.now(timezone.utc),
            created_by=current_user.id,
            reason=f"Payment edited from ₹{old_amount} to ₹{new_amount}: {edit_reason}"
        )
        db.add(new_txn)

        payment.amount = new_amount
        await db.flush()

    # 4. Final recompute
    await recompute_admission_totals(admission, db)

    # 5. Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        action="PAYMENT_EDITED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details=json.dumps({
            "payment_number": payment.payment_number,
            "old_amount": float(old_amount),
            "new_amount": float(payment.amount),
            "edit_reason": edit_reason
        })
    )
    db.add(audit)

    # Eagerly load all allocations so caller can inspect without lazy loading
    pa_res = await db.execute(
        select(PaymentAllocation)
        .where(PaymentAllocation.payment_id == payment.id)
        .order_by(PaymentAllocation.created_at)
    )
    all_allocs = list(pa_res.scalars().all())
    set_committed_value(payment, "allocations", all_allocs)

    return payment, reversal_txn

async def update_student_green_card_status(student_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Checks if the student has any active green card line across all valid admissions.
    Updates student.has_green_card and student.green_card_expiry correctly.
    Never blindly sets False if the student has another active green-card admission.
    """
    stmt = (
        select(AdmissionItem)
        .join(Admission, Admission.id == AdmissionItem.admission_id)
        .where(
            Admission.student_id == student_id,
            AdmissionItem.item_type == "GREEN_CARD",
            AdmissionItem.access_status == "ACTIVE",
            AdmissionItem.status != "DISCONTINUED",
            Admission.document_status == "VALID",
            Admission.status == "ACTIVE",
            (AdmissionItem.valid_to == None) | (AdmissionItem.valid_to >= date.today())
        )
    )
    await db.flush()
    res = await db.execute(stmt)
    active_gc_items = list(res.scalars().all())

    st_res = await db.execute(select(Student).where(Student.id == student_id).with_for_update())
    st = st_res.scalar_one_or_none()
    if st:
        if active_gc_items:
            st.has_green_card = True
            expiries = [itm.valid_to for itm in active_gc_items if itm.valid_to]
            st.green_card_expiry = max(expiries) if expiries else None
        else:
            st.has_green_card = False
            st.green_card_expiry = None

async def process_refund_service(
    db: AsyncSession,
    admission: Admission,
    amount: Optional[Decimal] = None,
    refund_mode: str = "CASH",
    reason: str = "Fee Refund",
    current_user: Optional[User] = None,
    payment_id: Optional[uuid.UUID] = None,
    target_item_id: Optional[uuid.UUID] = None,
    line_refunds: Optional[List[Tuple[uuid.UUID, Decimal]]] = None,
    refund_amount_requested: Optional[Decimal] = None,
    deduction_amount: Optional[Decimal] = None,
    deduction_reason: Optional[str] = None,
    notes: Optional[str] = None
) -> Tuple[Refund, FinancialTransaction]:
    """
    Allocation-aware refund with refund policy support (gross, deduction, net):
    - Can be per-item (target_item_id), per-line-list (line_refunds), per-payment, or whole slip.
    - Rule: refund amount per item <= amount currently collected for that item.
    - Whole-admission refund with no manual split reverses each item's own collected amount (not a proportional guess).
    - Creates Refund row with gross, deduction, net payout.
    - Creates negative allocation rows (kind=REVERSAL, refund_id=refund.id) against the specific items.
    - Creates FinancialTransaction and recomputes totals from ledger.
    """
    ded_amt = round_money(deduction_amount) if deduction_amount is not None else Decimal("0.00")

    if refund_amount_requested is not None and refund_amount_requested > Decimal("0.00"):
        gross_amount = round_money(refund_amount_requested)
        net_amount = round_money(max(Decimal("0.00"), gross_amount - ded_amt))
    elif amount is not None and amount > Decimal("0.00"):
        net_amount = round_money(amount)
        gross_amount = round_money(net_amount + ded_amt)
    else:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")

    if gross_amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Refund gross amount must be greater than zero")

    if admission.amount_paid <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Cannot issue refund. No fee has been paid for this admission.")

    if gross_amount > admission.amount_paid:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount ₹{gross_amount} cannot exceed total amount paid ₹{admission.amount_paid}"
        )

    if net_amount < Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Deduction amount cannot exceed refund amount requested")

    items = await _ensure_items_loaded(admission, db)

    # Determine itemized reversal allocations (sum must equal net_amount)
    if line_refunds:
        sum_lines = sum((round_money(r_amt) for _, r_amt in line_refunds), Decimal("0.00"))
        if sum_lines != net_amount and sum_lines != gross_amount:
            raise HTTPException(status_code=400, detail=f"Sum of line refunds ₹{sum_lines} does not match refund amount ₹{net_amount}")
        for itm_id, r_amt in line_refunds:
            itm_obj = next((i for i in items if i.id == itm_id), None)
            if not itm_obj:
                raise HTTPException(status_code=404, detail=f"Subject line {itm_id} not found on this admission")
            if r_amt > itm_obj.amount_collected:
                raise HTTPException(
                    status_code=400,
                    detail=f"Refund amount ₹{r_amt} exceeds collected amount ₹{itm_obj.amount_collected} on {itm_obj.item_name_snapshot}"
                )
        refund_allocations = line_refunds
    elif target_item_id:
        target_item = next((itm for itm in items if itm.id == target_item_id), None)
        if not target_item:
            raise HTTPException(status_code=404, detail="Target subject line not found on this admission")
        if gross_amount > target_item.amount_collected:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount ₹{gross_amount} exceeds amount collected on this subject ₹{target_item.amount_collected}"
            )
        refund_allocations = [(target_item.id, net_amount)]
    elif payment_id:
        p_res = await db.execute(
            select(Payment).options(selectinload(Payment.allocations)).where(Payment.id == payment_id)
        )
        payment = p_res.scalar_one_or_none()
        if not payment or payment.admission_id != admission.id:
            raise HTTPException(status_code=404, detail="Payment not found for this admission")

        pay_allocs = [a for a in payment.allocations if a.kind == "PAYMENT" and a.allocated_amount > Decimal("0.00")]
        itm_map = {itm.id: itm for itm in items}
        funded_items = [
            {"id": a.admission_item_id, "balance_due": min(itm_map[a.admission_item_id].amount_collected, a.allocated_amount)}
            for a in pay_allocs
            if a.admission_item_id in itm_map and itm_map[a.admission_item_id].amount_collected > Decimal("0.00")
        ]
        total_p_refundable = sum((f["balance_due"] for f in funded_items), Decimal("0.00"))
        if gross_amount > total_p_refundable:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount ₹{gross_amount} exceeds refundable collected balance ₹{total_p_refundable} for payment {payment.payment_number}"
            )
        if net_amount == total_p_refundable:
            refund_allocations = [(f["id"], f["balance_due"]) for f in funded_items]
        else:
            refund_allocations = allocate_payment_proportionally(net_amount, funded_items, mode="PROPORTIONAL")
    elif gross_amount == admission.amount_paid or gross_amount >= sum((itm.amount_collected for itm in items), Decimal("0.00")):
        # Whole-admission refund: reverses each item's own collected amount directly (not a proportional guess)
        if ded_amt > Decimal("0.00") and gross_amount > Decimal("0.00"):
            items_with_collected = [
                {"id": itm.id, "balance_due": itm.amount_collected}
                for itm in items
                if itm.amount_collected > Decimal("0.00")
            ]
            refund_allocations = allocate_payment_proportionally(net_amount, items_with_collected, mode="PROPORTIONAL")
        else:
            refund_allocations = [
                (itm.id, itm.amount_collected)
                for itm in items
                if itm.amount_collected > Decimal("0.00")
            ]
    else:
        # Partial refund across admission
        items_with_collected = [
            {"id": itm.id, "balance_due": itm.amount_collected}
            for itm in items
            if itm.amount_collected > Decimal("0.00")
        ]
        refund_allocations = allocate_payment_proportionally(net_amount, items_with_collected, mode="PROPORTIONAL")

    ref_no = await next_number(db, "REF")
    user_id = current_user.id if current_user else None
    user_name = current_user.full_name if current_user else "System"

    refund = Refund(
        refund_number=ref_no,
        admission_id=admission.id,
        payment_id=payment_id,
        student_id=admission.student_id,
        amount=net_amount,
        refund_amount_requested=gross_amount,
        deduction_amount=ded_amt,
        deduction_reason=deduction_reason,
        refund_mode=refund_mode,
        reason=reason.strip(),
        refund_date=datetime.now(timezone.utc),
        processed_by=user_id,
        processor_name_snapshot=user_name,
        notes=notes
    )
    db.add(refund)
    await db.flush()

    # Create negative PaymentAllocation rows for the refund against specific items
    for itm_id, ref_amt in refund_allocations:
        if ref_amt > Decimal("0.00"):
            pa = PaymentAllocation(
                payment_id=payment_id,
                refund_id=refund.id,
                admission_item_id=itm_id,
                allocated_amount=-round_money(ref_amt),
                kind="REVERSAL"
            )
            db.add(pa)

    await db.flush()

    # Append-only transaction
    txn_no = await next_number(db, "TXN")
    f_txn = FinancialTransaction(
        txn_number=txn_no,
        txn_type="REFUND",
        student_id=admission.student_id,
        admission_id=admission.id,
        payment_id=payment_id,
        refund_id=refund.id,
        mode=refund_mode,
        signed_amount=-net_amount,
        txn_at=datetime.now(timezone.utc),
        created_by=user_id,
        reason=f"Refund: {reason.strip()}" + (f" (Gross: ₹{gross_amount}, Deduction: ₹{ded_amt} - {deduction_reason})" if ded_amt > 0 else "")
    )
    db.add(f_txn)
    await db.flush()

    # Recompute totals strictly from allocation ledger
    await recompute_admission_totals(admission, db)
    await update_student_green_card_status(admission.student_id, db)

    # Audit
    audit = AuditLog(
        user_id=user_id,
        action="REFUND_PROCESSED",
        entity_type="REFUND",
        entity_id=refund.id,
        details=json.dumps({
            "refund_number": ref_no,
            "admission_number": admission.admission_number,
            "gross_amount": float(gross_amount),
            "deduction_amount": float(ded_amt),
            "net_amount": float(net_amount),
            "reason": reason.strip(),
            "txn_number": txn_no
        })
    )
    db.add(audit)

    return refund, f_txn


async def cancel_admission_service(
    admission: Admission,
    db: AsyncSession,
    current_user: User,
    reason: Optional[str] = None
) -> Admission:
    """
    Cancels an admission as ENTRY_MISTAKE.
    Rules:
    - Double cancel guard: if document_status == 'VOID' or status == 'CANCELLED', return 409.
    - Cancelling revoked slip guard: if status == 'REVOKED' or access_status == 'REVOKED', return 400.
    - Net money check: only allowed when amount_paid == 0; otherwise return 400 telling user to refund first.
    - Cascades to items: non-final items become DISCONTINUED with lifecycle_reason, previous_status saved,
      unpaid balances written off.
    - Updates student green card status.
    - Writes AuditLog with before/after numbers.
    """
    if getattr(admission, "document_status", "VALID") == "VOID" or admission.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="Admission document is already VOID / CANCELLED")

    if admission.status == "REVOKED" or getattr(admission, "access_status", "ACTIVE") == "REVOKED":
        raise HTTPException(status_code=400, detail="Cannot cancel a revoked admission. Admission is already REVOKED.")

    items = await _ensure_items_loaded(admission, db)

    # Net money paid check
    if admission.amount_paid > Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel admission with paid fees ₹{admission.amount_paid}. Refund fees first."
        )

    before_status = admission.status
    before_paid = admission.amount_paid
    before_due = admission.balance_due
    before_written_off = admission.written_off_amount or Decimal("0.00")

    cancel_reason = reason.strip() if reason and reason.strip() else "Cancelled by administrator as entry mistake"

    admission.document_status = "VOID"
    admission.status = "CANCELLED"
    admission.access_status = "REVOKED"
    admission.previous_status = before_status
    admission.revoke_type = "ENTRY_MISTAKE"
    admission.revocation_reason = cancel_reason
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id
    admission.payment_status = "VOID"
    admission.balance_due = Decimal("0.00")
    admission.written_off_amount = admission.total_payable

    for itm in items:
        if itm.status not in ["DISCONTINUED", "COMPLETED"]:
            itm.previous_status = itm.status
            itm.previous_access_status = itm.access_status
            itm.status = "DISCONTINUED"
            itm.access_status = "REVOKED"
            itm.discontinued_at = datetime.now(timezone.utc)
            itm.lifecycle_reason = cancel_reason
            itm.balance_due = Decimal("0.00")
            itm.written_off_amount = itm.net_price

    await update_student_green_card_status(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_CANCELLED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "reason": cancel_reason,
            "document_status": "VOID",
            "before": {
                "status": before_status,
                "amount_paid": float(before_paid),
                "balance_due": float(before_due),
                "written_off_amount": float(before_written_off)
            },
            "after": {
                "status": "CANCELLED",
                "document_status": "VOID",
                "amount_paid": float(admission.amount_paid),
                "balance_due": 0.0,
                "written_off_amount": float(admission.written_off_amount)
            }
        })
    )
    db.add(audit)
    return admission


async def revoke_admission_service(
    admission: Admission,
    db: AsyncSession,
    current_user: User,
    reason: str,
    revoke_type: str = "DROPOUT_NO_REFUND",
    scope: str = "WHOLE_SLIP",
    item_ids: Optional[List[uuid.UUID]] = None,
    effective_date: Optional[date] = None,
    pending_due_action: str = "KEEP_DUE",
    refund_amount: Optional[Decimal] = None,
    refund_amount_requested: Optional[Decimal] = None,
    deduction_amount: Optional[Decimal] = None,
    deduction_reason: Optional[str] = None,
    refund_mode: str = "CASH",
    line_refunds: Optional[List[Tuple[uuid.UUID, Decimal]]] = None
) -> Admission:
    """
    Revocation handling according to specification:
    - Guard double revoke / cancel: if document_status == 'VOID' or status in ['REVOKED', 'CANCELLED'], return 409.
    - If ENTRY_MISTAKE: requires amount_paid == 0; delegates to cancel_admission_service.
    - If DROPOUT_WITH_REFUND or refund amount requested: processes refund first.
    - Cascades to items: non-final items become DISCONTINUED with lifecycle_reason; remembers previous_status.
    - Unpaid balance on revoked/discontinued items: if pending_due_action == 'WAIVE', written_off_amount = balance_due, balance_due = 0.
    - Updates student green card status.
    - Writes AuditLog with before/after numbers.
    """
    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=409, detail="Admission document is already VOID")

    if admission.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="Admission is already CANCELLED")

    if scope == "WHOLE_SLIP" and (admission.status == "REVOKED" or getattr(admission, "access_status", "ACTIVE") == "REVOKED"):
        raise HTTPException(status_code=409, detail="Admission access is already REVOKED")

    items = await _ensure_items_loaded(admission, db)

    # ENTRY_MISTAKE check
    if revoke_type == "ENTRY_MISTAKE":
        if admission.amount_paid > Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot mark admission as ENTRY_MISTAKE because ₹{admission.amount_paid} has been paid. Refund fees first or use DROPOUT_WITH_REFUND."
            )
        return await cancel_admission_service(admission, db, current_user, reason=reason)

    if pending_due_action == "WAIVE" and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Only administrators can waive pending dues")

    # Handle refund if requested
    tot_ref = None
    if line_refunds:
        tot_ref = sum((round_money(r_amt) for _, r_amt in line_refunds), Decimal("0.00"))
    elif refund_amount_requested is not None and refund_amount_requested > Decimal("0.00"):
        tot_ref = refund_amount_requested
    elif refund_amount is not None and refund_amount > Decimal("0.00"):
        tot_ref = refund_amount
    elif revoke_type == "DROPOUT_WITH_REFUND":
        tot_ref = admission.amount_paid

    if tot_ref is not None and tot_ref > Decimal("0.00"):
        await process_refund_service(
            db=db,
            admission=admission,
            amount=refund_amount,
            refund_amount_requested=tot_ref,
            deduction_amount=deduction_amount,
            deduction_reason=deduction_reason,
            refund_mode=refund_mode,
            reason=f"Dropout refund: {reason.strip()}",
            current_user=current_user,
            line_refunds=line_refunds
        )

    # Determine target items
    if scope == "WHOLE_SLIP":
        target_items = [itm for itm in items if itm.status not in ["DISCONTINUED", "COMPLETED"]]
    else:
        t_ids = set(item_ids or [])
        target_items = [itm for itm in items if itm.id in t_ids]
        if not target_items:
            raise HTTPException(status_code=400, detail="No matching subject lines found for revocation")
        if all(itm.status == "DISCONTINUED" or getattr(itm, "access_status", "ACTIVE") == "REVOKED" for itm in target_items):
            raise HTTPException(status_code=409, detail="All selected subject lines are already REVOKED / DISCONTINUED")

    eff_date = effective_date or date.today()
    before_status = admission.status
    before_paid = admission.amount_paid
    before_due = admission.balance_due
    before_written_off = admission.written_off_amount or Decimal("0.00")

    for itm in target_items:
        itm.previous_status = itm.status
        itm.previous_access_status = getattr(itm, "access_status", "ACTIVE")
        itm.status = "DISCONTINUED"
        itm.access_status = "REVOKED"
        itm.revoke_type = revoke_type
        itm.valid_to = min(itm.valid_to or eff_date, eff_date)
        itm.discontinued_at = datetime.now(timezone.utc)
        itm.lifecycle_reason = reason.strip()
        itm.forfeited_amount = itm.amount_collected

        if pending_due_action == "WAIVE":
            itm.written_off_amount = itm.balance_due
            itm.balance_due = Decimal("0.00")
            itm.keep_due = False
        else:
            itm.keep_due = True
            itm.written_off_amount = Decimal("0.00")

    admission.previous_status = before_status
    admission.previous_access_status = getattr(admission, "access_status", "ACTIVE")
    if all(itm.status == "DISCONTINUED" or getattr(itm, "access_status", "ACTIVE") == "REVOKED" for itm in items):
        admission.status = "REVOKED"
        admission.access_status = "REVOKED"

    admission.revoke_type = revoke_type
    admission.revocation_reason = reason.strip()
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id
    admission.forfeited_amount = sum((itm.forfeited_amount for itm in items), Decimal("0.00"))

    await recompute_admission_totals(admission, db)
    await update_student_green_card_status(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_REVOKED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "admission_number": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "revoke_type": revoke_type,
            "scope": scope,
            "pending_due_action": pending_due_action,
            "reason": reason.strip(),
            "before": {
                "status": before_status,
                "amount_paid": float(before_paid),
                "balance_due": float(before_due),
                "written_off_amount": float(before_written_off)
            },
            "after": {
                "status": admission.status,
                "amount_paid": float(admission.amount_paid),
                "balance_due": float(admission.balance_due),
                "written_off_amount": float(admission.written_off_amount or 0),
                "forfeited_amount": float(admission.forfeited_amount or 0)
            }
        })
    )
    db.add(audit)
    return admission


async def restore_admission_service(
    admission: Admission,
    db: AsyncSession,
    current_user: User
) -> Admission:
    """
    Restores revoked admission.
    Rules:
    - VOID admission cannot be restored.
    - Only revoked admissions can be restored.
    - Items go back to previous_status.
    - Allocations are NOT touched (ledger is truth).
    - Recomputes totals from ledger.
    - Updates student green card status.
    - Writes AuditLog with before/after numbers.
    """
    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=400, detail="Cannot restore an admission marked as VOID (ENTRY_MISTAKE)")

    if admission.status != "REVOKED" and getattr(admission, "access_status", "ACTIVE") != "REVOKED":
        raise HTTPException(status_code=400, detail="Admission is not revoked")

    items = await _ensure_items_loaded(admission, db)

    before_status = admission.status
    before_paid = admission.amount_paid
    before_due = admission.balance_due
    before_written_off = admission.written_off_amount or Decimal("0.00")
    old_reason = admission.revocation_reason

    admission.status = admission.previous_status or "ACTIVE"
    admission.access_status = getattr(admission, "previous_access_status", None) or "ACTIVE"
    admission.previous_status = None
    admission.previous_access_status = None
    admission.revoke_type = None
    admission.revocation_reason = None
    admission.revoked_at = None
    admission.revoked_by = None
    admission.forfeited_amount = Decimal("0.00")
    admission.written_off_amount = Decimal("0.00")

    for itm in items:
        if itm.status == "DISCONTINUED" or getattr(itm, "access_status", "ACTIVE") == "REVOKED":
            itm.status = itm.previous_status or "ACTIVE"
            itm.access_status = getattr(itm, "previous_access_status", None) or "ACTIVE"
            itm.previous_status = None
            itm.previous_access_status = None
            itm.revoke_type = None
            itm.forfeited_amount = Decimal("0.00")
            itm.written_off_amount = Decimal("0.00")
            itm.keep_due = False
            itm.discontinued_at = None
            itm.lifecycle_reason = None

    # Recompute totals strictly from allocation ledger
    await recompute_admission_totals(admission, db)
    await update_student_green_card_status(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_RESTORED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "previous_revocation_reason": old_reason,
            "before": {
                "status": before_status,
                "amount_paid": float(before_paid),
                "balance_due": float(before_due),
                "written_off_amount": float(before_written_off)
            },
            "after": {
                "status": admission.status,
                "amount_paid": float(admission.amount_paid),
                "balance_due": float(admission.balance_due),
                "written_off_amount": 0.0
            }
        })
    )
    db.add(audit)
    return admission

