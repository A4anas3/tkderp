import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
from app.core.security import get_password_hash
from app.database.models import (
    Base, User, Teacher, Student, Enquiry, EnquiryDemoItem, Subject, Batch, BatchSubject,
    GreenCardProduct, Admission, AdmissionItem, Payment, PaymentAllocation,
    Refund, ExpenseCategory, Expense, SalaryRecord, Assessment, StudentMark, AuditLog,
    NumberSequence, IdempotencyRecord
)
from app.database.session import AsyncSessionLocal


async def init_models():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("Database tables dropped and recreated cleanly!")


async def seed_data():
    async with AsyncSessionLocal() as session:
        today = date.today()
        now = datetime.now(timezone.utc)

        # -------------------------------------------------------------
        # 1. System Users & Roles
        # -------------------------------------------------------------
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
        teacher_user1 = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111103"),
            employee_id="TCH001",
            full_name="K.K. Chauhan",
            email="teacher@thakurdwara.local",
            password_hash=teacher_pwd,
            role="TEACHER",
            status="ACTIVE"
        )
        teacher_user2 = User(
            id=uuid.UUID("11111111-1111-1111-1111-111111111104"),
            employee_id="TCH002",
            full_name="Dr. Amit Sharma",
            email="amit.sharma@thakurdwara.local",
            password_hash=teacher_pwd,
            role="TEACHER",
            status="ACTIVE"
        )
        session.add_all([admin_user, cashier_user, teacher_user1, teacher_user2])
        await session.flush()

        # -------------------------------------------------------------
        # 2. Teachers / Faculty
        # -------------------------------------------------------------
        teacher1 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222201"),
            teacher_code="TCH001",
            name="K.K. Chauhan",
            mobile="9876500001",
            email="kk.chauhan@thakurdwara.local",
            qualification="M.Sc. Mathematics, B.Ed. (12+ Yrs Exp)",
            specialization="Mathematics & Applied Science",
            joining_date=today - timedelta(days=700),
            status="ACTIVE",
            user_id=teacher_user1.id
        )
        teacher2 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222202"),
            teacher_code="TCH002",
            name="Dr. Amit Sharma",
            mobile="9876500002",
            email="amit.sharma@thakurdwara.local",
            qualification="Ph.D. Physics (Gold Medalist)",
            specialization="JEE & NEET Physics",
            joining_date=today - timedelta(days=600),
            status="ACTIVE",
            user_id=teacher_user2.id
        )
        session.add_all([teacher1, teacher2])
        await session.flush()

        # -------------------------------------------------------------
        # 3. Master Subjects Catalog
        # -------------------------------------------------------------
        sub_math = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333301"),
            subject_code="SUB-MTH-10",
            name="Mathematics (Class 9-10)",
            description="Complete CBSE & State Board Syllabus with NCERT & Exemplar",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number="Hall 13",
            schedule="Mon-Sat 04:00 PM - 05:30 PM",
            default_fee=Decimal("1000.00"),
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_sci = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333302"),
            subject_code="SUB-SCI-10",
            name="Science (Class 9-10)",
            description="Physics, Chemistry, Biology integrated foundational concept builder",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number="Hall 13",
            schedule="Mon-Sat 05:30 PM - 07:00 PM",
            default_fee=Decimal("1200.00"),
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_phy = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333303"),
            subject_code="SUB-PHY-12",
            name="Physics (Class 11-12 & JEE/NEET)",
            description="Mechanics, Electrodynamics, Optics & Modern Physics with Numerical Focus",
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 102",
            schedule="Mon-Sat 07:00 AM - 08:30 AM",
            default_fee=Decimal("1500.00"),
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        session.add_all([sub_math, sub_sci, sub_phy])
        await session.flush()

        # -------------------------------------------------------------
        # 4. Master Batches
        # -------------------------------------------------------------
        batch_10 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444401"),
            batch_code="BTC-2026-X01",
            name="Class 10 Board Excellence 2026-27",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            teacher_mobile_snapshot=teacher1.mobile,
            hall_number="Hall 13",
            schedule="Mon-Sat 04:00 PM - 05:30 PM",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=240),
            status="ACTIVE"
        )
        batch_12 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444402"),
            batch_code="BTC-2026-JEE01",
            name="Class 12 JEE Target Batch 2026-27",
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            teacher_mobile_snapshot=teacher2.mobile,
            hall_number="Hall 102",
            schedule="Mon-Sat 07:00 AM - 08:30 AM",
            start_date=today - timedelta(days=90),
            end_date=today + timedelta(days=210),
            status="ACTIVE"
        )
        session.add_all([batch_10, batch_12])
        await session.flush()

        bs1 = BatchSubject(batch_id=batch_10.id, subject_id=sub_math.id, fee=sub_math.default_fee)
        bs2 = BatchSubject(batch_id=batch_10.id, subject_id=sub_sci.id, fee=sub_sci.default_fee)
        bs3 = BatchSubject(batch_id=batch_12.id, subject_id=sub_phy.id, fee=sub_phy.default_fee)
        session.add_all([bs1, bs2, bs3])
        await session.flush()

        # -------------------------------------------------------------
        # 5. Green Card Products (All-Access Pass)
        # -------------------------------------------------------------
        gc_annual = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555501"),
            name="Green Card - All Access Annual Pass",
            description="Unlimited access to all active subjects, batches and test series for 1 academic year (365 days)",
            validity_days=365,
            price=Decimal("15000.00"),
            is_active=True
        )
        gc_month = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555502"),
            name="All-Access Green Card (1 Month)",
            description="Attend any coaching batch & subject for 30 consecutive days",
            validity_days=30,
            price=Decimal("2500.00"),
            is_active=True
        )
        gc_quarter = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555503"),
            name="Quarterly Green Card (3 Months)",
            description="Comprehensive 3-month institute pass for all lectures and revision batches",
            validity_days=90,
            price=Decimal("6500.00"),
            is_active=True
        )
        session.add_all([gc_annual, gc_month, gc_quarter])
        await session.flush()

        # -------------------------------------------------------------
        # 6. Expense Categories
        # -------------------------------------------------------------
        cat_infra = ExpenseCategory(
            id=uuid.UUID("66666666-6666-6666-6666-666666666601"),
            name="Building Rent & Infrastructure",
            description="Premises lease, building maintenance and hall upkeep"
        )
        cat_util = ExpenseCategory(
            id=uuid.UUID("66666666-6666-6666-6666-666666666602"),
            name="Electricity & Utilities",
            description="Power, high-speed internet, inverter maintenance & drinking water"
        )
        cat_edu = ExpenseCategory(
            id=uuid.UUID("66666666-6666-6666-6666-666666666603"),
            name="Study Materials & Printing",
            description="DPPs, assignment booklets, question papers, question banks"
        )
        session.add_all([cat_infra, cat_util, cat_edu])
        await session.flush()

        # -------------------------------------------------------------
        # 7. Student 1: Aman Sharma (Verified Flow: Demo -> Enrollment -> Assessment)
        # -------------------------------------------------------------
        student1 = Student(
            id=uuid.UUID("77777777-7777-7777-7777-777777777701"),
            student_code="STU-2026-0001",
            name="Aman Sharma",
            mobile="9876543210",
            father_name="Mr. Rajesh Sharma",
            email="aman.sharma@example.com",
            address="Ward 4, Civil Lines, Thakurdwara, UP",
            dob=date(2010, 5, 14),
            registration_date=today,
            status="ACTIVE",
            has_green_card=False
        )
        session.add(student1)
        await session.flush()

        # Enquiry with Sequential Demo Reference
        enquiry1 = Enquiry(
            id=uuid.UUID("88888888-8888-8888-8888-888888888801"),
            enquiry_code="ENQ-2026-0001",
            student_name="Aman Sharma",
            father_name="Mr. Rajesh Sharma",
            mobile="9876543210",
            school_college="Saraswati Vidya Mandir",
            interested_subject="Mathematics (Class 9-10)",
            purpose="Board Preparation & Doubt Clearing",
            notes="Attended 3-day demo class with K.K. Chauhan sir and liked the teaching pedagogy.",
            status="CONVERTED",
            demo_start_date=today,
            demo_deadline=today + timedelta(days=3),
            demo_duration_days=3,
            converted_student_id=student1.id,
            created_by=admin_user.id
        )
        session.add(enquiry1)
        await session.flush()

        demo_item1 = EnquiryDemoItem(
            id=uuid.UUID("99999999-9999-9999-9999-999999999901"),
            enquiry_id=enquiry1.id,
            subject_id=sub_math.id,
            teacher_id=teacher1.id,
            batch_id=batch_10.id,
            demo_reference_number="DEM-2026-0001",
            subject_name_snapshot=sub_math.name,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot=sub_math.hall_number,
            demo_start_date=today,
            demo_end_date=today + timedelta(days=3),
            demo_duration_days=3,
            status="CONVERTED",
            notes="Demo completed successfully. Converted to enrollment."
        )
        session.add(demo_item1)
        await session.flush()

        # Admission / Enrollment Record (ENR-2026-0001)
        adm_from = today
        adm_to = today + timedelta(days=30)
        admission1 = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            admission_number="ENR-2026-0001",
            student_id=student1.id,
            admission_date=today,
            valid_from=adm_from,
            valid_to=adm_to,
            subtotal=Decimal("1000.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            taxable_base=Decimal("1000.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1000.00"),
            amount_paid=Decimal("1000.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            student_name_snapshot=student1.name,
            created_by=cashier_user.id
        )
        session.add(admission1)
        await session.flush()

        adm_item1 = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            admission_id=admission1.id,
            item_type="BATCH",
            batch_id=batch_10.id,
            subject_id=sub_math.id,
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot="Hall 13",
            item_name_snapshot=f"{batch_10.name} — {sub_math.name}",
            original_price=Decimal("1000.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1000.00"),
            amount_collected=Decimal("1000.00"),
            balance_due=Decimal("0.00"),
            valid_from=adm_from,
            valid_to=adm_to
        )
        session.add(adm_item1)
        await session.flush()

        payment1 = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            payment_number="RCT-2026-0001",
            admission_id=admission1.id,
            student_id=student1.id,
            amount=Decimal("1000.00"),
            payment_mode="CASH",
            transaction_reference="CASH-DEP-001",
            payment_date=now,
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm_from,
            valid_to=adm_to,
            fee_period=f"{adm_from} to {adm_to}",
            notes="Initial enrollment course fee deposit in full"
        )
        session.add(payment1)
        await session.flush()

        alloc1 = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
            payment_id=payment1.id,
            admission_item_id=adm_item1.id,
            allocated_amount=Decimal("1000.00")
        )
        session.add(alloc1)
        await session.flush()

        # Assessment & Marks Record
        assessment1 = Assessment(
            id=uuid.UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
            name="Unit Test 1 - Real Numbers & Polynomials",
            description="First monthly syllabus assessment for Class 10 Board preparation",
            subject_id=sub_math.id,
            batch_id=batch_10.id,
            teacher_id=teacher1.id,
            exam_date=today - timedelta(days=2),
            max_marks=Decimal("50.00"),
            passing_marks=Decimal("20.00"),
            created_by=teacher_user1.id
        )
        session.add(assessment1)
        await session.flush()

        mark1 = StudentMark(
            id=uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff"),
            assessment_id=assessment1.id,
            student_id=student1.id,
            marks_obtained=Decimal("46.00"),
            percentage=Decimal("92.00"),
            grade="A+",
            remarks="Excellent analytical problem solving and conceptual clarity in polynomials",
            recorded_by=teacher_user1.id
        )
        session.add(mark1)
        await session.flush()

        # -------------------------------------------------------------
        # 8. Student 2: Ananya Joshi (3-Month Multiplied Fee & Partial Payment)
        # -------------------------------------------------------------
        student2 = Student(
            id=uuid.UUID("77777777-7777-7777-7777-777777777702"),
            student_code="STU-2026-0002",
            name="Ananya Joshi",
            mobile="9870011224",
            father_name="Deepak Joshi",
            email="ananya.joshi@example.com",
            address="Court Road, Near Tehsil Office, Thakurdwara",
            dob=date(2009, 11, 3),
            registration_date=today,
            status="ACTIVE",
            has_green_card=False
        )
        session.add(student2)
        await session.flush()

        adm2_from = today
        adm2_to = today + timedelta(days=90)
        admission2 = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"),
            admission_number="ENR-2026-0002",
            student_id=student2.id,
            admission_date=today,
            valid_from=adm2_from,
            valid_to=adm2_to,
            subtotal=Decimal("3000.00"),
            individual_discount_total=Decimal("300.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("300.00"),
            taxable_base=Decimal("2700.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("2700.00"),
            amount_paid=Decimal("1500.00"),
            balance_due=Decimal("1200.00"),
            payment_status="PARTIAL_PAID",
            status="ACTIVE",
            student_name_snapshot=student2.name,
            notes="3-Month Mathematics enrollment (@ ₹1,000/mo) with 10% concession. Initial installment paid, balance due ₹1,200.",
            created_by=cashier_user.id
        )
        session.add(admission2)
        await session.flush()

        adm_item2 = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"),
            admission_id=admission2.id,
            item_type="SUBJECT",
            subject_id=sub_math.id,
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot="Hall 13",
            item_name_snapshot="Mathematics (3 Mo @ ₹1000/mo)",
            original_price=Decimal("3000.00"),
            discount_type="PERCENTAGE",
            discount_value=Decimal("10.00"),
            discount_amount=Decimal("300.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("2700.00"),
            amount_collected=Decimal("1500.00"),
            balance_due=Decimal("1200.00"),
            valid_from=adm2_from,
            valid_to=adm2_to
        )
        session.add(adm_item2)
        await session.flush()

        payment2 = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc2"),
            payment_number="RCT-2026-0002",
            admission_id=admission2.id,
            student_id=student2.id,
            amount=Decimal("1500.00"),
            payment_mode="UPI",
            transaction_reference="UPI/ANANYA/991201",
            payment_date=now,
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm2_from,
            valid_to=adm2_to,
            fee_period=f"{adm2_from} to {adm2_to} (90 Days / 3 Months)",
            notes="Initial installment for 3-Month Math Course. Remaining balance due: ₹1,200"
        )
        session.add(payment2)
        await session.flush()

        alloc2 = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-ddddddddddd2"),
            payment_id=payment2.id,
            admission_item_id=adm_item2.id,
            allocated_amount=Decimal("1500.00")
        )
        session.add(alloc2)
        await session.flush()

        # -------------------------------------------------------------
        # 9. Student 3: Aryan Sharma (Green Card 1-Year Annual Pass)
        # -------------------------------------------------------------
        student3 = Student(
            id=uuid.UUID("77777777-7777-7777-7777-777777777703"),
            student_code="STU-2026-0003",
            name="Aryan Sharma",
            mobile="9811223344",
            father_name="Suresh Sharma",
            email="aryan.sharma@example.com",
            address="Civil Lines, Near Subhash Chowk, Thakurdwara",
            dob=date(2008, 6, 12),
            registration_date=today,
            status="ACTIVE",
            has_green_card=True,
            green_card_expiry=today + timedelta(days=365)
        )
        session.add(student3)
        await session.flush()

        adm3_from = today
        adm3_to = today + timedelta(days=365)
        admission3 = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"),
            admission_number="ENR-2026-0003",
            student_id=student3.id,
            admission_date=today,
            valid_from=adm3_from,
            valid_to=adm3_to,
            subtotal=Decimal("15000.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            taxable_base=Decimal("15000.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("15000.00"),
            amount_paid=Decimal("15000.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            student_name_snapshot=student3.name,
            notes="Green Card Annual All-Access Pass (365 Days validity). Paid in full.",
            created_by=cashier_user.id
        )
        session.add(admission3)
        await session.flush()

        adm_item3 = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3"),
            admission_id=admission3.id,
            item_type="GREEN_CARD",
            green_card_id=gc_annual.id,
            item_name_snapshot="Green Card - All Access Annual Pass",
            original_price=Decimal("15000.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("15000.00"),
            amount_collected=Decimal("15000.00"),
            balance_due=Decimal("0.00"),
            valid_from=adm3_from,
            valid_to=adm3_to
        )
        session.add(adm_item3)
        await session.flush()

        payment3 = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc3"),
            payment_number="RCT-2026-0003",
            admission_id=admission3.id,
            student_id=student3.id,
            amount=Decimal("15000.00"),
            payment_mode="BANK_TRANSFER",
            transaction_reference="NEFT-ARYAN-88401",
            payment_date=now,
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm3_from,
            valid_to=adm3_to,
            fee_period=f"{adm3_from} to {adm3_to} (Full Academic Session / 365 Days)",
            notes="Annual pass fee received via Net Banking"
        )
        session.add(payment3)
        await session.flush()

        alloc3 = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-ddddddddddd3"),
            payment_id=payment3.id,
            admission_item_id=adm_item3.id,
            allocated_amount=Decimal("15000.00")
        )
        session.add(alloc3)
        await session.flush()

        # -------------------------------------------------------------
        # 10. Student 4: Priya Verma (Active Math + Expired Physics in History)
        # -------------------------------------------------------------
        student4 = Student(
            id=uuid.UUID("77777777-7777-7777-7777-777777777704"),
            student_code="STU-2026-0004",
            name="Priya Verma",
            mobile="9823456789",
            father_name="Mukesh Verma",
            email="priya.verma@example.com",
            address="Station Road, Thakurdwara",
            dob=date(2009, 3, 21),
            registration_date=today - timedelta(days=60),
            status="ACTIVE",
            has_green_card=False
        )
        session.add(student4)
        await session.flush()

        # Admission 4A (Expired Physics cycle)
        adm4a_from = today - timedelta(days=60)
        adm4a_to = today - timedelta(days=30)
        admission4a = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4"),
            admission_number="ENR-2026-0004",
            student_id=student4.id,
            admission_date=adm4a_from,
            valid_from=adm4a_from,
            valid_to=adm4a_to,
            subtotal=Decimal("1500.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            taxable_base=Decimal("1500.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1500.00"),
            amount_paid=Decimal("1500.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            student_name_snapshot=student4.name,
            notes="Physics term (completed & expired).",
            created_by=cashier_user.id
        )
        session.add(admission4a)
        await session.flush()

        adm_item4a = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4"),
            admission_id=admission4a.id,
            item_type="SUBJECT",
            subject_id=sub_phy.id,
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number_snapshot="Hall 102",
            item_name_snapshot=sub_phy.name,
            original_price=Decimal("1500.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1500.00"),
            amount_collected=Decimal("1500.00"),
            balance_due=Decimal("0.00"),
            valid_from=adm4a_from,
            valid_to=adm4a_to,
            status="ACTIVE"
        )
        session.add(adm_item4a)
        await session.flush()

        payment4a = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc4"),
            payment_number="RCT-2026-0004",
            admission_id=admission4a.id,
            student_id=student4.id,
            amount=Decimal("1500.00"),
            payment_mode="CASH",
            transaction_reference="CASH-PRIYA-001",
            payment_date=now - timedelta(days=60),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm4a_from,
            valid_to=adm4a_to,
            fee_period=f"{adm4a_from} to {adm4a_to}",
            notes="Physics term fee"
        )
        session.add(payment4a)
        await session.flush()

        alloc4a = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-ddddddddddd4"),
            payment_id=payment4a.id,
            admission_item_id=adm_item4a.id,
            allocated_amount=Decimal("1500.00")
        )
        session.add(alloc4a)
        await session.flush()

        # Admission 4B (Currently Active Math cycle)
        adm4b_from = today - timedelta(days=5)
        adm4b_to = today + timedelta(days=25)
        admission4b = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5"),
            admission_number="ADM-2026-0005",
            student_id=student4.id,
            admission_date=adm4b_from,
            valid_from=adm4b_from,
            valid_to=adm4b_to,
            subtotal=Decimal("1000.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            taxable_base=Decimal("1000.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1000.00"),
            amount_paid=Decimal("1000.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            student_name_snapshot=student4.name,
            notes="Math enrollment active cycle.",
            created_by=cashier_user.id
        )
        session.add(admission4b)
        await session.flush()

        adm_item4b = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5"),
            admission_id=admission4b.id,
            item_type="SUBJECT",
            subject_id=sub_math.id,
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot="Hall 13",
            item_name_snapshot=sub_math.name,
            original_price=Decimal("1000.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1000.00"),
            amount_collected=Decimal("1000.00"),
            balance_due=Decimal("0.00"),
            valid_from=adm4b_from,
            valid_to=adm4b_to,
            status="ACTIVE"
        )
        session.add(adm_item4b)
        await session.flush()

        payment4b = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc5"),
            payment_number="RCT-2026-0005",
            admission_id=admission4b.id,
            student_id=student4.id,
            amount=Decimal("1000.00"),
            payment_mode="UPI",
            transaction_reference="UPI-PRIYA-002",
            payment_date=now - timedelta(days=5),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm4b_from,
            valid_to=adm4b_to,
            fee_period=f"{adm4b_from} to {adm4b_to}",
            notes="Math course monthly fee"
        )
        session.add(payment4b)
        await session.flush()

        alloc4b = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-ddddddddddd5"),
            payment_id=payment4b.id,
            admission_item_id=adm_item4b.id,
            allocated_amount=Decimal("1000.00")
        )
        session.add(alloc4b)
        await session.flush()

        # -------------------------------------------------------------
        # 11. Student 5: Rohan Singh (Subject Temporarily Suspended)
        # -------------------------------------------------------------
        student5 = Student(
            id=uuid.UUID("77777777-7777-7777-7777-777777777705"),
            student_code="STU-2026-0005",
            name="Rohan Singh",
            mobile="9834567890",
            father_name="Virendra Singh",
            email="rohan.singh@example.com",
            address="Moradabad Road, Thakurdwara",
            dob=date(2010, 8, 19),
            registration_date=today - timedelta(days=15),
            status="ACTIVE",
            has_green_card=False
        )
        session.add(student5)
        await session.flush()

        adm5_from = today - timedelta(days=15)
        adm5_to = today + timedelta(days=15)
        admission5 = Admission(
            id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6"),
            admission_number="ENR-2026-0005",
            student_id=student5.id,
            admission_date=adm5_from,
            valid_from=adm5_from,
            valid_to=adm5_to,
            subtotal=Decimal("1200.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            taxable_base=Decimal("1200.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1200.00"),
            amount_paid=Decimal("1200.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            student_name_snapshot=student5.name,
            notes="Science (Class 9-10). Temporarily suspended due to illness.",
            created_by=cashier_user.id
        )
        session.add(admission5)
        await session.flush()

        adm_item5 = AdmissionItem(
            id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6"),
            admission_id=admission5.id,
            item_type="SUBJECT",
            subject_id=sub_sci.id,
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot="Hall 13",
            item_name_snapshot=sub_sci.name,
            original_price=Decimal("1200.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1200.00"),
            amount_collected=Decimal("1200.00"),
            balance_due=Decimal("0.00"),
            valid_from=adm5_from,
            valid_to=adm5_to,
            status="SUSPENDED",
            suspended_at=now - timedelta(days=2),
            lifecycle_reason="Student recovering from viral fever; resuming next week."
        )
        session.add(adm_item5)
        await session.flush()

        payment5 = Payment(
            id=uuid.UUID("cccccccc-cccc-cccc-cccc-ccccccccccc6"),
            payment_number="RCT-2026-0006",
            admission_id=admission5.id,
            student_id=student5.id,
            amount=Decimal("1200.00"),
            payment_mode="CASH",
            transaction_reference="CASH-ROHAN-001",
            payment_date=now - timedelta(days=15),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            valid_from=adm5_from,
            valid_to=adm5_to,
            fee_period=f"{adm5_from} to {adm5_to}",
            notes="Science enrollment fee deposit"
        )
        session.add(payment5)
        await session.flush()

        alloc5 = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-ddddddddddd6"),
            payment_id=payment5.id,
            admission_item_id=adm_item5.id,
            allocated_amount=Decimal("1200.00")
        )
        session.add(alloc5)
        await session.flush()

        # -------------------------------------------------------------
        # 12. Audit Log
        # -------------------------------------------------------------
        audit = AuditLog(
            user_id=admin_user.id,
            action="DATABASE_CLEAN_INITIALIZATION_COMPLETED",
            entity_type="SYSTEM",
            details="Database reset cleanly; baseline master configuration, faculty, subjects, assessments, and verified student entries seeded.",
            ip_address="127.0.0.1"
        )
        session.add(audit)

        # -------------------------------------------------------------
        # 13. Number Sequences
        # -------------------------------------------------------------
        seq_adm = NumberSequence(name="ADM", year=today.year, last_value=5)
        seq_pay = NumberSequence(name="PAY", year=today.year, last_value=6)
        seq_ref = NumberSequence(name="REF", year=today.year, last_value=0)
        session.add_all([seq_adm, seq_pay, seq_ref])

        await session.commit()
        print("Clean database state successfully initialized with baseline master data, faculty, subjects, assessments, and verified test student entries!")


if __name__ == "__main__":
    asyncio.run(init_models())
    asyncio.run(seed_data())
