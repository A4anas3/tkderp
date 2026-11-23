import urllib.request
import json
import uuid
from datetime import date, timedelta

BASE = 'http://localhost:8080/api'

def post_json(url, data, token=None):
    payload = json.dumps(data).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_json(url, token=None):
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    print("1. Logging in as ADMIN...")
    login = post_json(f'{BASE}/auth/login', {'username': 'ADM001', 'password': 'Admin@1234'})
    token = login['access_token']
    print("   Token acquired.")

    print("2. Fetching active subjects & active teachers...")
    active_teachers = {t['id']: t for t in get_json(f'{BASE}/teachers/all', token)}
    all_subs = get_json(f'{BASE}/subjects?status_filter=ACTIVE&page_size=50', token)['items']
    subs = [s for s in all_subs if not s.get('teacher_id') or s.get('teacher_id') in active_teachers]
    print(f"   Active subjects with active teachers found: {len(subs)}")
    assert len(subs) >= 2, "Need at least 2 active subjects"
    sub1, sub2 = subs[0], subs[1]
    print(f"   Subject 1: {sub1['name']} (Fee: {sub1['default_fee']})")
    print(f"   Subject 2: {sub2['name']} (Fee: {sub2['default_fee']})")

    print("3. Creating a test student for subject-only admission...")
    suffix = uuid.uuid4().hex[:6]
    student_data = {
        "name": f"Subject Enrollee {suffix}",
        "father_name": "Test Father",
        "mobile": f"98765{uuid.uuid4().int % 90000 + 10000}",
        "email": f"enrollee_{suffix}@test.com",
        "gender": "MALE",
        "category": "GENERAL"
    }
    student = post_json(f'{BASE}/students', student_data, token)
    student_id = student['id']
    print(f"   Student created: {student['name']} (#{student['student_code']}, ID: {student_id})")

    print("4. Submitting subject-only admission with multiple subjects...")
    start_d = date.today()
    end_d = start_d + timedelta(days=30)
    fee1 = float(sub1['default_fee'])
    fee2 = float(sub2['default_fee'])
    total_original = fee1 + fee2
    # 10% discount = 0.9 * total_original
    expected_payable = total_original * 0.9

    adm_payload = {
        "student_id": student_id,
        "admission_date": start_d.isoformat(),
        "valid_from": start_d.isoformat(),
        "valid_to": end_d.isoformat(),
        "overall_discount_type": "PERCENTAGE",
        "overall_discount_value": 10.0,
        "items": [
            {
                "item_type": "SUBJECT",
                "subject_id": sub1['id'],
                "teacher_id": sub1.get('teacher_id'),
                "teacher_name_snapshot": sub1.get('teacher_name', 'Faculty'),
                "hall_number_snapshot": sub1.get('hall_number', 'Hall 13'),
                "item_name_snapshot": sub1['name'],
                "original_price": fee1,
                "months": 1,
                "valid_from": start_d.isoformat(),
                "valid_to": end_d.isoformat()
            },
            {
                "item_type": "SUBJECT",
                "subject_id": sub2['id'],
                "teacher_id": sub2.get('teacher_id'),
                "teacher_name_snapshot": sub2.get('teacher_name', 'Faculty'),
                "hall_number_snapshot": sub2.get('hall_number', 'Hall 13'),
                "item_name_snapshot": sub2['name'],
                "original_price": fee2,
                "months": 1,
                "valid_from": start_d.isoformat(),
                "valid_to": end_d.isoformat()
            }
        ],
        "initial_payment": {
            "amount": expected_payable,
            "payment_mode": "CASH",
            "remarks": "Subject-only enrolment payment"
        }
    }
    adm_res = post_json(f'{BASE}/admissions', adm_payload, token)
    adm_id = adm_res['id']
    adm_num = adm_res['admission_number']
    print(f"   Admission created: {adm_num} (ID: {adm_id})")
    print(f"   Total Payable: ₹{adm_res['total_payable']}, Amount Paid: ₹{adm_res['amount_paid']}, Balance Due: ₹{adm_res['balance_due']}")
    assert abs(float(adm_res['total_payable']) - expected_payable) < 0.01, f"Total payable should match expected {expected_payable}"
    assert float(adm_res['balance_due']) == 0.0, "Balance should be 0 after full payment"
    assert len(adm_res['items']) == 2, "Should have 2 enrolled subject items"

    print("5. Verifying student ID card...")
    id_card = get_json(f'{BASE}/students/{student_id}/id-card', token)
    print(f"   Student ID Card found: {id_card['student']['name']}")
    active_courses = id_card.get('active_courses', [])
    print(f"   Active courses on ID Card: {len(active_courses)}")
    for ac in active_courses:
        print(f"     - {ac.get('subject_name')} (Valid: {ac.get('valid_from')} to {ac.get('valid_to')})")
    assert len(active_courses) >= 2, "ID card must reflect both newly enrolled active subjects"

    print("6. Verifying public QR verification portal...")
    verify_res = get_json(f'{BASE}/verify/{adm_num}')
    print(f"   QR Verify Verified: {verify_res.get('verified')}, Student: {verify_res.get('student', {}).get('name')}")
    assert verify_res.get('verified') is True, "QR verify must show verified"
    assert verify_res.get('total_active_courses') == 2, "Must show 2 active courses"

    print("7. Verifying smart rolling cycle endpoint /students/{id}/last-fee-period...")
    period_res = get_json(f'{BASE}/students/{student_id}/last-fee-period?subject_id={sub1["id"]}', token)
    print(f"   Suggested next start date: {period_res.get('suggested_start_date')}, Suggested next end date: {period_res.get('suggested_end_date')}")
    assert period_res.get('has_previous') is True, "Should have previous cycle"

    print("=======================================================")
    print("ALL MULTI-SUBJECT ENROLMENT & FUNCTIONALITY VERIFIED 100%!")
    print("=======================================================")

if __name__ == '__main__':
    main()
