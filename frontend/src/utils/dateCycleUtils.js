/**
 * Rolling Monthly Fee Cycle Utility for Thakurdwara Coaching ERP.
 * 
 * Industry-Standard Rule:
 * A student's fee month starts on their own joining / enrollment date and ends the same date
 * next month minus 1 day (e.g., joined 19 Nov -> month is 19 Nov to 18 Dec, next 19 Dec to 18 Jan).
 * Never force 1st-to-1st calendar month.
 */

export function computeRollingCycle(startDateStr, monthsCount = 1) {
  if (!startDateStr) return null;
  const parts = startDateStr.split('-');
  if (parts.length !== 3) return null;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1; // 0-based month in JS
  const d = parseInt(parts[2], 10);

  const mCount = Math.max(1, parseInt(monthsCount, 10) || 1);
  let nextY = y;
  let nextM = m + mCount;
  while (nextM > 11) {
    nextM -= 12;
    nextY += 1;
  }

  // Determine max days in target month (e.g. Feb has 28/29, Nov has 30)
  const maxDays = new Date(nextY, nextM + 1, 0).getDate();
  const targetDay = Math.min(d, maxDays);

  // Next cycle start date (e.g., 19 Dec 2026)
  const nextStart = new Date(nextY, nextM, targetDay);

  // Current cycle end date is 1 day before nextStart (e.g., 18 Dec 2026)
  const currentEnd = new Date(nextStart);
  currentEnd.setDate(currentEnd.getDate() - 1);

  const pad = (n) => String(n).padStart(2, '0');
  const endDateStr = `${currentEnd.getFullYear()}-${pad(currentEnd.getMonth() + 1)}-${pad(currentEnd.getDate())}`;
  const nextDueDateStr = `${nextStart.getFullYear()}-${pad(nextStart.getMonth() + 1)}-${pad(nextStart.getDate())}`;

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    nextDueDate: nextDueDateStr,
    billingDay: d,
    billingDayLabel: `Day ${d} of month`,
  };
}

export function formatIndianDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatCycleLabel(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '—';
  return `${formatIndianDate(startDateStr)} → ${formatIndianDate(endDateStr)}`;
}

export function evaluateCycleStatus(endDateStr, balanceDue = 0) {
  if (!endDateStr) {
    return {
      status: 'UNKNOWN',
      label: 'Unknown',
      variant: 'neutral',
      daysRemaining: 0,
      subtext: 'No cycle set',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = endDateStr.split('T')[0].split('-');
  const end = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (Number(balanceDue) > 0 && daysRemaining < 0) {
    return {
      status: 'OVERDUE',
      label: 'Payment Overdue',
      variant: 'danger',
      daysRemaining,
      subtext: `Cycle ended · Overdue by ${Math.abs(daysRemaining)}d`,
    };
  } else if (daysRemaining < 0) {
    return {
      status: 'RENEWAL_DUE',
      label: 'Renewal Due',
      variant: 'warning',
      daysRemaining,
      subtext: `Cycle ended · Renewal due`,
    };
  } else if (daysRemaining <= 5) {
    return {
      status: 'DUE_SOON',
      label: 'Expiring Soon',
      variant: 'warning',
      daysRemaining,
      subtext: `${daysRemaining}d remaining in cycle`,
    };
  } else {
    return {
      status: 'ACTIVE',
      label: 'Active',
      variant: 'success',
      daysRemaining,
      subtext: `${daysRemaining}d remaining in cycle`,
    };
  }
}
