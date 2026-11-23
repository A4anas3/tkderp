import uuid
import pytest
from datetime import date
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def admin_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert res.status_code == 200
        return res.json()["access_token"]

@pytest.mark.asyncio
async def test_teacher_attendance_and_salary_flow(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create a teacher
        suffix = uuid.uuid4().hex[:6]
        mobile = f"98{uuid.uuid4().int % 100000000:08d}"
        t_res = await client.post("/api/teachers", headers=headers, json={
            "name": f"Attendance Test Teacher {suffix}",
            "mobile": mobile,
            "qualification": "M.Sc Mathematics",
            "specialization": "Mathematics Faculty",
            "joining_date": "2026-01-01"
        })
        assert t_res.status_code == 201
        teacher = t_res.json()
        teacher_id = teacher["id"]
        month_year = "2026-11"

        # 2. Check initial attendance (0 absent days)
        att_res = await client.get(f"/api/teachers/{teacher_id}/attendance?month_year={month_year}", headers=headers)
        assert att_res.status_code == 200
        att_data = att_res.json()
        assert att_data["absent_days_count"] == 0
        assert len(att_data["absent_dates"]) == 0

        # 3. Mark absent days using toggle
        date1 = "2026-11-04"
        toggle1 = await client.post(
            f"/api/teachers/{teacher_id}/attendance/toggle",
            headers=headers,
            json={"date": date1, "reason": "Medical leave"}
        )
        assert toggle1.status_code == 200
        assert toggle1.json()["absent_days_count"] == 1
        assert date1 in toggle1.json()["absent_dates"]

        # Toggle second day
        date2 = "2026-11-12"
        toggle2 = await client.post(
            f"/api/teachers/{teacher_id}/attendance/toggle",
            headers=headers,
            json={"date": date2, "reason": "Family function"}
        )
        assert toggle2.status_code == 200
        assert toggle2.json()["absent_days_count"] == 2
        assert date1 in toggle2.json()["absent_dates"]
        assert date2 in toggle2.json()["absent_dates"]

        # 4. Check monthly summary list includes this teacher with 2 absent days
        summary_res = await client.get(f"/api/teachers/attendance?month_year={month_year}&teacher_id={teacher_id}", headers=headers)
        assert summary_res.status_code == 200
        summaries = summary_res.json()
        assert len(summaries) == 1
        assert summaries[0]["absent_days_count"] == 2

        # 5. Verify absent count is visible in salary flow
        # Create salary record for this teacher for 2026-11
        sal_res = await client.post("/api/expenses/salaries", headers=headers, json={
            "employee_id": teacher_id,
            "employee_type": "TEACHER",
            "employee_name_snapshot": teacher["name"],
            "month_year": month_year,
            "salary_amount": 25000.0,
            "due_date": "2026-11-30",
            "notes": "Salary for Nov 2026"
        })
        assert sal_res.status_code == 201
        sal_data = sal_res.json()
        assert sal_data["absent_days_count"] == 2

        # Check in list salaries
        sal_list_res = await client.get(f"/api/expenses/salaries?month_year={month_year}&page_size=100", headers=headers)
        assert sal_list_res.status_code == 200
        sal_records = sal_list_res.json()["items"]
        matching_sal = next((s for s in sal_records if s["id"] == sal_data["id"]), None)
        assert matching_sal is not None
        assert matching_sal["absent_days_count"] == 2

        # Pay salary and verify absent count remains visible
        pay_res = await client.post(f"/api/expenses/salaries/{sal_data['id']}/pay", headers=headers, json={
            "paid_amount": 25000.0,
            "payment_mode": "BANK_TRANSFER",
            "payment_date": "2026-11-28",
            "notes": "Paid full"
        })
        assert pay_res.status_code == 200
        paid_data = pay_res.json()
        assert paid_data["status"] == "PAID"
        assert paid_data["absent_days_count"] == 2

        # 6. Untoggle date1 (should become 1 absent day)
        toggle_untoggle = await client.post(
            f"/api/teachers/{teacher_id}/attendance/toggle",
            headers=headers,
            json={"date": date1}
        )
        assert toggle_untoggle.status_code == 200
        assert toggle_untoggle.json()["absent_days_count"] == 1

        # 7. Bulk set absent dates
        bulk_res = await client.post(
            f"/api/teachers/{teacher_id}/attendance",
            headers=headers,
            json={"month_year": month_year, "absent_dates": ["2026-11-01", "2026-11-02", "2026-11-03"]}
        )
        assert bulk_res.status_code == 200
        assert bulk_res.json()["absent_days_count"] == 3
        assert bulk_res.json()["days_in_month"] == 30
        assert bulk_res.json()["present_days_count"] == 27

@pytest.mark.asyncio
async def test_real_calendar_days_in_month_and_present_calculation(admin_token):
    """
    Verify real calendar days-in-month and present calculation:
    - December 2026: 31 days (31 - absent)
    - February 2027: 28 days (28 - absent, non-leap year)
    - February 2028: 29 days (29 - absent, leap year)
    - November 2026: 30 days
    """
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a teacher
        suffix = uuid.uuid4().hex[:6]
        mobile = f"98{uuid.uuid4().int % 100000000:08d}"
        t_res = await client.post("/api/teachers", headers=headers, json={
            "name": f"Calendar Test Faculty {suffix}",
            "mobile": mobile,
            "qualification": "Ph.D",
            "specialization": "Physics",
            "joining_date": "2026-01-01"
        })
        assert t_res.status_code == 201
        tch_id = t_res.json()["id"]

        # Case 1: 31-day month: December 2026
        dec_res = await client.get(f"/api/teachers/{tch_id}/attendance?month_year=2026-12", headers=headers)
        assert dec_res.status_code == 200
        dec_data = dec_res.json()
        assert dec_data["days_in_month"] == 31
        assert dec_data["absent_days_count"] == 0
        assert dec_data["present_days_count"] == 31

        # Mark 2 days absent in Dec 2026
        await client.post(f"/api/teachers/{tch_id}/attendance/toggle", headers=headers, json={"date": "2026-12-05"})
        toggle_dec = await client.post(f"/api/teachers/{tch_id}/attendance/toggle", headers=headers, json={"date": "2026-12-15"})
        assert toggle_dec.status_code == 200
        dec_after = toggle_dec.json()
        assert dec_after["days_in_month"] == 31
        assert dec_after["absent_days_count"] == 2
        assert dec_after["present_days_count"] == 29

        # Case 2: 28-day month: February 2027 (non-leap year)
        feb27_res = await client.get(f"/api/teachers/{tch_id}/attendance?month_year=2027-02", headers=headers)
        assert feb27_res.status_code == 200
        feb27_data = feb27_res.json()
        assert feb27_data["days_in_month"] == 28
        assert feb27_data["absent_days_count"] == 0
        assert feb27_data["present_days_count"] == 28

        # Mark 1 day absent in Feb 2027
        toggle_feb27 = await client.post(f"/api/teachers/{tch_id}/attendance/toggle", headers=headers, json={"date": "2027-02-10"})
        assert toggle_feb27.status_code == 200
        feb27_after = toggle_feb27.json()
        assert feb27_after["days_in_month"] == 28
        assert feb27_after["absent_days_count"] == 1
        assert feb27_after["present_days_count"] == 27

        # Case 3: 29-day month: February 2028 (leap year)
        feb28_res = await client.get(f"/api/teachers/{tch_id}/attendance?month_year=2028-02", headers=headers)
        assert feb28_res.status_code == 200
        feb28_data = feb28_res.json()
        assert feb28_data["days_in_month"] == 29
        assert feb28_data["absent_days_count"] == 0
        assert feb28_data["present_days_count"] == 29

        # Mark leap day absent: 2028-02-29
        toggle_feb28 = await client.post(f"/api/teachers/{tch_id}/attendance/toggle", headers=headers, json={"date": "2028-02-29"})
        assert toggle_feb28.status_code == 200
        feb28_after = toggle_feb28.json()
        assert feb28_after["days_in_month"] == 29
        assert feb28_after["absent_days_count"] == 1
        assert feb28_after["present_days_count"] == 28

        # Verify summary endpoint returns days_in_month and present_days_count
        sum_dec = await client.get(f"/api/teachers/attendance?month_year=2026-12&teacher_id={tch_id}", headers=headers)
        assert sum_dec.status_code == 200
        assert sum_dec.json()[0]["days_in_month"] == 31
        assert sum_dec.json()[0]["absent_days_count"] == 2
        assert sum_dec.json()[0]["present_days_count"] == 29

        sum_feb28 = await client.get(f"/api/teachers/attendance?month_year=2028-02&teacher_id={tch_id}", headers=headers)
        assert sum_feb28.status_code == 200
        assert sum_feb28.json()[0]["days_in_month"] == 29
        assert sum_feb28.json()[0]["absent_days_count"] == 1
        assert sum_feb28.json()[0]["present_days_count"] == 28

@pytest.mark.asyncio
async def test_id_card_timings_and_due_balance(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]
        # 1. Create teacher
        t_res = await client.post("/api/teachers", headers=headers, json={
            "name": f"Faculty Timings {suffix}",
            "mobile": f"98{uuid.uuid4().int % 100000000:08d}",
            "qualification": "M.Sc",
            "specialization": "Science",
            "joining_date": "2026-01-01"
        })
        assert t_res.status_code == 201
        tch_id = t_res.json()["id"]

        # 2. Create subject with schedule
        sub_code = f"TIM-{suffix[:4].upper()}"
        sub_schedule = "Mon-Wed-Fri 04:00 PM - 05:30 PM"
        sub_res = await client.post("/api/subjects", headers=headers, json={
            "subject_code": sub_code,
            "name": f"Advanced Mechanics {suffix}",
            "default_fee": 1500.0,
            "teacher_id": tch_id,
            "schedule": sub_schedule,
            "hall_number": "Hall 10"
        })
        assert sub_res.status_code == 201
        subj_id = sub_res.json()["id"]

        # 3. Create student
        stu_res = await client.post("/api/students", headers=headers, json={
            "name": f"Timings Student {suffix}",
            "mobile": f"97{uuid.uuid4().int % 100000000:08d}",
            "father_name": "Test Father",
            "address": "Civil Lines"
        })
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        # 4. Create admission with partial payment: total ₹1500, paid ₹1000 => due ₹500
        today_str = date.today().isoformat()
        adm_res = await client.post("/api/admissions", headers=headers, json={
            "student_id": stu_id,
            "admission_date": today_str,
            "valid_from": today_str,
            "items": [
                {
                    "item_type": "SUBJECT",
                    "subject_id": subj_id,
                    "teacher_id": tch_id,
                    "item_name_snapshot": f"Advanced Mechanics {suffix}",
                    "original_price": 1500.0,
                    "months": 1
                }
            ],
            "initial_payment": {
                "amount": 1000.0,
                "payment_mode": "CASH"
            }
        })
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        adm_no = adm_data["admission_number"]
        adm_id = adm_data["id"]
        assert float(adm_data["total_payable"]) == 1500.0
        assert float(adm_data["amount_paid"]) == 1000.0
        assert float(adm_data["balance_due"]) == 500.0

        # 5. Verify Public ID Card shows timings and live due balance (₹500)
        card_res = await client.get(f"/api/public/id-card/{adm_no}")
        assert card_res.status_code == 200
        card_data = card_res.json()
        assert card_data["verified"] is True
        assert "due_balance" in card_data
        assert float(card_data["due_balance"]) == 500.0
        assert float(card_data["student"]["due_balance"]) == 500.0
        assert len(card_data["active_courses"]) > 0
        matched_course = next((c for c in card_data["active_courses"] if c["course_name"] == f"Advanced Mechanics {suffix}"), None)
        assert matched_course is not None
        assert matched_course["schedule"] == sub_schedule

        # 6. Verify admission slips endpoint returns subject schedule
        slips_res = await client.get(f"/api/admissions/{adm_id}/slips", headers=headers)
        assert slips_res.status_code == 200
        slips_data = slips_res.json()
        inv_slip = next((s for s in slips_data["slips"] if s["slip_type"] == "ADMISSION_INVOICE"), None)
        assert inv_slip is not None
        assert inv_slip["data"]["items"][0]["schedule"] == sub_schedule

        # 7. Verify student detail lines have schedule and total_balance_due
        stu_detail_res = await client.get(f"/api/students/{stu_id}", headers=headers)
        assert stu_detail_res.status_code == 200
        stu_detail = stu_detail_res.json()
        assert float(stu_detail["total_balance_due"]) == 500.0
        active_line = next((l for l in stu_detail["active"] if l["subject_id"] == subj_id), None)
        assert active_line is not None
        assert active_line["schedule"] == sub_schedule

@pytest.mark.asyncio
async def test_salary_flow_end_to_end(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]
        # 1. Create teacher
        t_res = await client.post("/api/teachers", headers=headers, json={
            "name": f"Salary Test Faculty {suffix}",
            "mobile": f"98{uuid.uuid4().int % 100000000:08d}",
            "qualification": "Ph.D Physics",
            "specialization": "Quantum Physics",
            "joining_date": "2026-01-01"
        })
        assert t_res.status_code == 201
        tch_id = t_res.json()["id"]
        tch_name = t_res.json()["name"]

        # 2. Mark 3 absent days in November 2026 (30-day month)
        for day in ["2026-11-04", "2026-11-10", "2026-11-18"]:
            tg = await client.post(
                f"/api/teachers/{tch_id}/attendance/toggle",
                headers=headers,
                json={"date": day, "reason": "Medical leave"}
            )
            assert tg.status_code == 200

        # Check attendance summary
        att_res = await client.get(f"/api/teachers/{tch_id}/attendance?month_year=2026-11", headers=headers)
        assert att_res.status_code == 200
        att_data = att_res.json()
        assert att_data["days_in_month"] == 30
        assert att_data["absent_days_count"] == 3

        # 3. Create Salary Entry with auto-calculated formula:
        # monthly salary = 30,000, days = 30 => per-day rate = 1000.
        # absent days = 3 => deduction = 3000.
        # holidays = 4 (paid days, never deducted).
        # Payable = 30000 - 3000 = 27000.
        base_salary = Decimal("30000.00")
        days_in_month = 30
        per_day_rate = base_salary / Decimal(str(days_in_month)) # 1000.00
        absent_days = 3
        payable = base_salary - (per_day_rate * Decimal(str(absent_days))) # 27000.00
        holidays_count = 4

        sal_res = await client.post("/api/expenses/salaries", headers=headers, json={
            "employee_id": tch_id,
            "employee_type": "TEACHER",
            "employee_name_snapshot": tch_name,
            "month_year": "2026-11",
            "base_salary": float(base_salary),
            "holidays_count": holidays_count,
            "salary_amount": float(payable),
            "due_date": "2026-11-30",
            "notes": f"Auto-calculated: Base ₹{base_salary}, 30 days, 4 holidays (paid), 3 absent days (deduction ₹3000)"
        })
        assert sal_res.status_code == 201
        sal_nov = sal_res.json()
        assert float(sal_nov["salary_amount"]) == 27000.00
        assert float(sal_nov["base_salary"]) == 30000.00
        assert sal_nov["holidays_count"] == 4
        assert sal_nov["absent_days_count"] == 3
        assert sal_nov["status"] == "PENDING"
        assert sal_nov["payment_mode"] is None

        # 4. Pay November salary with UPI
        pay_nov_res = await client.post(f"/api/expenses/salaries/{sal_nov['id']}/pay", headers=headers, json={
            "paid_amount": 27000.00,
            "payment_mode": "UPI",
            "payment_date": "2026-11-28",
            "notes": "Paid full via UPI"
        })
        assert pay_nov_res.status_code == 200
        paid_nov = pay_nov_res.json()
        assert paid_nov["status"] == "PAID"
        assert paid_nov["payment_mode"] == "UPI"
        assert float(paid_nov["paid_amount"]) == 27000.00
        assert paid_nov["absent_days_count"] == 3

        # 5. Last Month Coverage: Create pending salary for Last Month (October 2026, 31 days)
        # 1 absent day in October
        await client.post(
            f"/api/teachers/{tch_id}/attendance/toggle",
            headers=headers,
            json={"date": "2026-10-15", "reason": "Casual leave"}
        )
        oct_att = await client.get(f"/api/teachers/{tch_id}/attendance?month_year=2026-10", headers=headers)
        assert oct_att.status_code == 200
        assert oct_att.json()["days_in_month"] == 31
        assert oct_att.json()["absent_days_count"] == 1

        # Base = 31000, days = 31 => per-day rate = 1000. 1 absent => payable = 30000.
        sal_oct_res = await client.post("/api/expenses/salaries", headers=headers, json={
            "employee_id": tch_id,
            "employee_type": "TEACHER",
            "employee_name_snapshot": tch_name,
            "month_year": "2026-10",
            "base_salary": 31000.00,
            "holidays_count": 5,
            "salary_amount": 30000.00,
            "due_date": "2026-10-31",
            "notes": "Last month salary entry"
        })
        assert sal_oct_res.status_code == 201
        sal_oct = sal_oct_res.json()
        assert sal_oct["status"] == "PENDING"
        assert sal_oct["month_year"] == "2026-10"
        assert sal_oct["absent_days_count"] == 1

        # 6. Verify salary list covers both last month (2026-10) and current month (2026-11)
        # Check querying by teacher employee_id or month_year
        all_sal_res = await client.get(f"/api/expenses/salaries?employee_id={tch_id}", headers=headers)
        assert all_sal_res.status_code == 200
        items = all_sal_res.json()["items"]
        nov_item = next((s for s in items if s["id"] == sal_nov["id"]), None)
        oct_item = next((s for s in items if s["id"] == sal_oct["id"]), None)
        assert nov_item is not None
        assert nov_item["payment_mode"] == "UPI"
        assert oct_item is not None
        assert oct_item["status"] == "PENDING"

        # Also verify month_year filter works for last month
        oct_list_res = await client.get(f"/api/expenses/salaries?month_year=2026-10&employee_id={tch_id}", headers=headers)
        assert oct_list_res.status_code == 200
        assert any(s["id"] == sal_oct["id"] for s in oct_list_res.json()["items"])

        # 7. Pay pending last month salary with CASH
        pay_oct_res = await client.post(f"/api/expenses/salaries/{sal_oct['id']}/pay", headers=headers, json={
            "paid_amount": 30000.00,
            "payment_mode": "CASH",
            "payment_date": "2026-11-20",
            "notes": "Paid pending last-month salary in Cash"
        })
        assert pay_oct_res.status_code == 200
        paid_oct = pay_oct_res.json()
        assert paid_oct["status"] == "PAID"
        assert paid_oct["payment_mode"] == "CASH"

        # 8. Check Teacher's Profile Salary History endpoint
        tch_sal_res = await client.get(f"/api/teachers/{tch_id}/salaries", headers=headers)
        assert tch_sal_res.status_code == 200
        tch_salaries = tch_sal_res.json()
        assert len(tch_salaries) >= 2
        # Check November record
        nov_rec = next((s for s in tch_salaries if s["month_year"] == "2026-11"), None)
        assert nov_rec is not None
        assert float(nov_rec["salary_amount"]) == 27000.00
        assert float(nov_rec["paid_amount"]) == 27000.00
        assert nov_rec["payment_mode"] == "UPI"
        assert nov_rec["status"] == "PAID"

        # Check October record
        oct_rec = next((s for s in tch_salaries if s["month_year"] == "2026-10"), None)
        assert oct_rec is not None
        assert float(oct_rec["salary_amount"]) == 30000.00
        assert float(oct_rec["paid_amount"]) == 30000.00
        assert oct_rec["payment_mode"] == "CASH"
        assert oct_rec["status"] == "PAID"
