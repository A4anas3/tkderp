import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_cancelled_purchase_never_shows_days_remaining():
    """
    Verify that a cancelled / revoked purchase NEVER returns days_remaining
    in student enrollments, student detail lines, renewals, or teacher roster,
    and is excluded from active counts and lists.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create a new test student
        st_res = await client.post("/api/students", json={
            "name": "Cancelled Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert st_res.status_code == 201
        student = st_res.json()
        student_id = student["id"]

        # Get batch & subject
        b_res = await client.get("/api/batches/all", headers=headers)
        batches = b_res.json()
        batch = batches[0]
        sub = batch["subjects"][0]

        today = date.today()
        v_from = today.isoformat()
        v_to = (today + timedelta(days=30)).isoformat()

        # Enroll in course
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": v_from,
            "valid_from": v_from,
            "valid_to": v_to,
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "teacher_id": batch.get("teacher_id"),
                    "original_price": float(sub["fee"]),
                    "valid_from": v_from,
                    "valid_to": v_to
                }
            ]
        }, headers=headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        admission_id = adm["id"]

        # Before cancellation: days_remaining is an integer >= 0
        enr_before = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_before.status_code == 200
        assert len(enr_before.json()["active_subjects"]) == 1
        assert enr_before.json()["active_subjects"][0]["days_remaining"] is not None

        # Cancel / Revoke the purchase with reason
        rev_res = await client.post(f"/api/admissions/{admission_id}/revoke", json={
            "reason": "Student requested drop due to schedule clash",
            "refund_amount": 0,
            "refund_mode": "CASH"
        }, headers=headers)
        assert rev_res.status_code == 200

        # 1. Check student enrollments: active_subjects is empty, historical_subjects contains cancelled item with days_remaining == None
        enr_after = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_after.status_code == 200
        enr_data = enr_after.json()
        assert len(enr_data["active_subjects"]) == 0
        assert len(enr_data["historical_subjects"]) == 1
        hist_item = enr_data["historical_subjects"][0]
        assert hist_item["status"] == "CANCELLED"
        assert hist_item["days_remaining"] is None
        assert hist_item["is_expiring_soon"] is False
        assert hist_item["is_expired"] is False
        assert hist_item["is_overdue"] is False
        assert hist_item["can_cancel"] is False

        # 2. Check student detail: line is in revoked with days_left == None
        stu_detail = await client.get(f"/api/students/{student_id}", headers=headers)
        assert stu_detail.status_code == 200
        stu_data = stu_detail.json()
        assert len(stu_data["active"]) == 0
        assert len(stu_data["revoked"]) == 1
        assert stu_data["revoked"][0]["days_left"] is None
        assert stu_data["revoked"][0]["is_expired"] is False
        assert stu_data["revoked"][0]["is_overdue"] is False

        # 3. Check student renewals due: cancelled item must be excluded
        ren_due = await client.get(f"/api/students/{student_id}/renewals-due", headers=headers)
        assert ren_due.status_code == 200
        assert len(ren_due.json()) == 0

        # 4. Check global renewals summary: must be excluded
        ren_sum = await client.get("/api/renewals/summary", headers=headers)
        assert ren_sum.status_code == 200
        sum_data = ren_sum.json()
        candidate_ids = [itm["admission_id"] for itm in sum_data["expiring"] + sum_data["recently_expired"]]
        assert admission_id not in candidate_ids

        # 5. Check teacher roster: cancelled item must have cycle_status == "CANCELLED", days_remaining == None
        if batch.get("teacher_id"):
            teach_roster = await client.get(f"/api/teachers/{batch['teacher_id']}/enrollments", headers=headers)
            assert teach_roster.status_code == 200
            for itm in teach_roster.json()["items"]:
                if itm["admission_id"] == admission_id:
                    assert itm["cycle_status"] == "CANCELLED"
                    assert itm["days_remaining"] is None
                    assert itm["status_subtext"] == "Cancelled"


@pytest.mark.asyncio
async def test_renew_subject_aligned_flow():
    """
    Verify that renewing a subject creates a proper new cycle/invoice/receipt
    exactly like new enrollment, starting the day after the previous cycle ends,
    with rolling cycle end date and proper initial payment handling.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Renew Flow Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert st_res.status_code == 201
        student = st_res.json()
        student_id = student["id"]

        # Get batch & subject
        b_res = await client.get("/api/batches/all", headers=headers)
        batches = b_res.json()
        batch = batches[0]
        sub = batch["subjects"][0]
        fee = float(sub["fee"])

        # Initial enrollment: 2026-10-15 to 2026-11-14
        adm1_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": "2026-10-15",
            "valid_from": "2026-10-15",
            "valid_to": "2026-11-14",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "teacher_id": batch.get("teacher_id"),
                    "original_price": fee,
                    "valid_from": "2026-10-15",
                    "valid_to": "2026-11-14"
                }
            ]
        }, headers=headers)
        assert adm1_res.status_code == 201

        # Renew subject for next cycle: 2026-11-15 to 2026-12-14 (continuity: day after previous end)
        # with full payment
        renew_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": student_id,
            "subject_id": sub["subject_id"],
            "teacher_id": batch.get("teacher_id"),
            "valid_from": "2026-11-15",
            "valid_to": "2026-12-14",
            "months": 1,
            "fee": fee,
            "initial_payment": {
                "amount": fee,
                "payment_mode": "UPI",
                "transaction_reference": "UPI987654321",
                "notes": "Renewal payment collected via UPI"
            },
            "notes": "Cycle 2 renewal"
        }, headers=headers)
        assert renew_res.status_code == 201
        renewed_adm = renew_res.json()

        # Check new admission slip record
        assert renewed_adm["admission_number"].startswith("ADM-")
        assert renewed_adm["payment_status"] == "PAID"
        assert float(renewed_adm["amount_paid"]) == fee
        assert float(renewed_adm["balance_due"]) == 0.0
        assert len(renewed_adm["items"]) == 1

        renewed_item = renewed_adm["items"][0]
        assert renewed_item["valid_from"] == "2026-11-15"
        assert renewed_item["valid_to"] == "2026-12-14"
        assert renewed_item["renewed_from_item_id"] is not None
        assert renewed_item["renewal_count"] == 1
        assert not renewed_item["item_name_snapshot"].startswith("[Renewal] ")

        # Check student enrollments
        enr_res = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_res.status_code == 200
        active_subs = enr_res.json()["active_subjects"]
        assert len(active_subs) == 1
        # Consolidated active subject reflects the renewed chain
        assert active_subs[0]["is_renewed"] is True
        assert active_subs[0]["cycle_count"] == 2


