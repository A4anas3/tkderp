import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session import AsyncSessionLocal
from app.database.models import Admission, AdmissionItem


@pytest.mark.asyncio
async def test_change_subject_endpoint_removed():
    """
    Verify POST /api/admissions/change-subject has been removed and returns 404/405.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        res = await client.post("/api/admissions/change-subject", json={
            "student_id": str(uuid.uuid4()),
            "new_subject_id": str(uuid.uuid4()),
        }, headers=admin_headers)
        assert res.status_code in (404, 405)


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

