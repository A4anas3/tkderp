import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_calculate_renewal_endpoint_breakdowns():
    """
    Test: /api/admissions/calculate-renewal computes authoritative fee, duration factor,
    discount, and net_payable according to the subject monthly rate and duration (months/days divide).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create Subject with fee 2000.00
        subj_res = await client.post("/api/subjects", json={
            "name": f"Physics CalcTest {uuid.uuid4().hex[:6]}",
            "default_fee": 2000.00
        }, headers=headers)
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]

        # Case 1: 1 Month (30d) with 10% discount -> fee = 2000, disc = 200, net = 1800
        res_1m = await client.post("/api/admissions/calculate-renewal", json={
            "subject_id": subj_id,
            "valid_from": "2026-11-18",
            "valid_to": "2026-12-18",
            "discount_type": "PERCENTAGE",
            "discount_value": 10.0
        }, headers=headers)
        assert res_1m.status_code == 200
        data_1m = res_1m.json()
        assert Decimal(str(data_1m["base_monthly_fee"])) == Decimal("2000.00")
        assert Decimal(str(data_1m["duration_factor"])) == Decimal("1.0")
        assert Decimal(str(data_1m["fee"])) == Decimal("2000.00")
        assert Decimal(str(data_1m["discount_amount"])) == Decimal("200.00")
        assert Decimal(str(data_1m["net_payable"])) == Decimal("1800.00")

        # Case 2: 15 Days with 10% discount -> fee = 1000, disc = 100, net = 900
        res_15d = await client.post("/api/admissions/calculate-renewal", json={
            "subject_id": subj_id,
            "valid_from": "2026-11-18",
            "valid_to": "2026-12-03",
            "discount_type": "PERCENTAGE",
            "discount_value": 10.0
        }, headers=headers)
        assert res_15d.status_code == 200
        data_15d = res_15d.json()
        assert Decimal(str(data_15d["fee"])) == Decimal("1000.00")
        assert Decimal(str(data_15d["discount_amount"])) == Decimal("100.00")
        assert Decimal(str(data_15d["net_payable"])) == Decimal("900.00")

        # Case 3: 2 Months (60d) with 10% discount -> fee = 4000, disc = 400, net = 3600
        res_2m = await client.post("/api/admissions/calculate-renewal", json={
            "subject_id": subj_id,
            "valid_from": "2026-11-18",
            "valid_to": "2027-01-17",
            "discount_type": "PERCENTAGE",
            "discount_value": 10.0
        }, headers=headers)
        assert res_2m.status_code == 200
        data_2m = res_2m.json()
        assert Decimal(str(data_2m["fee"])) == Decimal("4000.00")
        assert Decimal(str(data_2m["discount_amount"])) == Decimal("400.00")
        assert Decimal(str(data_2m["net_payable"])) == Decimal("3600.00")


@pytest.mark.asyncio
async def test_renewal_amount_equals_rate_x_duration_minus_discount_and_accepts_paid():
    """
    Test: Renew subject for 1 month with fee 2000, discount 10%, Amount Paid 1800:
    authoritative payable is 1800.00, initial payment 1800 is accepted without conflict.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Subject Physics ExpiredDueTest
        subj_res = await client.post("/api/subjects", json={
            "name": f"Physics ExpiredDueTest {uuid.uuid4().hex[:6]}",
            "default_fee": 2000.00
        }, headers=headers)
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]

        # 2. Student
        stu_res = await client.post("/api/students", json={
            "name": "Renewal Live Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        # 3. Initial enrollment
        init_res = await client.post("/api/admissions", json={
            "student_id": stu_id,
            "admission_date": "2026-10-18",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj_id,
                "item_name_snapshot": "Physics ExpiredDueTest",
                "original_price": 2000.00,
                "valid_from": "2026-10-18",
                "valid_to": "2026-11-17"
            }]
        }, headers=headers)
        assert init_res.status_code == 201

        # 4. Renewal: 1 Month (30d), Valid From 18/11/2026 to 18/12/2026, Fee 2000, Discount 10%, Paid 1800
        renew_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": stu_id,
            "subject_id": subj_id,
            "valid_from": "2026-11-18",
            "valid_to": "2026-12-18",
            "fee": 2000.00,
            "discount_type": "PERCENTAGE",
            "discount_value": 10.0,
            "initial_payment": {
                "amount": 1800.00,
                "payment_mode": "CASH",
                "notes": "Full renewal fee paid"
            }
        }, headers=headers)
        assert renew_res.status_code == 201
        renew_adm = renew_res.json()

        # Verify financials
        assert Decimal(str(renew_adm["subtotal"])) == Decimal("2000.00")
        assert Decimal(str(renew_adm["total_discount"])) == Decimal("200.00")
        assert Decimal(str(renew_adm["total_payable"])) == Decimal("1800.00")
        assert Decimal(str(renew_adm["amount_paid"])) == Decimal("1800.00")
        assert Decimal(str(renew_adm["balance_due"])) == Decimal("0.00")
        assert renew_adm["payment_status"] == "PAID"


@pytest.mark.asyncio
async def test_new_course_purchase_computed_same_way():
    """
    Test: New course purchase flow computes amount the exact same way from the backend:
    subject fee x duration minus discount.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Subject with monthly fee 2000.00
        subj_res = await client.post("/api/subjects", json={
            "name": f"Chemistry PurchaseTest {uuid.uuid4().hex[:6]}",
            "default_fee": 2000.00
        }, headers=headers)
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]

        # 2. Preview for 2 months purchase with 10% discount:
        # Expected: Fee = 2000 * 2 = 4000. Discount = 10% = 400. Payable = 3600.
        prev_res = await client.post("/api/admissions/preview", json={
            "items": [
                {
                    "item_type": "SUBJECT",
                    "subject_id": subj_id,
                    "item_name_snapshot": "Chemistry PurchaseTest",
                    "months": 2,
                    "valid_from": "2026-11-22",
                    "valid_to": "2027-01-21",
                    "discount_type": "PERCENTAGE",
                    "discount_value": 10.0
                }
            ]
        }, headers=headers)
        assert prev_res.status_code == 200
        calc = prev_res.json()
        assert Decimal(str(calc["subtotal"])) == Decimal("4000.00")
        assert Decimal(str(calc["total_discount"])) == Decimal("400.00")
        assert Decimal(str(calc["total_payable"])) == Decimal("3600.00")

        # 3. Create student and execute purchase admission with full payment
        stu_res = await client.post("/api/students", json={
            "name": "New Course Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=headers)
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        create_res = await client.post("/api/admissions", json={
            "student_id": stu_id,
            "admission_date": "2026-11-22",
            "items": [
                {
                    "item_type": "SUBJECT",
                    "subject_id": subj_id,
                    "item_name_snapshot": "Chemistry PurchaseTest (2 Mo @ ₹2000/mo)",
                    "months": 2,
                    "valid_from": "2026-11-22",
                    "valid_to": "2027-01-21",
                    "discount_type": "PERCENTAGE",
                    "discount_value": 10.0
                }
            ],
            "initial_payment": {
                "amount": 3600.00,
                "payment_mode": "UPI",
                "notes": "Full purchase fee"
            }
        }, headers=headers)
        assert create_res.status_code == 201
        adm_data = create_res.json()

        assert Decimal(str(adm_data["subtotal"])) == Decimal("4000.00")
        assert Decimal(str(adm_data["total_discount"])) == Decimal("400.00")
        assert Decimal(str(adm_data["total_payable"])) == Decimal("3600.00")
        assert Decimal(str(adm_data["amount_paid"])) == Decimal("3600.00")
        assert Decimal(str(adm_data["balance_due"])) == Decimal("0.00")
        assert adm_data["payment_status"] == "PAID"
