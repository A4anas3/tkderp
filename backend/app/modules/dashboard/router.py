import uuid
from decimal import Decimal
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin, require_cashier_or_admin
from app.database.models import (
    Student, Batch, Teacher, Enquiry, EnquiryDemoItem, Admission, Payment, Expense, SalaryRecord,
    AdmissionItem, User, Subject, Refund
)
from app.common.active_student import active_student_subject_filter, today_kolkata
from app.common.teacher_scope import (
    is_teacher_user,
    resolve_teacher_for_user,
    active_teacher_student_item_filter,
    teacher_demo_ownership_filter,
    active_demo_filter,
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboards"])

@router.get("/admin")
async def get_admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    today = date.today()

    # Counts
    total_students = (await db.execute(select(func.count(Student.id)))).scalar_one()
    total_teachers = (await db.execute(select(func.count(Teacher.id)).where(Teacher.status == "ACTIVE"))).scalar_one()
    active_subjects = (await db.execute(select(func.count(Subject.id)).where(Subject.status == "ACTIVE"))).scalar_one()
    active_batches = (await db.execute(select(func.count(Batch.id)).where(Batch.status == "ACTIVE"))).scalar_one()
    pending_enquiries = (await db.execute(select(func.count(Enquiry.id)).where(Enquiry.status.in_(["PENDING", "ACTIVE_DEMO", "INTERESTED"])))).scalar_one()

    # Upcoming demo deadlines in next 3 days
    demo_deadlines = (await db.execute(
        select(func.count(Enquiry.id))
        .where(
            Enquiry.status.in_(["PENDING", "ACTIVE_DEMO", "INTERESTED"]),
            Enquiry.demo_deadline.isnot(None),
            Enquiry.demo_deadline <= today + timedelta(days=3)
        )
    )).scalar_one()

    # Financial sums
    total_revenue_booked = (await db.execute(
        select(func.coalesce(func.sum(Admission.total_payable), Decimal("0.00")))
        .where(
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
            Admission.document_status == "VALID"
        )
    )).scalar_one()

    total_pay = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
    )).scalar_one()

    total_ref = (await db.execute(
        select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
    )).scalar_one()

    total_collected = total_pay - total_ref

    total_expenses = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
    )).scalar_one()

    total_salaries_paid = (await db.execute(
        select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
    )).scalar_one()

    total_outflows = total_expenses + total_salaries_paid
    net_operating_cash = total_collected - total_outflows

    # Recent Admissions
    recent_adm_res = await db.execute(
        select(Admission).order_by(desc(Admission.created_at)).limit(5)
    )
    recent_admissions = [
        {
            "id": str(a.id),
            "admission_number": a.admission_number,
            "student_name": a.student_name_snapshot,
            "admission_date": str(a.admission_date),
            "total_payable": float(a.total_payable),
            "amount_paid": float(a.amount_paid),
            "balance_due": float(a.balance_due),
            "payment_status": a.payment_status
        }
        for a in recent_adm_res.scalars().all()
    ]

    # Recent Payments
    recent_pay_res = await db.execute(
        select(Payment).options(selectinload(Payment.student)).order_by(desc(Payment.payment_date)).limit(5)
    )
    recent_payments = [
        {
            "id": str(p.id),
            "payment_number": p.payment_number,
            "student_name": p.student.full_name if p.student else "Student",
            "amount": float(p.amount),
            "payment_mode": p.payment_mode,
            "date": p.payment_date.strftime("%Y-%m-%d %H:%M")
        }
        for p in recent_pay_res.scalars().all()
    ]

    return {
        "metrics": {
            "total_students": total_students,
            "total_teachers": total_teachers,
            "active_subjects": active_subjects,
            "active_batches": active_batches,
            "pending_enquiries": pending_enquiries,
            "urgent_demo_deadlines": demo_deadlines,
            "total_revenue_booked": float(total_revenue_booked),
            "total_cash_collected": float(total_collected),
            "total_expenses": float(total_outflows),
            "net_operating_cash": float(net_operating_cash)
        },
        "recent_admissions": recent_admissions,
        "recent_payments": recent_payments
    }

@router.get("/cashier")
async def get_cashier_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    today = date.today()

    # Today's net collections
    today_pay = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .where(func.date(Payment.payment_date) == today)
    )).scalar_one()

    today_ref = (await db.execute(
        select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
        .where(func.date(Refund.refund_date) == today)
    )).scalar_one()

    today_coll = today_pay - today_ref

    # Today's expenses
    today_exp = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
        .where(Expense.expense_date == today)
    )).scalar_one()

    # Today's admissions count
    today_adms = (await db.execute(
        select(func.count(Admission.id)).where(Admission.admission_date == today)
    )).scalar_one()

    # Total pending balance across all admissions (including expired admissions with unpaid balance)
    total_due = (await db.execute(
        select(func.coalesce(func.sum(Admission.balance_due), Decimal("0.00")))
        .where(
            Admission.payment_status.in_(["UNPAID", "PARTIALLY_PAID"]),
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
            Admission.document_status == "VALID",
            Admission.balance_due > Decimal("0.00")
        )
    )).scalar_one()

    # Upcoming Demos
    demo_res = await db.execute(
        select(Enquiry)
        .options(selectinload(Enquiry.demo_items))
        .where(
            Enquiry.status.in_(["PENDING", "ACTIVE_DEMO", "INTERESTED"]),
            Enquiry.demo_deadline.isnot(None),
            Enquiry.demo_deadline <= today + timedelta(days=5)
        )
        .order_by(Enquiry.demo_deadline.asc())
        .limit(6)
    )
    demos = [
        {
            "id": str(e.id),
            "student_name": e.student_name,
            "interested_subject": e.interested_subject,
            "mobile": e.mobile,
            "demo_deadline": str(e.demo_deadline) if e.demo_deadline else None,
            "remaining_days": (e.demo_deadline - today).days if e.demo_deadline else None,
            "status": e.status,
            "converted_student_id": str(e.converted_student_id) if e.converted_student_id else None,
            "demo_reference_numbers": [d.demo_reference_number for d in (e.demo_items or [])],
        }
        for e in demo_res.scalars().all()
    ]

    # Partial / Unpaid admissions needing follow-up (including expired admissions with dues)
    unpaid_res = await db.execute(
        select(Admission)
        .where(
            Admission.payment_status.in_(["UNPAID", "PARTIALLY_PAID"]),
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
            Admission.document_status == "VALID",
            Admission.balance_due > Decimal("0.00")
        )
        .order_by(desc(Admission.created_at), desc(Admission.admission_date))
        .limit(15)
    )
    due_admissions = [
        {
            "id": str(a.id),
            "admission_number": a.admission_number,
            "purchase_transaction_id": a.purchase_transaction_id or a.admission_number,
            "student_name": a.student_name_snapshot,
            "total_payable": float(a.total_payable),
            "amount_paid": float(a.amount_paid),
            "balance_due": float(a.balance_due),
            "payment_status": a.payment_status,
            "status": a.status,
            "is_expired": a.status == "EXPIRED" or (a.valid_to is not None and a.valid_to < today)
        }
        for a in unpaid_res.scalars().all()
    ]

    return {
        "metrics": {
            "today_collections": float(today_coll),
            "today_expenses": float(today_exp),
            "today_net": float(today_coll - today_exp),
            "today_admissions_count": today_adms,
            "total_receivables_due": float(total_due)
        },
        "upcoming_demos": demos,
        "due_admissions": due_admissions
    }

@router.get("/teacher")
async def get_teacher_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    teacher_mode = is_teacher_user(current_user)
    teacher = await resolve_teacher_for_user(db, current_user)
    teacher_id = teacher.id if teacher else None

    if teacher_mode and not teacher_id:
        return {
            "teacher_name": current_user.full_name,
            "specialization": "Faculty",
            "batches_count": 0,
            "subjects_count": 0,
            "total_unique_students": 0,
            "active_demos_count": 0,
            "batches": [],
            "subjects": [],
            "active_demos": [],
        }

    today = today_kolkata()

    # Subjects taught directly
    subject_query = select(Subject)
    if teacher_id:
        subject_query = subject_query.where(Subject.teacher_id == teacher_id)
    subject_query = subject_query.order_by(Subject.status.asc(), Subject.name.asc())
    s_res = await db.execute(subject_query)
    subjects = s_res.scalars().all()

    batch_list = []
    total_students_set = set()

    for s in subjects:
        enr_stmt = (
            select(AdmissionItem.admission_id, Admission.student_id, Student.name, Student.mobile, Student.student_code)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .where(
                AdmissionItem.subject_id == s.id,
                Student.status == "ACTIVE",
                active_teacher_student_item_filter(today),
            )
        )
        enr_res = await db.execute(enr_stmt)
        students_rows = enr_res.all()

        roster = []
        seen_stu_in_sub = set()
        for row in students_rows:
            if row[1] in seen_stu_in_sub:
                continue
            seen_stu_in_sub.add(row[1])
            total_students_set.add(row[1])
            roster.append({
                "student_id": str(row[1]),
                "student_name": row[2],
                "mobile": row[3],
                "registration_no": row[4],
                "status": "ACTIVE",
            })

        batch_list.append({
            "id": str(s.id),
            "batch_id": str(s.id),
            "batch_code": s.subject_code,
            "name": s.name,
            "hall_number": s.hall_number or "Main Hall",
            "schedule": s.schedule or "Regular",
            "status": s.status,
            "student_count": len(roster),
            "students": roster,
        })

    if not teacher_mode:
        # Batches taught (for Admin view)
        batch_query = select(Batch).options(selectinload(Batch.subjects))
        if teacher_id:
            batch_query = batch_query.where(Batch.teacher_id == teacher_id)
        batch_query = batch_query.order_by(Batch.status.asc(), Batch.name.asc())
        b_res = await db.execute(batch_query)
        batches = b_res.scalars().all()

        for b in batches:
            enr_stmt = (
                select(AdmissionItem.admission_id, Admission.student_id, Admission.student_name_snapshot, Student.mobile, Student.student_code)
                .join(Admission, AdmissionItem.admission_id == Admission.id)
                .join(Student, Admission.student_id == Student.id)
                .where(
                    AdmissionItem.batch_id == b.id,
                    active_student_subject_filter(AdmissionItem, Admission, today)
                )
            )
            enr_res = await db.execute(enr_stmt)
            students_rows = enr_res.all()

            roster = []
            for row in students_rows:
                total_students_set.add(row[1])
                roster.append({
                    "student_id": str(row[1]),
                    "student_name": row[2],
                    "mobile": row[3],
                    "registration_no": row[4]
                })

            batch_list.append({
                "id": str(b.id),
                "batch_id": str(b.id),
                "batch_code": b.batch_code,
                "name": b.name,
                "hall_number": b.hall_number,
                "schedule": b.schedule,
                "status": b.status,
                "student_count": len(roster),
                "students": roster
            })

    # Active demos for this teacher
    sub_ids = [s.id for s in subjects]
    demos_query = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .where(active_demo_filter(today))
        .order_by(EnquiryDemoItem.demo_start_date.desc(), EnquiryDemoItem.created_at.desc())
    )
    if teacher_id:
        demos_query = demos_query.where(teacher_demo_ownership_filter(teacher_id, sub_ids))
    demo_rows = (await db.execute(demos_query)).all()
    active_demos = [
        {
            "demo_item_id": str(ditm.id),
            "enquiry_id": str(enq.id),
            "demo_reference_number": ditm.demo_reference_number,
            "student_name": enq.student_name,
            "mobile": enq.mobile,
            "subject_id": str(ditm.subject_id) if ditm.subject_id else None,
            "subject_name": ditm.subject_name_snapshot,
            "hall_number": ditm.hall_number_snapshot,
            "demo_start_date": str(ditm.demo_start_date),
            "demo_end_date": str(ditm.demo_end_date),
            "status": ditm.status,
        }
        for ditm, enq in demo_rows
    ]

    return {
        "teacher_name": teacher.name if teacher else current_user.full_name,
        "specialization": teacher.specialization if teacher else "Faculty",
        "batches_count": len(batch_list),
        "subjects_count": len(batch_list),
        "total_unique_students": len(total_students_set),
        "active_demos_count": len(active_demos),
        "batches": batch_list,
        "subjects": batch_list,
        "active_demos": active_demos,
    }
