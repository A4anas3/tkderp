import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
import freezegun

from app.main import app
from app.database.session import AsyncSessionLocal
from app.database.models import AdmissionItem, Batch, User
from app.services.daily_jobs import refresh_statuses
from sqlalchemy import select

@pytest.mark.asyncio
async def test_hall_clash_validation():
    """
    Test 4: Hall-clash check when creating or editing a batch subject (same hall + overlapping schedule).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create Subject
        s_res = await client.post("/api/subjects", json={
            "name": f"Physics HallClash {uuid.uuid4().hex[:6]}",
            "default_fee": 1200.00
        }, headers=headers)
        assert s_res.status_code == 201
        subj_id = s_res.json()["id"]

        unique_hall = f"Hall-Test-{uuid.uuid4().hex[:5]}"

        # 1. Create Batch 1 in unique_hall: Mon-Fri 09:00 AM - 10:30 AM
        b1_res = await client.post("/api/batches", json={
            "name": f"Batch Morning {uuid.uuid4().hex[:4]}",
            "hall_number": unique_hall,
            "schedule": "Mon-Fri 09:00 AM - 10:30 AM",
            "start_date": date.today().isoformat(),
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 1200.00,
                    "hall_number": unique_hall,
                    "schedule": "Mon-Fri 09:00 AM - 10:30 AM"
                }
            ]
        }, headers=headers)
        assert b1_res.status_code == 201
        b1_id = b1_res.json()["id"]

        # 2. Attempt to create Batch 2 in the same hall with overlapping schedule: Mon-Fri 10:00 AM - 11:30 AM
        b2_clash = await client.post("/api/batches", json={
            "name": f"Batch Clash {uuid.uuid4().hex[:4]}",
            "hall_number": unique_hall,
            "schedule": "Mon-Fri 10:00 AM - 11:30 AM",
            "start_date": date.today().isoformat(),
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 1200.00,
                    "hall_number": unique_hall,
                    "schedule": "Mon-Fri 10:00 AM - 11:30 AM"
                }
            ]
        }, headers=headers)
        assert b2_clash.status_code == 400
        assert "Hall clash detected" in b2_clash.json()["detail"]

        # 3. Create Batch 3 with non-overlapping schedule: Mon-Fri 11:00 AM - 12:30 PM (Succeeds)
        b3_ok = await client.post("/api/batches", json={
            "name": f"Batch Afternoon {uuid.uuid4().hex[:4]}",
            "hall_number": unique_hall,
            "schedule": "Mon-Fri 11:00 AM - 12:30 PM",
            "start_date": date.today().isoformat(),
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 1200.00,
                    "hall_number": unique_hall,
                    "schedule": "Mon-Fri 11:00 AM - 12:30 PM"
                }
            ]
        }, headers=headers)
        assert b3_ok.status_code == 201
        b3_id = b3_ok.json()["id"]

        # 4. Attempt to update Batch 3 to clash with Batch 1 (Fails with 400)
        b3_edit_clash = await client.put(f"/api/batches/{b3_id}", json={
            "schedule": "Mon-Fri 09:30 AM - 10:30 AM",
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 1200.00,
                    "hall_number": unique_hall,
                    "schedule": "Mon-Fri 09:30 AM - 10:30 AM"
                }
            ]
        }, headers=headers)
        assert b3_edit_clash.status_code == 400
        assert "Hall clash detected" in b3_edit_clash.json()["detail"]

        # 5. Updating Batch 3 without clashing succeeds
        b3_edit_ok = await client.put(f"/api/batches/{b3_id}", json={
            "name": f"Batch Afternoon Renamed {uuid.uuid4().hex[:4]}"
        }, headers=headers)
        assert b3_edit_ok.status_code == 200


@pytest.mark.asyncio
async def test_single_definition_of_active_student_and_freeze_time_flip():
    """
    Acceptance:
    - Counts on batch detail, dashboard, and teacher page all show the same number.
    - Freezing the clock (freezegun) at valid_to + 1 flips status.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Create Teacher
        t_res = await client.post("/api/teachers", json={
            "name": f"Faculty Verma {uuid.uuid4().hex[:6]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}",
            "qualification": "M.Sc Chemistry",
            "specialization": "Organic Chemistry",
            "share_type": "PERCENT",
            "share_value": 35.00
        }, headers=headers)
        assert t_res.status_code == 201
        teacher = t_res.json()
        teacher_id = teacher["id"]

        # 2. Create Subject
        s_res = await client.post("/api/subjects", json={
            "name": f"Organic Chem {uuid.uuid4().hex[:6]}",
            "default_fee": 1500.00,
            "teacher_id": teacher_id
        }, headers=headers)
        assert s_res.status_code == 201
        subj_id = s_res.json()["id"]

        # 3. Create Batch
        hall = f"Hall-Active-{uuid.uuid4().hex[:5]}"
        today = date.today()
        b_res = await client.post("/api/batches", json={
            "name": f"Chem Batch {uuid.uuid4().hex[:6]}",
            "teacher_id": teacher_id,
            "hall_number": hall,
            "schedule": "Mon-Sat 08:00 AM - 09:30 AM",
            "capacity": 40,
            "start_date": (today - timedelta(days=10)).isoformat(),
            "subjects": [
                {
                    "subject_id": subj_id,
                    "fee": 1500.00,
                    "teacher_id": teacher_id,
                    "hall_number": hall,
                    "schedule": "Mon-Sat 08:00 AM - 09:30 AM",
                    "capacity": 40
                }
            ]
        }, headers=headers)
        assert b_res.status_code == 201
        batch_id = b_res.json()["id"]

        # 4. Enroll Student 1: Active (valid from today - 10 to today + 20)
        st1_res = await client.post("/api/students", json={
            "name": f"Active Student 1 {uuid.uuid4().hex[:4]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        st1_id = st1_res.json()["id"]

        adm1_res = await client.post("/api/admissions", json={
            "student_id": st1_id,
            "admission_date": (today - timedelta(days=10)).isoformat(),
            "valid_from": (today - timedelta(days=10)).isoformat(),
            "valid_to": (today + timedelta(days=20)).isoformat(),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "batch_id": batch_id,
                "subject_id": subj_id,
                "teacher_id": teacher_id,
                "item_name_snapshot": "Organic Chem",
                "original_price": 1500.00,
                "valid_from": (today - timedelta(days=10)).isoformat(),
                "valid_to": (today + timedelta(days=20)).isoformat()
            }]
        }, headers=headers)
        assert adm1_res.status_code == 201
        # Pay Student 1 in full
        await client.post("/api/payments", json={
            "admission_id": adm1_res.json()["id"],
            "amount": 1500.00,
            "payment_mode": "CASH"
        }, headers=headers)

        # 5. Enroll Student 2: Active for next 5 days only (valid from today - 5 to today + 5)
        st2_res = await client.post("/api/students", json={
            "name": f"Active Student 2 {uuid.uuid4().hex[:4]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        st2_id = st2_res.json()["id"]

        adm2_res = await client.post("/api/admissions", json={
            "student_id": st2_id,
            "admission_date": (today - timedelta(days=5)).isoformat(),
            "valid_from": (today - timedelta(days=5)).isoformat(),
            "valid_to": (today + timedelta(days=5)).isoformat(),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "batch_id": batch_id,
                "subject_id": subj_id,
                "teacher_id": teacher_id,
                "item_name_snapshot": "Organic Chem",
                "original_price": 1500.00,
                "valid_from": (today - timedelta(days=5)).isoformat(),
                "valid_to": (today + timedelta(days=5)).isoformat()
            }]
        }, headers=headers)
        assert adm2_res.status_code == 201
        await client.post("/api/payments", json={
            "admission_id": adm2_res.json()["id"],
            "amount": 1500.00,
            "payment_mode": "UPI"
        }, headers=headers)

        # 6. Enroll Student 3: Expired yesterday (valid from today - 30 to today - 1)
        st3_res = await client.post("/api/students", json={
            "name": f"Expired Student 3 {uuid.uuid4().hex[:4]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        st3_id = st3_res.json()["id"]

        adm3_res = await client.post("/api/admissions", json={
            "student_id": st3_id,
            "admission_date": (today - timedelta(days=30)).isoformat(),
            "valid_from": (today - timedelta(days=30)).isoformat(),
            "valid_to": (today - timedelta(days=1)).isoformat(),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "batch_id": batch_id,
                "subject_id": subj_id,
                "teacher_id": teacher_id,
                "item_name_snapshot": "Organic Chem",
                "original_price": 1500.00,
                "valid_from": (today - timedelta(days=30)).isoformat(),
                "valid_to": (today - timedelta(days=1)).isoformat()
            }]
        }, headers=headers)
        assert adm3_res.status_code == 201

        # Run status refresh for today to flip Student 3 to EXPIRED
        await refresh_statuses(today=today)

        # --- ASSERTION 1: ALL SURFACES AGREE ON THE SAME NUMBER (2 active students) ---
        # A. Batch Detail
        b_get = await client.get(f"/api/batches/{batch_id}", headers=headers)
        assert b_get.status_code == 200
        batch_enrolled_count = b_get.json()["enrolled_count"]
        assert batch_enrolled_count == 2, f"Batch detail enrolled count mismatch: {batch_enrolled_count} != 2"

        # B. Teacher Dashboard
        # Set user_id or test teacher dashboard fallback
        t_dash = await client.get("/api/dashboard/teacher", headers=headers)
        assert t_dash.status_code == 200
        t_batches = t_dash.json()["batches"]
        matching_b = next((b for b in t_batches if b["batch_id"] == batch_id), None)
        assert matching_b is not None
        assert matching_b["student_count"] == 2, f"Teacher dashboard count mismatch: {matching_b['student_count']} != 2"

        # C. Teacher Roster Page
        t_roster = await client.get(f"/api/teachers/{teacher_id}/roster?status_filter=ACTIVE", headers=headers)
        assert t_roster.status_code == 200
        r_data = t_roster.json()
        assert r_data["metrics"]["active_enrollments"] == 2
        assert r_data["total"] == 2

        # D. Active Summary Endpoint
        summary_res = await client.get("/api/batches/active-summary", headers=headers)
        assert summary_res.status_code == 200
        summary_item = next((b for b in summary_res.json() if b["batch_id"] == batch_id), None)
        assert summary_item is not None
        assert summary_item["active_students"] == 2
        assert summary_item["capacity"] == 40
        assert summary_item["seats_left"] == 38
        assert summary_item["expiring_in_7_days"] == 1  # Student 2 expires in 5 days!

        # Also test the root alias /batches/active-summary
        alias_res = await client.get("/batches/active-summary", headers=headers)
        assert alias_res.status_code == 200

        # --- ASSERTION 2: FREEZE TIME AT valid_to + 1 FLIPS STATUS ---
        # Student 2 valid_to is today + 5 days. Freeze time at today + 6 days (valid_to + 1)
        future_date = today + timedelta(days=6)
        with freezegun.freeze_time(future_date.isoformat()):
            # Re-authenticate under frozen time
            adm_login_f = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
            assert adm_login_f.status_code == 200
            headers_f = {"Authorization": f"Bearer {adm_login_f.json()['access_token']}"}

            # Run refresh_statuses on future_date
            refresh_summary = await refresh_statuses(today=future_date)
            assert refresh_summary["items_expired_count"] >= 1

            # Check database item status
            async with AsyncSessionLocal() as db:
                itm2_id = adm2_res.json()["items"][0]["id"]
                itm2 = (await db.execute(select(AdmissionItem).where(AdmissionItem.id == uuid.UUID(itm2_id)))).scalar_one()
                assert itm2.status == "EXPIRED"

            # Now all surfaces must show EXACTLY 1 active student!
            # A. Batch detail
            b_get2 = await client.get(f"/api/batches/{batch_id}", headers=headers_f)
            assert b_get2.json()["enrolled_count"] == 1

            # B. Teacher dashboard
            t_dash2 = await client.get("/api/dashboard/teacher", headers=headers_f)
            matching_b2 = next((b for b in t_dash2.json()["batches"] if b["batch_id"] == batch_id), None)
            assert matching_b2["student_count"] == 1

            # C. Teacher roster
            t_roster2 = await client.get(f"/api/teachers/{teacher_id}/roster?status_filter=ACTIVE", headers=headers_f)
            assert t_roster2.json()["metrics"]["active_enrollments"] == 1
            assert t_roster2.json()["total"] == 1

            # D. Active Summary
            s_res2 = await client.get("/api/batches/active-summary", headers=headers_f)
            summary_item2 = next((b for b in s_res2.json() if b["batch_id"] == batch_id), None)
            assert summary_item2["active_students"] == 1
            assert summary_item2["seats_left"] == 39


@pytest.mark.asyncio
async def test_grace_days_and_on_hold_status():
    """
    Test 5: Grace days config:
    A student with unpaid balance stays ACTIVE for N grace days (settings.GRACE_DAYS = 7),
    then item becomes ON_HOLD (visible flag, not deleted).
    When balance is paid, item returns to ACTIVE.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Create Subject
        s_res = await client.post("/api/subjects", json={
            "name": f"Biology Grace {uuid.uuid4().hex[:6]}",
            "default_fee": 2000.00
        }, headers=headers)
        subj_id = s_res.json()["id"]

        today = date.today()

        # 2. Enroll student with zero payment (unpaid balance = 2000)
        st_res = await client.post("/api/students", json={
            "name": f"Unpaid Student {uuid.uuid4().hex[:4]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        st_id = st_res.json()["id"]

        adm_res = await client.post("/api/admissions", json={
            "student_id": st_id,
            "admission_date": today.isoformat(),
            "valid_from": today.isoformat(),
            "valid_to": (today + timedelta(days=30)).isoformat(),
            "items": [{
                "item_type": "SUBJECT",
                "subject_id": subj_id,
                "item_name_snapshot": "Biology Grace",
                "original_price": 2000.00,
                "valid_from": today.isoformat(),
                "valid_to": (today + timedelta(days=30)).isoformat()
            }]
        }, headers=headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        item_id = adm_data["items"][0]["id"]

        # Within grace days (e.g. today + 4 days): student must stay ACTIVE
        with freezegun.freeze_time((today + timedelta(days=4)).isoformat()):
            await refresh_statuses(today=today + timedelta(days=4))
            async with AsyncSessionLocal() as db:
                itm = (await db.execute(select(AdmissionItem).where(AdmissionItem.id == uuid.UUID(item_id)))).scalar_one()
                assert itm.status == "ACTIVE"
                assert itm.is_on_hold is False

        # Past grace days (today + 8 days > GRACE_DAYS=7): item becomes ON_HOLD
        past_grace_date = today + timedelta(days=8)
        with freezegun.freeze_time(past_grace_date.isoformat()):
            res = await refresh_statuses(today=past_grace_date)
            assert res["items_put_on_hold_count"] >= 1

            async with AsyncSessionLocal() as db:
                itm = (await db.execute(select(AdmissionItem).where(AdmissionItem.id == uuid.UUID(item_id)))).scalar_one()
                assert itm.status == "ON_HOLD"
                assert itm.is_on_hold is True

            # Re-authenticate under frozen time
            adm_login_f = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
            assert adm_login_f.status_code == 200
            headers_f = {"Authorization": f"Bearer {adm_login_f.json()['access_token']}"}

            # Visible in admission detail as ON_HOLD
            adm_check = await client.get(f"/api/admissions/{adm_data['id']}", headers=headers_f)
            assert adm_check.status_code == 200
            chk_itm = adm_check.json()["items"][0]
            assert chk_itm["status"] == "ON_HOLD"
            assert chk_itm["is_on_hold"] is True

            # Student pays balance in full: item returns to ACTIVE
            pay_res = await client.post("/api/payments", json={
                "admission_id": adm_data["id"],
                "amount": 2000.00,
                "payment_mode": "CASH"
            }, headers=headers_f)
            assert pay_res.status_code == 201

            async with AsyncSessionLocal() as db:
                itm_restored = (await db.execute(select(AdmissionItem).where(AdmissionItem.id == uuid.UUID(item_id)))).scalar_one()
                assert itm_restored.status == "ACTIVE"
                assert itm_restored.is_on_hold is False
