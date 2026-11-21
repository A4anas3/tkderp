import uuid
import random
import csv
import io
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session import AsyncSessionLocal
from app.modules.reports.ledger_queries import get_subject_revenue_from_ledger, get_total_ledger_revenue, ist_day_boundaries
from app.database.models import Payment, Refund, SalaryRecord, PaymentAllocation
from sqlalchemy import select, func, or_

@pytest.mark.asyncio
async def test_teacher_payable_lifecycle():
    """
    Teacher payable test:
    - Teacher with 40% share
    - Pay 1000 -> 400 earned
    - Refund 250 -> 100 reversed
    - Payout 200 -> 200 paid
    - Assert payable == 100 (earned 400 - reversed 100 - paid 200 = 100)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_token = adm_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Create Teacher with 40% share
        tch_res = await client.post("/api/teachers", json={
            "name": f"Prof Sharma {uuid.uuid4().hex[:6]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}",
            "qualification": "M.Sc Physics",
            "specialization": "Quantum Mechanics",
            "share_type": "PERCENT",
            "share_value": 40.00
        }, headers=headers)
        assert tch_res.status_code == 201
        tch = tch_res.json()
        teacher_id = tch["id"]

        # 2. Create Subject
        subj_res = await client.post("/api/subjects", json={
            "name": f"Advanced Physics {uuid.uuid4().hex[:6]}",
            "default_fee": 1500.00,
            "billing_cycle": "MONTHLY"
        }, headers=headers)
        assert subj_res.status_code == 201
        subj = subj_res.json()

        # 3. Create Batch with this teacher and subject
        batch_res = await client.post("/api/batches", json={
            "name": f"Physics Mastery {uuid.uuid4().hex[:6]}",
            "batch_type": "REGULAR",
            "teacher_id": teacher_id,
            "hall_number": "Hall 101",
            "subjects": [
                {
                    "subject_id": subj["id"],
                    "fee": 1500.00,
                    "teacher_id": teacher_id,
                    "hall_number": "Hall 101"
                }
            ]
        }, headers=headers)
        assert batch_res.status_code == 201
        batch = batch_res.json()

        # 4. Create Student
        st_res = await client.post("/api/students", json={
            "name": "Physics Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert st_res.status_code == 201
        student = st_res.json()

        # 5. Create Admission with 1500 fee (net 1500)
        adm_res = await client.post("/api/admissions", json={
            "student_id": student["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch["id"],
                    "subject_id": subj["id"],
                    "teacher_id": teacher_id,
                    "item_name_snapshot": "Physics Paper 1",
                    "original_price": 1500.00,
                    "discount_type": "NONE",
                    "discount_value": 0.00
                }
            ]
        }, headers=headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        item_id = adm["items"][0]["id"]
        assert adm["items"][0]["share_type"] == "PERCENT"
        assert Decimal(str(adm["items"][0]["share_percent"])) == Decimal("40.00")

        # 6. Step 1: Pay 1000 -> Teacher earns 40% of 1000 = 400
        pay_res = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": 1000.00,
            "payment_mode": "CASH",
            "notes": "First partial payment"
        }, headers=headers)
        assert pay_res.status_code == 201

        # Check teacher earnings
        earn_res = await client.get(f"/api/teachers/{teacher_id}/earnings", headers=headers)
        assert earn_res.status_code == 200
        e_data = earn_res.json()
        assert Decimal(str(e_data["total_earned"])) == Decimal("400.00")
        assert Decimal(str(e_data["total_reversed"])) == Decimal("0.00")
        assert Decimal(str(e_data["net_earned"])) == Decimal("400.00")
        assert Decimal(str(e_data["total_paid"])) == Decimal("0.00")
        assert Decimal(str(e_data["payable"])) == Decimal("400.00")
        assert len(e_data["by_subject"]) == 1
        assert Decimal(str(e_data["by_subject"][0]["earned"])) == Decimal("400.00")

        # 7. Step 2: Refund 250 -> 40% of 250 = 100 reversed
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm["id"],
            "target_item_id": item_id,
            "amount": 250.00,
            "refund_mode": "CASH",
            "reason": "Student dropped portion"
        }, headers=headers)
        assert ref_res.status_code == 201

        # Check teacher earnings after refund
        earn_res2 = await client.get(f"/api/teachers/{teacher_id}/earnings", headers=headers)
        assert earn_res2.status_code == 200
        e_data2 = earn_res2.json()
        assert Decimal(str(e_data2["total_earned"])) == Decimal("400.00")
        assert Decimal(str(e_data2["total_reversed"])) == Decimal("100.00")
        assert Decimal(str(e_data2["net_earned"])) == Decimal("300.00")
        assert Decimal(str(e_data2["total_paid"])) == Decimal("0.00")
        assert Decimal(str(e_data2["payable"])) == Decimal("300.00")

        # 8. Step 3: Payout 200 -> Teacher paid 200
        payout_res = await client.post(f"/api/teachers/{teacher_id}/payouts", json={
            "amount": 200.00,
            "payout_mode": "BANK_TRANSFER",
            "notes": "Advance faculty payout",
            "reference": "TXN_TCH_PAYOUT_123"
        }, headers=headers)
        assert payout_res.status_code == 201

        # Check final teacher earnings
        earn_res3 = await client.get(f"/api/teachers/{teacher_id}/earnings", headers=headers)
        assert earn_res3.status_code == 200
        e_data3 = earn_res3.json()
        assert Decimal(str(e_data3["total_earned"])) == Decimal("400.00")
        assert Decimal(str(e_data3["total_reversed"])) == Decimal("100.00")
        assert Decimal(str(e_data3["net_earned"])) == Decimal("300.00")
        assert Decimal(str(e_data3["total_paid"])) == Decimal("200.00")
        # Teacher payable = earned (400) - reversed (100) - paid (200) = 100!
        assert Decimal(str(e_data3["payable"])) == Decimal("100.00")
        assert len(e_data3["payouts"]) == 1
        assert Decimal(str(e_data3["payouts"][0]["amount"])) == Decimal("200.00")

        # Verify SalaryRecord exists in database and has status=PAID
        salary_id = e_data3["payouts"][0]["salary_record_id"]
        assert salary_id is not None
        async with AsyncSessionLocal() as db:
            s_rec = (await db.execute(select(SalaryRecord).where(SalaryRecord.id == uuid.UUID(salary_id)))).scalar_one_or_none()
            assert s_rec is not None
            assert s_rec.status == "PAID"
            assert Decimal(str(s_rec.paid_amount)) == Decimal("200.00")


@pytest.mark.asyncio
async def test_randomized_reconciliation():
    """
    Property-style test:
    Random sequence of admissions, payments, and partial refunds across multiple subjects.
    Asserts:
    sum(subject_revenue in date range) == sum(payments) - sum(refunds) in the same range.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_token = adm_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Create 3 unique subjects
        subject_ids = []
        for i in range(3):
            s_res = await client.post("/api/subjects", json={
                "name": f"Subj Reconcile {i} {uuid.uuid4().hex[:6]}",
                "default_fee": 1000.00
            }, headers=headers)
            assert s_res.status_code == 201
            subject_ids.append(s_res.json()["id"])

        today_str = date.today().isoformat()
        test_admissions = []

        # Create 3 admissions, each with all 3 subjects
        for s_idx in range(3):
            st_res = await client.post("/api/students", json={
                "name": f"Student Recon {s_idx}",
                "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
            }, headers=headers)
            st_id = st_res.json()["id"]

            adm_res = await client.post("/api/admissions", json={
                "student_id": st_id,
                "admission_date": today_str,
                "items": [
                    {
                        "item_type": "SUBJECT",
                        "subject_id": sub_id,
                        "item_name_snapshot": f"Subj Line {j}",
                        "original_price": 1000.00,
                        "discount_type": "NONE",
                        "discount_value": 0.00
                    }
                    for j, sub_id in enumerate(subject_ids)
                ]
            }, headers=headers)
            assert adm_res.status_code == 201
            test_admissions.append(adm_res.json())

        # Perform random payments and refunds
        total_paid_sim = Decimal("0.00")
        total_refunded_sim = Decimal("0.00")

        rng = random.Random(42)
        for adm in test_admissions:
            # Pay random amount between 300 and 1500
            pay_amt = Decimal(str(rng.randint(300, 1500)))
            p_res = await client.post("/api/payments", json={
                "admission_id": adm["id"],
                "amount": float(pay_amt),
                "payment_mode": rng.choice(["CASH", "UPI", "BANK_TRANSFER"]),
                "notes": "Random simulated payment"
            }, headers=headers)
            assert p_res.status_code == 201
            total_paid_sim += pay_amt

            # Randomly issue partial refund on some admissions
            if rng.random() > 0.3:
                ref_amt = Decimal(str(rng.randint(50, int(pay_amt / 2))))
                r_res = await client.post("/api/payments/refund", json={
                    "admission_id": adm["id"],
                    "amount": float(ref_amt),
                    "refund_mode": "CASH",
                    "reason": "Random simulated refund"
                }, headers=headers)
                assert r_res.status_code == 201
                total_refunded_sim += ref_amt

        # Query Subject Revenue Report
        rep_res = await client.get(f"/api/reports/subject-revenue?from_date={today_str}&to_date={today_str}", headers=headers)
        assert rep_res.status_code == 200
        rep_data = rep_res.json()

        # Sum revenue across our 3 subjects from the report items
        report_subj_map = {item["subject_id"]: Decimal(str(item["total_collected"])) for item in rep_data["items"]}
        sum_our_subjects = sum((report_subj_map.get(s_id, Decimal("0.00")) for s_id in subject_ids), Decimal("0.00"))

        expected_net = total_paid_sim - total_refunded_sim
        assert sum_our_subjects == expected_net, f"Reconciliation failed: expected {expected_net}, got {sum_our_subjects}"

        # Admissions-level and ledger reconciliation
        async with AsyncSessionLocal() as db:
            test_adm_ids = [uuid.UUID(adm["id"]) for adm in test_admissions]
            p_sum = (await db.execute(
                select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
                .where(Payment.admission_id.in_(test_adm_ids))
            )).scalar_one()

            r_sum = (await db.execute(
                select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
                .where(Refund.admission_id.in_(test_adm_ids))
            )).scalar_one()

            total_test_allocs = (await db.execute(
                select(func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00")))
                .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
                .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
                .where(or_(
                    Payment.admission_id.in_(test_adm_ids),
                    Refund.admission_id.in_(test_adm_ids)
                ))
            )).scalar_one()

            assert total_test_allocs == p_sum - r_sum == expected_net, (
                f"Ledger reconciliation mismatch: allocs={total_test_allocs}, p_sum={p_sum}, r_sum={r_sum}, expected={expected_net}"
            )


@pytest.mark.asyncio
async def test_all_reports_and_csv_exports():
    """
    Tests all 5 reports and their CSV export endpoints:
    1. Subject revenue
    2. Teacher payable
    3. Dues by subject
    4. Collection by cashier
    5. Collection by mode
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_token = adm_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        today_str = date.today().isoformat()

        # 1. Subject Revenue
        r1 = await client.get(f"/api/reports/subject-revenue?from_date={today_str}", headers=headers)
        assert r1.status_code == 200
        assert "items" in r1.json()

        csv1 = await client.get(f"/api/reports/subject-revenue?format=csv&from_date={today_str}", headers=headers)
        assert csv1.status_code == 200
        assert "text/csv" in csv1.headers["content-type"]
        reader = csv.reader(io.StringIO(csv1.text))
        headers_row = next(reader)
        assert "Subject Code" in headers_row and "Total Collected" in headers_row[4]

        csv1_alt = await client.get(f"/api/reports/subject-revenue/csv?from_date={today_str}", headers=headers)
        assert csv1_alt.status_code == 200
        assert "text/csv" in csv1_alt.headers["content-type"]

        # 2. Teacher Payable
        r2 = await client.get(f"/api/reports/teacher-payable?from_date={today_str}", headers=headers)
        assert r2.status_code == 200
        assert "items" in r2.json()

        csv2 = await client.get(f"/api/reports/teacher-payable?format=csv&from_date={today_str}", headers=headers)
        assert csv2.status_code == 200
        assert "text/csv" in csv2.headers["content-type"]
        reader2 = csv.reader(io.StringIO(csv2.text))
        h2 = next(reader2)
        assert "Teacher Name" in h2 and "Payable (₹)" in h2

        csv2_alt = await client.get(f"/api/reports/teacher-payable/csv?from_date={today_str}", headers=headers)
        assert csv2_alt.status_code == 200

        # 3. Dues By Subject
        r3 = await client.get(f"/api/reports/dues-by-subject?from_date={today_str}", headers=headers)
        assert r3.status_code == 200
        assert "items" in r3.json()

        csv3 = await client.get(f"/api/reports/dues-by-subject?format=csv&from_date={today_str}", headers=headers)
        assert csv3.status_code == 200
        assert "text/csv" in csv3.headers["content-type"]
        reader3 = csv.reader(io.StringIO(csv3.text))
        h3 = next(reader3)
        assert "Subject Name" in h3 and "Balance Due" in h3[5]

        csv3_alt = await client.get(f"/api/reports/dues-by-subject/csv?from_date={today_str}", headers=headers)
        assert csv3_alt.status_code == 200

        # 4. Collection By Cashier
        r4 = await client.get(f"/api/reports/collection-by-cashier?from_date={today_str}", headers=headers)
        assert r4.status_code == 200
        assert "items" in r4.json()

        csv4 = await client.get(f"/api/reports/collection-by-cashier?format=csv&from_date={today_str}", headers=headers)
        assert csv4.status_code == 200
        assert "text/csv" in csv4.headers["content-type"]
        reader4 = csv.reader(io.StringIO(csv4.text))
        h4 = next(reader4)
        assert "Cashier Name" in h4 and "Net Collected" in h4[6]

        csv4_alt = await client.get(f"/api/reports/collection-by-cashier/csv?from_date={today_str}", headers=headers)
        assert csv4_alt.status_code == 200

        # 5. Collection By Mode
        r5 = await client.get(f"/api/reports/collection-by-mode?from_date={today_str}", headers=headers)
        assert r5.status_code == 200
        assert "items" in r5.json()

        csv5 = await client.get(f"/api/reports/collection-by-mode?format=csv&from_date={today_str}", headers=headers)
        assert csv5.status_code == 200
        assert "text/csv" in csv5.headers["content-type"]
        reader5 = csv.reader(io.StringIO(csv5.text))
        h5 = next(reader5)
        assert "Payment Mode" in h5 and "Net Collected" in h5[5]

        csv5_alt = await client.get(f"/api/reports/collection-by-mode/csv?from_date={today_str}", headers=headers)
        assert csv5_alt.status_code == 200
