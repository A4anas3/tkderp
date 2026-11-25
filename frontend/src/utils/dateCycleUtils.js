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

export function getCleanCancelReason(reason) {
  if (!reason || typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const junkWords = ['dsfd', 'asdf', 'asdfg', 'qwerty', 'zxcv', 'xxx', 'test', 'bla', 'blah', 'null', 'undefined', 'na', 'n/a', 'none'];
  if (junkWords.includes(lower)) return null;
  if (/^[bcdfghjklmnpqrstvwxyz]{3,}$/i.test(lower)) return null;
  if (/^(.)\1+$/i.test(trimmed)) return null;
  if (trimmed.length < 3) return null;
  return trimmed;
}

export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const dt = new Date(y, m, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function computeDaysRemaining(validToStr, validFromStr = null) {
  const end = parseLocalDate(validToStr);
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseLocalDate(validFromStr);
  const refDate = start && start > today ? start : today;
  const diffTime = end.getTime() - refDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Compute remaining active days across an array of { valid_from, valid_to } periods.
 * Only days actually covered by a validity period from today onward are counted;
 * gap days between disjoint periods (and days before a future start) are excluded.
 */
export function computeDaysRemainingForPeriods(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const parsed = periods.map((p) => ({
    start: parseLocalDate(p?.valid_from),
    end: parseLocalDate(p?.valid_to),
  }));
  if (parsed.some((p) => !p.end)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;

  const nonExpired = parsed.filter((p) => p.end.getTime() >= today.getTime());
  if (nonExpired.length === 0) {
    const maxEnd = new Date(Math.max(...parsed.map((p) => p.end.getTime())));
    const starts = parsed.map((p) => p.start).filter(Boolean);
    const minStart = starts.length ? new Date(Math.min(...starts.map((s) => s.getTime()))) : null;
    const refDate = minStart && minStart > today ? minStart : today;
    return Math.round((maxEnd.getTime() - refDate.getTime()) / ONE_DAY_MS);
  }

  const intervals = nonExpired
    .map((p) => {
      const effStart = p.start && p.start > today ? p.start : today;
      return { start: effStart, end: p.end };
    })
    .filter((iv) => iv.start.getTime() <= iv.end.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());

  if (intervals.length === 0) return 0;

  const merged = [{ start: intervals[0].start, end: intervals[0].end }];
  for (let i = 1; i < intervals.length; i += 1) {
    const curr = intervals[i];
    const prev = merged[merged.length - 1];
    if (curr.start.getTime() <= prev.end.getTime() + ONE_DAY_MS) {
      if (curr.end.getTime() > prev.end.getTime()) {
        prev.end = curr.end;
      }
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  let coveredDays = 0;
  for (const iv of merged) {
    coveredDays += Math.round((iv.end.getTime() - iv.start.getTime()) / ONE_DAY_MS) + 1;
  }
  return Math.max(0, coveredDays - 1);
}

/**
 * Returns the number of uncovered gap days strictly between prevValidTo and nextValidFrom.
 * Returns 0 if contiguous or overlapping.
 */
export function computeGapDays(prevValidTo, nextValidFrom) {
  const prevEnd = parseLocalDate(prevValidTo);
  const nextStart = parseLocalDate(nextValidFrom);
  if (!prevEnd || !nextStart) return 0;
  const ONE_DAY_MS = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((nextStart.getTime() - prevEnd.getTime()) / ONE_DAY_MS);
  return diffDays > 1 ? diffDays - 1 : 0;
}

export function evaluateCycleStatus(endDateStr, balanceDue = 0, isCancelledOrRevoked = false, startDateStr = null) {
  if (isCancelledOrRevoked) {
    return {
      status: 'CANCELLED',
      label: 'Cancelled',
      variant: 'danger',
      daysRemaining: null,
      subtext: 'Cancelled',
    };
  }

  if (!endDateStr) {
    return {
      status: 'UNKNOWN',
      label: 'Unknown',
      variant: 'neutral',
      daysRemaining: null,
      subtext: 'No cycle set',
    };
  }

  const daysRemaining = computeDaysRemaining(endDateStr, startDateStr);
  if (daysRemaining === null) {
    return {
      status: 'UNKNOWN',
      label: 'Unknown',
      variant: 'neutral',
      daysRemaining: null,
      subtext: 'No cycle set',
    };
  }

  if (daysRemaining < 0) {
    return {
      status: 'EXPIRED',
      label: 'Expired',
      variant: 'danger',
      daysRemaining,
      subtext: `Cycle expired ${Math.abs(daysRemaining)}d ago · Renewal due`,
    };
  } else if (daysRemaining <= 7) {
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

export function formatValidityDuration(days) {
  const d = parseInt(days, 10);
  if (!d || isNaN(d)) return '—';
  if (d === 365) return '365 Days (1 Year)';
  if (d > 0 && d % 365 === 0) return `${d} Days (${d / 365} Years)`;
  if (d === 180) return '180 Days (6 Months)';
  if (d === 90) return '90 Days (3 Months)';
  if (d === 60) return '60 Days (2 Months)';
  if (d === 30) return '30 Days (1 Month)';
  if (d > 0 && d % 30 === 0) return `${d} Days (${d / 30} Months)`;
  return `${d} Days`;
}
