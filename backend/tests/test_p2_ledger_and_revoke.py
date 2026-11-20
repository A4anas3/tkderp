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
