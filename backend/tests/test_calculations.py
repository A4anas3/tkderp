from decimal import Decimal
import uuid
import pytest
from app.common.calculations import (
    round_money,
    calculate_inclusive_gst,
    calculate_item_discount,
    calculate_admission_financials,
    allocate_payment_proportionally
)

def test_round_money():
    assert round_money(Decimal("100.004")) == Decimal("100.00")
    assert round_money(Decimal("100.005")) == Decimal("100.01")
    assert round_money(Decimal("100.009")) == Decimal("100.01")

def test_inclusive_gst_calculation_spec():
    """
    Test exact formula from master prompt:
    Final displayed amount = ₹400
    GST rate = 18%
    Base amount = 400 / 1.18 = ₹338.98
    GST amount = 400 - 338.98 = ₹61.02
    Total payable = ₹400
    """
    base, gst = calculate_inclusive_gst(Decimal("400.00"), Decimal("18.00"))
    assert base == Decimal("338.98")
    assert gst == Decimal("61.02")
    assert base + gst == Decimal("400.00")

def test_inclusive_gst_zero_or_disabled():
    base, gst = calculate_inclusive_gst(Decimal("500.00"), Decimal("0.00"))
    assert base == Decimal("500.00")
    assert gst == Decimal("0.00")

def test_item_discount():
    # Percentage discount: 10% on 1500 = 150
    disc = calculate_item_discount(Decimal("1500.00"), "PERCENTAGE", Decimal("10.00"))
    assert disc == Decimal("150.00")

    # Fixed discount: 100 on 1000 = 100
    disc = calculate_item_discount(Decimal("1000.00"), "FIXED", Decimal("100.00"))
    assert disc == Decimal("100.00")

    # Fixed discount exceeding price is capped
    disc = calculate_item_discount(Decimal("500.00"), "FIXED", Decimal("700.00"))
    assert disc == Decimal("500.00")

def test_admission_financials_multi_subject_example():
    """
    Matches prompt section 11 & 12:
    Math: 1000, disc: 100 (after: 900)
    Physics: 1500, disc: 10% (150, after: 1350)
    English: 800, disc: 0 (after: 800)
    Subtotal: 3300
    Individual discount total: 250
    Subtotal after ind disc: 3050
    Overall fixed discount: 50
    Total payable: 3000
    GST 18% inclusive:
      Base: 3000 / 1.18 = 2542.37
      GST: 3000 - 2542.37 = 457.63
    """
    items = [
        {"price": Decimal("1000.00"), "discount_type": "FIXED", "discount_value": Decimal("100.00")},
        {"price": Decimal("1500.00"), "discount_type": "PERCENTAGE", "discount_value": Decimal("10.00")},
        {"price": Decimal("800.00"), "discount_type": "NONE", "discount_value": Decimal("0.00")},
    ]
    result = calculate_admission_financials(
        items=items,
        overall_discount_type="FIXED",
        overall_discount_value=Decimal("50.00"),
        gst_enabled=True,
        gst_rate=Decimal("18.00")
    )

    assert result["subtotal"] == Decimal("3300.00")
    assert result["individual_discount_total"] == Decimal("250.00")
    assert result["overall_discount_amount"] == Decimal("50.00")
    assert result["total_discount"] == Decimal("300.00")
    assert result["total_payable"] == Decimal("3000.00")
    assert result["taxable_base"] == Decimal("2542.37")
    assert result["gst_amount"] == Decimal("457.63")
    assert result["taxable_base"] + result["gst_amount"] == Decimal("3000.00")

    # Check sum of net_price across items matches total_payable
    total_net = sum(itm["net_price"] for itm in result["items"])
    assert total_net == Decimal("3000.00")

def test_allocate_payment_proportionally():
    """
    Matches prompt section 13:
    Suppose:
    Item 1 balance: 1000
    Item 2 balance: 1500
    Item 3 balance: 800
    Total balance: 3300
    Payment amount: 1000
    """
    item1_id = uuid.uuid4()
    item2_id = uuid.uuid4()
    item3_id = uuid.uuid4()

    items = [
        {"id": item1_id, "balance_due": Decimal("1000.00")},
        {"id": item2_id, "balance_due": Decimal("1500.00")},
        {"id": item3_id, "balance_due": Decimal("800.00")},
    ]

    allocations = allocate_payment_proportionally(Decimal("1000.00"), items)
    alloc_map = dict(allocations)

    total_allocated = sum(alloc_map.values())
    assert total_allocated == Decimal("1000.00")
    # Proportions:
    # 1000 / 3300 * 1000 = 303.03
    # 1500 / 3300 * 1000 = 454.55
    # 800 / 3300 * 1000 = remainder 242.42
    assert alloc_map[item1_id] == Decimal("303.03")
    assert alloc_map[item2_id] == Decimal("454.55")
    assert alloc_map[item3_id] == Decimal("242.42")


def test_three_subjects_odd_paise_and_modes():
    """
    Acceptance:
    Three subjects (1000/1000/1000), pay 1000 then 1000.01 style odd amounts:
    allocation sum always equals payment exactly.
    Tests PROPORTIONAL (largest-remainder), SEQUENTIAL, and MANUAL modes.
    Tests error handling when payment exceeds total balance.
    """
    s1, s2, s3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    items = [
        {"id": s1, "balance_due": Decimal("1000.00")},
        {"id": s2, "balance_due": Decimal("1000.00")},
        {"id": s3, "balance_due": Decimal("1000.00")},
    ]

    # Test odd payment amounts
    odd_amounts = [
        Decimal("0.01"),
        Decimal("0.02"),
        Decimal("1.00"),
        Decimal("333.33"),
        Decimal("1000.00"),
        Decimal("1000.01"),
        Decimal("1000.02"),
        Decimal("1000.03"),
        Decimal("1499.99"),
        Decimal("2000.00"),
        Decimal("2500.50"),
        Decimal("2999.99"),
        Decimal("3000.00")
    ]

    for pay_amt in odd_amounts:
        allocs = allocate_payment_proportionally(pay_amt, items, mode="PROPORTIONAL")
        alloc_map = dict(allocs)
        total_allocated = sum(alloc_map.values())
        assert total_allocated == pay_amt, f"Allocated sum {total_allocated} != {pay_amt}"
        for itm_id, amt in allocs:
            assert amt <= Decimal("1000.00"), f"Item {itm_id} allocated {amt} > balance 1000.00"
            assert amt >= Decimal("0.00")

    # Specifically for 1000.00 and 1000.01
    alloc_1000 = dict(allocate_payment_proportionally(Decimal("1000.00"), items))
    assert sum(alloc_1000.values()) == Decimal("1000.00")

    alloc_1000_01 = dict(allocate_payment_proportionally(Decimal("1000.01"), items))
    assert sum(alloc_1000_01.values()) == Decimal("1000.01")
    # In paise: 100001 / 3 = 33333.666... -> two items get 333.34 and one gets 333.33
    values_1000_01 = sorted(alloc_1000_01.values())
    assert values_1000_01 == [Decimal("333.33"), Decimal("333.34"), Decimal("333.34")]

    # Overpayment raises ValueError
    with pytest.raises(ValueError, match="exceeds total outstanding balance"):
        allocate_payment_proportionally(Decimal("3000.01"), items)

    with pytest.raises(ValueError, match="exceeds total outstanding balance"):
        allocate_payment_proportionally(Decimal("5000.00"), items)

    # SEQUENTIAL mode
    seq_allocs = dict(allocate_payment_proportionally(Decimal("1500.50"), items, mode="SEQUENTIAL"))
    assert sum(seq_allocs.values()) == Decimal("1500.50")
    assert seq_allocs[s1] == Decimal("1000.00")
    assert seq_allocs[s2] == Decimal("500.50")
    assert seq_allocs[s3] == Decimal("0.00")

    # MANUAL mode
    manual_entries = [
        {"admission_item_id": s1, "allocated_amount": Decimal("600.00")},
        {"admission_item_id": s2, "allocated_amount": Decimal("300.00")},
        {"admission_item_id": s3, "allocated_amount": Decimal("100.00")},
    ]
    man_allocs = dict(allocate_payment_proportionally(
        Decimal("1000.00"), items, mode="MANUAL", manual_allocations=manual_entries
    ))
    assert sum(man_allocs.values()) == Decimal("1000.00")
    assert man_allocs[s1] == Decimal("600.00")
    assert man_allocs[s2] == Decimal("300.00")
    assert man_allocs[s3] == Decimal("100.00")

    # MANUAL mode mismatch raises ValueError
    bad_manual = [
        {"admission_item_id": s1, "allocated_amount": Decimal("500.00")},
        {"admission_item_id": s2, "allocated_amount": Decimal("300.00")},
        {"admission_item_id": s3, "allocated_amount": Decimal("100.00")},
    ]
    with pytest.raises(ValueError, match="Sum of manual allocations"):
        allocate_payment_proportionally(
            Decimal("1000.00"), items, mode="MANUAL", manual_allocations=bad_manual
        )

    # MANUAL mode exceeding item balance raises ValueError
    excess_manual = [
        {"admission_item_id": s1, "allocated_amount": Decimal("1200.00")},
        {"admission_item_id": s2, "allocated_amount": Decimal("0.00")},
        {"admission_item_id": s3, "allocated_amount": Decimal("0.00")},
    ]
    with pytest.raises(ValueError, match="exceeds item balance"):
        allocate_payment_proportionally(
            Decimal("1200.00"), items, mode="MANUAL", manual_allocations=excess_manual
        )


def test_rolling_monthly_cycle_calculations():
    """
    Test user specified rolling cycle rules:
    - Joined 19 Nov -> month is 19 Nov to 18 Dec, next 19 Dec to 18 Jan. Never force 1st-to-1st.
    - Joined 1 Oct -> 1 Oct to 31 Oct, next 1 Nov to 30 Nov.
    - Multi-month duration: e.g. 2 months from 19 Nov -> 19 Nov to 18 Jan, next 19 Jan.
    """
    from datetime import date
    from app.common.calculations import compute_rolling_cycle_end, evaluate_student_rolling_cycle

    # 1 month from Nov 19
    cycle_end, next_start = compute_rolling_cycle_end(date(2026, 11, 19), 1)
    assert cycle_end == date(2026, 12, 18)
    assert next_start == date(2026, 12, 19)

    # Next month from Dec 19
    cycle_end_2, next_start_2 = compute_rolling_cycle_end(next_start, 1)
    assert cycle_end_2 == date(2027, 1, 18)
    assert next_start_2 == date(2027, 1, 19)

    # 1 month from Oct 1
    cycle_end_oct, next_start_oct = compute_rolling_cycle_end(date(2026, 10, 1), 1)
    assert cycle_end_oct == date(2026, 10, 31)
    assert next_start_oct == date(2026, 11, 1)

    # 2 months duration from Nov 19
    cycle_end_2m, next_start_2m = compute_rolling_cycle_end(date(2026, 11, 19), 2)
    assert cycle_end_2m == date(2027, 1, 18)
    assert next_start_2m == date(2027, 1, 19)

    # Evaluation
    eval_res = evaluate_student_rolling_cycle(
        valid_from=date(2026, 11, 19),
        valid_to=None,
        admission_date=date(2026, 11, 19),
        balance_due=Decimal("0.00"),
        net_price=Decimal("2000.00"),
        amount_collected=Decimal("2000.00")
    )
    assert eval_res["valid_to"] == "2026-12-18"
    assert eval_res["next_due_date"] == "2026-12-19"
    assert eval_res["billing_day"] == 19
    assert eval_res["payment_status"] == "PAID"

