#!/usr/bin/env python3
import os
import sys
import httpx
from playwright.sync_api import sync_playwright

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH",
    "/home/ubuntu/antigravity/profiles/a4anaskhanshab_at_gmail_com/.cache/ms-playwright"
)

def run_live_verification():
    print("=" * 70)
    print("LIVE VERIFICATION: CREATE MONTHLY SALARY ENTRY MODAL SUBMIT BUTTON")
    print("=" * 70)

    # 1. Health checks
    print("\n[1/5] Checking Backend and Frontend HTTP status...")
    with httpx.Client(timeout=10.0) as client:
        b_res = client.get("http://localhost:8080/health")
        assert b_res.status_code == 200, f"Backend health returned status {b_res.status_code}"
        b_data = b_res.json()
        assert b_data.get("status") == "healthy", f"Backend not healthy: {b_data}"
        print(f"  ✓ Backend /health is healthy: {b_data}")

        f_res = client.get("http://localhost:5173")
        assert f_res.status_code == 200, f"Frontend returned status {f_res.status_code}"
        print("  ✓ Frontend returned HTTP 200 OK")

    # 2. Browser automation
    print("\n[2/5] Launching Playwright Chromium...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Login
        print("\n[3/5] Navigating to http://localhost:5173/login and logging in...")
        page.goto("http://localhost:5173/login", wait_until="domcontentloaded")
        page.wait_for_selector("text=THAKURDWARA COACHING", timeout=10000)
        page.click('button:has-text("Sign In to ERP")')
        page.wait_for_url(lambda url: "/login" not in url, timeout=10000)
        print("  ✓ Logged in successfully as ADM001")

        # Navigate to Expenses
        print("\n[4/5] Navigating to Expenses > Faculty & Staff Payroll...")
        page.goto("http://localhost:5173/expenses", wait_until="domcontentloaded")
        page.wait_for_selector("text=Expenses & Salary Outflows", timeout=10000)
        print("  ✓ Expenses page loaded")

        # Click Faculty & Staff Payroll tab
        page.click('button:has-text("Faculty & Staff Payroll")')
        page.wait_for_timeout(500)
        print("  ✓ Switched to Faculty & Staff Payroll tab")

        # Open Create Monthly Salary Entry modal
        page.click('button:has-text("Create Salary Entry")')
        page.wait_for_selector("text=Create Monthly Salary Entry", timeout=10000)
        print("  ✓ 'Create Monthly Salary Entry' modal opened")

        # Verify submit button reads "Pay Salary"
        print("\n[5/5] Inspecting Modal Submit Button...")
        submit_btn = page.wait_for_selector('form button[type="submit"]', timeout=10000)
        btn_text = submit_btn.inner_text().strip()
        print(f"  Submit button text: '{btn_text}'")

        assert btn_text == "Pay Salary", f"Expected button text to be 'Pay Salary', but found '{btn_text}'"
        print("  ✓ Assertion PASSED: Submit button reads 'Pay Salary' exactly")

        # Check that 'Create Salary Record' is not present
        page_content = page.content()
        assert "Create Salary Record" not in page_content, "Found deprecated 'Create Salary Record' text in DOM"
        print("  ✓ Verified: 'Create Salary Record' is completely absent from the DOM")

        # Screenshot
        screenshot_dir = os.path.join(os.path.dirname(__file__), "screenshots")
        os.makedirs(screenshot_dir, exist_ok=True)
        screenshot_path = os.path.join(screenshot_dir, "modal_pay_salary.png")
        page.screenshot(path=screenshot_path)
        print(f"  ✓ Screenshot saved: {screenshot_path}")

        # Cancel modal
        page.click('button:has-text("Cancel")')
        page.wait_for_timeout(500)
        print("  ✓ Modal safely dismissed without side effects")

        browser.close()

    print("\n" + "=" * 70)
    print("ALL LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_live_verification()
