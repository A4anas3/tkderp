/**
 * Real Calendar Utilities for Thakurdwara ERP.
 * 
 * Rules:
 * - 31 days: January, March, May, July, August, October, December (months 1, 3, 5, 7, 8, 10, 12)
 * - 30 days: April, June, September, November (months 4, 6, 9, 11)
 * - February (month 2): 28 days normally, 29 days in a leap year.
 *   Leap-year rule: year divisible by 4, except end of century (divisible by 100) unless also divisible by 400.
 */

export function isLeapYear(year) {
  const y = Number(year);
  if (!y || isNaN(y)) return false;
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || isNaN(y) || isNaN(m) || m < 1 || m > 12) return 30;
  if (m === 2) {
    return isLeapYear(y) ? 29 : 28;
  }
  if (m === 4 || m === 6 || m === 9 || m === 11) {
    return 30;
  }
  return 31;
}

export function parseMonthYear(monthYearStr) {
  if (!monthYearStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return {
      yearNum: y,
      monthNum: m,
      monthYear: `${y}-${String(m).padStart(2, '0')}`,
      daysInMonth: getDaysInMonth(y, m),
    };
  }

  const parts = String(monthYearStr).split('-');
  const y = parseInt(parts[0], 10) || new Date().getFullYear();
  const m = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
  return {
    yearNum: y,
    monthNum: m,
    monthYear: `${y}-${String(m).padStart(2, '0')}`,
    daysInMonth: getDaysInMonth(y, m),
  };
}
