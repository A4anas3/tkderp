import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database.session import AsyncSessionLocal
from app.database.models import Admission, AdmissionItem
from app.services.daily_jobs import refresh_statuses
from sqlalchemy import select

@pytest.mark.asyncio
async def test_expired_admission_due_remains_visible_and_payable():
    """
    Test that when an admission item/subject expires (valid_to passes and status becomes EXPIRED),
    its unpaid balance still appears as a due in:
    1. Cashier dashboard due figures (total_receivables_due) and due_admissions list (marked is_expired=True).
    2. Student profile detail (total_balance_due and expired_balance_due, lines with is_expired=True and is_overdue=True).
    3. Student active-enrollment endpoint (historical_subjects with balance_due, is_expired=True, is_overdue=True, expired_due_total).
    4. Due can still be paid via payment endpoint, which settles the due.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 2. Create Subject & Batch
        subj_res = await client.post("/api/subjects", json={
            "name": f"Physics ExpiredDueTest {uuid.uuid4().hex[:6]}",
            "default_fee": 2000.00
        }, headers=headers)
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]

        batch_res = await client.post("/api/batches", json={
            "name": f"Batch ExpiredDue {uuid.uuid4().hex[:6]}",
            "start_date": (date.today() - timedelta(days=40)).isoformat(),
            "hall_number": f"H-{uuid.uuid4().hex[:4]}",
            "schedule": "MWF 10-11 AM",
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 2000.00,
                    "schedule": "MWF 10-11 AM"
                }
            ]
        }, headers=headers)
        assert batch_res.status_code == 201
        batch_id = batch_res.json()["id"]

        # 3. Create Student
        stu_res = await client.post("/api/students", json={
            "name": f"Expired Due Student {uuid.uuid4().hex[:5]}",
            "mobile": f"98{uuid.uuid4().int % 100000000:08d}",
            "gender": "MALE"
        }, headers=headers)
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        # 4. Create Admission with partial payment (fee: 2000, paid: 500, balance: 1500)
        # Set validity to the past (e.g. expired 5 days ago)
        past_from = (date.today() - timedelta(days=35)).isoformat()
        past_to = (date.today() - timedelta(days=5)).isoformat()

        adm_create_res = await client.post("/api/admissions", json={
            "student_id": stu_id,
            "admission_date": past_from,
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": subj_id,
                    "batch_id": batch_id,
                    "item_name_snapshot": "Physics ExpiredDueTest",
                    "original_price": 2000.00,
                    "net_price": 2000.00,
                    "valid_from": past_from,
                    "valid_to": past_to
                }
            ],
            "initial_payment": {
                "amount": 500.00,
                "payment_mode": "CASH"
            }
        }, headers=headers)
        assert adm_create_res.status_code == 201
        adm_data = adm_create_res.json()
        adm_id = adm_data["id"]
        assert float(adm_data["balance_due"]) == 1500.00

        # 5. Run daily status refresh to expire the item and admission
        async with AsyncSessionLocal() as db:
            await refresh_statuses(today=date.today(), db=db)

            # Confirm status in DB is EXPIRED
            item_db = (await db.execute(select(AdmissionItem).where(AdmissionItem.admission_id == uuid.UUID(adm_id)))).scalar_one()
            assert item_db.status == "EXPIRED"
            assert float(item_db.balance_due) == 1500.00

            adm_db = (await db.execute(select(Admission).where(Admission.id == uuid.UUID(adm_id)))).scalar_one()
            assert adm_db.status == "EXPIRED"
            assert float(adm_db.balance_due) == 1500.00

        # 6. Verify Dashboard due figures (cashier dashboard)
        cashier_res = await client.get("/api/dashboard/cashier", headers=headers)
        assert cashier_res.status_code == 200
        cashier_data = cashier_res.json()
        assert cashier_data["metrics"]["total_receivables_due"] >= 1500.00

        # Verify due_admissions list includes the expired admission with overdue indicator
        matching_due_adm = next((a for a in cashier_data["due_admissions"] if a["id"] == adm_id), None)
        assert matching_due_adm is not None, "Expired admission must appear in due_admissions list"
        assert float(matching_due_adm["balance_due"]) == 1500.00
        assert matching_due_adm["status"] == "EXPIRED"
        assert matching_due_adm["is_expired"] is True

        # 7. Verify Student Profile Detail
        student_res = await client.get(f"/api/students/{stu_id}", headers=headers)
        assert student_res.status_code == 200
        student_data = student_res.json()
        assert float(student_data["total_balance_due"]) == 1500.00, "Student total_balance_due must include expired dues"
        assert float(student_data["expired_balance_due"]) == 1500.00, "Student expired_balance_due must reflect expired due"

        # Check line in expired list
        assert len(student_data["expired"]) >= 1
        exp_line = next(l for l in student_data["expired"] if l["admission_id"] == adm_id)
        assert float(exp_line["balance_due"]) == 1500.00
        assert exp_line["is_expired"] is True
        assert exp_line["is_overdue"] is True

        # 8. Verify Active Enrollment Endpoint
        enr_res = await client.get(f"/api/students/{stu_id}/active-enrollment", headers=headers)
        assert enr_res.status_code == 200
        enr_data = enr_res.json()
        assert float(enr_data["expired_due_total"]) == 1500.00
        assert float(enr_data["total_due"]) >= 1500.00
        assert float(enr_data["active_totals"]["total_due"]) >= 1500.00

        # Historical subjects must have the overdue item
        hist_item = next(h for h in enr_data["historical_subjects"] if h["admission_id"] == adm_id)
        assert float(hist_item["balance_due"]) == 1500.00
        assert hist_item["is_expired"] is True
        assert hist_item["is_overdue"] is True

        # 9. Test paying the expired due
        pay_res = await client.post("/api/payments", json={
            "admission_id": adm_id,
            "student_id": stu_id,
            "amount": 1500.00,
            "payment_mode": "UPI",
            "transaction_reference": f"UPI-TEST-{uuid.uuid4().hex[:6]}"
        }, headers=headers)
        assert pay_res.status_code == 201

        # 10. Verify due is now cleared
        student_res_after = await client.get(f"/api/students/{stu_id}", headers=headers)
        assert float(student_res_after.json()["total_balance_due"]) == 0.00
