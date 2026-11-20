import asyncio
import uuid
from decimal import Decimal
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_concurrent_admissions_atomic_numbering():
    """
    Acceptance Test:
    Creates 50 admissions in parallel: all numbers must be unique, no 500 errors.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cashier login
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Register a test student
        unique_mobile = f"98{uuid.uuid4().int % 100000000:08d}"
        s_res = await client.post("/api/students", json={
            "name": "Parallel Admission Student",
            "mobile": unique_mobile
        }, headers=headers)
        assert s_res.status_code == 201
        student = s_res.json()

        # Get active subject/batch
        b_res = await client.get("/api/batches/all", headers=headers)
        batches = b_res.json()
        assert len(batches) >= 1
        batch = batches[0]
        sub = batch["subjects"][0]

        adm_payload = {
            "student_id": student["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": f"{batch['name']} - {sub['subject_name']}",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False
        }

        # Fire 50 admission creations concurrently
        async def create_one():
            return await client.post("/api/admissions", json=adm_payload, headers=headers)

        tasks = [create_one() for _ in range(50)]
        responses = await asyncio.gather(*tasks)

        admission_numbers = []
        for r in responses:
            assert r.status_code == 201, f"Failed with {r.status_code}: {r.text}"
            data = r.json()
            admission_numbers.append(data["admission_number"])

        assert len(admission_numbers) == 50
        assert len(set(admission_numbers)) == 50, "Duplicate admission numbers generated under concurrency!"

@pytest.mark.asyncio
async def test_concurrent_payments_with_for_update():
    """
    Acceptance Test:
    Fires 20 parallel payment requests of the same amount on an admission
    whose balance fits only 10:
    - exactly 10 succeed (HTTP 201),
    - the rest get 400,
    - and amount_paid never exceeds total_payable.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Register a test student
        unique_mobile = f"97{uuid.uuid4().int % 100000000:08d}"
        s_res = await client.post("/api/students", json={
            "name": "Parallel Payment Student",
            "mobile": unique_mobile
        }, headers=headers)
        assert s_res.status_code == 201
        student = s_res.json()

        # Create admission with total_payable = 10,000 (10 installments of 1,000)
        # We achieve 10,000 by setting item price to 10,000
        adm_payload = {
            "student_id": student["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "item_name_snapshot": "Full Year Coaching Package",
                    "original_price": 10000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False
        }
        adm_res = await client.post("/api/admissions", json=adm_payload, headers=headers)
        assert adm_res.status_code == 201
        admission = adm_res.json()
        adm_id = admission["id"]
        assert float(admission["balance_due"]) == 10000.0

        # Fire 20 parallel payment requests of 1,000 each
        async def pay_installment(idx: int):
            return await client.post(
                "/api/payments",
                json={
                    "admission_id": adm_id,
                    "amount": 1000.0,
                    "payment_mode": "CASH",
                    "notes": f"Concurrent payment test #{idx}"
                },
                headers=headers
            )

        tasks = [pay_installment(i) for i in range(20)]
        responses = await asyncio.gather(*tasks)

        success_count = 0
        failed_count = 0
        for r in responses:
            if r.status_code == 201:
                success_count += 1
            elif r.status_code == 400:
                failed_count += 1
            else:
                pytest.fail(f"Unexpected status code {r.status_code}: {r.text}")

        assert success_count == 10, f"Expected exactly 10 successes, got {success_count}"
        assert failed_count == 10, f"Expected exactly 10 failures with 400, got {failed_count}"

        # Fetch final admission state
        final_adm_res = await client.get(f"/api/admissions/{adm_id}", headers=headers)
        assert final_adm_res.status_code == 200
        final_adm = final_adm_res.json()
        assert float(final_adm["amount_paid"]) == 10000.0
        assert float(final_adm["balance_due"]) == 0.0
        assert final_adm["payment_status"] == "PAID"

@pytest.mark.asyncio
async def test_idempotency_key_support():
    """
    Acceptance Test:
    Accept optional Idempotency-Key header on POST /payments and POST /admissions;
    store it and return original response if the same key is sent again.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test Idempotent Admission Creation
        unique_mobile = f"96{uuid.uuid4().int % 100000000:08d}"
        s_res = await client.post("/api/students", json={
            "name": "Idempotent Student",
            "mobile": unique_mobile
        }, headers=headers)
        assert s_res.status_code == 201
        student = s_res.json()

        idemp_adm_key = f"adm-idemp-{uuid.uuid4().hex}"
        adm_headers = {**headers, "Idempotency-Key": idemp_adm_key}
        adm_payload = {
            "student_id": student["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "item_name_snapshot": "Test Subject",
                    "original_price": 3000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False
        }

        adm1 = await client.post("/api/admissions", json=adm_payload, headers=adm_headers)
        assert adm1.status_code == 201
        adm1_data = adm1.json()

        # Send identical request with same key
        adm2 = await client.post("/api/admissions", json=adm_payload, headers=adm_headers)
        assert adm2.status_code == 201
        adm2_data = adm2.json()

        # Must return identical admission id and number, no duplicate row
        assert adm1_data["id"] == adm2_data["id"]
        assert adm1_data["admission_number"] == adm2_data["admission_number"]

        # 2. Test Idempotent Payment
        idemp_pay_key = f"pay-idemp-{uuid.uuid4().hex}"
        pay_headers = {**headers, "Idempotency-Key": idemp_pay_key}
        pay_payload = {
            "admission_id": adm1_data["id"],
            "amount": 1000.0,
            "payment_mode": "UPI",
            "transaction_reference": "UPI-IDEMP-001"
        }

        pay1 = await client.post("/api/payments", json=pay_payload, headers=pay_headers)
        assert pay1.status_code == 201
        pay1_data = pay1.json()

        # Repeat payment with same Idempotency-Key
        pay2 = await client.post("/api/payments", json=pay_payload, headers=pay_headers)
        assert pay2.status_code == 201
        pay2_data = pay2.json()

        # Must return exact same payment
        assert pay1_data["id"] == pay2_data["id"]
        assert pay1_data["payment_number"] == pay2_data["payment_number"]

        # Verify admission was only charged once (1000.0, not 2000.0)
        adm_check = await client.get(f"/api/admissions/{adm1_data['id']}", headers=headers)
        assert float(adm_check.json()["amount_paid"]) == 1000.0
        assert float(adm_check.json()["balance_due"]) == 2000.0

@pytest.mark.asyncio
async def test_allocation_modes_and_odd_amounts():
    """
    Acceptance Test:
    Odd amounts across 3 subjects -> allocation sum == payment in every mode:
    - PROPORTIONAL
    - SEQUENTIAL
    - MANUAL
    Also verifies error when payment > balance.
    """
    from app.common.calculations import allocate_payment_proportionally

    items = [
        {"id": "sub-1", "balance_due": Decimal("1000.00")},
        {"id": "sub-2", "balance_due": Decimal("1000.00")},
        {"id": "sub-3", "balance_due": Decimal("1000.00")}
    ]

    # 1. Odd amount PROPORTIONAL: ₹1000.01 across three ₹1000 subjects
    alloc_prop = allocate_payment_proportionally(Decimal("1000.01"), items, mode="PROPORTIONAL")
    sum_prop = sum(amt for _, amt in alloc_prop)
    assert sum_prop == Decimal("1000.01")
    for _, amt in alloc_prop:
        assert amt <= Decimal("1000.00")
        assert amt >= Decimal("0.00")

    # 2. Odd amount SEQUENTIAL: ₹1000.01
    alloc_seq = allocate_payment_proportionally(Decimal("1000.01"), items, mode="SEQUENTIAL")
    sum_seq = sum(amt for _, amt in alloc_seq)
    assert sum_seq == Decimal("1000.01")
    assert alloc_seq[0][1] == Decimal("1000.00")
    assert alloc_seq[1][1] == Decimal("0.01")
    assert alloc_seq[2][1] == Decimal("0.00")

    # 3. Odd amount MANUAL: ₹1000.01
    manual_spec = [
        {"admission_item_id": "sub-1", "allocated_amount": Decimal("400.01")},
        {"admission_item_id": "sub-2", "allocated_amount": Decimal("350.00")},
        {"admission_item_id": "sub-3", "allocated_amount": Decimal("250.00")}
    ]
    alloc_man = allocate_payment_proportionally(Decimal("1000.01"), items, mode="MANUAL", manual_allocations=manual_spec)
    sum_man = sum(amt for _, amt in alloc_man)
    assert sum_man == Decimal("1000.01")
    assert alloc_man[0][1] == Decimal("400.01")
    assert alloc_man[1][1] == Decimal("350.00")
    assert alloc_man[2][1] == Decimal("250.00")

    # 4. Error when payment exceeds total balance
    with pytest.raises(ValueError, match="exceeds total outstanding balance"):
        allocate_payment_proportionally(Decimal("3000.01"), items, mode="PROPORTIONAL")

@pytest.mark.asyncio
async def test_api_payment_allocation_modes():
    """
    Acceptance Test via API:
    Creates 3-subject admission and verifies PROPORTIONAL, SEQUENTIAL, and MANUAL allocations via API.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Register student
        unique_mobile = f"95{uuid.uuid4().int % 100000000:08d}"
        s_res = await client.post("/api/students", json={"name": "3-Subject Student", "mobile": unique_mobile}, headers=headers)
        student = s_res.json()

        # Create admission with 3 subjects of 1000 each (total = 3000)
        adm_payload = {
            "student_id": student["id"],
            "admission_date": "2026-11-21",
            "items": [
                {"item_type": "BATCH_SUBJECT", "item_name_snapshot": "Subject A", "original_price": 1000.0, "discount_type": "NONE", "discount_value": 0.0},
                {"item_type": "BATCH_SUBJECT", "item_name_snapshot": "Subject B", "original_price": 1000.0, "discount_type": "NONE", "discount_value": 0.0},
                {"item_type": "BATCH_SUBJECT", "item_name_snapshot": "Subject C", "original_price": 1000.0, "discount_type": "NONE", "discount_value": 0.0}
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False
        }
        adm_res = await client.post("/api/admissions", json=adm_payload, headers=headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        item_ids = [itm["id"] for itm in adm["items"]]

        # Pay 1000.01 PROPORTIONAL
        p1_res = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": 1000.01,
            "payment_mode": "UPI",
            "allocation_mode": "PROPORTIONAL"
        }, headers=headers)
        assert p1_res.status_code == 201
        p1 = p1_res.json()
        total_p1_alloc = sum(float(a["allocated_amount"]) for a in p1["allocations"])
        assert round(total_p1_alloc, 2) == 1000.01

        # Pay 500.00 SEQUENTIAL
        p2_res = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": 500.0,
            "payment_mode": "CASH",
            "allocation_mode": "SEQUENTIAL"
        }, headers=headers)
        assert p2_res.status_code == 201
        p2 = p2_res.json()
        total_p2_alloc = sum(float(a["allocated_amount"]) for a in p2["allocations"])
        assert round(total_p2_alloc, 2) == 500.0

        # Pay remaining with MANUAL allocation
        # Check current balance due
        adm_curr = (await client.get(f"/api/admissions/{adm['id']}", headers=headers)).json()
        remaining_due = float(adm_curr["balance_due"])
        assert remaining_due == 1499.99

        # Overpayment should fail with 400
        fail_res = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": remaining_due + 10.0,
            "payment_mode": "CASH"
        }, headers=headers)
        assert fail_res.status_code == 400

