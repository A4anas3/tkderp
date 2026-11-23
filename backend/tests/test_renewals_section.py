import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.common.active_lines import today_kolkata

@pytest.mark.asyncio
async def test_renewals_section_role_enforcement():
    """
    Teacher must NOT see renewals (403 Forbidden).
    Cashier and Admin MUST have access (200 OK).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Teacher access -> 403 Forbidden
        t_login = await client.post("/api/auth/login", json={"username": "TCH001", "password": "Teacher@1234"})
        assert t_login.status_code == 200
        t_token = t_login.json()["access_token"]
        t_res = await client.get("/api/renewals", headers={"Authorization": f"Bearer {t_token}"})
        assert t_res.status_code == 403

        # 2. Cashier access -> 200 OK
        c_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert c_login.status_code == 200
        c_token = c_login.json()["access_token"]
        c_res = await client.get("/api/renewals", headers={"Authorization": f"Bearer {c_token}"})
        assert c_res.status_code == 200
        data = c_res.json()
        assert "expiring" in data
        assert "recently_expired" in data
        assert "counts" in data

        # 3. Admin access -> 200 OK
        a_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert a_login.status_code == 200
        a_token = a_login.json()["access_token"]
        a_res = await client.get("/api/renewals", headers={"Authorization": f"Bearer {a_token}"})
        assert a_res.status_code == 200


@pytest.mark.asyncio
async def test_renewals_lists_and_renewal_disappearance():
    """
    Validates:
    1) Expiring in 1-5 days list includes students expiring in that window with course name and wa.me link.
    2) Recently expired list includes students expired 1-5 days ago with course name and wa.me link.
    3) When a student renews, their expiry date moves out, and they automatically disappear from both lists!
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cashier login
        c_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert c_login.status_code == 200
        c_token = c_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {c_token}"}

        today = today_kolkata()

        # Get subjects
        subj_res = await client.get("/api/subjects", headers=headers)
        assert subj_res.status_code == 200
        subjects = subj_res.json()["items"]
        assert len(subjects) >= 1
        subject = subjects[0]
        sub_id = subject["id"]
        sub_fee = float(subject["default_fee"] or 1000.0)

        # 1. Create Student A: expiring in 3 days
        stu_a_res = await client.post("/api/students", json={
            "name": f"Expiring Test Student {uuid.uuid4().hex[:4]}",
            "mobile": f"98{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert stu_a_res.status_code == 201
        stu_a = stu_a_res.json()

        expiring_date = today + timedelta(days=3)
        adm_a_res = await client.post("/api/admissions", json={
            "student_id": stu_a["id"],
            "admission_date": str(today - timedelta(days=27)),
            "valid_from": str(today - timedelta(days=27)),
            "valid_to": str(expiring_date),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_id,
                "item_name_snapshot": subject["name"],
                "original_price": sub_fee,
                "valid_from": str(today - timedelta(days=27)),
                "valid_to": str(expiring_date)
            }]
        }, headers=headers)
        assert adm_a_res.status_code == 201
        adm_a = adm_a_res.json()

        # 2. Create Student B: expired 2 days ago
        stu_b_res = await client.post("/api/students", json={
            "name": f"Expired Test Student {uuid.uuid4().hex[:4]}",
            "mobile": f"99{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert stu_b_res.status_code == 201
        stu_b = stu_b_res.json()

        expired_date = today - timedelta(days=2)
        adm_b_res = await client.post("/api/admissions", json={
            "student_id": stu_b["id"],
            "admission_date": str(today - timedelta(days=32)),
            "valid_from": str(today - timedelta(days=32)),
            "valid_to": str(expired_date),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_id,
                "item_name_snapshot": subject["name"],
                "original_price": sub_fee,
                "valid_from": str(today - timedelta(days=32)),
                "valid_to": str(expired_date)
            }]
        }, headers=headers)
        assert adm_b_res.status_code == 201
        adm_b = adm_b_res.json()
        item_b_id = adm_b["items"][0]["id"]

        # 3. Query renewals endpoint
        renewals_res = await client.get("/api/renewals", headers=headers)
        assert renewals_res.status_code == 200
        data = renewals_res.json()

        # Verify Student A is in expiring list (in 1-5 days)
        expiring_matches = [x for x in data["expiring"] if x["student_id"] == stu_a["id"]]
        assert len(expiring_matches) == 1
        exp_match = expiring_matches[0]
        assert exp_match["student_name"] == stu_a["name"]
        assert exp_match["subject_name"] == subject["name"]
        assert exp_match["days_remaining"] == 3
        assert exp_match["status_label"] == "Expires in 3 days"
        assert exp_match["whatsapp_url"].startswith("https://wa.me/")
        assert "Expires in 3 days" in exp_match["whatsapp_message"]

        # Verify Student B is in recently expired list (1-5 days ago)
        expired_matches = [x for x in data["recently_expired"] if x["student_id"] == stu_b["id"]]
        assert len(expired_matches) == 1
        rec_match = expired_matches[0]
        assert rec_match["student_name"] == stu_b["name"]
        assert rec_match["subject_name"] == subject["name"]
        assert rec_match["days_ago"] == 2
        assert rec_match["status_label"] == "Expired 2 days ago"
        assert rec_match["whatsapp_url"].startswith("https://wa.me/")
        assert "Expired 2 days ago" in rec_match["whatsapp_message"]

        # 4. NOW RENEW Student B's expired subject using renew-subject
        renew_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": stu_b["id"],
            "subject_id": sub_id,
            "valid_from": str(today),
            "valid_to": str(today + timedelta(days=30)),
            "months": 1,
            "fee": sub_fee,
            "discount_type": "NONE",
            "discount_value": 0.0,
            "notes": "Course renewed at cashier desk"
        }, headers=headers)
        assert renew_res.status_code == 201

        # 5. Re-query renewals endpoint: Student B MUST have automatically DISAPPEARED from both lists!
        renewals_after = await client.get("/api/renewals", headers=headers)
        assert renewals_after.status_code == 200
        data_after = renewals_after.json()

        b_in_expired = [x for x in data_after["recently_expired"] if x["student_id"] == stu_b["id"]]
        b_in_expiring = [x for x in data_after["expiring"] if x["student_id"] == stu_b["id"]]
        assert len(b_in_expired) == 0, "Renewed student must disappear from recently expired list"
        assert len(b_in_expiring) == 0, "Renewed student with 30-day validity must not appear in 1-5 days list"

        # Student A is still expiring in 3 days
        a_in_expiring = [x for x in data_after["expiring"] if x["student_id"] == stu_a["id"]]
        assert len(a_in_expiring) == 1
