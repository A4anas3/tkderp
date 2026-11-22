import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8080"

def get_auth_token():
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=json.dumps({"username": "ADM001", "password": "Admin@1234"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())["access_token"]

def test_reports():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    print("[1] Authentication: OK (Admin logged in)")

    # 1. Collections Report (a)
    print("\n--- Testing (a) Collections Report ---")
    url = f"{BASE_URL}/api/reports/collections"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "gross_collected" in data["summary"]
        assert "by_mode" in data
        assert "by_cashier" in data
        print(f"Collections Summary: Gross=₹{data['summary']['gross_collected']}, Refunds=₹{data['summary']['total_refunded']}, Net=₹{data['summary']['net_collected']}")
        print(f"Payment Modes ({len(data['by_mode'])}): {[m['mode'] for m in data['by_mode']]}")
        print(f"Cashiers ({len(data['by_cashier'])}): {[c['cashier_name'] for c in data['by_cashier']]}")
        print(f"Transactions: {len(data['transactions'])}")

    # Collections CSV
    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Payment Number" in content
        print(f"Collections CSV Export: OK ({len(content.splitlines())} lines)")

    # 2. Dues & Ageing Report (b)
    print("\n--- Testing (b) Dues & Ageing Report ---")
    url = f"{BASE_URL}/api/reports/dues-ageing"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "buckets" in data["summary"]
        buckets = data["summary"]["buckets"]
        print(f"Total Dues: ₹{data['summary']['total_due']}")
        print(f"Ageing Buckets: 0-30=₹{buckets.get('0-30', {}).get('amount', 0)}, 31-60=₹{buckets.get('31-60', {}).get('amount', 0)}, 61-90=₹{buckets.get('61-90', {}).get('amount', 0)}, 90+=₹{buckets.get('90+', {}).get('amount', 0)}")
        print(f"Students with dues: {len(data['items'])}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Student Name" in content
        print(f"Dues Ageing CSV Export: OK ({len(content.splitlines())} lines)")

    # 3. Subject-wise Breakup (c)
    print("\n--- Testing (c) Subject-wise Breakup Report ---")
    url = f"{BASE_URL}/api/reports/subject-breakup"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "items" in data
        assert "summary" in data
        print(f"Subject-wise Summary: Booked=₹{data['summary']['total_booked_all']}, Collected=₹{data['summary']['total_collected_all']}, Balance=₹{data['summary']['total_balance_all']}")
        for s in data["items"][:5]:
            print(f"  Subject: {s['subject_name']} ({s['subject_code']}) | Enrolled: {s['enrolled_count']} | Billed: ₹{s['fees_billed']} | Collected: ₹{s['collected']} | Due: ₹{s['due']} | Waived: ₹{s.get('waived', 0)} | Refunded: ₹{s.get('refunded', 0)} | Net: ₹{s.get('net_revenue', 0)}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Subject Code" in content
        print(f"Subject Breakup CSV Export: OK ({len(content.splitlines())} lines)")

    # 4. Teacher-wise Breakup (d)
    print("\n--- Testing (d) Teacher-wise Breakup Report ---")
    url = f"{BASE_URL}/api/reports/teacher-breakup"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert isinstance(data, list)
        print(f"Total Faculty Members: {len(data)}")
        for t in data[:5]:
            print(f"  Faculty: {t['teacher_name']} ({t['teacher_code']}) | Batches: {t['batches_count']} | Enrolled: {t['enrolled_count']} | Billed: ₹{t.get('fees_billed', 0)} | Collections: ₹{t.get('collections', 0)} | Due: ₹{t.get('due', 0)}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Teacher Code" in content
        print(f"Teacher Breakup CSV Export: OK ({len(content.splitlines())} lines)")

    # 5. Batch-wise Report (e)
    print("\n--- Testing (e) Batch-wise Report ---")
    url = f"{BASE_URL}/api/reports/batch-breakup"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert isinstance(data, list)
        print(f"Total Batches: {len(data)}")
        for b in data[:5]:
            print(f"  Batch: {b['batch_name']} ({b['batch_code']}) | Hall: {b['hall_number']} | Enrolments: {b['enrolled_count']} | Collections: ₹{b.get('collections', 0)} | Dues: ₹{b.get('dues', 0)}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Batch Code" in content
        print(f"Batch Breakup CSV Export: OK ({len(content.splitlines())} lines)")

    # 6. Admissions & Conversion Report (f)
    print("\n--- Testing (f) Admissions & Conversion Report ---")
    url = f"{BASE_URL}/api/reports/admissions-conversion"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "by_source" in data
        assert "by_subject" in data
        print(f"Conversion Summary: Enquiries={data['summary']['total_enquiries']}, Converted={data['summary']['total_converted']}, Conversion Rate={data['summary']['overall_conversion_rate']}%")
        print(f"Sources Breakdown ({len(data['by_source'])}): {[{'source': s['source_name'], 'enquiries': s['enquiries_count'], 'converted': s['converted_count'], 'rate': s['conversion_rate_pct']} for s in data['by_source']]}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Enquiry Code" in content
        print(f"Admissions Conversion CSV Export: OK ({len(content.splitlines())} lines)")

    # 7. Waivers Report (g)
    print("\n--- Testing (g) Waivers Report ---")
    url = f"{BASE_URL}/api/reports/waivers"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "items" in data
        print(f"Waivers Summary: Total Waived=₹{data['summary']['total_waived_amount']}, Count={data['summary']['waivers_count']}, Unique Students={data['summary']['unique_students_count']}")
        for w in data["items"][:5]:
            print(f"  Waiver: {w['waiver_number']} | Student: {w['student_name']} | Waived: ₹{w['waived_amount']} | Admin: {w['admin_name']} | Reason: {w['reason']} | Audit Ref: {w['audit_reference']}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Waiver Number" in content
        print(f"Waivers CSV Export: OK ({len(content.splitlines())} lines)")

    # 8. Refunds Report (h)
    print("\n--- Testing (h) Refunds Report ---")
    url = f"{BASE_URL}/api/reports/refunds"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "items" in data
        print(f"Refunds Summary: Net Refunded=₹{data['summary']['total_refunded_amount']}, Gross Requested=₹{data['summary']['gross_requested_amount']}, Deductions=₹{data['summary']['total_deductions_amount']}")
        for r in data["items"][:5]:
            print(f"  Refund: {r['refund_number']} | Student: {r['student_name']} | Net: ₹{r['amount']} | Deduction: ₹{r['deduction_amount']} | Mode: {r['refund_mode']} | Reason: {r['reason']}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Refund Number" in content
        print(f"Refunds CSV Export: OK ({len(content.splitlines())} lines)")

    # 9. Expenses Report (i)
    print("\n--- Testing (i) Expenses Report ---")
    url = f"{BASE_URL}/api/reports/expenses"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "items" in data
        assert "by_category" in data
        print(f"Expenses Summary: Total=₹{data['summary']['total_expenses']}, Operational=₹{data['summary']['total_operational_expenses']}, Salaries=₹{data['summary']['total_salaries_paid']}")
        for c in data["by_category"]:
            print(f"  Category: {c['category_name']} | Count: {c['count']} | Amount: ₹{c['amount']}")

    req_csv = urllib.request.Request(f"{url}?format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Category" in content or "Reference" in content
        print(f"Expenses CSV Export: OK ({len(content.splitlines())} lines)")

    # 10. Summary Dashboard (j)
    print("\n--- Testing (j) Summary Dashboard ---")
    url = f"{BASE_URL}/api/reports/summary-dashboard?period=daily"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert "summary" in data
        assert "intervals" in data
        print(f"Daily Summary Dashboard: Billed=₹{data['summary']['total_billed']}, Collected=₹{data['summary']['total_collected']}, Due=₹{data['summary']['total_due']}, Expenses=₹{data['summary']['total_expenses']}, Net Cash=₹{data['summary']['net_cash']}")
        print(f"Daily Intervals ({len(data['intervals'])}):")
        for inv in data["intervals"][-5:]:
            print(f"  {inv['period_label']}: Billed=₹{inv['billed']} | Collected=₹{inv['collected']} | Expenses=₹{inv['expenses']} | Net=₹{inv['net_cash']}")

    url_m = f"{BASE_URL}/api/reports/summary-dashboard?period=monthly"
    req_m = urllib.request.Request(url_m, headers=headers)
    with urllib.request.urlopen(req_m) as resp:
        data_m = json.loads(resp.read().decode())
        print(f"Monthly Summary Dashboard: Billed=₹{data_m['summary']['total_billed']}, Collected=₹{data_m['summary']['total_collected']}, Net Cash=₹{data_m['summary']['net_cash']}")
        print(f"Monthly Intervals ({len(data_m['intervals'])}):")
        for inv in data_m["intervals"]:
            print(f"  {inv['period_label']}: Billed=₹{inv['billed']} | Collected=₹{inv['collected']} | Net=₹{inv['net_cash']}")

    req_csv = urllib.request.Request(f"{url}&format=csv", headers=headers)
    with urllib.request.urlopen(req_csv) as resp:
        content = resp.read().decode()
        assert "Period" in content
        print(f"Summary Dashboard CSV Export: OK ({len(content.splitlines())} lines)")

    print("\n=== ALL 10 REPORTS & EXPORTS VERIFIED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_reports()
