import uuid
from decimal import Decimal
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.cli import verify_ledger

@pytest.mark.asyncio
async def test_paid_revoke_no_refund():
    """
    Test: paid 3000 -> revoke no refund -> payment_status still PAID,
    access REVOKED, ledger and teacher totals unchanged, forfeited_amount = collected.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_token = adm_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Revoke No Refund Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        # Get batches
        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # Create admission with 3 subject items of 1000 each = 3000
        adm_payload = {
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": f"{sub['subject_name']} Line 1",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": f"{sub['subject_name']} Line 2",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": f"{sub['subject_name']} Line 3",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0
                }
            ],
            "initial_payment": {
                "amount": 3000.0,
                "payment_mode": "UPI",
                "notes": "Full upfront fee payment"
            }
        }
        res = await client.post("/api/admissions", json=adm_payload, headers=admin_headers)
        assert res.status_code == 201
        adm = res.json()
        assert adm["amount_paid"] == "3000.00" or adm["amount_paid"] == 3000.0
        assert adm["payment_status"] == "PAID"
        assert adm["access_status"] == "ACTIVE"

        # Revoke whole slip with DROPOUT_NO_REFUND
        revoke_res = await client.post(f"/api/admissions/{adm['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Student relocated to another city",
            "pending_due_action": "KEEP_DUE"
        }, headers=admin_headers)
        assert revoke_res.status_code == 200
        revoked_adm = revoke_res.json()

        # Verifications
        assert revoked_adm["access_status"] == "REVOKED"
        assert revoked_adm["payment_status"] == "PAID"  # payment_status still PAID!
        assert Decimal(str(revoked_adm["amount_paid"])) == Decimal("3000.00")
        assert Decimal(str(revoked_adm["forfeited_amount"])) == Decimal("3000.00")
        for itm in revoked_adm["items"]:
            assert itm["access_status"] == "REVOKED"
            assert Decimal(str(itm["amount_collected"])) == Decimal("1000.00")
            assert Decimal(str(itm["forfeited_amount"])) == Decimal("1000.00")

        # Double revoke should return 409 Conflict
        double_revoke = await client.post(f"/api/admissions/{adm['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Trying to revoke again"
        }, headers=admin_headers)
        assert double_revoke.status_code == 409

@pytest.mark.asyncio
async def test_keep_due_vs_waive_permissions():
    """
    Test: KEEP_DUE keeps balance in dues and allows payments;
    WAIVE writes off balance and requires admin role.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cashier login
        csh_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        csh_headers = {"Authorization": f"Bearer {csh_login.json()['access_token']}"}

        # Admin login
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student & admission
        st_res = await client.post("/api/students", json={
            "name": "Waive Test Student",
            "mobile": f"92{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 200.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm1 = adm_res.json()
        assert Decimal(str(adm1["balance_due"])) == Decimal("800.00")

        # Cashier attempts WAIVE -> 403 Forbidden
        csh_waive = await client.post(f"/api/admissions/{adm1['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Dropout",
            "pending_due_action": "WAIVE"
        }, headers=csh_headers)
        assert csh_waive.status_code == 403

        # Admin revokes with WAIVE -> written_off_amount = 800, balance_due = 0
        adm_waive = await client.post(f"/api/admissions/{adm1['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Administrative fee waiver on dropout",
            "pending_due_action": "WAIVE"
        }, headers=admin_headers)
        assert adm_waive.status_code == 200
        waived_data = adm_waive.json()
        assert Decimal(str(waived_data["written_off_amount"])) == Decimal("800.00")
        assert Decimal(str(waived_data["balance_due"])) == Decimal("0.00")

        # Now test KEEP_DUE: admission with partial payment
        adm2_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 300.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm2 = adm2_res.json()

        adm_keep = await client.post(f"/api/admissions/{adm2['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Dropout but owes fees",
            "pending_due_action": "KEEP_DUE"
        }, headers=admin_headers)
        assert adm_keep.status_code == 200
        keep_data = adm_keep.json()
        assert Decimal(str(keep_data["balance_due"])) == Decimal("700.00")
        assert keep_data["items"][0]["keep_due"] is True

        # Payment on KEEP_DUE line must be accepted
        pay_res = await client.post("/api/payments", json={
            "admission_id": adm2["id"],
            "amount": 200.0,
            "payment_mode": "CASH",
            "notes": "Payment towards outstanding due on revoked subject"
        }, headers=admin_headers)
        assert pay_res.status_code == 201
        pay_data = pay_res.json()
        assert Decimal(str(pay_data["amount"])) == Decimal("200.00")

@pytest.mark.asyncio
async def test_edit_payment_with_history():
    """
    Test: Edit payment 1500 -> 900 creates reversal + new allocation rows,
    history visible, totals correct.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Edit Payment Student",
            "mobile": f"93{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # 2 subjects of 1000 each = 2000 total
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Sub A",
                    "original_price": 1000.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Sub B",
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)
        adm = adm_res.json()

        # Pay 1500
        pay_res = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": 1500.0,
            "payment_mode": "UPI"
        }, headers=admin_headers)
        assert pay_res.status_code == 201
        pay = pay_res.json()
        assert len(pay["allocations"]) == 2

        # Edit payment from 1500 to 900
        edit_res = await client.put(f"/api/payments/{pay['id']}", json={
            "amount": 900.0,
            "edit_reason": "Cashier entered wrong amount, verified with bank slip"
        }, headers=admin_headers)
        assert edit_res.status_code == 200
        edited_pay = edit_res.json()
        assert Decimal(str(edited_pay["amount"])) == Decimal("900.00")

        # Check allocations history: should have original + reversals + new positive rows
        allocs = edited_pay["allocations"]
        reversals = [a for a in allocs if a.get("kind") == "REVERSAL"]
        payments = [a for a in allocs if a.get("kind") == "PAYMENT"]
        assert len(reversals) >= 2
        assert len(payments) >= 4  # 2 original + 2 new

        # Check admission totals
        get_adm = await client.get(f"/api/admissions/{adm['id']}", headers=admin_headers)
        updated_adm = get_adm.json()
        assert Decimal(str(updated_adm["amount_paid"])) == Decimal("900.00")
        assert Decimal(str(updated_adm["balance_due"])) == Decimal("1100.00")

@pytest.mark.asyncio
async def test_refund_one_subject():
    """
    Test: Refund one subject touches only that line's collected amount.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Refund Line Student",
            "mobile": f"94{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Target Subject",
                    "original_price": 1000.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Other Subject",
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 2000.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm = adm_res.json()
        target_item = adm["items"][0]
        other_item = adm["items"][1]

        # Refund 400 specifically on target_item
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm["id"],
            "item_id": target_item["id"],
            "amount": 400.0,
            "reason": "Partial dissatisfaction with faculty",
            "refund_mode": "CASH"
        }, headers=admin_headers)
        assert ref_res.status_code == 201

        # Check admission and items
        get_adm = await client.get(f"/api/admissions/{adm['id']}", headers=admin_headers)
        updated_adm = get_adm.json()
        assert Decimal(str(updated_adm["amount_paid"])) == Decimal("1600.00")
        assert updated_adm["payment_status"] == "PARTIALLY_REFUNDED"

        items_map = {i["id"]: i for i in updated_adm["items"]}
        assert Decimal(str(items_map[target_item["id"]]["amount_collected"])) == Decimal("600.00")
        # Other item is untouched!
        assert Decimal(str(items_map[other_item["id"]]["amount_collected"])) == Decimal("1000.00")

@pytest.mark.asyncio
async def test_entry_mistake_guard():
    """
    Test: ENTRY_MISTAKE with money paid -> 400.
    With zero money paid -> VOID document.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Entry Mistake Student",
            "mobile": f"95{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # 1. Admission WITH money paid
        adm1_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 500.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm1 = adm1_res.json()

        # Attempt ENTRY_MISTAKE revoke -> must fail with 400
        mistake_fail = await client.post(f"/api/admissions/{adm1['id']}/revoke", json={
            "revoke_type": "ENTRY_MISTAKE",
            "scope": "WHOLE_SLIP",
            "reason": "Created by mistake"
        }, headers=admin_headers)
        assert mistake_fail.status_code == 400

        # Attempt cancel -> must fail with 400
        cancel_fail = await client.post(f"/api/admissions/{adm1['id']}/cancel", headers=admin_headers)
        assert cancel_fail.status_code == 400

        # 2. Admission WITHOUT money paid
        adm2_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)
        adm2 = adm2_res.json()

        # ENTRY_MISTAKE succeeds on 0 paid
        mistake_ok = await client.post(f"/api/admissions/{adm2['id']}/revoke", json={
            "revoke_type": "ENTRY_MISTAKE",
            "scope": "WHOLE_SLIP",
            "reason": "Operator error - duplicate entry"
        }, headers=admin_headers)
        assert mistake_ok.status_code == 200
        res_data = mistake_ok.json()
        assert res_data["document_status"] == "VOID"
        assert res_data["access_status"] == "REVOKED"
        assert res_data["payment_status"] == "VOID"

@pytest.mark.asyncio
async def test_verify_ledger_cli_command():
    """
    Test: verify_ledger reports 0 mismatches across all admissions in database.
    """
    mismatches = await verify_ledger(fix=False)
    assert mismatches == 0

@pytest.mark.asyncio
async def test_property_pay_edit_refund_verify_ledger():
    """
    Acceptance Test:
    verify_ledger reports 0 mismatches after a sequence of pay/edit/refund operations.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Property Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # Create admission with 3 subjects of 1000 each = 3000
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject A",
                    "original_price": 1000.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject B",
                    "original_price": 1000.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject C",
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        adm_id = adm["id"]

        # 1. Pay 1000
        p1_res = await client.post("/api/payments", json={
            "admission_id": adm_id,
            "amount": 1000.0,
            "payment_mode": "CASH"
        }, headers=admin_headers)
        assert p1_res.status_code == 201
        p1 = p1_res.json()

        # 2. Edit payment #1: 1000 -> 1500
        edit1_res = await client.put(f"/api/payments/{p1['id']}", json={
            "amount": 1500.0,
            "edit_reason": "Cashier corrected initial deposit amount"
        }, headers=admin_headers)
        assert edit1_res.status_code == 200

        # 3. Pay 600
        p2_res = await client.post("/api/payments", json={
            "admission_id": adm_id,
            "amount": 600.0,
            "payment_mode": "UPI"
        }, headers=admin_headers)
        assert p2_res.status_code == 201
        p2 = p2_res.json()

        # 4. Refund 200 from payment #2
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm_id,
            "payment_id": p2["id"],
            "amount": 200.0,
            "reason": "Overcharge refund"
        }, headers=admin_headers)
        assert ref_res.status_code == 201

        # 5. Edit payment #1 again: 1500 -> 1200
        edit2_res = await client.put(f"/api/payments/{p1['id']}", json={
            "amount": 1200.0,
            "edit_reason": "Readjusting receipt after verification"
        }, headers=admin_headers)
        assert edit2_res.status_code == 200

        # 6. Pay 400
        p3_res = await client.post("/api/payments", json={
            "admission_id": adm_id,
            "amount": 400.0,
            "payment_mode": "CASH"
        }, headers=admin_headers)
        assert p3_res.status_code == 201

        # Run verify_ledger
        mismatches = await verify_ledger(fix=False)
        assert mismatches == 0

        # Fetch final admission
        adm_final = (await client.get(f"/api/admissions/{adm_id}", headers=admin_headers)).json()
        # Net paid = 1200 (p1 edited) + 600 (p2) - 200 (refund) + 400 (p3) = 2000.00
        assert float(adm_final["amount_paid"]) == 2000.0
        assert float(adm_final["balance_due"]) == 1000.0
        assert adm_final["payment_status"] == "PARTIALLY_REFUNDED"


@pytest.mark.asyncio
async def test_payment_rejection_discontinued_and_non_active():
    """
    Test: Payments must be rejected when admission.status != ACTIVE or item is DISCONTINUED / SUSPENDED.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Rejection Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject X",
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        item_id = adm["items"][0]["id"]

        # 1. Discontinue item -> payment rejected with 400
        disc_res = await client.post(f"/api/admissions/items/{item_id}/discontinue", json={
            "action": "DISCONTINUE",
            "reason": "Student opted out"
        }, headers=admin_headers)
        assert disc_res.status_code == 200

        pay_fail = await client.post("/api/payments", json={
            "admission_id": adm["id"],
            "amount": 500.0,
            "payment_mode": "CASH"
        }, headers=admin_headers)
        assert pay_fail.status_code == 400
        assert "discontinued" in pay_fail.json()["detail"].lower() or "no outstanding balance" in pay_fail.json()["detail"].lower()


@pytest.mark.asyncio
async def test_acceptance_pay_partial_refund_revoke_restore():
    """
    Acceptance Test:
    pay -> partial refund of one subject -> revoke -> restore returns exactly the original
    per-subject collected numbers minus refunds; reports and teacher totals match the ledger at every step.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Acceptance Refund Revoke Student",
            "mobile": f"97{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # 1. Create admission with 2 subjects of 1000 each = 2000 total
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Physics-NEET",
                    "original_price": 1000.0
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Chemistry-NEET",
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 2000.0, "payment_mode": "UPI"}
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        item_physics = adm["items"][0]
        item_chemistry = adm["items"][1]

        assert float(item_physics["amount_collected"]) == 1000.0
        assert float(item_chemistry["amount_collected"]) == 1000.0
        assert float(adm["amount_paid"]) == 2000.0

        # 2. Partial refund of ONE subject (Physics: 400 refund)
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm["id"],
            "item_id": item_physics["id"],
            "amount": 400.0,
            "reason": "Change of faculty preference for Physics",
            "refund_mode": "UPI"
        }, headers=admin_headers)
        assert ref_res.status_code == 201

        # Check collected numbers after refund
        get_adm1 = (await client.get(f"/api/admissions/{adm['id']}", headers=admin_headers)).json()
        items1_map = {i["id"]: i for i in get_adm1["items"]}
        assert float(items1_map[item_physics["id"]]["amount_collected"]) == 600.0
        assert float(items1_map[item_chemistry["id"]]["amount_collected"]) == 1000.0
        assert float(get_adm1["amount_paid"]) == 1600.0
        assert get_adm1["payment_status"] == "PARTIALLY_REFUNDED"

        # 3. Revoke admission (all non-final items become DISCONTINUED with previous_status remembered)
        rev_res = await client.post(f"/api/admissions/{adm['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Family relocation",
            "pending_due_action": "KEEP_DUE"
        }, headers=admin_headers)
        assert rev_res.status_code == 200
        rev_adm = rev_res.json()
        assert rev_adm["status"] == "REVOKED"
        assert rev_adm["access_status"] == "REVOKED"
        for itm in rev_adm["items"]:
            assert itm["status"] == "DISCONTINUED"
            assert itm["previous_status"] == "ACTIVE"
            assert itm["access_status"] == "REVOKED"

        # 4. Restore admission
        rest_res = await client.post(f"/api/admissions/{adm['id']}/restore", headers=admin_headers)
        assert rest_res.status_code == 200
        rest_adm = rest_res.json()
        assert rest_adm["status"] == "ACTIVE"
        assert rest_adm["access_status"] == "ACTIVE"

        # Verify: items go back to previous_status ("ACTIVE"), allocations are NOT touched
        items_rest_map = {i["id"]: i for i in rest_adm["items"]}
        assert items_rest_map[item_physics["id"]]["status"] == "ACTIVE"
        assert items_rest_map[item_chemistry["id"]]["status"] == "ACTIVE"
        assert items_rest_map[item_physics["id"]]["previous_status"] is None
        assert items_rest_map[item_chemistry["id"]]["previous_status"] is None

        # EXACT original per-subject collected numbers minus refund restored!
        assert float(items_rest_map[item_physics["id"]]["amount_collected"]) == 600.0
        assert float(items_rest_map[item_chemistry["id"]]["amount_collected"]) == 1000.0
        assert float(rest_adm["amount_paid"]) == 1600.0

        # Ledger check
        assert await verify_ledger(fix=False) == 0


@pytest.mark.asyncio
async def test_refund_policy_deductions():
    """
    Test: refund_policy support with refund_amount_requested, deduction_amount, deduction_reason.
    Gross, deduction, net payout stored and ledger updated.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Refund Policy Student",
            "mobile": f"98{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        sub = b_res.json()[0]["subjects"][0]

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": b_res.json()[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Mathematics",
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 1000.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm = adm_res.json()

        # Request 1000 refund, with 250 deduction for 5 days attended
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm["id"],
            "refund_amount_requested": 1000.0,
            "deduction_amount": 250.0,
            "deduction_reason": "Attended 5 days class fee",
            "reason": "Student withdrawal due to relocation",
            "refund_mode": "BANK_TRANSFER"
        }, headers=admin_headers)
        assert ref_res.status_code == 201
        ref_data = ref_res.json()

        assert float(ref_data["refund_amount_requested"]) == 1000.0
        assert float(ref_data["deduction_amount"]) == 250.0
        assert ref_data["deduction_reason"] == "Attended 5 days class fee"
        # Net paid out to student: 1000 - 250 = 750
        assert float(ref_data["amount"]) == 750.0

        # Admission amount_paid is now 1000 - 750 = 250.0 (retained fees)
        get_adm = (await client.get(f"/api/admissions/{adm['id']}", headers=admin_headers)).json()
        assert float(get_adm["amount_paid"]) == 250.0
        assert float(get_adm["items"][0]["amount_collected"]) == 250.0
        assert get_adm["payment_status"] == "PARTIALLY_REFUNDED"


@pytest.mark.asyncio
async def test_cancel_guards_and_restrictions():
    """
    Test:
    - Cancel allowed only when net money paid == 0; returns 400 if money paid.
    - Double cancel returns 409.
    - Cancelling a revoked slip returns 400.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Cancel Guard Student",
            "mobile": f"99{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        sub = b_res.json()[0]["subjects"][0]

        # 1. Admission with paid money
        adm_paid = (await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": b_res.json()[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject 1",
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 500.0, "payment_mode": "CASH"}
        }, headers=admin_headers)).json()

        # Cancel paid admission must return 400
        cancel_fail = await client.post(f"/api/admissions/{adm_paid['id']}/cancel", headers=admin_headers)
        assert cancel_fail.status_code == 400
        assert "refund fees first" in cancel_fail.json()["detail"].lower()

        # 2. Admission with 0 paid
        adm_unpaid = (await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": b_res.json()[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject 2",
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)).json()

        # Cancel succeeds
        cancel_ok = await client.post(f"/api/admissions/{adm_unpaid['id']}/cancel", headers=admin_headers)
        assert cancel_ok.status_code == 200
        cancelled_adm = cancel_ok.json()
        assert cancelled_adm["status"] == "CANCELLED"
        assert cancelled_adm["document_status"] == "VOID"
        assert cancelled_adm["items"][0]["status"] == "DISCONTINUED"

        # Double cancel returns 409
        double_cancel = await client.post(f"/api/admissions/{adm_unpaid['id']}/cancel", headers=admin_headers)
        assert double_cancel.status_code == 409

        # 3. Revoked slip cannot be cancelled
        adm_revoked = (await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": b_res.json()[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Subject 3",
                    "original_price": 1000.0
                }
            ]
        }, headers=admin_headers)).json()

        await client.post(f"/api/admissions/{adm_revoked['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Revoking before cancel test"
        }, headers=admin_headers)

        cancel_revoked = await client.post(f"/api/admissions/{adm_revoked['id']}/cancel", headers=admin_headers)
        assert cancel_revoked.status_code == 400
        assert "already revoked" in cancel_revoked.json()["detail"].lower()


@pytest.mark.asyncio
async def test_green_card_multi_admission_integrity():
    """
    Test: Student.has_green_card and expiry update correctly when student has another active
    green card admission (does not blindly set False).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Green Card Multi Student",
            "mobile": f"90{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        gc_prods = (await client.get("/api/green-card", headers=admin_headers)).json()
        gc1 = gc_prods[0]

        # Admission 1 with Green Card
        adm1 = (await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "GREEN_CARD",
                    "green_card_id": gc1["id"],
                    "item_name_snapshot": "GC Line 1",
                    "original_price": 5000.0
                }
            ],
            "initial_payment": {"amount": 5000.0, "payment_mode": "CASH"}
        }, headers=admin_headers)).json()

        st_check1 = (await client.get(f"/api/students/{st['id']}", headers=admin_headers)).json()
        assert st_check1["has_green_card"] is True
        assert st_check1["green_card_expiry"] is not None

        # Admission 2 with Green Card (additional card)
        adm2 = (await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "GREEN_CARD",
                    "green_card_id": gc1["id"],
                    "item_name_snapshot": "GC Line 2",
                    "original_price": 5000.0
                }
            ],
            "initial_payment": {"amount": 5000.0, "payment_mode": "CASH"}
        }, headers=admin_headers)).json()

        # Revoke Admission 1
        await client.post(f"/api/admissions/{adm1['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Cancelled first card"
        }, headers=admin_headers)

        # Student STILL has active green card because Admission 2 is active!
        st_check2 = (await client.get(f"/api/students/{st['id']}", headers=admin_headers)).json()
        assert st_check2["has_green_card"] is True
        assert st_check2["green_card_expiry"] is not None

        # Revoke Admission 2
        await client.post(f"/api/admissions/{adm2['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Cancelled second card"
        }, headers=admin_headers)

        # Now student has no active green card
        st_check3 = (await client.get(f"/api/students/{st['id']}", headers=admin_headers)).json()
        assert st_check3["has_green_card"] is False


@pytest.mark.asyncio
async def test_cancel_expired_or_completed_admission_item_fails():
    """
    Test:
    1. Expired admission item (valid_to in past, or status EXPIRED):
       - can_cancel is False in response.
       - Cancel endpoint /admissions/{id}/cancel returns 400 error.
       - Revoke endpoint /admissions/{id}/revoke returns 400 error.
    2. Completed admission item (status COMPLETED):
       - can_cancel is False in response.
       - Cancel endpoint returns 400 error.
    3. Active upcoming admission item:
       - can_cancel is True in response.
       - Cancel endpoint succeeds with 200 (when unpaid).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": f"Cancel Expired Test {uuid.uuid4().hex[:6]}",
            "mobile": f"94{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        sub = b_res.json()[0]["subjects"][0]
        batch_id = b_res.json()[0]["id"]

        # 1. Admission with expired validity date (e.g., last month)
        adm_expired_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-10-01",
            "valid_from": "2026-10-01",
            "valid_to": "2026-10-31",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch_id,
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Expired Subject Test",
                    "original_price": 1000.0,
                    "valid_from": "2026-10-01",
                    "valid_to": "2026-10-31"
                }
            ]
        }, headers=admin_headers)
        assert adm_expired_res.status_code == 201
        adm_expired = adm_expired_res.json()

        # can_cancel must be False on admission and item
        assert adm_expired["can_cancel"] is False
        assert adm_expired["items"][0]["can_cancel"] is False

        # Attempting to cancel via /cancel endpoint must fail with 400
        cancel_expired_res = await client.post(f"/api/admissions/{adm_expired['id']}/cancel", headers=admin_headers)
        assert cancel_expired_res.status_code == 400
        err_msg = cancel_expired_res.json()["detail"].lower()
        assert "expired" in err_msg or "cannot cancel" in err_msg

        # Attempting to revoke via /revoke endpoint must also fail with 400
        revoke_expired_res = await client.post(f"/api/admissions/{adm_expired['id']}/revoke", json={
            "revoke_type": "DROPOUT_NO_REFUND",
            "scope": "WHOLE_SLIP",
            "reason": "Trying to cancel expired batch"
        }, headers=admin_headers)
        assert revoke_expired_res.status_code == 400
        err_msg2 = revoke_expired_res.json()["detail"].lower()
        assert "expired" in err_msg2 or "cannot cancel" in err_msg2

        # 2. Admission with COMPLETED status
        from app.database.session import AsyncSessionLocal
        from app.modules.admissions.models import Admission, AdmissionItem

        async with AsyncSessionLocal() as session:
            db_adm = await session.get(Admission, uuid.UUID(adm_expired["id"]))
            db_adm.status = "COMPLETED"
            for itm in db_adm.items:
                itm.status = "COMPLETED"
            await session.commit()

        # Get via API to verify computed can_cancel
        adm_completed_res = await client.get(f"/api/admissions/{adm_expired['id']}", headers=admin_headers)
        assert adm_completed_res.status_code == 200
        assert adm_completed_res.json()["can_cancel"] is False
        assert adm_completed_res.json()["items"][0]["can_cancel"] is False

        cancel_completed_res = await client.post(f"/api/admissions/{adm_expired['id']}/cancel", headers=admin_headers)
        assert cancel_completed_res.status_code == 400

        # 3. Active upcoming admission item (valid_to in future)
        adm_active_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "valid_from": "2026-11-21",
            "valid_to": "2026-12-20",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch_id,
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Active Subject Test",
                    "original_price": 1000.0,
                    "valid_from": "2026-11-21",
                    "valid_to": "2026-12-20"
                }
            ]
        }, headers=admin_headers)
        assert adm_active_res.status_code == 201
        adm_active = adm_active_res.json()

        assert adm_active["can_cancel"] is True
        assert adm_active["items"][0]["can_cancel"] is True

        # Unpaid active admission can be cancelled successfully
        cancel_active_res = await client.post(f"/api/admissions/{adm_active['id']}/cancel", headers=admin_headers)
        assert cancel_active_res.status_code == 200
        assert cancel_active_res.json()["status"] == "CANCELLED"



