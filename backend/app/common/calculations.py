from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Tuple, Optional
import calendar
from datetime import date, timedelta


def compute_rolling_cycle_end(start_d: date, months: int = 1) -> Tuple[date, date]:
    """
    Given joining/cycle start date start_d (e.g. 2026-11-19) and months count (default 1):
    Calculates next renewal start (e.g. 2026-12-19) and current cycle end date (2026-12-18).
    Rule: joined 19 Nov -> month is 19 Nov to 18 Dec, next 19 Dec to 18 Jan.
    Never forces 1st-to-1st calendar month.
    """
    m_count = max(1, months)
    year = start_d.year
    month = start_d.month + m_count
    while month > 12:
        month -= 12
        year += 1
    _, max_days = calendar.monthrange(year, month)
    target_day = min(start_d.day, max_days)
    next_cycle_start = date(year, month, target_day)
    cycle_end = next_cycle_start - timedelta(days=1)
    return cycle_end, next_cycle_start


def evaluate_student_rolling_cycle(
    valid_from: Optional[date],
    valid_to: Optional[date],
    admission_date: date,
    balance_due: Decimal,
    net_price: Decimal,
    amount_collected: Decimal
) -> Dict[str, Any]:
    """
    Evaluates rolling date-to-date coaching cycle parameters, remaining days,
    anchor billing day of month, renewal due date, and cycle status.
    Rule: joined 19 Nov -> month is 19 Nov to 18 Dec, next 19 Dec to 18 Jan.
    """
    today = date.today()
    c_start = valid_from or admission_date
    if valid_to:
        c_end = valid_to
        next_due = c_end + timedelta(days=1)
    else:
        c_end, next_due = compute_rolling_cycle_end(c_start, 1)

    days_remaining = (c_end - today).days
    billing_day = c_start.day

    if balance_due > Decimal("0.00") and today > c_end:
        cycle_status = "OVERDUE"
        status_label = "Payment Overdue"
        badge_variant = "danger"
        status_subtext = f"Cycle ended {c_end.strftime('%d %b %Y')} · Overdue by {(today - c_end).days}d"
    elif today > c_end:
        cycle_status = "INACTIVE"
        status_label = "Inactive (Expired)"
        badge_variant = "danger"
        status_subtext = f"Cycle ended {(today - c_end).days}d ago ({c_end.strftime('%d %b %Y')})"
    elif today < c_start:
        cycle_status = "UPCOMING"
        status_label = "Upcoming"
        badge_variant = "neutral"
        status_subtext = f"Starts on {c_start.strftime('%d %b %Y')}"
    elif days_remaining <= 5:
        cycle_status = "DUE_SOON"
        status_label = "Expiring Soon"
        badge_variant = "warning"
        status_subtext = f"{days_remaining}d remaining · Renewal on {next_due.strftime('%d %b')}"
    else:
        cycle_status = "ACTIVE"
        status_label = "Active"
        badge_variant = "success"
        status_subtext = f"{days_remaining}d remaining in cycle"

    if balance_due <= Decimal("0.00") and net_price > Decimal("0.00"):
        payment_status = "PAID"
    elif amount_collected > Decimal("0.00"):
        payment_status = "PARTIAL"
    else:
        payment_status = "UNPAID"

    return {
        "valid_from": str(c_start),
        "valid_to": str(c_end),
        "billing_day": billing_day,
        "cycle_label": f"{c_start.strftime('%d %b %Y')} → {c_end.strftime('%d %b %Y')}",
        "billing_cycle_anchor": f"Day {billing_day} of month",
        "next_due_date": str(next_due),
        "days_remaining": days_remaining,
        "cycle_status": cycle_status,
        "status_label": status_label,
        "badge_variant": badge_variant,
        "status_subtext": status_subtext,
        "payment_status": payment_status,
        "net_price": float(net_price),
        "amount_collected": float(amount_collected),
        "balance_due": float(balance_due)
    }


def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def calculate_inclusive_gst(inclusive_amount: Decimal, gst_rate: Decimal) -> Tuple[Decimal, Decimal]:
    """
    Calculates Taxable Base and GST amount from GST-inclusive price.
    Formula:
      base_amount = inclusive_amount / (1 + gst_rate / 100)
      gst_amount = inclusive_amount - base_amount
    """
    if gst_rate <= Decimal("0.00") or inclusive_amount <= Decimal("0.00"):
        return inclusive_amount, Decimal("0.00")
    
    factor = Decimal("1.00") + (gst_rate / Decimal("100.00"))
    base_amount = round_money(inclusive_amount / factor)
    gst_amount = round_money(inclusive_amount - base_amount)
    return base_amount, gst_amount

def calculate_item_discount(original_price: Decimal, discount_type: str, discount_value: Decimal) -> Decimal:
    """
    Calculates discount amount on an item.
    """
    if discount_type == "PERCENTAGE":
        pct = min(discount_value, Decimal("100.00"))
        disc = round_money(original_price * (pct / Decimal("100.00")))
    elif discount_type == "FIXED":
        disc = round_money(min(discount_value, original_price))
    else:
        disc = Decimal("0.00")
    return disc

def calculate_admission_financials(
    items: List[Dict[str, Any]],
    overall_discount_type: str = "NONE",
    overall_discount_value: Decimal = Decimal("0.00"),
    gst_enabled: bool = False,
    gst_rate: Decimal = Decimal("18.00")
) -> Dict[str, Any]:
    """
    Calculates complete itemized admission numbers:
    - subtotal of original prices
    - individual discounts per item
    - subtotal after individual discounts
    - overall discount distributed proportionally
    - net price per item
    - inclusive GST breakdown
    - final total payable
    """
    subtotal = Decimal("0.00")
    individual_discount_total = Decimal("0.00")
    
    calculated_items = []
    
    for itm in items:
        price = Decimal(str(itm.get("price", 0)))
        d_type = itm.get("discount_type", "NONE")
        d_val = Decimal(str(itm.get("discount_value", 0)))
        
        ind_disc = calculate_item_discount(price, d_type, d_val)
        item_sub = max(Decimal("0.00"), price - ind_disc)
        
        subtotal += price
        individual_discount_total += ind_disc
        
        calculated_items.append({
            **itm,
            "original_price": price,
            "individual_discount": ind_disc,
            "after_individual_discount": item_sub,
            "net_price": item_sub
        })
        
    subtotal_after_individual = max(Decimal("0.00"), subtotal - individual_discount_total)
    
    # Overall discount
    overall_discount_amount = Decimal("0.00")
    if subtotal_after_individual > Decimal("0.00"):
        if overall_discount_type == "PERCENTAGE":
            pct = min(overall_discount_value, Decimal("100.00"))
            overall_discount_amount = round_money(subtotal_after_individual * (pct / Decimal("100.00")))
        elif overall_discount_type == "FIXED":
            overall_discount_amount = round_money(min(overall_discount_value, subtotal_after_individual))
            
    total_discount = individual_discount_total + overall_discount_amount
    total_payable = max(Decimal("0.00"), subtotal - total_discount)
    
    # Proportional overall discount distribution across items
    if subtotal_after_individual > Decimal("0.00") and overall_discount_amount > Decimal("0.00"):
        allocated_so_far = Decimal("0.00")
        for i, itm in enumerate(calculated_items):
            if i == len(calculated_items) - 1:
                # Last item takes remainder to prevent rounding variance
                item_ov_disc = overall_discount_amount - allocated_so_far
            else:
                share = itm["after_individual_discount"] / subtotal_after_individual
                item_ov_disc = round_money(overall_discount_amount * share)
                allocated_so_far += item_ov_disc
                
            itm["overall_discount_share"] = item_ov_disc
            itm["net_price"] = max(Decimal("0.00"), itm["after_individual_discount"] - item_ov_disc)
    else:
        for itm in calculated_items:
            itm["overall_discount_share"] = Decimal("0.00")
            itm["net_price"] = itm["after_individual_discount"]
            
    # Inclusive GST calculation on total payable
    taxable_base = total_payable
    gst_amount = Decimal("0.00")
    if gst_enabled and gst_rate > Decimal("0.00"):
        taxable_base, gst_amount = calculate_inclusive_gst(total_payable, gst_rate)
        
    return {
        "subtotal": subtotal,
        "individual_discount_total": individual_discount_total,
        "overall_discount_amount": overall_discount_amount,
        "total_discount": total_discount,
        "total_payable": total_payable,
        "gst_enabled": gst_enabled,
        "gst_rate": gst_rate if gst_enabled else Decimal("0.00"),
        "taxable_base": taxable_base,
        "gst_amount": gst_amount,
        "items": calculated_items
    }

def allocate_payment_proportionally(
    payment_amount: Decimal,
    items_with_balance: List[Dict[str, Any]],
    mode: str = "PROPORTIONAL",
    manual_allocations: Optional[Any] = None
) -> List[Tuple[Any, Decimal]]:
    """
    Allocates payment across admission items based on their outstanding balance.
    Guarantees:
      - sum(allocations) == payment_amount EXACTLY (using largest-remainder method on paise).
      - No allocation exceeds an item's balance.
      - Raises ValueError if payment > total balance or payment < 0.
    Supported modes:
      - "PROPORTIONAL" (default): largest-remainder on paise proportional to balance.
      - "SEQUENTIAL": allocates fully to first items in list order.
      - "MANUAL": cashier provides manual allocation amounts per item.
    Returns:
      List of (item_id, allocated_amount).
    """
    payment_amount = round_money(payment_amount)
    if payment_amount < Decimal("0.00"):
        raise ValueError("Payment amount cannot be negative")

    if not items_with_balance:
        if payment_amount > Decimal("0.00"):
            raise ValueError(f"Payment amount ₹{payment_amount} exceeds total outstanding balance ₹0.00")
        return []

    # Extract balances in paise
    items_paise = [
        (itm["id"], int(round(itm["balance_due"] * 100)))
        for itm in items_with_balance
    ]
    total_balance_paise = sum(p for _, p in items_paise)
    pay_paise = int(round(payment_amount * 100))

    if pay_paise > total_balance_paise:
        raise ValueError(
            f"Payment amount ₹{payment_amount} exceeds total outstanding balance ₹{Decimal(total_balance_paise) / Decimal(100):.2f}"
        )

    if pay_paise == 0:
        return [(itm["id"], Decimal("0.00")) for itm in items_with_balance]

    mode_norm = (mode or "PROPORTIONAL").upper()

    if mode_norm == "MANUAL":
        alloc_map = {}
        if isinstance(manual_allocations, dict):
            for k, v in manual_allocations.items():
                alloc_map[str(k)] = round_money(Decimal(str(v)))
        elif isinstance(manual_allocations, list):
            for entry in manual_allocations:
                if isinstance(entry, dict):
                    itm_id = str(entry.get("admission_item_id") or entry.get("id"))
                    alloc_map[itm_id] = round_money(Decimal(str(entry.get("allocated_amount") or entry.get("amount", 0))))
                else:
                    itm_id = str(getattr(entry, "admission_item_id", getattr(entry, "id", None)))
                    amt = getattr(entry, "allocated_amount", getattr(entry, "amount", Decimal("0.00")))
                    alloc_map[itm_id] = round_money(Decimal(str(amt)))

        result = []
        sum_manual_paise = 0
        for itm_id, bal_p in items_paise:
            amt = alloc_map.get(str(itm_id), Decimal("0.00"))
            amt_p = int(round(amt * 100))
            if amt_p < 0:
                raise ValueError("Manual allocation cannot be negative")
            if amt_p > bal_p:
                raise ValueError(
                    f"Manual allocation ₹{amt:.2f} exceeds item balance ₹{Decimal(bal_p)/Decimal(100):.2f}"
                )
            sum_manual_paise += amt_p
            result.append((itm_id, amt))

        if sum_manual_paise != pay_paise:
            raise ValueError(
                f"Sum of manual allocations (₹{Decimal(sum_manual_paise)/Decimal(100):.2f}) must equal payment amount (₹{payment_amount:.2f})"
            )
        return result

    elif mode_norm == "SEQUENTIAL":
        result = []
        rem_paise = pay_paise
        for itm_id, bal_p in items_paise:
            take = min(rem_paise, bal_p)
            result.append((itm_id, Decimal(take) / Decimal(100)))
            rem_paise -= take
        return result

    else:
        # PROPORTIONAL (Largest Remainder Method on Paise)
        floor_paise_shares = []
        remainders = []

        for idx, (itm_id, bal_p) in enumerate(items_paise):
            raw = (pay_paise * bal_p) / total_balance_paise
            flr = int(raw)
            flr = min(flr, bal_p)
            floor_paise_shares.append(flr)
            remainders.append((raw - flr, idx))

        allocated_paise = list(floor_paise_shares)
        distributed_paise = sum(allocated_paise)
        leftover = pay_paise - distributed_paise

        # Sort by remainder descending, then balance descending
        remainders.sort(key=lambda x: (x[0], items_paise[x[1]][1]), reverse=True)

        for _, idx in remainders:
            if leftover <= 0:
                break
            if allocated_paise[idx] < items_paise[idx][1]:
                allocated_paise[idx] += 1
                leftover -= 1

        if leftover > 0:
            for idx, (_, bal_p) in enumerate(items_paise):
                while leftover > 0 and allocated_paise[idx] < bal_p:
                    allocated_paise[idx] += 1
                    leftover -= 1

        return [
            (items_paise[i][0], Decimal(allocated_paise[i]) / Decimal(100))
            for i in range(len(items_paise))
        ]
