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
    Refund, ExpenseCategory, Expense, SalaryRecord, Assessment, StudentMark, AuditLog
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
        teacher3 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222203"),
            teacher_code="TCH003",
            name="Smt. Neha Verma",
            mobile="9876500003",
            email="neha.verma@thakurdwara.local",
            qualification="M.A. English, NET Qualified",
            specialization="English Grammar & Reasoning",
            joining_date=today - timedelta(days=350),
            status="ACTIVE"
        )
        teacher4 = Teacher(
            id=uuid.UUID("22222222-2222-2222-2222-222222222204"),
            teacher_code="TCH004",
            name="Er. Rajesh Singhal",
            mobile="9876500004",
            email="rajesh.singhal@thakurdwara.local",
            qualification="M.Sc. Chemistry, CSIR NET",
            specialization="Organic & Physical Chemistry",
            joining_date=today - timedelta(days=250),
            status="ACTIVE"
        )
        session.add_all([teacher1, teacher2, teacher3, teacher4])
        await session.flush()

        # -------------------------------------------------------------
        # 3. Dynamic Subjects (Database-Driven)
        # -------------------------------------------------------------
        sub_math = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333301"),
            subject_code="SUB_MATH",
            name="Mathematics (Class 9-10)",
            description="Complete NCERT, Exemplar & Olympiad Mathematics",
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
            name="Science (Class 9-10)",
            description="Physics, Chemistry & Biology foundational concepts",
            default_fee=Decimal("1200.00"),
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 14",
            schedule="Mon-Fri 10:30 AM - 12:00 PM",
            class_category="Class 9-10",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_phy = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333303"),
            subject_code="SUB_PHY",
            name="Physics (Target JEE/NEET 11-12)",
            description="Advanced Mechanics, Electromagnetism & Modern Physics",
            default_fee=Decimal("1500.00"),
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 02",
            schedule="Mon-Fri 03:00 PM - 04:30 PM",
            class_category="Target JEE/NEET",
            default_discount_percentage=Decimal("15.00"),
            status="ACTIVE"
        )
        sub_chem = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333304"),
            subject_code="SUB_CHEM",
            name="Chemistry (Target JEE/NEET 11-12)",
            description="Physical, Inorganic and Organic Chemistry for Competitive Entrance",
            default_fee=Decimal("1500.00"),
            teacher_id=teacher4.id,
            teacher_name_snapshot=teacher4.name,
            hall_number="Hall 05",
            schedule="Mon-Fri 04:30 PM - 06:00 PM",
            class_category="Target JEE/NEET",
            default_discount_percentage=Decimal("15.00"),
            status="ACTIVE"
        )
        sub_eng = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333305"),
            subject_code="SUB_ENG",
            name="English Grammar & Writing (Foundation)",
            description="High-School English Language, Composition & Speaking",
            default_fee=Decimal("800.00"),
            teacher_id=teacher3.id,
            teacher_name_snapshot=teacher3.name,
            hall_number="Hall 08",
            schedule="Tue-Sat 01:00 PM - 02:00 PM",
            class_category="General",
            default_discount_percentage=Decimal("5.00"),
            status="ACTIVE"
        )
        session.add_all([sub_math, sub_sci, sub_phy, sub_chem, sub_eng])
        await session.flush()

        # -------------------------------------------------------------
        # 4. Batches
        # -------------------------------------------------------------
        batch_10 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444401"),
            batch_code="BAT_CLASS10_M",
            name="Class 10 Board Excellence (Morning)",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            teacher_mobile_snapshot=teacher1.mobile,
            class_category="Class 9-10",
            hall_number="Hall 13",
            schedule="09:00 AM - 12:00 PM",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=300),
            status="ACTIVE"
        )
        batch_jee = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444402"),
            batch_code="BAT_JEE_EVE",
            name="JEE Mains & Advanced Target (Evening)",
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            teacher_mobile_snapshot=teacher2.mobile,
            class_category="Target JEE/NEET",
            hall_number="Hall 02",
            schedule="03:00 PM - 06:00 PM",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=300),
            status="ACTIVE"
        )
        session.add_all([batch_10, batch_jee])
        await session.flush()

        # Batch-Subject Junctions
        bs1 = BatchSubject(batch_id=batch_10.id, subject_id=sub_math.id, teacher_id=teacher1.id)
        bs2 = BatchSubject(batch_id=batch_10.id, subject_id=sub_sci.id, teacher_id=teacher2.id)
        bs3 = BatchSubject(batch_id=batch_jee.id, subject_id=sub_phy.id, teacher_id=teacher2.id)
        bs4 = BatchSubject(batch_id=batch_jee.id, subject_id=sub_chem.id, teacher_id=teacher4.id)
        session.add_all([bs1, bs2, bs3, bs4])
        await session.flush()

        # -------------------------------------------------------------
        # 5. Green Card Products
        # -------------------------------------------------------------
        gc1 = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555501"),
            name="All-Access Green Card (1 Month)",
            description="Attend any coaching batch & subject for 30 consecutive days",
            validity_days=30,
            price=Decimal("2500.00"),
            is_active=True
        )
        gc3 = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555502"),
            name="Quarterly Green Card (3 Months)",
            description="Comprehensive 3-month institute pass for all lectures and revision batches",
            validity_days=90,
            price=Decimal("6500.00"),
            is_active=True
        )
        session.add_all([gc1, gc3])
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
        # 7. One Clean Real Student Entry (End-to-End Verified)
        # -------------------------------------------------------------
        # Student Registration Profile
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

        # Enquiry Demo Item (Subject-wise demo tracking)
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

        # Admission Item (Line item with independent validity)
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

        # Official Payment Receipt (RCT-2026-0001)
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

        # Payment Allocation
        alloc1 = PaymentAllocation(
            id=uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
            payment_id=payment1.id,
            admission_item_id=adm_item1.id,
            allocated_amount=Decimal("1000.00")
        )
        session.add(alloc1)
        await session.flush()

        # -------------------------------------------------------------
        # 8. Assessment & Marks System (Section 20 Verified)
        # -------------------------------------------------------------
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
        # 9. Audit Log
        # -------------------------------------------------------------
        audit = AuditLog(
            user_id=admin_user.id,
            action="DATABASE_CLEAN_INITIALIZATION_COMPLETED",
            entity_type="SYSTEM",
            details="Database reset cleanly; baseline master configuration, faculty, subjects, and verified test entry seeded.",
            ip_address="127.0.0.1"
        )
        session.add(audit)

        await session.commit()
        print("Clean database state successfully initialized with baseline master data and verified test student entry!")


if __name__ == "__main__":
    asyncio.run(init_models())
    asyncio.run(seed_data())
