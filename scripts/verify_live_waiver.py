#!/usr/bin/env python3
"""
Live end-to-end verification script for Fee Due Waiver (Maaf) feature.
Tests running API on port 8080:
1. Backend health check OK.
2. Login as Admin & Cashier.
3. Create test student & admission with outstanding balance due.
4. Confirm Cashier cannot waive (HTTP 403 Forbidden).
5. Waive due as Admin -> due clears to 0.00, written_off_amount = waived amount.
6. Confirm WAIVER FinancialTransaction exists in append-only ledger.
7. Confirm fee slips show waived amount and contain WAIVER_VOUCHER.
8. Confirm Audit Log contains FEE_DUE_WAIVED with who waived, when, how much, and reason.
"""
import sys
import uuid
import requests
from decimal import Decimal

BASE_URL = "http://localhost:8080"

def main():
    print("=" * 70)
    print("LIVE VERIFICATION: Fee Due Waiver (Maaf) with Full Audit Trail")
    print("=" * 70)

    # 1. Health check
    h_res = requests.get(f"{BASE_URL}/health")
    assert h_res.status_code == 200, f"Health check failed: {h_res.text}"
    print("[PASS] 1. Backend health check: 200 OK")

    # 2. Logins
    adm_login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
    assert adm_login.status_code == 200, f"Admin login failed: {adm_login.text}"
    admin_token = adm_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    csh_login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
    assert csh_login.status_code == 200, f"Cashier login failed: {csh_login.text}"
    cashier_token = csh_login.json()["access_token"]
    cashier_headers = {"Authorization": f"Bearer {cashier_token}"}
    print("[PASS] 2. Authentication: Admin & Cashier authenticated")

    # 3. Create test student and admission with 700.00 balance due
    rand_mobile = f"98{uuid.uuid4().int % 100000000:08d}"
    st_res = requests.post(f"{BASE_URL}/api/students", json={
        "name": "Live Waiver Verification Student",
        "mobile": rand_mobile
    }, headers=admin_headers)
    assert st_res.status_code == 201, f"Failed to create student: {st_res.text}"
    st = st_res.json()

    b_res = requests.get(f"{BASE_URL}/api/batches/all", headers=admin_headers)
    assert b_res.status_code == 200
    batches = b_res.json()
    batch = batches[0]
    subject = batch["subjects"][0]

    adm_res = requests.post(f"{BASE_URL}/api/admissions", json={
        "student_id": st["id"],
        "admission_date": "2026-11-22",
        "items": [
            {
                "item_type": "BATCH_SUBJECT",
                "batch_id": batch["id"],
                "subject_id": subject["subject_id"],
                "item_name_snapshot": subject["subject_name"],
                "original_price": 1000.0
            }
        ],
        "initial_payment": {"amount": 300.0, "payment_mode": "CASH"}
    }, headers=admin_headers)
    assert adm_res.status_code == 201, f"Failed to create admission: {adm_res.text}"
    admission = adm_res.json()
    assert Decimal(str(admission["balance_due"])) == Decimal("700.00")
    print(f"[PASS] 3. Test admission created: {admission['admission_number']} with ₹700.00 due")

    # 4. Confirm Cashier cannot waive (HTTP 403 Forbidden)
    csh_waive_res = requests.post(
        f"{BASE_URL}/api/admissions/{admission['id']}/waive",
        json={"reason": "Cashier unauthorized attempt", "amount": 700.0},
        headers=cashier_headers
    )
    assert csh_waive_res.status_code == 403, f"Expected 403 for cashier, got {csh_waive_res.status_code}: {csh_waive_res.text}"
    print(f"[PASS] 4. Non-admin (Cashier) guard: HTTP 403 Forbidden received as expected")

    # Confirm due was not changed
    chk_adm = requests.get(f"{BASE_URL}/api/admissions/{admission['id']}", headers=admin_headers).json()
    assert Decimal(str(chk_adm["balance_due"])) == Decimal("700.00")

    # 5. Waive due as Admin
    waive_reason = "Management concession granted by Institute Director for meritorious student"
    adm_waive_res = requests.post(
        f"{BASE_URL}/api/admissions/{admission['id']}/waive",
        json={"reason": waive_reason},
        headers=admin_headers
    )
    assert adm_waive_res.status_code == 200, f"Admin waive failed: {adm_waive_res.text}"
    waived = adm_waive_res.json()
    assert Decimal(str(waived["balance_due"])) == Decimal("0.00"), f"Expected 0.00 balance due, got {waived['balance_due']}"
    assert Decimal(str(waived["written_off_amount"])) == Decimal("700.00"), f"Expected 700.00 written off, got {waived['written_off_amount']}"
    assert waived["payment_status"] == "PAID"
    print(f"[PASS] 5. Admin waiver succeeded: Due cleared to ₹0.00, written_off_amount = ₹700.00, status = PAID")

    # 6. Confirm WAIVER FinancialTransaction exists
    tx_res = requests.get(f"{BASE_URL}/api/payments/transactions?admission_id={admission['id']}", headers=admin_headers)
    assert tx_res.status_code == 200
    txns = tx_res.json()["items"]
    waiver_tx = next((t for t in txns if t["type"] == "WAIVER"), None)
    assert waiver_tx is not None, "WAIVER transaction not found in financial transactions"
    assert Decimal(str(waiver_tx["amount"])) == Decimal("700.00")
    assert waiver_tx["mode"] == "WAIVER"
    assert waive_reason in waiver_tx["notes"]
    print(f"[PASS] 6. WAIVER transaction recorded: {waiver_tx['number']} of ₹{waiver_tx['amount']} (mode: WAIVER)")

    # 7. Confirm fee slips show waived amount and contain WAIVER_VOUCHER
    slips_res = requests.get(f"{BASE_URL}/api/admissions/{admission['id']}/slips", headers=admin_headers)
    assert slips_res.status_code == 200
    slips_data = slips_res.json()
    assert Decimal(str(slips_data["written_off_amount"])) == Decimal("700.00")
    assert Decimal(str(slips_data["balance_due"])) == Decimal("0.00")

    invoice_slip = next((s for s in slips_data["slips"] if s["slip_type"] == "ADMISSION_INVOICE"), None)
    assert invoice_slip is not None
    assert Decimal(str(invoice_slip["data"]["written_off_amount"])) == Decimal("700.00")
    assert Decimal(str(invoice_slip["data"]["balance_due"])) == Decimal("0.00")

    waiver_slip = next((s for s in slips_data["slips"] if s["slip_type"] == "WAIVER_VOUCHER"), None)
    assert waiver_slip is not None, "Fee slips collection must include WAIVER_VOUCHER"
    assert Decimal(str(waiver_slip["amount"])) == Decimal("700.00")
    print(f"[PASS] 7. Fee slips show waived amount (₹700.00) & include WAIVER_VOUCHER {waiver_slip['slip_number']}")

    # 8. Confirm Audit Log shows the waiver
    audit_res = requests.get(f"{BASE_URL}/api/audit?action=FEE_DUE_WAIVED", headers=admin_headers)
    assert audit_res.status_code == 200
    audit_items = audit_res.json()["items"]
    log_entry = next((a for a in audit_items if str(a["entity_id"]) == admission["id"]), None)
    assert log_entry is not None, f"Audit Log entry for admission {admission['id']} not found"
    assert log_entry["user_role"] == "ADMIN"
    assert log_entry["parsed_details"]["waived_amount"] == 700.0
    assert waive_reason in log_entry["parsed_details"]["reason"]
    assert log_entry["parsed_details"]["before"]["balance_due"] == 700.0
    assert log_entry["parsed_details"]["after"]["balance_due"] == 0.0
    print(f"[PASS] 8. Audit Log recorded waiver: by {log_entry['user_name']} ({log_entry['user_role']}) at {log_entry['created_at']}, amount ₹{log_entry['parsed_details']['waived_amount']}")

    # 9. Confirm student profile total_balance_due is cleared
    st_det = requests.get(f"{BASE_URL}/api/students/{st['id']}", headers=admin_headers).json()
    assert Decimal(str(st_det["total_balance_due"])) == Decimal("0.00")
    print(f"[PASS] 9. Student total_balance_due cleared: ₹0.00")

    print("\nALL LIVE CHECKS PASSED SUCCESSFULLY (9/9)!")

if __name__ == "__main__":
    main()
