import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.core.security import get_password_hash
from app.database.models import (
    Base, User, Teacher, Student, Enquiry, Subject, Batch, BatchSubject,
    GreenCardProduct, Admission, AdmissionItem, Payment, PaymentAllocation,
    ExpenseCategory, Expense, SalaryRecord, AuditLog
)
from app.database.session import AsyncSessionLocal
from app.common.calculations import calculate_admission_financials, allocate_payment_proportionally

async def init_models():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("Database tables created successfully!")

async def seed_data():
    async with AsyncSessionLocal() as session:
        # 1. Users
        admin_pwd = get_password_hash("Admin@1234")
        cashier_pwd = get_password_hash("Cashier@1234")
        teacher_pwd = get_password_hash("Teacher@1234")

        admin_user = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111101"),
            employee_id="ADM001",
            full_name="Principal R.K. Verma",
            email="admin@thakurdwara.local",
            password_hash=admin_pwd,
            role="ADMIN",
            status="ACTIVE"
        )
        cashier_user = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111102"),
            employee_id="CSH001",
            full_name="Sunil Mishra (Cashier)",
            email="cashier@thakurdwara.local",
            password_hash=cashier_pwd,
            role="CASHIER",
            status="ACTIVE"
        )
        teacher_user = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111103"),
            employee_id="TCH001",
            full_name="K.K. Chauhan",
            email="teacher@thakurdwara.local",
            password_hash=teacher_pwd,
            role="TEACHER",
            status="ACTIVE"
        )
        session.add_all([admin_user, cashier_user, teacher_user])
        await session.flush()

        # 2. Teachers
        teacher1 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222201"),
            teacher_code="TCH001",
            name="K.K. Chauhan",
            mobile="9876500001",
            email="kk.chauhan@thakurdwara.local",
            qualification="M.Sc. Mathematics, B.Ed.",
            specialization="Mathematics & Applied Science",
            joining_date=date(2023, 4, 1),
            status="ACTIVE",
            user_id=teacher_user.id
        )
        teacher2 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222202"),
            teacher_code="TCH002",
            name="Amit Sharma",
            mobile="9876500002",
            email="amit.sharma@thakurdwara.local",
            qualification="M.Sc. Physics (Gold Medalist)",
            specialization="JEE & NEET Physics",
            joining_date=date(2023, 7, 15),
            status="ACTIVE"
        )
        teacher3 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222203"),
            teacher_code="TCH003",
            name="Neha Verma",
            mobile="9876500003",
            email="neha.verma@thakurdwara.local",
            qualification="M.A. English, NET Qualified",
            specialization="English Grammar & Reasoning",
            joining_date=date(2024, 1, 10),
            status="ACTIVE"
        )
        session.add_all([teacher1, teacher2, teacher3])
        await session.flush()

        # 3. Subjects (Subject-wise structure with assigned teacher, hall number, and schedule)
        sub_math = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333301"),
            subject_code="SUB_MATH",
            name="Mathematics",
            description="Core & Advanced Mathematics",
            default_fee=Decimal("1000.00"),
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number="Hall 13",
            schedule="Mon-Fri 09:00 AM - 10:30 AM",
            class_category="Class 9-10",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_sci = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333302"),
            subject_code="SUB_SCI",
            name="Science",
            description="General Science & Physics/Chem fundamentals",
            default_fee=Decimal("1200.00"),
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number="Hall 101",
            schedule="Mon-Fri 10:45 AM - 12:15 PM",
            class_category="Class 9-10",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_phy = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333303"),
            subject_code="SUB_PHY",
            name="Physics",
            description="Higher Secondary & Competitive Physics",
            default_fee=Decimal("1500.00"),
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 102",
            schedule="Mon-Fri 01:00 PM - 02:30 PM",
            class_category="Class 11-12",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_chem = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333304"),
            subject_code="SUB_CHEM",
            name="Chemistry",
            description="Organic, Inorganic & Physical Chemistry",
            default_fee=Decimal("1200.00"),
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 103",
            schedule="Mon-Fri 02:45 PM - 04:15 PM",
            class_category="Class 11-12",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_eng = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333305"),
            subject_code="SUB_ENG",
            name="English",
            description="Grammar, Vocabulary & Comprehension",
            default_fee=Decimal("800.00"),
            teacher_id=teacher3.id,
            teacher_name_snapshot=teacher3.name,
            hall_number="Hall 104",
            schedule="Mon-Fri 04:30 PM - 06:00 PM",
            class_category="General",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        session.add_all([sub_math, sub_sci, sub_phy, sub_chem, sub_eng])
        await session.flush()

        # 4. Batches
        batch1 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444401"),
            batch_code="BAT001",
            name="KK Chauhan 9-10",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            teacher_mobile_snapshot=teacher1.mobile,
            class_category="Class 9-10",
            hall_number="Hall 13",
            schedule="Mon-Fri 09:00 AM - 11:00 AM",
            start_date=date(2026, 4, 1),
            status="ACTIVE"
        )
        batch2 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444402"),
            batch_code="BAT002",
            name="Foundation 11-12",
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            teacher_mobile_snapshot=teacher2.mobile,
            class_category="Class 11-12",
            hall_number="Hall 12",
            schedule="Mon-Sat 04:00 PM - 06:30 PM",
            start_date=date(2026, 4, 15),
            status="ACTIVE"
        )
        session.add_all([batch1, batch2])

        # Batch Subjects
        bs1 = BatchSubject(batch_id=batch1.id, subject_id=sub_math.id, fee=Decimal("1000.00"))
        bs2 = BatchSubject(batch_id=batch1.id, subject_id=sub_sci.id, fee=Decimal("1200.00"))
        bs3 = BatchSubject(batch_id=batch2.id, subject_id=sub_phy.id, fee=Decimal("1500.00"))
        bs4 = BatchSubject(batch_id=batch2.id, subject_id=sub_chem.id, fee=Decimal("1200.00"))
        session.add_all([bs1, bs2, bs3, bs4])

        # 5. Green Card Product
        green_card = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555501"),
            name="Green Card - All Access Annual Pass",
            price=Decimal("15000.00"),
            validity_days=365,
            description="Unlimited access to all eligible active batches and subjects for 1 academic year",
            is_active=True
        )
        session.add(green_card)

        # 6. Students
        stu1 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666601"),
            student_code="STU2026001",
            name="Rahul Sharma",
            mobile="9870011221",
            father_name="Ramesh Sharma",
            email="rahul.sharma@gmail.com",
            address="Civil Lines, Thakurdwara",
            dob=date(2009, 5, 12),
            registration_date=date(2026, 10, 1),
            status="ACTIVE"
        )
        stu2 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666602"),
            student_code="STU2026002",
            name="Priya Singh",
            mobile="9870011222",
            father_name="Devendra Singh",
            email="priya.singh@gmail.com",
            address="Gandhi Nagar, Thakurdwara",
            dob=date(2008, 8, 22),
            registration_date=date(2026, 10, 5),
            status="ACTIVE"
        )
        stu3 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666603"),
            student_code="STU2026003",
            name="Rohan Gupta",
            mobile="9870011223",
            father_name="Sanjay Gupta",
            registration_date=date(2026, 10, 10),
            status="ACTIVE"
        )
        stu4 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666604"),
            student_code="STU2026004",
            name="Ananya Joshi",
            mobile="9870011224",
            father_name="Deepak Joshi",
            registration_date=date(2026, 10, 15),
            status="ACTIVE"
        )
        session.add_all([stu1, stu2, stu3, stu4])

        # 7. Enquiries
        today = date.today()
        enq1 = Enquiry(
            enquiry_code="ENQ2026001",
            student_name="Aryan Kumar",
            mobile="9871122334",
            purpose="Class 10 Science Demo",
            interested_subject="Science & Mathematics",
            demo_start_date=today - timedelta(days=1),
            demo_duration_days=3,
            demo_deadline=today + timedelta(days=2),
            notes="Interested in KK Chauhan batch. Very enthusiastic.",
            status="ACTIVE_DEMO",
            created_by=cashier_user.id
        )
        enq2 = Enquiry(
            enquiry_code="ENQ2026002",
            student_name="Sneha Rao",
            mobile="9871122335",
            purpose="Class 11 Physics Enquiry",
            interested_subject="Physics",
            demo_start_date=today - timedelta(days=2),
            demo_duration_days=3,
            demo_deadline=today + timedelta(days=1),
            notes="Trial class ongoing.",
            status="ACTIVE_DEMO",
            created_by=cashier_user.id
        )
        enq3 = Enquiry(
            enquiry_code="ENQ2026003",
            student_name="Divyansh Roy",
            mobile="9871122336",
            purpose="General Coaching Enquiry",
            interested_subject="Mathematics",
            notes="Will confirm demo start date next Monday.",
            status="PENDING",
            created_by=cashier_user.id
        )
        session.add_all([enq1, enq2, enq3])

        # 8. Admission 1: Multi-subject purchase for Rahul Sharma
        # Rahul purchases Math ₹1,000, Science ₹1,200, English ₹800 = ₹3,000 subtotal
        # Discount: ₹200 overall discount -> ₹2,800 total payable.
        # Paid: ₹1,800. Balance due: ₹1,000.
        adm1_calc = calculate_admission_financials(
            items=[
                {"item_type": "BATCH_SUBJECT", "batch_id": batch1.id, "subject_id": sub_math.id, "item_name": "KK Chauhan 9-10 - Mathematics", "price": Decimal("1000.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")},
                {"item_type": "BATCH_SUBJECT", "batch_id": batch1.id, "subject_id": sub_sci.id, "item_name": "KK Chauhan 9-10 - Science", "price": Decimal("1200.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")},
                {"item_type": "BATCH_SUBJECT", "batch_id": None, "subject_id": sub_eng.id, "item_name": "English Grammar", "price": Decimal("800.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")}
            ],
            overall_discount_type="FIXED",
            overall_discount_value=Decimal("200.00"),
            gst_enabled=True,
            gst_rate=Decimal("18.00")
        )

        adm1 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777701"),
            admission_number="ADM/2026/001",
            student_id=stu1.id,
            student_name_snapshot=stu1.name,
            admission_date=date(2026, 10, 1),
            subtotal=adm1_calc["subtotal"],
            individual_discount_total=adm1_calc["individual_discount_total"],
            overall_discount_type="FIXED",
            overall_discount_value=Decimal("200.00"),
            overall_discount_amount=adm1_calc["overall_discount_amount"],
            total_discount=adm1_calc["total_discount"],
            gst_enabled=True,
            gst_rate=Decimal("18.00"),
            taxable_base=adm1_calc["taxable_base"],
            gst_amount=adm1_calc["gst_amount"],
            total_payable=adm1_calc["total_payable"],
            amount_paid=Decimal("1800.00"),
            balance_due=Decimal("1000.00"),
            payment_status="PARTIALLY_PAID",
            status="ACTIVE",
            notes="3-subject bundle with overall discount",
            created_by=cashier_user.id
        )
        session.add(adm1)
        await session.flush()

        adm1_items = []
        for itm in adm1_calc["items"]:
            adm_item = AdmissionItem(
                admission_id=adm1.id,
                item_type=itm["item_type"],
                batch_id=itm.get("batch_id"),
                subject_id=itm.get("subject_id"),
                item_name_snapshot=itm["item_name"],
                original_price=itm["original_price"],
                discount_type=itm.get("discount_type", "NONE"),
                discount_value=itm.get("discount_value", Decimal("0.00")),
                discount_amount=itm["individual_discount"],
                overall_discount_share=itm["overall_discount_share"],
                net_price=itm["net_price"],
                amount_collected=Decimal("0.00"),
                balance_due=itm["net_price"]
            )
            session.add(adm_item)
            adm1_items.append(adm_item)
        await session.flush()

        # Payment 1 for Admission 1 (₹1,800 received)
        pmt1 = Payment(
            payment_number="RCP/2026/001",
            admission_id=adm1.id,
            student_id=stu1.id,
            amount=Decimal("1800.00"),
            payment_mode="UPI",
            transaction_reference="UPI98745612301",
            payment_date=datetime.now(timezone.utc),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="First installment received via UPI"
        )
        session.add(pmt1)
        await session.flush()

        # Proportional allocation of ₹1,800 across the 3 items
        allocations1 = allocate_payment_proportionally(
            Decimal("1800.00"),
            [{"id": itm.id, "balance_due": itm.balance_due} for itm in adm1_items]
        )
        for itm_id, alloc_amt in allocations1:
            alloc = PaymentAllocation(payment_id=pmt1.id, admission_item_id=itm_id, allocated_amount=alloc_amt)
            session.add(alloc)
            # Update item amount_collected and balance_due
            for itm in adm1_items:
                if itm.id == itm_id:
                    itm.amount_collected += alloc_amt
                    itm.balance_due = max(Decimal("0.00"), itm.balance_due - alloc_amt)

        # 9. Expense Categories
        cat_salary = ExpenseCategory(name="Salary", description="Faculty and administrative staff compensation")
        cat_elec = ExpenseCategory(name="Electricity & Utilities", description="Power bills, water and maintenance")
        cat_rent = ExpenseCategory(name="Premises Rent", description="Building and classroom leasing")
        cat_stat = ExpenseCategory(name="Stationery & Supplies", description="Whiteboard markers, registers, study sheets")
        cat_misc = ExpenseCategory(name="Miscellaneous", description="Tea, refreshments, minor daily operations")
        session.add_all([cat_salary, cat_elec, cat_rent, cat_stat, cat_misc])
        await session.flush()

        # 10. Expenses
        exp1 = Expense(
            category_id=cat_elec.id,
            title="UPPCL Electricity Bill - Main Campus",
            amount=Decimal("4500.00"),
            expense_date=date(2026, 10, 5),
            payment_mode="BANK_TRANSFER",
            transaction_reference="NEFT-UPPCL-89712",
            added_by=admin_user.id,
            notes="Cleared on time"
        )
        exp2 = Expense(
            category_id=cat_stat.id,
            title="Registers, Question Papers and Whiteboard Markers",
            amount=Decimal("1250.00"),
            expense_date=date(2026, 10, 12),
            payment_mode="CASH",
            added_by=cashier_user.id,
            notes="Purchased from local market"
        )
        exp3 = Expense(
            category_id=cat_misc.id,
            title="Staff Daily Refreshments & Tea",
            amount=Decimal("650.00"),
            expense_date=date(2026, 10, 15),
            payment_mode="CASH",
            added_by=cashier_user.id
        )
        session.add_all([exp1, exp2, exp3])

        # 11. Salary Records
        sal1 = SalaryRecord(
            employee_id=teacher1.id,
            employee_type="TEACHER",
            employee_name_snapshot="K.K. Chauhan",
            month_year="2026-10",
            salary_amount=Decimal("25000.00"),
            due_date=date(2026, 11, 5),
            paid_amount=Decimal("25000.00"),
            status="PAID",
            payment_date=date(2026, 11, 4),
            payment_mode="BANK_TRANSFER",
            notes="Monthly faculty remuneration"
        )
        sal2 = SalaryRecord(
            employee_id=teacher2.id,
            employee_type="TEACHER",
            employee_name_snapshot="Amit Sharma",
            month_year="2026-10",
            salary_amount=Decimal("30000.00"),
            due_date=date(2026, 11, 5),
            paid_amount=Decimal("15000.00"),
            status="PARTIALLY_PAID",
            payment_date=date(2026, 11, 5),
            payment_mode="UPI",
            notes="50% advance cleared, remaining due"
        )
        session.add_all([sal1, sal2])

        # 12. Audit Log
        audit1 = AuditLog(
            user_id=admin_user.id,
            action="INITIAL_SEED",
            entity_type="SYSTEM",
            details="System initial database schema and seed data loaded successfully"
        )
        session.add(audit1)

        await session.commit()
        print("Sample institute data seeded successfully!")

if __name__ == "__main__":
    asyncio.run(init_models())
    asyncio.run(seed_data())
