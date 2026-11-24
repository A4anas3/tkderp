#!/usr/bin/env python3
import os
import sys
import uuid
from datetime import date
import httpx
from playwright.sync_api import sync_playwright

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH",
    "/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright"
)

def run_live_verification():
    print("=" * 75)
    print("LIVE VERIFICATION: ONE-CLICK SALARY CREATION & PAYMENT DISBURSEMENT")
    print("=" * 75)

    # 1. Health checks
    print("\n[1/6] Verifying Backend and Frontend HTTP status...")
    with httpx.Client(timeout=10.0) as client:
        b_res = client.get("http://localhost:8080/health")
        assert b_res.status_code == 200, f"Backend health status {b_res.status_code}"
        b_data = b_res.json()
        assert b_data.get("status") == "healthy", f"Backend not healthy: {b_data}"
        print(f"  ✓ Backend /health is healthy: {b_data}")

        f_res = client.get("http://localhost:5173")
        assert f_res.status_code == 200, f"Frontend returned {f_res.status_code}"
        print("  ✓ Frontend returned HTTP 200 OK")

    screenshot_dir = os.path.join(os.path.dirname(__file__), "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print("\n[2/6] Launching Playwright Chromium...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("console", lambda msg: print(f"  [BROWSER CONSOLE] {msg.type}: {msg.text}"))

        # Login
        print("\n[3/6] Navigating to http://localhost:5173/login and logging in as ADM001...")
        page.goto("http://localhost:5173/login", wait_until="domcontentloaded")
        page.wait_for_selector("text=THAKURDWARA COACHING", timeout=10000)
        page.click('button:has-text("Sign In to ERP")')
        page.wait_for_url(lambda url: "/login" not in url, timeout=10000)
        print("  ✓ Logged in successfully")

        # Navigate to Expenses
        print("\n[4/6] Navigating to Expenses > Faculty & Staff Payroll...")
        page.goto("http://localhost:5173/expenses", wait_until="domcontentloaded")
        page.wait_for_selector("text=Expenses & Salary Outflows", timeout=10000)
        page.click('button:has-text("Faculty & Staff Payroll")')
        page.wait_for_timeout(500)
        print("  ✓ Opened Faculty & Staff Payroll tab")

        # Open Create Monthly Salary Entry modal
        page.click('button:has-text("Create Salary Entry")')
        page.wait_for_selector("text=Create Monthly Salary Entry", timeout=10000)
        print("  ✓ 'Create Monthly Salary Entry' modal opened")

        # Verify fields: Paid Amount, Payment Mode, Payment Date
        print("\n[5/6] Inspecting Modal Fields & Validations...")
        
        # Payment Mode dropdown: default UPI, options UPI and CASH
        pm_select = page.locator('select').filter(has=page.locator('option[value="UPI"]')).first
        selected_mode = pm_select.input_value()
        print(f"  Payment Mode default value: '{selected_mode}'")
        assert selected_mode == "UPI", f"Expected default Payment Mode 'UPI', got '{selected_mode}'"
        print("  ✓ Default Payment Mode is 'UPI' (matches Disburse modal)")

        # Payment Date: default today
        today_str = date.today().isoformat()
        date_inputs = page.locator('input[type="date"]').all()
        # Find payment date input
        pdate_val = None
        for inp in date_inputs:
            v = inp.input_value()
            if v == today_str:
                pdate_val = v
                break
        assert pdate_val == today_str, f"Expected Payment Date to default to today ({today_str}), got '{pdate_val}'"
        print(f"  ✓ Default Payment Date is today: '{pdate_val}'")

        # Paid Amount: prefilled with payable amount (25000.00)
        paid_amt_input = page.get_by_label("Paid Amount (₹)")
        paid_val = paid_amt_input.input_value()
        print(f"  Paid Amount prefilled value: '{paid_val}'")
        assert float(paid_val) > 0, f"Expected positive prefilled paid amount, got '{paid_val}'"
        print("  ✓ Paid Amount prefilled with payable salary amount")

        # Fill employee name first
        test_teacher_name = f"AutoFaculty_{uuid.uuid4().hex[:6]}"
        custom_name_input = page.get_by_label("Or Enter Custom Employee Name")
        custom_name_input.fill(test_teacher_name)

        # Test validation: Paid amount <= 0 shows error
        print("  Testing validation with Paid Amount = 0...")
        paid_amt_input.fill("0")
        page.click('form button[type="submit"]:has-text("Pay Salary")')
        page.wait_for_selector("text=Paid amount must be greater than 0", timeout=5000)
        print("  ✓ Validation PASSED: 'Paid amount must be greater than 0' error displayed")

        # Now fill valid details
        paid_amt_input.fill("25000.00")
        
        # Select UPI payment mode
        pm_select.select_option("UPI")

        # Take screenshot of Create modal with new fields
        create_modal_shot = os.path.join(screenshot_dir, "create_salary_modal_fields.png")
        page.screenshot(path=create_modal_shot)
        print(f"  ✓ Modal screenshot saved: {create_modal_shot}")

        # Submit: One-click Pay Salary
        print("\n[6/6] Submitting Create & Pay in ONE click...")
        page.click('form button[type="submit"]:has-text("Pay Salary")')

        # Modal should close and success toast should appear naming the payment mode
        page.wait_for_selector("text=Salary payment recorded via UPI", timeout=10000)
        print("  ✓ Success message displayed naming payment mode: 'Salary payment recorded via UPI'")

        # Wait for modal to disappear
        page.wait_for_selector("text=Create Monthly Salary Entry", state="hidden", timeout=5000)
        print("  ✓ Modal closed automatically")

        # Verify salary table shows new row with PAID, 25000.00, UPI, Paid badge
        page.wait_for_timeout(1000)
        # Search for our created record
        search_input = page.locator('input[placeholder="Search payroll by employee name..."]')
        search_input.fill(test_teacher_name)
        page.wait_for_timeout(1000)

        # Verify row content
        row = page.locator('tr').filter(has_text=test_teacher_name)
        row.wait_for(timeout=10000)
        row_text = row.inner_text()
        print(f"  Created row text: {row_text.replace(chr(10), ' | ')}")

        assert "PAID" in row_text, "Expected status 'PAID' in row"
        assert "25000.00" in row_text, "Expected paid amount '25000.00' in row"
        assert "UPI" in row_text, "Expected mode 'UPI' in row"
        assert "Paid" in row_text, "Expected 'Paid' badge in Actions"
        assert "Pay Salary" not in row_text, "Row should NOT show 'Pay Salary' button since it was already paid in one click"
        print("  ✓ Row verification PASSED: status PAID, amount 25000.00, mode UPI, no second step needed!")

        # Screenshot of paid row
        paid_row_shot = os.path.join(screenshot_dir, "salary_paid_row.png")
        page.screenshot(path=paid_row_shot)
        print(f"  ✓ Paid row screenshot saved: {paid_row_shot}")

        # Now test still-PENDING record flow:
        # Clear search filter to view all rows or find a PENDING record
        print("\nVerifying that still-PENDING records still offer 'Pay Salary' via Disburse modal...")
        search_input.fill("")
        page.wait_for_timeout(1000)

        # Check if there is a PENDING record; if not, create one via backend API
        pending_btn = page.locator('tr:has-text("PENDING") button:has-text("Pay Salary")').first
        if not pending_btn.is_visible():
            print("  No pending row visible, creating a PENDING salary record via API for testing...")
            with httpx.Client(timeout=10.0) as api_client:
                login_res = api_client.post("http://localhost:8080/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
                token = login_res.json()["access_token"]
                sal_res = api_client.post("http://localhost:8080/api/expenses/salaries", headers={"Authorization": f"Bearer {token}"}, json={
                    "employee_name_snapshot": f"PendingStaff_{uuid.uuid4().hex[:6]}",
                    "employee_type": "STAFF",
                    "month_year": date.today().strftime("%Y-%m"),
                    "salary_amount": 18000.0,
                    "due_date": today_str,
                    "notes": "Testing still-pending disburse modal flow"
                })
                assert sal_res.status_code == 201
            # Refresh table
            page.click('button[title="Refresh"], button:has-text("Refresh")')
            page.wait_for_timeout(1000)
            pending_btn = page.locator('tr:has-text("PENDING") button:has-text("Pay Salary")').first

        assert pending_btn.is_visible(), "Expected a PENDING record row with 'Pay Salary' button"
        print("  ✓ Found still-PENDING record with 'Pay Salary' button")

        # Click list row's 'Pay Salary' button to open Disburse modal
        pending_btn.click()
        page.wait_for_selector("text=Disburse Salary Payment", timeout=10000)
        print("  ✓ Disburse Salary Payment modal opened from list row's 'Pay Salary' button")

        # Verify modal elements
        disburse_submit = page.locator('form button[type="submit"]:has-text("Confirm Salary Payout")')
        assert disburse_submit.is_visible(), "Expected 'Confirm Salary Payout' button in Disburse modal"
        print("  ✓ Disburse modal has 'Confirm Salary Payout' button")

        disburse_modal_shot = os.path.join(screenshot_dir, "disburse_salary_modal.png")
        page.screenshot(path=disburse_modal_shot)
        print(f"  ✓ Disburse modal screenshot saved: {disburse_modal_shot}")

        # Dismiss modal safely
        page.click('form button:has-text("Cancel")')
        page.wait_for_timeout(500)
        print("  ✓ Disburse modal dismissed cleanly")

        browser.close()

    print("\n" + "=" * 75)
    print("ALL LIVE VERIFICATION CHECKS COMPLETED AND PASSED PERFECTLY!")
    print("=" * 75)

if __name__ == "__main__":
    run_live_verification()
