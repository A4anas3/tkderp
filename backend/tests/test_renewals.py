import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.daily_jobs import run_daily_expiration_job
from app.database.session import AsyncSessionLocal


@pytest.mark.asyncio
async def test_renew_twice_for_same_dates_409():
    """
    Acceptance Test 1: Renew twice for the same dates -> 409 Conflict.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Overlap Renewal Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        # Get batch & subject
        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]
        std_fee = float(sub["fee"])

        # Enroll in initial subject period: 2026-10-01 to 2026-10-31
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-10-01",
            "valid_from": "2026-10-01",
            "valid_to": "2026-10-31",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": std_fee,
                    "valid_from": "2026-10-01",
                    "valid_to": "2026-10-31"
                }
            ]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        initial_item = adm_res.json()["items"][0]

        # First renewal for 2026-11-01 to 2026-11-30 -> 201 Created (using standard fee)
        renew1_res = await client.post(f"/api/admissions/items/{initial_item['id']}/renew", json={
            "valid_from": "2026-11-01",
            "valid_to": "2026-11-30"
        }, headers=admin_headers)
        assert renew1_res.status_code == 201
        renewed_item = renew1_res.json()["items"][0]
        assert renewed_item["renewed_from_item_id"] == initial_item["id"]
        assert renewed_item["renewal_count"] == 1

        # Second renewal for overlapping dates (e.g. 2026-11-15 to 2026-12-14) -> 409 Conflict
        renew2_res = await client.post(f"/api/admissions/items/{initial_item['id']}/renew", json={
            "valid_from": "2026-11-15",
            "valid_to": "2026-12-14"
        }, headers=admin_headers)
        assert renew2_res.status_code == 409
        assert "overlapping active enrollment" in renew2_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_renew_three_subjects_partial_payment_allocations():
    """
    Acceptance Test 2: Renew three subjects at once with one partial payment ->
    allocations sum strictly to payment, ledger remains consistent.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Multi Renewal Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        # Get subjects
        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subjects = subj_res.json()["items"]
        assert len(subjects) >= 3

        # Enroll in 3 subjects with 1000 each
        items = [
            {
                "item_type": "BATCH_SUBJECT",
                "subject_id": subjects[i]["id"],
                "item_name_snapshot": subjects[i]["name"],
                "original_price": 1000.0,
                "valid_from": "2026-09-01",
                "valid_to": "2026-09-30"
            }
            for i in range(3)
        ]
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-09-01",
            "items": items
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        init_items = adm_data["items"]
        assert len(init_items) == 3

        # Renew all 3 subjects on ONE slip with a partial payment of ₹1000.01
        renew_res = await client.post(
            f"/api/admissions/items/{init_items[0]['id']}/renew",
            json={
                "additional_item_ids": [init_items[1]["id"], init_items[2]["id"]],
                "valid_from": "2026-10-01",
                "valid_to": "2026-10-31",
                "fee": 1000.0,
                "price_override_reason": "Bundled package renewal",
                "initial_payment": {
                    "amount": 1000.01,
                    "payment_mode": "UPI",
                    "allocation_mode": "PROPORTIONAL",
                    "transaction_reference": "UPI-RENEW-123"
                }
            },
            headers=admin_headers
        )
        assert renew_res.status_code == 201
        renewed_adm = renew_res.json()
        assert len(renewed_adm["items"]) == 3
        assert Decimal(str(renewed_adm["total_payable"])) == Decimal("3000.00")
        assert Decimal(str(renewed_adm["amount_paid"])) == Decimal("1000.01")
        assert Decimal(str(renewed_adm["balance_due"])) == Decimal("1999.99")
        assert renewed_adm["payment_status"] == "PARTIALLY_PAID"

        # Check allocations sum
        alloc_sum = sum(Decimal(str(itm["amount_collected"])) for itm in renewed_adm["items"])
        assert alloc_sum == Decimal("1000.01")

        # Check renewal links
        for i in range(3):
            assert renewed_adm["items"][i]["renewed_from_item_id"] == init_items[i]["id"]
            assert renewed_adm["items"][i]["renewal_count"] == 1


@pytest.mark.asyncio
async def test_renewal_chain_visible():
    """
    Acceptance Test 3: Renewal chain visible via renewed_from_item_id and renewal_count.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Chain Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        std_fee = float(subj["default_fee"])

        # Initial enrollment (period 1: Jan 1 to Jan 31)
        adm1 = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-01-01",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": std_fee,
                "valid_from": "2026-01-01",
                "valid_to": "2026-01-31"
            }]
        }, headers=admin_headers)
        item1 = adm1.json()["items"][0]
        assert item1["renewed_from_item_id"] is None
        assert item1["renewal_count"] == 0

        # Renewal 1 (period 2: Feb 1 to Feb 28)
        adm2 = await client.post(f"/api/admissions/items/{item1['id']}/renew", json={
            "valid_from": "2026-02-01",
            "valid_to": "2026-02-28"
        }, headers=admin_headers)
        item2 = adm2.json()["items"][0]
        assert item2["renewed_from_item_id"] == item1["id"]
        assert item2["renewal_count"] == 1

        # Renewal 2 (period 3: Mar 1 to Mar 31)
        adm3 = await client.post(f"/api/admissions/items/{item2['id']}/renew", json={
            "valid_from": "2026-03-01",
            "valid_to": "2026-03-31"
        }, headers=admin_headers)
        item3 = adm3.json()["items"][0]
        assert item3["renewed_from_item_id"] == item2["id"]
        assert item3["renewal_count"] == 2


@pytest.mark.asyncio
async def test_discontinued_item_renewal_rejected():
    """
    Acceptance Test 4: Renewal of a DISCONTINUED item is rejected with a clear message.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Discontinued Renewal Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        std_fee = float(subj["default_fee"])

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-05-01",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": std_fee,
                "valid_from": "2026-05-01",
                "valid_to": "2026-05-31"
            }]
        }, headers=admin_headers)
        adm = adm_res.json()
        item = adm["items"][0]

        # Cancel/revoke the item via individual course cancel
        disc_res = await client.post(
            f"/api/admissions/{adm['id']}/revoke",
            json={
                "reason": "Student relocated",
                "scope": "SELECTED_ITEMS",
                "item_ids": [item["id"]],
                "pending_due_action": "WAIVE"
            },
            headers=admin_headers
        )
        assert disc_res.status_code == 200
        assert disc_res.json()["items"][0]["status"] == "DISCONTINUED"

        # Attempt renewal via /items/{id}/renew
        renew_res = await client.post(f"/api/admissions/items/{item['id']}/renew", json={
            "valid_from": "2026-06-01",
            "valid_to": "2026-06-30"
        }, headers=admin_headers)
        assert renew_res.status_code == 400
        assert "cannot renew discontinued subject line" in renew_res.json()["detail"].lower()

        # Attempt renewal via legacy /renew-subject
        legacy_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": st["id"],
            "subject_id": subj["id"],
            "valid_from": "2026-06-01",
            "valid_to": "2026-06-30"
        }, headers=admin_headers)
        assert legacy_res.status_code == 400
        assert "cannot renew discontinued subject line" in legacy_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_price_override_requires_reason():
    """
    Test: Cashier override of default fee requires price_override_reason.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Override Price Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        std_fee = float(subj["default_fee"])

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-04-01",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": std_fee,
                "valid_from": "2026-04-01",
                "valid_to": "2026-04-30"
            }]
        }, headers=admin_headers)
        item = adm_res.json()["items"][0]

        # Override price without reason -> 400
        res_no_reason = await client.post(f"/api/admissions/items/{item['id']}/renew", json={
            "valid_from": "2026-05-01",
            "valid_to": "2026-05-31",
            "fee": std_fee + 200.0
        }, headers=admin_headers)
        assert res_no_reason.status_code == 400
        assert "price override reason is required" in res_no_reason.json()["detail"].lower()

        # Override price with reason -> 201
        res_with_reason = await client.post(f"/api/admissions/items/{item['id']}/renew", json={
            "valid_from": "2026-05-01",
            "valid_to": "2026-05-31",
            "fee": std_fee + 200.0,
            "price_override_reason": "Special advanced coaching fee agreed with principal"
        }, headers=admin_headers)
        assert res_with_reason.status_code == 201
        renewed = res_with_reason.json()["items"][0]
        assert renewed["price_override_reason"] == "Special advanced coaching fee agreed with principal"
        assert Decimal(str(renewed["original_price"])) == Decimal(str(std_fee + 200.0))


@pytest.mark.asyncio
async def test_renewals_due_and_report():
    """
    Test: Renewals due endpoints (student and admissions) and renewal rate report.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        today = date.today()
        # Item expiring in 3 days
        exp_date = today + timedelta(days=3)

        st_res = await client.post("/api/students", json={
            "name": "Due Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        std_fee = float(subj["default_fee"])

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": str(today - timedelta(days=27)),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": std_fee,
                "valid_from": str(today - timedelta(days=27)),
                "valid_to": str(exp_date)
            }]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        created_item = adm_res.json()["items"][0]

        # 1. Student renewals due
        stu_due_res = await client.get(f"/api/students/{st['id']}/renewals-due?days=7", headers=admin_headers)
        assert stu_due_res.status_code == 200
        due_items = stu_due_res.json()
        target = next((d for d in due_items if d["item_id"] == created_item["id"]), None)
        assert target is not None
        assert target["student_mobile"] == st["mobile"]
        assert target["renewed"] is False
        assert target["days_remaining"] == 3

        # 2. Admissions renewals due
        adm_due_res = await client.get(f"/api/admissions/renewals-due?days=7&subject_id={subj['id']}", headers=admin_headers)
        assert adm_due_res.status_code == 200
        adm_due_items = adm_due_res.json()
        adm_target = next((d for d in adm_due_items if d["item_id"] == created_item["id"]), None)
        assert adm_target is not None

        # Renew the item
        renew_res = await client.post(f"/api/admissions/items/{created_item['id']}/renew", json={
            "valid_from": str(exp_date + timedelta(days=1)),
            "valid_to": str(exp_date + timedelta(days=30))
        }, headers=admin_headers)
        assert renew_res.status_code == 201

        # Now check student renewals-due: renewed should be True
        stu_due_res2 = await client.get(f"/api/students/{st['id']}/renewals-due?days=7", headers=admin_headers)
        due_items2 = stu_due_res2.json()
        target2 = next((d for d in due_items2 if d["item_id"] == created_item["id"]), None)
        assert target2 is not None
        assert target2["renewed"] is True

        # 3. Renewal rate report
        rpt_res = await client.get(
            f"/api/reports/renewal-rate?from_date={today - timedelta(days=30)}&to_date={today + timedelta(days=30)}&subject_id={subj['id']}",
            headers=admin_headers
        )
        assert rpt_res.status_code == 200
        rpt = rpt_res.json()
        assert "summary" in rpt
        assert "by_subject" in rpt
        assert rpt["summary"]["total_expired"] >= 1
        assert rpt["summary"]["total_renewed"] >= 1


@pytest.mark.asyncio
async def test_daily_expiration_job_flips_status():
    """
    Test: Auto-status daily job flips expired items to EXPIRED the day after valid_to.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        today = date.today()
        # Expired yesterday
        exp_yesterday = today - timedelta(days=1)

        st_res = await client.post("/api/students", json={
            "name": "Expire Job Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        subj_res = await client.get("/api/subjects", headers=admin_headers)
        subj = subj_res.json()["items"][0]
        std_fee = float(subj["default_fee"])

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": str(today - timedelta(days=31)),
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subj["id"],
                "item_name_snapshot": subj["name"],
                "original_price": std_fee,
                "valid_from": str(today - timedelta(days=31)),
                "valid_to": str(exp_yesterday)
            }]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        item_id = adm_res.json()["items"][0]["id"]
        adm_id = adm_res.json()["id"]

        # Run daily job
        async with AsyncSessionLocal() as session:
            summary = await run_daily_expiration_job(session, run_date=today)
            assert summary["expired_items_count"] >= 1

        # Check item status is now EXPIRED
        adm_check = await client.get(f"/api/admissions/{adm_id}", headers=admin_headers)
        assert adm_check.status_code == 200
        checked_item = next(i for i in adm_check.json()["items"] if i["id"] == item_id)
        assert checked_item["status"] == "EXPIRED"
        assert checked_item["access_status"] == "EXPIRED"
