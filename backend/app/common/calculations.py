from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Tuple

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
    items_with_balance: List[Dict[str, Any]]
) -> List[Tuple[Any, Decimal]]:
    """
    Allocates a payment across admission items based on their outstanding balance.
    Returns a list of (item_id, allocated_amount).
    """
    total_balance = sum((itm["balance_due"] for itm in items_with_balance), Decimal("0.00"))
    if total_balance <= Decimal("0.00") or payment_amount <= Decimal("0.00"):
        return []
    
    allocations = []
    amount_left = min(payment_amount, total_balance)
    allocated_sum = Decimal("0.00")
    
    for i, itm in enumerate(items_with_balance):
        if i == len(items_with_balance) - 1:
            alloc_for_item = amount_left - allocated_sum
        else:
            share = itm["balance_due"] / total_balance
            alloc_for_item = round_money(amount_left * share)
            allocated_sum += alloc_for_item
            
        alloc_for_item = min(alloc_for_item, itm["balance_due"])
        allocations.append((itm["id"], alloc_for_item))
        
    return allocations
