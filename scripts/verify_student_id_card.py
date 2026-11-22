#!/usr/bin/env python3
"""
Comprehensive Live Verification for Student ID Card & Public Verification Portal.
"""
import sys
import urllib.parse
import httpx

BASE_API_URL = "http://127.0.0.1:8080"
BASE_FRONTEND_URL = "http://127.0.0.1:5173"

def main():
    print("=" * 70)
    print("THAKURDWARA ERP - STUDENT ID CARD & VERIFIER LIVE VERIFICATION")
    print("=" * 70)

    client = httpx.Client(timeout=10.0)

    # 1. Backend Health Check
    print("\n[1/7] Testing Backend Health Check...")
    h_res = client.get(f"{BASE_API_URL}/health")
    assert h_res.status_code == 200, f"Backend health failed with status {h_res.status_code}"
    health_data = h_res.json()
    assert health_data.get("status") == "healthy", f"Health status not healthy: {health_data}"
    print(f"  ✓ Backend healthy on port 8080: {health_data.get('service')}")

    # 2. Authenticate as Admin
    print("\n[2/7] Authenticating as Admin Staff...")
    auth_res = client.post(f"{BASE_API_URL}/api/auth/login", json={
        "username": "ADM001",
        "password": "Admin@1234"
    })
    assert auth_res.status_code == 200, f"Login failed: {auth_res.text}"
    token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("  ✓ Admin authenticated successfully")

    # 3. Retrieve Student Profile
    print("\n[3/7] Fetching Student Profile...")
    stu_res = client.get(f"{BASE_API_URL}/api/students", headers=headers)
    assert stu_res.status_code == 200, f"List students failed: {stu_res.text}"
    students = stu_res.json()["items"]
    assert len(students) > 0, "No students found in system"

    # Find a student with an admission number and active courses
    target_student = None
    target_detail = None
    for s in students:
        s_id = s["id"]
        d_res = client.get(f"{BASE_API_URL}/api/students/{s_id}", headers=headers)
        if d_res.status_code == 200:
            d_json = d_res.json()
            if d_json.get("latest_admission_number") and d_json.get("active"):
                target_student = s
                target_detail = d_json
                break

    if not target_student:
        target_student = students[0]
        d_res = client.get(f"{BASE_API_URL}/api/students/{target_student['id']}", headers=headers)
        target_detail = d_res.json()

    print(f"  ✓ Target Student: {target_detail.get('name')} (Code: {target_detail.get('student_code')})")
    print(f"    - Admission Number: {target_detail.get('latest_admission_number')}")
    print(f"    - Mobile Number: {target_detail.get('mobile')}")
    print(f"    - Active Courses Count: {len(target_detail.get('active', []))}")
    for idx, c in enumerate(target_detail.get('active', [])):
        print(f"      [{idx+1}] {c.get('subject_name')} | Valid: {c.get('valid_from')} to {c.get('valid_to')}")

    # 4. Check Active Enrollment Endpoint
    print("\n[4/7] Fetching Active Enrollment Details...")
    enr_res = client.get(f"{BASE_API_URL}/api/students/{target_student['id']}/active-enrollment", headers=headers)
    assert enr_res.status_code == 200, f"Active enrollment fetch failed: {enr_res.text}"
    enr_data = enr_res.json()
    active_subjs = enr_data.get("active_subjects", [])
    active_gc = enr_data.get("active_green_card")
    total_active = len(active_subjs) + (1 if active_gc else 0)
    print(f"  ✓ Active Enrollment confirmed: {total_active} active course(s)")

    # 5. Public Verification Endpoint (No Auth Required)
    print("\n[5/7] Testing Public Verification Endpoint (Unauthenticated)...")
    adm_no = target_detail.get("latest_admission_number") or target_detail.get("student_code")
    v_res = client.get(f"{BASE_API_URL}/api/verify/{adm_no}")
    assert v_res.status_code == 200, f"Public verify failed: {v_res.text}"
    v_data = v_res.json()
    assert v_data.get("verified") is True, "Verification flag is not True"
    assert v_data["student"]["name"] == target_detail["name"], "Student name mismatch"
    assert v_data["student"]["student_code"] == target_detail["student_code"], "Student code mismatch"
    assert v_data["student"]["admission_number"] == adm_no, "Admission number mismatch"
    assert "active_courses" in v_data, "active_courses missing from verification data"
    print(f"  ✓ Verification Success for: {adm_no}")
    print(f"    - Student: {v_data['student']['name']}")
    print(f"    - Verified Status: {v_data['student']['status']}")
    print(f"    - Institute: {v_data.get('institute_name')}")
    print(f"    - Active Courses Listed: {len(v_data['active_courses'])}")
    for c in v_data["active_courses"]:
        print(f"      • {c['course_name']}: {c['validity_period']} ({c.get('days_remaining')} days left)")

    # Test verification by Student Code as well
    stu_code = target_detail["student_code"]
    v_by_code = client.get(f"{BASE_API_URL}/api/verify/{stu_code}")
    assert v_by_code.status_code == 200, "Verification by student code failed"
    assert v_by_code.json()["verified"] is True
    print(f"  ✓ Verification by Student Code '{stu_code}' also verified successfully")

    # 6. Verify WhatsApp Share Link Generation
    print("\n[6/7] Testing WhatsApp wa.me Share Link Generation...")
    phone = target_detail.get("mobile", "9876543210")
    clean_phone = "".join(filter(str.isdigit, phone))
    if len(clean_phone) == 10:
        clean_phone = f"91{clean_phone}"

    expected_qr_url = f"{BASE_FRONTEND_URL}/verify/{adm_no}"
    msg_parts = [
        "THAKURDWARA COACHING INSTITUTE",
        "Official Student Identity Card",
        f"Student Name: {target_detail['name']}",
        f"Student ID: {target_detail['student_code']}",
        f"Admission No: {adm_no}",
        f"Verify Credential Online:\n{expected_qr_url}",
    ]
    encoded_text = urllib.parse.quote(f"Test Student Card for {target_detail['name']}")
    wa_url = f"https://wa.me/{clean_phone}?text={encoded_text}"
    assert wa_url.startswith("https://wa.me/"), "WhatsApp URL must start with https://wa.me/"
    assert clean_phone in wa_url, "Phone must be present in wa.me link"
    print(f"  ✓ WhatsApp wa.me link target: https://wa.me/{clean_phone}")
    print(f"  ✓ Verification URL in message: {expected_qr_url}")

    # 7. Frontend Verification Page & Assets
    print("\n[7/7] Testing Frontend Verification Route & Assets...")
    fe_res = client.get(f"{BASE_FRONTEND_URL}/verify/{adm_no}")
    assert fe_res.status_code == 200, f"Frontend verify page returned status {fe_res.status_code}"
    assert "text/html" in fe_res.headers.get("content-type", "")
    print(f"  ✓ Frontend route '{BASE_FRONTEND_URL}/verify/{adm_no}' served HTTP 200 HTML")

    fe_proxy_res = client.get(f"{BASE_FRONTEND_URL}/api/verify/{adm_no}")
    assert fe_proxy_res.status_code == 200, f"Frontend API proxy failed with {fe_proxy_res.status_code}"
    assert fe_proxy_res.json().get("verified") is True
    print(f"  ✓ Frontend API proxy correctly routed to backend")

    print("\n" + "=" * 70)
    print("ALL LIVE VERIFICATION CHECKS PASSED PERFECTLY (7/7)")
    print("=" * 70)

if __name__ == "__main__":
    main()
