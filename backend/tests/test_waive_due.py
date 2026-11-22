import pytest
import uuid
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_admin_waive_full_due_and_trail():
    """
    Test: Admin waives full pending due.
    Verifications:
    1. Due clears: balance_due becomes 0.00, written_off_amount = 800.00.
    2. Append-only FinancialTransaction (txn_type=WAIVER) recorded.
    3. Slip shows the waived amount and includes WAIVER_VOUCHER.
    4. Audit Log records the waiver event with who, when, amount, and reason.
    5. Student profile reflects total_balance_due = 0.00.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 1. Create student and admission with 800 balance due
        st_res = await client.post("/api/students", json={
            "name": "Waiver Test Student Full",
            "mobile": f"93{uuid.uuid4().int % 100000000:08d}"
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
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 200.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        admission = adm_res.json()
        assert Decimal(str(admission["balance_due"])) == Decimal("800.00")
        assert Decimal(str(admission["amount_paid"])) == Decimal("200.00")
        assert Decimal(str(admission["written_off_amount"])) == Decimal("0.00")

        # 2. Admin executes direct fee waiver (maaf)
        waive_res = await client.post(
            f"/api/admissions/{admission['id']}/waive",
            json={
                "reason": "Administrative scholarship waiver granted by Institute Director",
                "amount": 800.0
            },
            headers=admin_headers
        )
        assert waive_res.status_code == 200
        waived_adm = waive_res.json()

        # Check balance due is cleared and written off amount is updated
        assert Decimal(str(waived_adm["balance_due"])) == Decimal("0.00")
        assert Decimal(str(waived_adm["written_off_amount"])) == Decimal("800.00")
        assert Decimal(str(waived_adm["amount_paid"])) == Decimal("200.00")
        assert waived_adm["payment_status"] == "PAID"

        # 3. Check FinancialTransaction ledger
        tx_res = await client.get(
            f"/api/payments/transactions?admission_id={admission['id']}",
            headers=admin_headers
        )
        assert tx_res.status_code == 200
        txns = tx_res.json()["items"]
        waiver_tx = next((t for t in txns if t["type"] == "WAIVER"), None)
        assert waiver_tx is not None, "WAIVER transaction must exist in transactions ledger"
        assert Decimal(str(waiver_tx["amount"])) == Decimal("800.00")
        assert waiver_tx["mode"] == "WAIVER"
        assert "Administrative scholarship waiver" in waiver_tx["notes"]

        # 4. Check Fee Slips
        slips_res = await client.get(
            f"/api/admissions/{admission['id']}/slips",
            headers=admin_headers
        )
        assert slips_res.status_code == 200
        slips_data = slips_res.json()
        assert Decimal(str(slips_data["written_off_amount"])) == Decimal("800.00")
        assert Decimal(str(slips_data["balance_due"])) == Decimal("0.00")

        # The invoice slip data must show written_off_amount
        invoice_slip = next((s for s in slips_data["slips"] if s["slip_type"] == "ADMISSION_INVOICE"), None)
        assert invoice_slip is not None
        assert Decimal(str(invoice_slip["data"]["written_off_amount"])) == Decimal("800.00")
        assert Decimal(str(invoice_slip["data"]["balance_due"])) == Decimal("0.00")

        # Must include WAIVER_VOUCHER in slips list
        waiver_slip = next((s for s in slips_data["slips"] if s["slip_type"] == "WAIVER_VOUCHER"), None)
        assert waiver_slip is not None, "Fee slip collection must include WAIVER_VOUCHER"
        assert Decimal(str(waiver_slip["amount"])) == Decimal("800.00")

        # 5. Check Audit Log
        audit_res = await client.get(
            f"/api/audit?action=FEE_DUE_WAIVED",
            headers=admin_headers
        )
        assert audit_res.status_code == 200
        audit_items = audit_res.json()["items"]
        waiver_audit = next(
            (a for a in audit_items if str(a["entity_id"]) == admission["id"]),
            None
        )
        assert waiver_audit is not None, "Audit Log must contain FEE_DUE_WAIVED event for the admission"
        assert waiver_audit["user_name"] is not None
        assert waiver_audit["user_role"] == "ADMIN"
        assert waiver_audit["parsed_details"]["waived_amount"] == 800.0
        assert "Administrative scholarship waiver" in waiver_audit["parsed_details"]["reason"]
        assert waiver_audit["parsed_details"]["before"]["balance_due"] == 800.0
        assert waiver_audit["parsed_details"]["after"]["balance_due"] == 0.0

        # Also verify in student's audit trail endpoint
        stu_audit_res = await client.get(
            f"/api/audit/student/{st['id']}",
            headers=admin_headers
        )
        assert stu_audit_res.status_code == 200
        stu_audit_items = stu_audit_res.json()["items"]
        assert any(a["action"] == "FEE_DUE_WAIVED" for a in stu_audit_items)

        # 6. Verify student detail profile
        st_detail_res = await client.get(
            f"/api/students/{st['id']}",
            headers=admin_headers
        )
        assert st_detail_res.status_code == 200
        st_detail = st_detail_res.json()
        assert Decimal(str(st_detail["total_balance_due"])) == Decimal("0.00")


@pytest.mark.asyncio
async def test_cashier_cannot_waive_due_returns_403():
    """
    Test: Cashier attempting to waive fee due returns 403 Forbidden.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cashier login
        csh_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert csh_login.status_code == 200
        csh_headers = {"Authorization": f"Bearer {csh_login.json()['access_token']}"}

        # Admin login to setup
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Cashier Waive Guard Student",
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
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 1000.0
                }
            ],
            "initial_payment": {"amount": 100.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        admission = adm_res.json()

        # Cashier attempts to waive -> 403 Forbidden
        csh_res = await client.post(
            f"/api/admissions/{admission['id']}/waive",
            json={
                "reason": "Cashier trying to waive due without admin privilege",
                "amount": 900.0
            },
            headers=csh_headers
        )
        assert csh_res.status_code == 403
        assert "Only administrators" in csh_res.json()["detail"] or "Forbidden" in csh_res.json()["detail"] or csh_res.status_code == 403

        # Confirm balance due was untouched
        get_adm = await client.get(f"/api/admissions/{admission['id']}", headers=admin_headers)
        assert Decimal(str(get_adm.json()["balance_due"])) == Decimal("900.00")


@pytest.mark.asyncio
async def test_admin_partial_waive_due():
    """
    Test: Partial waiver of 300 out of 800 leaves 500 balance due.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Partial Waiver Student",
            "mobile": f"95{uuid.uuid4().int % 100000000:08d}"
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
        admission = adm_res.json()
        assert Decimal(str(admission["balance_due"])) == Decimal("800.00")

        # Admin waives partial amount 300
        waive_res = await client.post(
            f"/api/admissions/{admission['id']}/waive",
            json={
                "reason": "Partial financial aid concession",
                "amount": 300.0
            },
            headers=admin_headers
        )
        assert waive_res.status_code == 200
        updated = waive_res.json()
        assert Decimal(str(updated["balance_due"])) == Decimal("500.00")
        assert Decimal(str(updated["written_off_amount"])) == Decimal("300.00")
        assert Decimal(str(updated["amount_paid"])) == Decimal("200.00")

        # Now waive remaining 500 without specifying amount (defaults to full balance)
        waive_res2 = await client.post(
            f"/api/admissions/{admission['id']}/waive",
            json={
                "reason": "Remaining fee waiver after review"
            },
            headers=admin_headers
        )
        assert waive_res2.status_code == 200
        updated2 = waive_res2.json()
        assert Decimal(str(updated2["balance_due"])) == Decimal("0.00")
        assert Decimal(str(updated2["written_off_amount"])) == Decimal("800.00")


@pytest.mark.asyncio
async def test_waive_validation_guards():
    """
    Test: Validation guards on waiving.
    - Cannot waive when balance_due == 0
    - Cannot waive amount > balance_due
    - Mandatory reason required
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": "Guards Test Student",
            "mobile": f"96{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        # Fully paid admission (balance_due = 0)
        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-11-21",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "original_price": 500.0
                }
            ],
            "initial_payment": {"amount": 500.0, "payment_mode": "CASH"}
        }, headers=admin_headers)
        adm_paid = adm_res.json()
        assert Decimal(str(adm_paid["balance_due"])) == Decimal("0.00")

        # Attempt to waive fully paid admission -> 400
        zero_res = await client.post(
            f"/api/admissions/{adm_paid['id']}/waive",
            json={"reason": "Attempting waive on 0 balance"},
            headers=admin_headers
        )
        assert zero_res.status_code == 400
        assert "no outstanding balance due" in zero_res.json()["detail"].lower()
