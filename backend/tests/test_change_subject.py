import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session import AsyncSessionLocal
from app.database.models import Admission, AdmissionItem


@pytest.mark.asyncio
async def test_change_subject_endpoint_success():
    """
    Test changing a subject via POST /api/admissions/change-subject.
    - Student is enrolled in Subject A.
    - Changes to Subject B with new dates and payment on the spot.
    - Subject A is discontinued and archived to history.
    - Subject B is active with new date range and paid slip.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Create a test student
        st_res = await client.post("/api/students", json={
            "name": "Change Subject Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        # 2. Get two different subjects
        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subjects = subj_res.json()["items"]
        assert len(subjects) >= 2
        sub_a = subjects[0]
        sub_b = subjects[1]

        # 3. Enroll in Subject A
        adm1_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-01",
            "valid_from": "2026-11-01",
            "valid_to": "2026-11-30",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_a["id"],
                "item_name_snapshot": sub_a["name"],
                "original_price": float(sub_a["default_fee"]),
                "valid_from": "2026-11-01",
                "valid_to": "2026-11-30"
            }],
            "initial_payment": {
                "amount": float(sub_a["default_fee"]),
                "payment_mode": "CASH"
            }
        }, headers=admin_headers)
        assert adm1_res.status_code == 201
        item_a = adm1_res.json()["items"][0]
        assert item_a["status"] == "ACTIVE"

        # 4. Change subject from Sub A to Sub B
        change_res = await client.post("/api/admissions/change-subject", json={
            "student_id": st["id"],
            "old_item_id": item_a["id"],
            "new_subject_id": sub_b["id"],
            "valid_from": "2026-11-15",
            "valid_to": "2026-12-14",
            "fee": float(sub_b["default_fee"]),
            "initial_payment": {
                "amount": float(sub_b["default_fee"]),
                "payment_mode": "UPI",
                "transaction_reference": "UPI-CHANGE-777"
            },
            "notes": "Student requested switch to Chemistry"
        }, headers=admin_headers)
        assert change_res.status_code == 201
        adm_b = change_res.json()
        assert len(adm_b["items"]) == 1
        item_b = adm_b["items"][0]

        assert item_b["subject_id"] == sub_b["id"]
        assert item_b["valid_from"] == "2026-11-15"
        assert item_b["valid_to"] == "2026-12-14"
        assert item_b["renewed_from_item_id"] == item_a["id"]
        assert adm_b["payment_status"] == "PAID"
        assert Decimal(str(adm_b["amount_paid"])) == Decimal(str(sub_b["default_fee"]))

        # 5. Check active enrollment: Sub B is active, Sub A is historical
        enr_res = await client.get(f"/api/students/{st['id']}/active-enrollment", headers=admin_headers)
        assert enr_res.status_code == 200
        enr = enr_res.json()

        active_subs = [s["subject_id"] for s in enr["active_subjects"]]
        assert sub_b["id"] in active_subs
        assert sub_a["id"] not in active_subs

        hist_subs = [s["subject_id"] for s in enr["historical_subjects"]]
        assert sub_a["id"] in hist_subs
        old_hist = next(s for s in enr["historical_subjects"] if s["subject_id"] == sub_a["id"])
        assert old_hist["status"] == "DISCONTINUED"
        assert "Changed subject" in old_hist["lifecycle_reason"]


@pytest.mark.asyncio
async def test_on_the_spot_admission_with_change_from_item_id():
    """
    Test on-the-spot enrollment wizard flow with change_from_item_id in AdmissionItemCreate.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "OnTheSpot Flow Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subjects = subj_res.json()["items"]
        sub_a = subjects[0]
        sub_b = subjects[1]

        # Initial enrollment
        adm1 = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-01",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_a["id"],
                "item_name_snapshot": sub_a["name"],
                "original_price": float(sub_a["default_fee"]),
                "valid_from": "2026-11-01",
                "valid_to": "2026-11-30"
            }]
        }, headers=admin_headers)
        item_a = adm1.json()["items"][0]

        # Enrol in Sub B with change_from_item_id
        adm2 = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-20",
            "valid_from": "2026-11-20",
            "valid_to": "2026-12-19",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_b["id"],
                "item_name_snapshot": sub_b["name"],
                "original_price": float(sub_b["default_fee"]),
                "valid_from": "2026-11-20",
                "valid_to": "2026-12-19",
                "change_from_item_id": item_a["id"]
            }],
            "initial_payment": {
                "amount": float(sub_b["default_fee"]),
                "payment_mode": "CASH"
            }
        }, headers=admin_headers)
        assert adm2.status_code == 201
        item_b = adm2.json()["items"][0]
        assert item_b["renewed_from_item_id"] == item_a["id"]


@pytest.mark.asyncio
async def test_change_subject_overlap_conflict():
    """
    Test that changing to a subject where the student already has an active overlapping period yields 409 Conflict.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Overlap Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subjects = subj_res.json()["items"]
        sub_a = subjects[0]
        sub_b = subjects[1]

        # Enroll in both Sub A and Sub B
        await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-01",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": sub_a["id"],
                    "item_name_snapshot": sub_a["name"],
                    "original_price": float(sub_a["default_fee"]),
                    "valid_from": "2026-11-01",
                    "valid_to": "2026-11-30"
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": sub_b["id"],
                    "item_name_snapshot": sub_b["name"],
                    "original_price": float(sub_b["default_fee"]),
                    "valid_from": "2026-11-01",
                    "valid_to": "2026-11-30"
                }
            ]
        }, headers=admin_headers)

        # Trying to change Sub A to Sub B for an overlapping period -> 409 Conflict
        res = await client.post("/api/admissions/change-subject", json={
            "student_id": st["id"],
            "old_subject_id": sub_a["id"],
            "new_subject_id": sub_b["id"],
            "valid_from": "2026-11-15",
            "valid_to": "2026-12-14"
        }, headers=admin_headers)
        assert res.status_code == 409
        assert "overlapping active enrollment" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_on_the_spot_purchase_with_custom_date_range_and_discount():
    """
    Test on-the-spot flow: pick student, pick subject with custom date range together,
    apply discount, confirm and record payment.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Custom Date Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        base_fee = float(subj["default_fee"])

        # 10% discount on base_fee
        discount_value = 10.0
        expected_discount = base_fee * 0.10
        expected_net = base_fee - expected_discount

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-22",
            "valid_from": "2026-11-22",
            "valid_to": "2026-12-25",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": base_fee,
                "discount_type": "PERCENTAGE",
                "discount_value": discount_value,
                "valid_from": "2026-11-22",
                "valid_to": "2026-12-25"
            }],
            "initial_payment": {
                "amount": expected_net,
                "payment_mode": "CASH",
                "notes": "Paid on the spot in cash"
            }
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        item = adm["items"][0]

        assert item["valid_from"] == "2026-11-22"
        assert item["valid_to"] == "2026-12-25"
        assert Decimal(str(item["net_price"])) == Decimal(str(expected_net))
        assert adm["payment_status"] == "PAID"
        assert Decimal(str(adm["balance_due"])) == Decimal("0.00")

