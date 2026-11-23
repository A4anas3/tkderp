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
