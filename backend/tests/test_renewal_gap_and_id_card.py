import uuid
from datetime import date, timedelta
import pytest
import freezegun
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.common.active_lines import compute_days_remaining, compute_days_remaining_for_periods, today_kolkata


def test_compute_days_remaining_for_periods_excludes_gaps():
    """
    Unit tests for compute_days_remaining_for_periods:
    - Single period matches compute_days_remaining
    - Contiguous renewal merges seamlessly (no gap days)
    - Renewal with a gap NEVER counts gap days as active
    - Today inside a gap before a future period starts NEVER counts gap days
    """
    today = date(2026, 11, 25)

    # 1. Single active period
    assert compute_days_remaining_for_periods(
        [(date(2026, 11, 24), date(2026, 12, 23))],
        today=today,
    ) == 28

    # 2. Contiguous 2-month renewal (2026-11-24..2026-12-23 + 2026-12-24..2027-01-23)
    # 29 covered days (Nov 25..Dec 23) + 31 covered days (Dec 24..Jan 23) = 60 -> 59d remaining
    assert compute_days_remaining_for_periods(
        [
            (date(2026, 11, 24), date(2026, 12, 23)),
            (date(2026, 12, 24), date(2027, 1, 23)),
        ],
        today=today,
    ) == 59

    # 3. Renewal WITH a 9-day gap (Dec 1..Dec 9 not covered)
    # Period 1: Nov 24..Nov 30 (6 covered days from Nov 25: Nov 25..30)
    # Period 2: Dec 10..Jan 09 (31 covered days: Dec 10..Jan 9)
    # Total covered = 37 -> 36d remaining (NOT 45d!)
    assert compute_days_remaining_for_periods(
        [
            (date(2026, 11, 24), date(2026, 11, 30)),
            (date(2026, 12, 10), date(2027, 1, 9)),
        ],
        today=today,
    ) == 36

    # 4. Today is inside the gap (Dec 5, after Period 1 ended Nov 30, before Period 2 starts Dec 10)
    # Only Period 2 (Dec 10..Jan 09) counts: 30d remaining (matches single future period)
    gap_today = date(2026, 12, 5)
    assert compute_days_remaining_for_periods(
        [
            (date(2026, 11, 24), date(2026, 11, 30)),
            (date(2026, 12, 10), date(2027, 1, 9)),
        ],
        today=gap_today,
    ) == compute_days_remaining(date(2027, 1, 9), date(2026, 12, 10), gap_today) == 30

    # 5. Three periods: two contiguous + one gapped
    # [Nov 24..Nov 30] + [Dec 1..Dec 10] => [Nov 25..Dec 10] (16d)
    # Gap: Dec 11..Dec 19 (9d)
    # [Dec 20..Jan 19] (31d)
    # Total covered = 47 -> 46d remaining
    assert compute_days_remaining_for_periods(
        [
            (date(2026, 11, 24), date(2026, 11, 30)),
            (date(2026, 12, 1), date(2026, 12, 10)),
            (date(2026, 12, 20), date(2027, 1, 19)),
        ],
        today=today,
    ) == 46


@pytest.mark.asyncio
async def test_renewal_with_gap_excludes_gap_days_and_lists_all_periods_on_id_card():
    """
    Reproduce the gap case on a test admission:
    - Initial enrollment: today-1 .. today+5 (6 remaining covered days from today)
    - Renew with a 10-day gap: valid_from = today+16, valid_to = today+45 (30 covered days)
    Verify:
    1. Renewed item runs from the chosen start date (today+16 .. today+45).
    2. /active-enrollment lists BOTH validity_periods and days_remaining excludes the 10 gap days.
    3. Public ID card (/api/public/id-card/{code}) and /api/verify/{code} list EVERY validity
       period with its own from-to dates (not a single merged range) and exclude gap days.
    4. During the gap (frozen clock at today+10), days_remaining counts only Period 2 (29d).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        st_res = await client.post("/api/students", json={
            "name": f"Gap Renewal Student {uuid.uuid4().hex[:5]}",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}",
        }, headers=headers)
        assert st_res.status_code == 201
        student = st_res.json()
        student_id = student["id"]
        student_code = student["student_code"]

        b_res = await client.get("/api/batches/all", headers=headers)
        assert b_res.status_code == 200
        batch = b_res.json()[0]
        sub = batch["subjects"][0]
        fee = float(sub["fee"])

        today = today_kolkata()
        p1_from = today - timedelta(days=1)
        p1_to = today + timedelta(days=5)
        # 10-day gap: today+6 .. today+15 are NOT covered
        p2_from = today + timedelta(days=16)
        p2_to = today + timedelta(days=45)

        adm1_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": p1_from.isoformat(),
            "valid_from": p1_from.isoformat(),
            "valid_to": p1_to.isoformat(),
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": sub["subject_name"],
                    "teacher_id": batch.get("teacher_id"),
                    "original_price": fee,
                    "valid_from": p1_from.isoformat(),
                    "valid_to": p1_to.isoformat(),
                }
            ],
        }, headers=headers)
        assert adm1_res.status_code == 201
        adm1_no = adm1_res.json()["admission_number"]

        renew_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": student_id,
            "subject_id": sub["subject_id"],
            "teacher_id": batch.get("teacher_id"),
            "valid_from": p2_from.isoformat(),
            "valid_to": p2_to.isoformat(),
            "months": 1,
            "fee": fee,
            "notes": "Renewal with 10-day gap",
        }, headers=headers)
        assert renew_res.status_code == 201
        adm2 = renew_res.json()
        adm2_no = adm2["admission_number"]
        assert adm2["items"][0]["valid_from"] == p2_from.isoformat()
        assert adm2["items"][0]["valid_to"] == p2_to.isoformat()

        # Covered days from today:
        # Period 1: today .. today+5 => 6 days
        # Period 2: today+16 .. today+45 => 30 days
        # Total covered = 36 days => days_remaining = 35 (merged would have been 45!)
        expected_remaining = compute_days_remaining_for_periods(
            [(p1_from, p1_to), (p2_from, p2_to)],
            today=today,
        )
        assert expected_remaining == 35

        # 1. Check /active-enrollment
        enr_res = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_res.status_code == 200
        active_subs = enr_res.json()["active_subjects"]
        assert len(active_subs) == 1
        subj_entry = active_subs[0]
        assert subj_entry["days_remaining"] == 35
        assert len(subj_entry["validity_periods"]) == 2
        assert subj_entry["validity_periods"][0]["valid_from"] == p1_from.isoformat()
        assert subj_entry["validity_periods"][0]["valid_to"] == p1_to.isoformat()
        assert subj_entry["validity_periods"][0]["admission_number"] == adm1_no
        assert subj_entry["validity_periods"][1]["valid_from"] == p2_from.isoformat()
        assert subj_entry["validity_periods"][1]["valid_to"] == p2_to.isoformat()
        assert subj_entry["validity_periods"][1]["admission_number"] == adm2_no

        # 2. Check public ID card API
        card_res = await client.get(f"/api/public/id-card/{student_code}")
        assert card_res.status_code == 200
        card_data = card_res.json()
        assert len(card_data["active_courses"]) == 1
        card_course = card_data["active_courses"][0]
        assert card_course["days_remaining"] == 35
        assert len(card_course["validity_periods"]) == 2
        assert card_course["validity_periods"][0]["valid_from"] == p1_from.isoformat()
        assert card_course["validity_periods"][0]["valid_to"] == p1_to.isoformat()
        assert card_course["validity_periods"][1]["valid_from"] == p2_from.isoformat()
        assert card_course["validity_periods"][1]["valid_to"] == p2_to.isoformat()
        # validity_period string also reflects separate periods, not a single merged range
        assert "|" in card_course["validity_period"]

        # 3. Check public verify API
        ver_res = await client.get(f"/api/verify/{student_code}")
        assert ver_res.status_code == 200
        ver_course = ver_res.json()["active_courses"][0]
        assert ver_course["days_remaining"] == 35
        assert len(ver_course["validity_periods"]) == 2

        # 4. Freeze clock inside the gap (today + 10): Period 1 is expired, Period 2 hasn't started yet
        gap_day = today + timedelta(days=10)
        with freezegun.freeze_time(gap_day.isoformat()):
            adm_login_g = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
            assert adm_login_g.status_code == 200
            headers_g = {"Authorization": f"Bearer {adm_login_g.json()['access_token']}"}

            enr_gap = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers_g)
            assert enr_gap.status_code == 200
            gap_subs = enr_gap.json()["active_subjects"]
            assert len(gap_subs) == 1
            # Period 2 is today+16..today+45 => (45 - 16) = 29d remaining; gap days today+10..today+15 NOT counted
            assert gap_subs[0]["days_remaining"] == 29
            assert len(gap_subs[0]["validity_periods"]) == 1
            assert gap_subs[0]["validity_periods"][0]["valid_from"] == p2_from.isoformat()
            assert gap_subs[0]["validity_periods"][0]["valid_to"] == p2_to.isoformat()
