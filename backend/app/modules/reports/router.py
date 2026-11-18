import uuid
from decimal import Decimal
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.database.session import get_db
from app.core.dependencies import require_staff
from app.database.models import (
    AdmissionItem, Subject, Batch, Teacher, PaymentAllocation, Payment,
    Expense, SalaryRecord, User
)

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])

@router.get("/subject-revenue")
async def get_subject_revenue_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Returns revenue breakdown by subject:
    Total booked net price, total collected via allocations, balance due, enrollments.
    """
    subjects_res = await db.execute(select(Subject).order_by(Subject.name.asc()))
    subjects = subjects_res.scalars().all()

    report = []
    total_revenue_all = Decimal("0.00")
    total_collected_all = Decimal("0.00")

    for s in subjects:
        # Sum booked net_price and collected on admission_items for this subject
        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.original_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.discount_amount + AdmissionItem.overall_discount_share), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .where(AdmissionItem.subject_id == s.id)
        )
        res = await db.execute(stmt)
        orig_price, total_disc, booked, collected, student_count = res.one()

        balance = booked - collected
        total_revenue_all += booked
        total_collected_all += collected

        report.append({
            "subject_id": str(s.id),
            "subject_code": s.subject_code,
            "subject_name": s.name,
            "default_fee": float(s.default_fee),
            "enrolled_count": student_count,
            "original_billed": float(orig_price),
            "total_discounts": float(total_disc),
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(balance)
        })

    # Also handle Green Card / All Access items separately
    gc_stmt = (
        select(
            func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
            func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
            func.coalesce(func.count(AdmissionItem.id), 0)
        )
        .where(AdmissionItem.item_type == "GREEN_CARD")
    )
    gc_res = await db.execute(gc_stmt)
    gc_booked, gc_collected, gc_count = gc_res.one()
    if gc_count > 0:
        total_revenue_all += gc_booked
        total_collected_all += gc_collected
        report.append({
            "subject_id": "green-card-all-access",
            "subject_code": "GREEN-CARD",
            "subject_name": "Green Card (All-Access Pass)",
            "default_fee": 15000.0,
            "enrolled_count": gc_count,
            "total_booked": float(gc_booked),
            "total_collected": float(gc_collected),
            "balance_due": float(gc_booked - gc_collected)
        })

    return {
        "summary": {
            "total_booked_all": float(total_revenue_all),
            "total_collected_all": float(total_collected_all),
            "total_balance_all": float(total_revenue_all - total_collected_all)
        },
        "items": report
    }

@router.get("/batch-revenue")
async def get_batch_revenue_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    batches_res = await db.execute(select(Batch).order_by(Batch.name.asc()))
    batches = batches_res.scalars().all()

    report = []
    for b in batches:
        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .where(AdmissionItem.batch_id == b.id)
        )
        res = await db.execute(stmt)
        booked, collected, count = res.one()

        report.append({
            "batch_id": str(b.id),
            "batch_code": b.batch_code,
            "batch_name": b.name,
            "teacher_name": b.teacher_name_snapshot,
            "enrolled_count": count,
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(booked - collected),
            "status": b.status
        })

    return report

@router.get("/teacher-revenue")
async def get_teacher_revenue_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Teacher-wise associated subject revenue report matching requirement 530.
    """
    teachers_res = await db.execute(select(Teacher).order_by(Teacher.name.asc()))
    teachers = teachers_res.scalars().all()

    report = []
    for t in teachers:
        # Batches taught by teacher
        b_res = await db.execute(select(Batch.id).where(Batch.teacher_id == t.id))
        b_ids = [b for b, in b_res.all()]

        if not b_ids:
            report.append({
                "teacher_id": str(t.id),
                "teacher_name": t.name,
                "teacher_code": t.teacher_code,
                "specialization": t.specialization,
                "batches_count": 0,
                "enrolled_count": 0,
                "total_booked": 0.0,
                "total_collected": 0.0,
                "balance_due": 0.0
            })
            continue

        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .where(AdmissionItem.batch_id.in_(b_ids))
        )
        res = await db.execute(stmt)
        booked, collected, count = res.one()

        report.append({
            "teacher_id": str(t.id),
            "teacher_name": t.name,
            "teacher_code": t.teacher_code,
            "specialization": t.specialization,
            "batches_count": len(b_ids),
            "enrolled_count": count,
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(booked - collected)
        })

    return report

@router.get("/cash-movement")
async def get_cash_movement_report(
    year: int = Query(default=2026),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Returns monthly cash inflows (payments collected) vs outflows (daily expenses + salaries paid).
    """
    months_data = []

    for month in range(1, 13):
        m_str = f"{year}-{month:02d}"
        
        # Inflows (Payments received in this month)
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)

        pay_stmt = (
            select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .where(Payment.payment_date >= start_date, Payment.payment_date < end_date)
        )
        pay_res = await db.execute(pay_stmt)
        inflow = pay_res.scalar_one()

        # Outflow 1: Daily expenses in this month
        exp_stmt = (
            select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
            .where(Expense.expense_date >= start_date, Expense.expense_date < end_date)
        )
        exp_res = await db.execute(exp_stmt)
        daily_exp = exp_res.scalar_one()

        # Outflow 2: Salaries paid in this month
        sal_stmt = (
            select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
            .where(
                SalaryRecord.payment_date >= start_date,
                SalaryRecord.payment_date < end_date
            )
        )
        sal_res = await db.execute(sal_stmt)
        sal_paid = sal_res.scalar_one()

        total_outflow = daily_exp + sal_paid
        net_cash = inflow - total_outflow

        month_label = start_date.strftime("%b %Y")
        months_data.append({
            "month_key": m_str,
            "month_label": month_label,
            "inflows": float(inflow),
            "daily_expenses": float(daily_exp),
            "salaries_paid": float(sal_paid),
            "total_outflows": float(total_outflow),
            "net_cash_flow": float(net_cash)
        })

    total_inflows = sum(m["inflows"] for m in months_data)
    total_outflows = sum(m["total_outflows"] for m in months_data)

    return {
        "year": year,
        "total_inflows": total_inflows,
        "total_outflows": total_outflows,
        "net_cash_position": total_inflows - total_outflows,
        "monthly_breakdown": months_data
    }
