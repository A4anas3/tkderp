import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { getDaysInMonth, parseMonthYear } from '../../utils/calendarUtils';

/**
 * TeacherAttendanceCalendar
 * Monthly calendar view for a teacher where ONLY absent days need marking.
 * Any day not marked absent automatically counts as present.
 * Days in month and present days are dynamically computed using the real calendar
 * for that specific month & year (including February leap year rules).
 */
export default function TeacherAttendanceCalendar({
  teacherId,
  teacherName,
  initialMonthYear,
  onAttendanceChange,
  onMonthChange,
}) {
  const { success, error } = useToast();

  const getCurrentMonthYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const [monthYear, setMonthYear] = useState(initialMonthYear || getCurrentMonthYear());
  const [absentDays, setAbsentDays] = useState([]); // Array of 'YYYY-MM-DD'
  const [loading, setLoading] = useState(true);
  const [togglingDate, setTogglingDate] = useState(null);

  // Sync internal monthYear if initialMonthYear prop changes
  useEffect(() => {
    if (initialMonthYear && initialMonthYear !== monthYear) {
      setMonthYear(initialMonthYear);
    }
  }, [initialMonthYear]);

  // Real calendar calculations for selected month & year
  const { yearNum, monthNum, daysInMonth } = parseMonthYear(monthYear);
  const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay(); // 0 is Sun

  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const absentSet = new Set(absentDays);
  const totalAbsent = absentDays.length;
  const totalPresent = Math.max(0, daysInMonth - totalAbsent);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Load attendance records for teacher & monthYear
  const loadAttendance = useCallback(async () => {
    if (!teacherId || !monthYear) return;
    setLoading(true);
    try {
      const res = await teacherApi.getTeacherAttendance(teacherId, { month_year: monthYear });
      const rawList = res.absent_days || res.absent_dates || [];
      const normalized = rawList.map((d) => (typeof d === 'string' ? d : String(d)));
      setAbsentDays(normalized);
      if (onAttendanceChange) {
        const absCount = res.absent_days_count || normalized.length;
        const realDays = res.days_in_month || daysInMonth;
        const presCount = res.present_days_count ?? Math.max(0, realDays - absCount);
        onAttendanceChange(absCount, presCount, realDays);
      }
    } catch (err) {
      console.error('Failed to load teacher attendance:', err);
      error(err.message || 'Failed to load teacher attendance');
    } finally {
      setLoading(false);
    }
  }, [teacherId, monthYear, error, onAttendanceChange, daysInMonth]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const updateMonth = (newMy) => {
    setMonthYear(newMy);
    if (onMonthChange) {
      onMonthChange(newMy);
    }
  };

  // Navigate months
  const handlePrevMonth = () => {
    const [y, m] = monthYear.split('-').map(Number);
    const date = new Date(y, m - 2, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    updateMonth(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    const [y, m] = monthYear.split('-').map(Number);
    const date = new Date(y, m, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    updateMonth(`${newY}-${newM}`);
  };

  // Toggle absent/present for a date
  const handleToggleDay = async (dateStr) => {
    if (togglingDate) return;
    setTogglingDate(dateStr);

    const isCurrentlyAbsent = absentDays.includes(dateStr);
    const newAbsentDays = isCurrentlyAbsent
      ? absentDays.filter((d) => d !== dateStr)
      : [...absentDays, dateStr];

    // Optimistic update
    setAbsentDays(newAbsentDays);
    if (onAttendanceChange) {
      onAttendanceChange(newAbsentDays.length, Math.max(0, daysInMonth - newAbsentDays.length), daysInMonth);
    }

    try {
      await teacherApi.toggleAttendance(teacherId, { date: dateStr });
      if (isCurrentlyAbsent) {
        success(`Marked present on ${dateStr}`);
      } else {
        success(`Marked absent on ${dateStr}`);
      }
    } catch (err) {
      // Rollback on failure
      setAbsentDays(absentDays);
      if (onAttendanceChange) {
        onAttendanceChange(absentDays.length, Math.max(0, daysInMonth - absentDays.length), daysInMonth);
      }
      error(err.message || 'Failed to update attendance');
    } finally {
      setTogglingDate(null);
    }
  };

  // Clear all absences (mark all present)
  const handleMarkAllPresent = async () => {
    if (!teacherId || absentDays.length === 0) return;
    try {
      await teacherApi.saveMonthlyAttendance(teacherId, {
        month_year: monthYear,
        absent_dates: [],
        absent_days: [],
      });
      setAbsentDays([]);
      if (onAttendanceChange) onAttendanceChange(0, daysInMonth, daysInMonth);
      success('All days marked present for this month');
    } catch (err) {
      error(err.message || 'Failed to clear absent days');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Month Navigation & Metrics Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-base">
              {teacherName ? `${teacherName} — Attendance` : 'Monthly Attendance View'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-[#714B67] font-semibold font-mono">
              {monthLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Rule: Only absent days need marking. Any day not marked absent counts as present.
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={monthYear}
              onChange={(e) => e.target.value && updateMonth(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent px-2 py-1 outline-none font-mono cursor-pointer"
            />
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <Button
            size="xs"
            variant="secondary"
            onClick={loadAttendance}
            loading={loading}
            title="Reload attendance"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          {totalAbsent > 0 && (
            <Button
              size="xs"
              variant="outline"
              onClick={handleMarkAllPresent}
              className="text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-300"
            >
              Mark All Present
            </Button>
          )}
        </div>
      </div>

      {/* Monthly Summary KPI Banner */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-50 via-slate-50 to-emerald-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Selected Month
          </span>
          <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
            {monthLabel}
          </span>
        </div>

        <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Days in Month
          </span>
          <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
            {daysInMonth} days
          </span>
        </div>

        <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200 shadow-2xs">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
            Total Absent (Holidays)
          </span>
          <span className="font-mono font-black text-rose-700 text-base mt-0.5 block">
            {totalAbsent} {totalAbsent === 1 ? 'day' : 'days'}
          </span>
        </div>

        <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Present Days
          </span>
          <span className="font-mono font-black text-emerald-800 text-base mt-0.5 block">
            {totalPresent} / {daysInMonth} days
          </span>
        </div>
      </div>

      {/* Interactive Calendar Grid */}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium">
            Click on any day cell to toggle between <strong>Absent (Holiday)</strong> and{' '}
            <strong>Present</strong>.
          </span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400 inline-block" />
              Present (Default)
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <span className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-500 inline-block" />
              Absent (Holiday)
            </span>
          </div>
        </div>

        {/* Calendar Day Header */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-1.5 text-center">
          {daysOfWeek.map((day, idx) => (
            <div
              key={day}
              className={`py-1.5 text-xs font-bold uppercase tracking-wider rounded ${
                idx === 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-600 bg-slate-100/70'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days Matrix */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="h-20 sm:h-24 rounded-lg bg-slate-50/40 border border-dashed border-slate-200"
            />
          ))}

          {/* Month days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayStr = String(dayNum).padStart(2, '0');
            const dateStr = `${monthYear}-${dayStr}`;
            const isAbsent = absentSet.has(dateStr);
            const isToggling = togglingDate === dateStr;
            const dayOfWeek = new Date(yearNum, monthNum - 1, dayNum).getDay();
            const isSunday = dayOfWeek === 0;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleToggleDay(dateStr)}
                disabled={isToggling}
                className={`relative h-20 sm:h-24 p-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between group ${
                  isAbsent
                    ? 'bg-rose-50/90 border-rose-300 hover:border-rose-400 hover:bg-rose-100/80 shadow-xs'
                    : 'bg-white hover:bg-emerald-50/40 border-slate-200 hover:border-emerald-300'
                }`}
              >
                {/* Day Number and Status Indicator */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`font-mono text-sm sm:text-base font-bold ${
                      isAbsent
                        ? 'text-rose-700'
                        : isSunday
                        ? 'text-rose-500'
                        : 'text-slate-800 group-hover:text-emerald-700'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {isAbsent ? (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>

                {/* Status Badge */}
                <div className="w-full">
                  {isAbsent ? (
                    <div className="w-full text-center py-0.5 px-1 rounded bg-rose-600 text-white font-bold text-[10px] tracking-wide uppercase shadow-2xs">
                      Absent
                    </div>
                  ) : (
                    <div className="w-full text-center py-0.5 px-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px] tracking-wide uppercase">
                      Present
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
