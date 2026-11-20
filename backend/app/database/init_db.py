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
    Refund, ExpenseCategory, Expense, SalaryRecord, AuditLog
)
from app.database.session import AsyncSessionLocal
from app.common.calculations import calculate_admission_financials, allocate_payment_proportionally

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
        # 3. Subjects (With Faculty & Hall Snapshot)
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
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number="Hall 13",
            schedule="Mon-Fri 10:45 AM - 12:15 PM",
            class_category="Class 9-10",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_phy = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333303"),
            subject_code="SUB_PHY",
            name="Physics (Target JEE/NEET 11-12)",
            description="Mechanics, Electrodynamics & Modern Physics",
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
            name="Chemistry (Target JEE/NEET 11-12)",
            description="Organic, Inorganic & Physical Chemistry with mock sets",
            default_fee=Decimal("1400.00"),
            teacher_id=teacher4.id,
            teacher_name_snapshot=teacher4.name,
            hall_number="Hall 103",
            schedule="Mon-Fri 02:45 PM - 04:15 PM",
            class_category="Class 11-12",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_eng = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333305"),
            subject_code="SUB_ENG",
            name="English Grammar & Comprehension",
            description="Functional English, Writing Skills and Verbal Ability",
            default_fee=Decimal("800.00"),
            teacher_id=teacher3.id,
            teacher_name_snapshot=teacher3.name,
            hall_number="Hall 104",
            schedule="Mon-Fri 04:30 PM - 06:00 PM",
            class_category="General",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        sub_bio = Subject(
            id=uuid.UUID("33333333-3333-3333-3333-333333333306"),
            subject_code="SUB_BIO",
            name="Biology & Medical Target (NEET)",
            description="Zoology & Botany comprehensive syllabus for NEET",
            default_fee=Decimal("1300.00"),
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number="Hall 105",
            schedule="Mon-Sat 08:00 AM - 09:30 AM",
            class_category="Class 11-12",
            default_discount_percentage=Decimal("10.00"),
            status="ACTIVE"
        )
        session.add_all([sub_math, sub_sci, sub_phy, sub_chem, sub_eng, sub_bio])
        await session.flush()

        # -------------------------------------------------------------
        # 4. Batches & Batch Subjects
        # -------------------------------------------------------------
        batch1 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444401"),
            batch_code="BAT001",
            name="CBSE 10th Board Toppers",
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            teacher_mobile_snapshot=teacher1.mobile,
            class_category="Class 9-10",
            hall_number="Hall 13",
            schedule="Mon-Fri 09:00 AM - 12:15 PM",
            start_date=today - timedelta(days=60),
            status="ACTIVE"
        )
        batch2 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444402"),
            batch_code="BAT002",
            name="JEE Foundation 2027",
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            teacher_mobile_snapshot=teacher2.mobile,
            class_category="Class 11-12",
            hall_number="Hall 102",
            schedule="Mon-Sat 01:00 PM - 04:15 PM",
            start_date=today - timedelta(days=45),
            status="ACTIVE"
        )
        batch3 = Batch(
            id=uuid.UUID("44444444-4444-4444-4444-444444444403"),
            batch_code="BAT003",
            name="NEET Medical Achievers",
            teacher_id=teacher4.id,
            teacher_name_snapshot=teacher4.name,
            teacher_mobile_snapshot=teacher4.mobile,
            class_category="Class 11-12",
            hall_number="Hall 103",
            schedule="Mon-Sat 08:00 AM - 12:00 PM",
            start_date=today - timedelta(days=30),
            status="ACTIVE"
        )
        session.add_all([batch1, batch2, batch3])
        await session.flush()

        bs1 = BatchSubject(batch_id=batch1.id, subject_id=sub_math.id, fee=Decimal("1000.00"), teacher_id=teacher1.id, teacher_name_snapshot=teacher1.name, hall_number="Hall 13")
        bs2 = BatchSubject(batch_id=batch1.id, subject_id=sub_sci.id, fee=Decimal("1200.00"), teacher_id=teacher1.id, teacher_name_snapshot=teacher1.name, hall_number="Hall 13")
        bs3 = BatchSubject(batch_id=batch2.id, subject_id=sub_phy.id, fee=Decimal("1500.00"), teacher_id=teacher2.id, teacher_name_snapshot=teacher2.name, hall_number="Hall 102")
        bs4 = BatchSubject(batch_id=batch2.id, subject_id=sub_chem.id, fee=Decimal("1400.00"), teacher_id=teacher4.id, teacher_name_snapshot=teacher4.name, hall_number="Hall 103")
        bs5 = BatchSubject(batch_id=batch3.id, subject_id=sub_bio.id, fee=Decimal("1300.00"), teacher_id=teacher2.id, teacher_name_snapshot=teacher2.name, hall_number="Hall 105")
        bs6 = BatchSubject(batch_id=batch3.id, subject_id=sub_chem.id, fee=Decimal("1400.00"), teacher_id=teacher4.id, teacher_name_snapshot=teacher4.name, hall_number="Hall 103")
        session.add_all([bs1, bs2, bs3, bs4, bs5, bs6])

        # -------------------------------------------------------------
        # 5. Green Card Product
        # -------------------------------------------------------------
        green_card = GreenCardProduct(
            id=uuid.UUID("55555555-5555-5555-5555-555555555501"),
            name="Green Card - All Access Annual Pass",
            price=Decimal("15000.00"),
            validity_days=365,
            description="Unlimited access to all active subjects, batches and test series for 1 academic year",
            is_active=True
        )
        session.add(green_card)

        # -------------------------------------------------------------
        # 6. Students (Diverse profiles with 10-digit mobile numbers)
        # -------------------------------------------------------------
        stu1 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666601"),
            student_code="STU2026001",
            name="Rahul Sharma",
            mobile="9870011221",
            father_name="Ramesh Sharma",
            email="rahul.sharma@example.com",
            address="Civil Lines, Near Subhash Chowk, Thakurdwara",
            dob=date(2009, 5, 12),
            registration_date=today - timedelta(days=50),
            status="ACTIVE"
        )
        stu2 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666602"),
            student_code="STU2026002",
            name="Priya Singh",
            mobile="9870011222",
            father_name="Devendra Singh",
            email="priya.singh@example.com",
            address="Gandhi Nagar, Moradabad Road, Thakurdwara",
            dob=date(2008, 8, 22),
            registration_date=today - timedelta(days=40),
            status="ACTIVE"
        )
        stu3 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666603"),
            student_code="STU2026003",
            name="Rohan Gupta",
            mobile="9870011223",
            father_name="Sanjay Gupta",
            email="rohan.gupta@example.com",
            address="Station Road, Railway Colony, Thakurdwara",
            dob=date(2007, 3, 14),
            registration_date=today - timedelta(days=35),
            status="ACTIVE",
            has_green_card=True,
            green_card_expiry=today + timedelta(days=330)
        )
        stu4 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666604"),
            student_code="STU2026004",
            name="Ananya Joshi",
            mobile="9870011224",
            father_name="Deepak Joshi",
            email="ananya.joshi@example.com",
            address="Court Road, Near Tehsil Office, Thakurdwara",
            dob=date(2009, 11, 3),
            registration_date=today - timedelta(days=20),
            status="ACTIVE"
        )
        stu5 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666605"),
            student_code="STU2026005",
            name="Vikas Yadav",
            mobile="9870011225",
            father_name="Ramkishore Yadav",
            email="vikas.yadav@example.com",
            address="Patel Nagar, Kashipur Road, Thakurdwara",
            dob=date(2008, 1, 20),
            registration_date=today - timedelta(days=25),
            status="ACTIVE"
        )
        stu6 = Student(
            id=uuid.UUID("66666666-6666-6666-6666-666666666606"),
            student_code="STU2026006",
            name="Tanvi Aggarwal",
            mobile="9870011226",
            father_name="Mukesh Aggarwal",
            email="tanvi.aggarwal@example.com",
            address="Main Market, Cloth Bazar, Thakurdwara",
            dob=date(2009, 9, 18),
            registration_date=today - timedelta(days=10),
            status="ACTIVE"
        )
        session.add_all([stu1, stu2, stu3, stu4, stu5, stu6])
        await session.flush()

        # -------------------------------------------------------------
        # 7. Enquiries (Realistic Pipeline & Demos)
        # -------------------------------------------------------------
        enq1 = Enquiry(
            enquiry_code="ENQ2026001",
            student_name="Aryan Kumar",
            mobile="9871122334",
            purpose="Class 10 Demo Trial",
            interested_subject="Mathematics & Science",
            demo_start_date=today - timedelta(days=1),
            demo_duration_days=3,
            demo_deadline=today + timedelta(days=2),
            notes="Trial class ongoing in Hall 13 (KK Chauhan sir). Student is attentive and wants admission next week.",
            status="ACTIVE_DEMO",
            created_by=cashier_user.id
        )
        enq2 = Enquiry(
            enquiry_code="ENQ2026002",
            student_name="Sneha Rao",
            mobile="9871122335",
            purpose="JEE Physics Demo",
            interested_subject="Physics (Target JEE/NEET 11-12)",
            demo_start_date=today - timedelta(days=2),
            demo_duration_days=3,
            demo_deadline=today + timedelta(days=1),
            notes="Demo ongoing with Dr. Amit Sharma in Hall 102. Trial ending tomorrow.",
            status="ACTIVE_DEMO",
            created_by=cashier_user.id
        )
        enq3 = Enquiry(
            enquiry_code="ENQ2026003",
            student_name="Divyansh Roy",
            mobile="9871122336",
            purpose="Admission Enquiry",
            interested_subject="Mathematics (Class 9-10)",
            notes="Parent visited front desk; requested fee structure booklet. Follow-up scheduled for Saturday.",
            status="PENDING",
            created_by=cashier_user.id
        )
        enq4 = Enquiry(
            enquiry_code="ENQ2026004",
            student_name="Tanvi Aggarwal",
            mobile="9870011226",
            purpose="English Spoken & Grammar",
            interested_subject="English Grammar & Comprehension",
            demo_start_date=today - timedelta(days=12),
            demo_duration_days=3,
            demo_deadline=today - timedelta(days=9),
            notes="Demo attended in Hall 104; converted to confirmed admission.",
            status="CONVERTED",
            converted_student_id=stu6.id,
            created_by=cashier_user.id
        )
        enq5 = Enquiry(
            enquiry_code="ENQ2026005",
            student_name="Mohit Chauhan",
            mobile="9871122338",
            purpose="Foundation Batch Trial",
            interested_subject="Science (Class 9-10)",
            demo_start_date=today - timedelta(days=15),
            demo_duration_days=3,
            demo_deadline=today - timedelta(days=12),
            notes="Demo period completed; student chose self-study this term.",
            status="EXPIRED",
            created_by=cashier_user.id
        )
        session.add_all([enq1, enq2, enq3, enq4, enq5])
        await session.flush()

        # -------------------------------------------------------------
        # 8. Admission 1: Rahul Sharma (Multi-Subject Paid in Full)
        # -------------------------------------------------------------
        adm1_calc = calculate_admission_financials(
            items=[
                {"item_type": "BATCH_SUBJECT", "batch_id": batch1.id, "subject_id": sub_math.id, "item_name": "CBSE 10th - Mathematics", "price": Decimal("1000.00"), "discount_type": "PERCENTAGE", "discount_value": Decimal("10.00")},
                {"item_type": "BATCH_SUBJECT", "batch_id": batch1.id, "subject_id": sub_sci.id, "item_name": "CBSE 10th - Science", "price": Decimal("1200.00"), "discount_type": "PERCENTAGE", "discount_value": Decimal("10.00")}
            ],
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00")
        )

        adm1 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777701"),
            admission_number="ADM/2026/001",
            student_id=stu1.id,
            student_name_snapshot=stu1.name,
            admission_date=today - timedelta(days=45),
            subtotal=adm1_calc["subtotal"],
            individual_discount_total=adm1_calc["individual_discount_total"],
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=adm1_calc["total_discount"],
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=adm1_calc["taxable_base"],
            gst_amount=adm1_calc["gst_amount"],
            total_payable=adm1_calc["total_payable"],
            amount_paid=adm1_calc["total_payable"],
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="CBSE Class 10 full semester enrollment. Paid in full.",
            valid_from=today - timedelta(days=45),
            valid_to=today + timedelta(days=135),
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
                teacher_id=teacher1.id,
                teacher_name_snapshot=teacher1.name,
                hall_number_snapshot="Hall 13",
                item_name_snapshot=itm["item_name"],
                original_price=itm["original_price"],
                discount_type=itm.get("discount_type", "NONE"),
                discount_value=itm.get("discount_value", Decimal("0.00")),
                discount_amount=itm["individual_discount"],
                overall_discount_share=itm["overall_discount_share"],
                net_price=itm["net_price"],
                amount_collected=itm["net_price"],
                balance_due=Decimal("0.00")
            )
            session.add(adm_item)
            adm1_items.append(adm_item)
        await session.flush()

        pmt1 = Payment(
            payment_number="RCP/2026/001",
            admission_id=adm1.id,
            student_id=stu1.id,
            amount=adm1.total_payable,
            payment_mode="UPI",
            transaction_reference="UPI98745612301",
            payment_date=now - timedelta(days=45),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Full course fee settled via UPI at admission",
            valid_from=today - timedelta(days=45),
            valid_to=today + timedelta(days=135),
            fee_period="Full Semester Oct 2026 - Mar 2027"
        )
        session.add(pmt1)
        await session.flush()

        for itm in adm1_items:
            session.add(PaymentAllocation(payment_id=pmt1.id, admission_item_id=itm.id, allocated_amount=itm.net_price))

        # -------------------------------------------------------------
        # 9. Admission 2: Priya Singh (Target JEE XI-XII Paid in Full)
        # -------------------------------------------------------------
        adm2_calc = calculate_admission_financials(
            items=[
                {"item_type": "BATCH_SUBJECT", "batch_id": batch2.id, "subject_id": sub_phy.id, "item_name": "JEE Foundation - Physics", "price": Decimal("1500.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")},
                {"item_type": "BATCH_SUBJECT", "batch_id": batch2.id, "subject_id": sub_chem.id, "item_name": "JEE Foundation - Chemistry", "price": Decimal("1400.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")}
            ],
            overall_discount_type="FIXED",
            overall_discount_value=Decimal("300.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00")
        )

        adm2 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777702"),
            admission_number="ADM/2026/002",
            student_id=stu2.id,
            student_name_snapshot=stu2.name,
            admission_date=today - timedelta(days=35),
            subtotal=adm2_calc["subtotal"],
            individual_discount_total=adm2_calc["individual_discount_total"],
            overall_discount_type="FIXED",
            overall_discount_value=Decimal("300.00"),
            overall_discount_amount=adm2_calc["overall_discount_amount"],
            total_discount=adm2_calc["total_discount"],
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=adm2_calc["taxable_base"],
            gst_amount=adm2_calc["gst_amount"],
            total_payable=adm2_calc["total_payable"],
            amount_paid=adm2_calc["total_payable"],
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="JEE 2027 Foundation bundle with early bird concession. Paid in full.",
            valid_from=today - timedelta(days=35),
            valid_to=today + timedelta(days=145),
            created_by=cashier_user.id
        )
        session.add(adm2)
        await session.flush()

        adm2_items = []
        for itm in adm2_calc["items"]:
            t_id = teacher2.id if itm.get("subject_id") == sub_phy.id else teacher4.id
            t_name = teacher2.name if itm.get("subject_id") == sub_phy.id else teacher4.name
            h_no = "Hall 102" if itm.get("subject_id") == sub_phy.id else "Hall 103"
            adm_item = AdmissionItem(
                admission_id=adm2.id,
                item_type=itm["item_type"],
                batch_id=itm.get("batch_id"),
                subject_id=itm.get("subject_id"),
                teacher_id=t_id,
                teacher_name_snapshot=t_name,
                hall_number_snapshot=h_no,
                item_name_snapshot=itm["item_name"],
                original_price=itm["original_price"],
                discount_type=itm.get("discount_type", "NONE"),
                discount_value=itm.get("discount_value", Decimal("0.00")),
                discount_amount=itm["individual_discount"],
                overall_discount_share=itm["overall_discount_share"],
                net_price=itm["net_price"],
                amount_collected=itm["net_price"],
                balance_due=Decimal("0.00")
            )
            session.add(adm_item)
            adm2_items.append(adm_item)
        await session.flush()

        pmt2 = Payment(
            payment_number="RCP/2026/002",
            admission_id=adm2.id,
            student_id=stu2.id,
            amount=adm2.total_payable,
            payment_mode="BANK_TRANSFER",
            transaction_reference="NEFT-HDFC-99120",
            payment_date=now - timedelta(days=35),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Full fees transferred via HDFC Net Banking",
            valid_from=today - timedelta(days=35),
            valid_to=today + timedelta(days=145),
            fee_period="Full Semester Oct 2026 - Mar 2027"
        )
        session.add(pmt2)
        await session.flush()

        for itm in adm2_items:
            session.add(PaymentAllocation(payment_id=pmt2.id, admission_item_id=itm.id, allocated_amount=itm.net_price))

        # -------------------------------------------------------------
        # 10. Admission 3: Rohan Gupta (Green Card Annual Pass Paid in Full)
        # -------------------------------------------------------------
        adm3 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777703"),
            admission_number="ADM/2026/003",
            student_id=stu3.id,
            student_name_snapshot=stu3.name,
            admission_date=today - timedelta(days=35),
            subtotal=green_card.price,
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=green_card.price,
            gst_amount=Decimal("0.00"),
            total_payable=green_card.price,
            amount_paid=green_card.price,
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="1-Year All Access Green Card subscription. Paid in full.",
            valid_from=today - timedelta(days=35),
            valid_to=today + timedelta(days=330),
            created_by=cashier_user.id
        )
        session.add(adm3)
        await session.flush()

        adm3_item = AdmissionItem(
            admission_id=adm3.id,
            item_type="GREEN_CARD",
            green_card_id=green_card.id,
            item_name_snapshot="Green Card - All Access Annual Pass",
            original_price=green_card.price,
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=green_card.price,
            amount_collected=green_card.price,
            balance_due=Decimal("0.00")
        )
        session.add(adm3_item)
        await session.flush()

        pmt3 = Payment(
            payment_number="RCP/2026/003",
            admission_id=adm3.id,
            student_id=stu3.id,
            amount=green_card.price,
            payment_mode="CARD",
            transaction_reference="POS-HDFC-88219",
            payment_date=now - timedelta(days=35),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Debit card swiped at front desk counter",
            valid_from=today - timedelta(days=35),
            valid_to=today + timedelta(days=330),
            fee_period="Annual Session 2026-2027"
        )
        session.add(pmt3)
        await session.flush()

        session.add(PaymentAllocation(payment_id=pmt3.id, admission_item_id=adm3_item.id, allocated_amount=green_card.price))

        # -------------------------------------------------------------
        # 11. Admission 4: Tanvi Aggarwal (Converted from Enquiry ENQ2026004)
        # -------------------------------------------------------------
        adm4 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777704"),
            admission_number="ADM/2026/004",
            student_id=stu6.id,
            student_name_snapshot=stu6.name,
            admission_date=today - timedelta(days=8),
            subtotal=Decimal("800.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("800.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("800.00"),
            amount_paid=Decimal("800.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="Converted successfully from trial demo enquiry. Cash paid in full.",
            valid_from=today - timedelta(days=8),
            valid_to=today + timedelta(days=172),
            created_by=cashier_user.id
        )
        session.add(adm4)
        await session.flush()

        adm4_item = AdmissionItem(
            admission_id=adm4.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_eng.id,
            teacher_id=teacher3.id,
            teacher_name_snapshot=teacher3.name,
            hall_number_snapshot="Hall 104",
            item_name_snapshot="English Grammar & Comprehension",
            original_price=Decimal("800.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("800.00"),
            amount_collected=Decimal("800.00"),
            balance_due=Decimal("0.00")
        )
        session.add(adm4_item)
        await session.flush()

        pmt4 = Payment(
            payment_number="RCP/2026/004",
            admission_id=adm4.id,
            student_id=stu6.id,
            amount=Decimal("800.00"),
            payment_mode="CASH",
            payment_date=now - timedelta(days=8),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Cash received at desk upon enquiry conversion",
            valid_from=today - timedelta(days=8),
            valid_to=today + timedelta(days=172),
            fee_period="Nov 2026 - Apr 2027"
        )
        session.add(pmt4)
        await session.flush()

        session.add(PaymentAllocation(payment_id=pmt4.id, admission_item_id=adm4_item.id, allocated_amount=Decimal("800.00")))

        # -------------------------------------------------------------
        # 12. Admission 5: Vikas Yadav (Full Refund & Revoked Showcase)
        # -------------------------------------------------------------
        adm5 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777705"),
            admission_number="ADM/2026/005",
            student_id=stu5.id,
            student_name_snapshot=stu5.name,
            admission_date=today - timedelta(days=20),
            subtotal=Decimal("1200.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("1200.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1200.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("0.00"),
            payment_status="VOID",
            status="REVOKED",
            revocation_reason="Full refund issued: Student family relocated outside district. Admission and batch enrollment revoked.",
            revoked_at=now - timedelta(days=5),
            revoked_by=cashier_user.id,
            notes="Original enrollment revoked with full refund issued.",
            valid_from=today - timedelta(days=20),
            valid_to=today + timedelta(days=160),
            created_by=cashier_user.id
        )
        session.add(adm5)
        await session.flush()

        adm5_item = AdmissionItem(
            admission_id=adm5.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_sci.id,
            teacher_id=teacher1.id,
            teacher_name_snapshot=teacher1.name,
            hall_number_snapshot="Hall 13",
            item_name_snapshot="Science (Class 9-10)",
            original_price=Decimal("1200.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1200.00"),
            amount_collected=Decimal("0.00"),
            balance_due=Decimal("0.00")
        )
        session.add(adm5_item)
        await session.flush()

        pmt5 = Payment(
            payment_number="RCP/2026/005",
            admission_id=adm5.id,
            student_id=stu5.id,
            amount=Decimal("1200.00"),
            payment_mode="CASH",
            payment_date=now - timedelta(days=20),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Initial cash payment at enrollment (Later refunded)",
            valid_from=today - timedelta(days=20),
            valid_to=today + timedelta(days=160),
            fee_period="Nov 2026 - Apr 2027"
        )
        session.add(pmt5)
        await session.flush()

        ref1 = Refund(
            refund_number="REF/2026/001",
            admission_id=adm5.id,
            payment_id=pmt5.id,
            student_id=stu5.id,
            amount=Decimal("1200.00"),
            refund_mode="CASH",
            reason="Student family relocated outside district. Full refund issued and admission revoked.",
            refund_date=now - timedelta(days=5),
            processed_by=cashier_user.id,
            processor_name_snapshot=cashier_user.full_name,
            notes="Full refund processed. Student surrendered ID card and batch slip."
        )
        session.add(ref1)

        # -------------------------------------------------------------
        # 12b. Admission 6: Tanvi Aggarwal - Month 1 Biology (Expired Cycle)
        # -------------------------------------------------------------
        adm6 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777706"),
            admission_number="ADM/2026/006",
            student_id=stu6.id,
            student_name_snapshot=stu6.name,
            admission_date=today - timedelta(days=98),
            subtotal=Decimal("1300.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("1300.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1300.00"),
            amount_paid=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="Biology NEET monthly cycle (Aug-Sept). Paid in full.",
            valid_from=today - timedelta(days=98),
            valid_to=today - timedelta(days=69),
            created_by=cashier_user.id
        )
        session.add(adm6)
        await session.flush()

        adm6_item = AdmissionItem(
            admission_id=adm6.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_bio.id,
            batch_id=batch3.id,
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number_snapshot="Hall 105",
            item_name_snapshot="Biology & Medical Target (NEET)",
            original_price=Decimal("1300.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1300.00"),
            amount_collected=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            valid_from=today - timedelta(days=98),
            valid_to=today - timedelta(days=69)
        )
        session.add(adm6_item)
        await session.flush()

        pmt6 = Payment(
            payment_number="RCP/2026/006",
            admission_id=adm6.id,
            student_id=stu6.id,
            amount=Decimal("1300.00"),
            payment_mode="UPI",
            transaction_reference="UPI/6001/TANVI",
            payment_date=now - timedelta(days=98),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="UPI fee received for Month 1",
            valid_from=today - timedelta(days=98),
            valid_to=today - timedelta(days=69),
            fee_period="Aug 2026 - Sep 2026"
        )
        session.add(pmt6)
        await session.flush()
        session.add(PaymentAllocation(payment_id=pmt6.id, admission_item_id=adm6_item.id, allocated_amount=Decimal("1300.00")))

        # -------------------------------------------------------------
        # 12c. Admission 7: Tanvi Aggarwal - Month 2 Biology (Expired Cycle)
        # -------------------------------------------------------------
        adm7 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777707"),
            admission_number="ADM/2026/007",
            student_id=stu6.id,
            student_name_snapshot=stu6.name,
            admission_date=today - timedelta(days=68),
            subtotal=Decimal("1300.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("1300.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1300.00"),
            amount_paid=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="Biology NEET monthly cycle (Sep-Oct). Paid in full.",
            valid_from=today - timedelta(days=68),
            valid_to=today - timedelta(days=39),
            created_by=cashier_user.id
        )
        session.add(adm7)
        await session.flush()

        adm7_item = AdmissionItem(
            admission_id=adm7.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_bio.id,
            batch_id=batch3.id,
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number_snapshot="Hall 105",
            item_name_snapshot="Biology & Medical Target (NEET)",
            original_price=Decimal("1300.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1300.00"),
            amount_collected=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            valid_from=today - timedelta(days=68),
            valid_to=today - timedelta(days=39)
        )
        session.add(adm7_item)
        await session.flush()

        pmt7 = Payment(
            payment_number="RCP/2026/007",
            admission_id=adm7.id,
            student_id=stu6.id,
            amount=Decimal("1300.00"),
            payment_mode="UPI",
            transaction_reference="UPI/6002/TANVI",
            payment_date=now - timedelta(days=68),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="UPI fee received for Month 2",
            valid_from=today - timedelta(days=68),
            valid_to=today - timedelta(days=39),
            fee_period="Sep 2026 - Oct 2026"
        )
        session.add(pmt7)
        await session.flush()
        session.add(PaymentAllocation(payment_id=pmt7.id, admission_item_id=adm7_item.id, allocated_amount=Decimal("1300.00")))

        # -------------------------------------------------------------
        # 12d. Admission 8: Tanvi Aggarwal - Month 3 Biology (Active Current Cycle)
        # -------------------------------------------------------------
        adm8 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777708"),
            admission_number="ADM/2026/008",
            student_id=stu6.id,
            student_name_snapshot=stu6.name,
            admission_date=today - timedelta(days=7),
            subtotal=Decimal("1300.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("1300.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1300.00"),
            amount_paid=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="Biology NEET monthly cycle (Nov-Dec). Active cycle paid in full.",
            valid_from=today - timedelta(days=7),
            valid_to=today + timedelta(days=22),
            created_by=cashier_user.id
        )
        session.add(adm8)
        await session.flush()

        adm8_item = AdmissionItem(
            admission_id=adm8.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_bio.id,
            batch_id=batch3.id,
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number_snapshot="Hall 105",
            item_name_snapshot="Biology & Medical Target (NEET)",
            original_price=Decimal("1300.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1300.00"),
            amount_collected=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            valid_from=today - timedelta(days=7),
            valid_to=today + timedelta(days=22)
        )
        session.add(adm8_item)
        await session.flush()

        pmt8 = Payment(
            payment_number="RCP/2026/008",
            admission_id=adm8.id,
            student_id=stu6.id,
            amount=Decimal("1300.00"),
            payment_mode="UPI",
            transaction_reference="UPI/6003/TANVI",
            payment_date=now - timedelta(days=7),
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="UPI fee received for Month 3",
            valid_from=today - timedelta(days=7),
            valid_to=today + timedelta(days=22),
            fee_period="Nov 2026 - Dec 2026"
        )
        session.add(pmt8)
        await session.flush()
        session.add(PaymentAllocation(payment_id=pmt8.id, admission_item_id=adm8_item.id, allocated_amount=Decimal("1300.00")))

        # -------------------------------------------------------------
        # 12e. Admission 9: Rohan Gupta - Biology NEET (Active Current Cycle)
        # -------------------------------------------------------------
        adm9 = Admission(
            id=uuid.UUID("77777777-7777-7777-7777-777777777709"),
            admission_number="ADM/2026/009",
            student_id=stu3.id,
            student_name_snapshot=stu3.name,
            admission_date=today,
            subtotal=Decimal("1300.00"),
            individual_discount_total=Decimal("0.00"),
            overall_discount_type="NONE",
            overall_discount_value=Decimal("0.00"),
            overall_discount_amount=Decimal("0.00"),
            total_discount=Decimal("0.00"),
            gst_enabled=False,
            gst_rate=Decimal("18.00"),
            taxable_base=Decimal("1300.00"),
            gst_amount=Decimal("0.00"),
            total_payable=Decimal("1300.00"),
            amount_paid=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            payment_status="PAID",
            status="ACTIVE",
            notes="Biology NEET monthly cycle (Nov-Dec). Active cycle paid in full.",
            valid_from=today,
            valid_to=today + timedelta(days=29),
            created_by=cashier_user.id
        )
        session.add(adm9)
        await session.flush()

        adm9_item = AdmissionItem(
            admission_id=adm9.id,
            item_type="BATCH_SUBJECT",
            subject_id=sub_bio.id,
            batch_id=batch3.id,
            teacher_id=teacher2.id,
            teacher_name_snapshot=teacher2.name,
            hall_number_snapshot="Hall 105",
            item_name_snapshot="Biology & Medical Target (NEET)",
            original_price=Decimal("1300.00"),
            discount_type="NONE",
            discount_value=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            overall_discount_share=Decimal("0.00"),
            net_price=Decimal("1300.00"),
            amount_collected=Decimal("1300.00"),
            balance_due=Decimal("0.00"),
            valid_from=today,
            valid_to=today + timedelta(days=29)
        )
        session.add(adm9_item)
        await session.flush()

        pmt9 = Payment(
            payment_number="RCP/2026/009",
            admission_id=adm9.id,
            student_id=stu3.id,
            amount=Decimal("1300.00"),
            payment_mode="CASH",
            payment_date=now,
            collected_by=cashier_user.id,
            collector_name_snapshot=cashier_user.full_name,
            notes="Cash received for Biology monthly cycle",
            valid_from=today,
            valid_to=today + timedelta(days=29),
            fee_period="Nov 2026 - Dec 2026"
        )
        session.add(pmt9)
        await session.flush()
        session.add(PaymentAllocation(payment_id=pmt9.id, admission_item_id=adm9_item.id, allocated_amount=Decimal("1300.00")))

        # -------------------------------------------------------------
        # 13. Expense Categories & Institute Expenses
        # -------------------------------------------------------------
        cat_sal = ExpenseCategory(name="Faculty Remuneration & Salaries", description="Monthly salaries and allowances for teaching and admin staff")
        cat_rent = ExpenseCategory(name="Premises Rent & Leases", description="Campus building and examination hall leasing")
        cat_util = ExpenseCategory(name="Electricity & Utilities", description="Commercial power tariffs, generator fuel and water")
        cat_stat = ExpenseCategory(name="Study Material & Printing", description="DPP sheets, weekly mock test printing, stationery")
        cat_mkt = ExpenseCategory(name="Marketing & Promotion", description="Flex hoardings, local newspaper inserts, social media")
        cat_pantry = ExpenseCategory(name="Pantry & Operations", description="Drinking water jars, tea refreshments for staff and guests")
        session.add_all([cat_sal, cat_rent, cat_util, cat_stat, cat_mkt, cat_pantry])
        await session.flush()

        exp1 = Expense(
            category_id=cat_util.id,
            title="UPPCL Commercial Electricity Bill (Main Campus)",
            amount=Decimal("4850.00"),
            expense_date=today - timedelta(days=10),
            payment_mode="BANK_TRANSFER",
            transaction_reference="NEFT-UPPCL-44102",
            added_by=admin_user.id,
            notes="Cleared on time via Net Banking"
        )
        exp2 = Expense(
            category_id=cat_stat.id,
            title="Bulk Printing - JEE & Board Mock Question Papers (5,000 sets)",
            amount=Decimal("3200.00"),
            expense_date=today - timedelta(days=7),
            payment_mode="CASH",
            added_by=cashier_user.id,
            notes="Printed by Aggarwal Printers, Main Market"
        )
        exp3 = Expense(
            category_id=cat_mkt.id,
            title="Bus Stand & Railway Road Hoarding Flex Installation",
            amount=Decimal("6500.00"),
            expense_date=today - timedelta(days=15),
            payment_mode="UPI",
            transaction_reference="UPI-MKT-99124",
            added_by=admin_user.id,
            notes="Annual admission promotion banners"
        )
        exp4 = Expense(
            category_id=cat_pantry.id,
            title="Staff Tea, Refreshments & Mineral Water Dispensers",
            amount=Decimal("1450.00"),
            expense_date=today - timedelta(days=3),
            payment_mode="CASH",
            added_by=cashier_user.id,
            notes="Monthly pantry settlement"
        )
        session.add_all([exp1, exp2, exp3, exp4])

        # -------------------------------------------------------------
        # 14. Faculty Salary Records
        # -------------------------------------------------------------
        current_month_str = today.strftime("%Y-%m")
        sal1 = SalaryRecord(
            employee_id=teacher1.id,
            employee_type="TEACHER",
            employee_name_snapshot=teacher1.name,
            month_year=current_month_str,
            salary_amount=Decimal("35000.00"),
            due_date=today.replace(day=5) if today.day >= 5 else today,
            paid_amount=Decimal("35000.00"),
            status="PAID",
            payment_date=today.replace(day=5) if today.day >= 5 else today,
            payment_mode="BANK_TRANSFER",
            notes="Monthly faculty remuneration disbursed via direct bank transfer"
        )
        sal2 = SalaryRecord(
            employee_id=teacher2.id,
            employee_type="TEACHER",
            employee_name_snapshot=teacher2.name,
            month_year=current_month_str,
            salary_amount=Decimal("40000.00"),
            due_date=today.replace(day=5) if today.day >= 5 else today,
            paid_amount=Decimal("40000.00"),
            status="PAID",
            payment_date=today.replace(day=5) if today.day >= 5 else today,
            payment_mode="BANK_TRANSFER",
            notes="Senior Physics Faculty remuneration"
        )
        sal3 = SalaryRecord(
            employee_id=teacher3.id,
            employee_type="TEACHER",
            employee_name_snapshot=teacher3.name,
            month_year=current_month_str,
            salary_amount=Decimal("22000.00"),
            due_date=today.replace(day=5) if today.day >= 5 else today,
            paid_amount=Decimal("22000.00"),
            status="PAID",
            payment_date=today.replace(day=5) if today.day >= 5 else today,
            payment_mode="UPI",
            notes="English faculty salary paid via UPI"
        )
        sal4 = SalaryRecord(
            employee_id=teacher4.id,
            employee_type="TEACHER",
            employee_name_snapshot=teacher4.name,
            month_year=current_month_str,
            salary_amount=Decimal("30000.00"),
            due_date=today.replace(day=5) if today.day >= 5 else today,
            paid_amount=Decimal("30000.00"),
            status="PAID",
            payment_date=today.replace(day=5) if today.day >= 5 else today,
            payment_mode="BANK_TRANSFER",
            notes="Chemistry faculty salary disbursed"
        )
        session.add_all([sal1, sal2, sal3, sal4])

        # -------------------------------------------------------------
        # 15. Audit Log Records
        # -------------------------------------------------------------
        audit1 = AuditLog(
            user_id=admin_user.id,
            action="INITIAL_DATABASE_WIPE_AND_RESET",
            entity_type="SYSTEM",
            details="Database completely reset and fresh professional institute mock data seeded.",
            ip_address="127.0.0.1"
        )
        session.add(audit1)

        await session.commit()
        print("Fresh professional institute mock data successfully seeded!")

if __name__ == "__main__":
    asyncio.run(init_models())
    asyncio.run(seed_data())
