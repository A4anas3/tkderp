import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  UserCheck,
  MessageSquareText,
} from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { parseMonthYear } from '../../utils/calendarUtils';

const QUICK_ABSENT_REASONS = [
  'Sick Leave',
  'Personal Work',
  'Emergency',
  'Holiday',
  'Family Function',
  'Official Duty',
];

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildRecordsMap(records) {
  const map = {};
  if (!Array.isArray(records)) return map;
  for (const rec of records) {
    if (rec && rec.date) {
      const key = typeof rec.date === 'string' ? rec.date.slice(0, 10) : String(rec.date);
      map[key] = rec;
    }
  }
  return map;
}

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
  monthYear: propMonthYear,
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

  const [internalMonthYear, setInternalMonthYear] = useState(
    propMonthYear || initialMonthYear || getCurrentMonthYear()
  );
  const [absentDays, setAbsentDays] = useState([]); // Array of 'YYYY-MM-DD'
  const [recordsByDate, setRecordsByDate] = useState({}); // { 'YYYY-MM-DD': TeacherAttendanceRecordResponse }
  const [loading, setLoading] = useState(true);
  const [togglingDate, setTogglingDate] = useState(null);

  // Reason modal state when marking a day ABSENT
  const [absentModalDate, setAbsentModalDate] = useState(null);
  const [absentReason, setAbsentReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submittingAbsent, setSubmittingAbsent] = useState(false);

  // Active month is prop if provided, else internal state
  const activeMonthYear = propMonthYear || internalMonthYear;

  // Sync internal state when initialMonthYear changes (if propMonthYear not provided)
  useEffect(() => {
    if (initialMonthYear && !propMonthYear) {
      setInternalMonthYear(initialMonthYear);
    }
  }, [initialMonthYear, propMonthYear]);

  // Keep callbacks in refs to avoid recreating callbacks or triggering effects
  const onAttendanceChangeRef = useRef(onAttendanceChange);
  useEffect(() => {
    onAttendanceChangeRef.current = onAttendanceChange;
  }, [onAttendanceChange]);

  const onMonthChangeRef = useRef(onMonthChange);
  useEffect(() => {
    onMonthChangeRef.current = onMonthChange;
  }, [onMonthChange]);

  // Real calendar calculations for selected month & year
  const { yearNum, monthNum, daysInMonth } = parseMonthYear(activeMonthYear);
  const firstDayOfWeek = new Date(yearNum, monthNum - 1, 1).getDay(); // 0 is Sun

  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const absentSet = new Set(absentDays);
  const totalAbsent = absentDays.length;
  const totalPresent = Math.max(0, daysInMonth - totalAbsent);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const applyAttendanceResponse = useCallback((res) => {
    const rawList = res?.absent_days || res?.absent_dates || [];
    const normalized = rawList.map((d) => (typeof d === 'string' ? d : String(d)));
    setAbsentDays(normalized);
    setRecordsByDate(buildRecordsMap(res?.records));
    return normalized;
  }, []);

  // Load attendance records for teacher & activeMonthYear
  const loadAttendance = useCallback(async () => {
    if (!teacherId || !activeMonthYear) return;
    setLoading(true);
    try {
      const res = await teacherApi.getTeacherAttendance(teacherId, { month_year: activeMonthYear });
      applyAttendanceResponse(res);
    } catch (err) {
      console.error('Failed to load teacher attendance:', err);
      error(err.message || 'Failed to load teacher attendance');
    } finally {
      setLoading(false);
    }
  }, [teacherId, activeMonthYear, error, applyAttendanceResponse]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const updateMonth = (newMy) => {
    setInternalMonthYear(newMy);
    if (onMonthChangeRef.current) {
      onMonthChangeRef.current(newMy);
    }
  };

  // Navigate months
  const handlePrevMonth = () => {
    const parts = (activeMonthYear || '').split('-');
    if (parts.length !== 2) return;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const date = new Date(y, m - 2, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    updateMonth(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    const parts = (activeMonthYear || '').split('-');
    if (parts.length !== 2) return;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const date = new Date(y, m, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    updateMonth(`${newY}-${newM}`);
  };

  const closeAbsentModal = () => {
    if (submittingAbsent) return;
    setAbsentModalDate(null);
    setAbsentReason('');
    setReasonError('');
  };

  // Handle clicking a day cell:
  // - If currently ABSENT -> toggle back to Present immediately (clears stored reason)
  // - If currently Present -> open "Why absent?" modal (reason required)
  const handleDayClick = async (dateStr) => {
    if (togglingDate || submittingAbsent) return;

    const isCurrentlyAbsent = absentSet.has(dateStr);
    if (!isCurrentlyAbsent) {
      setAbsentModalDate(dateStr);
      setAbsentReason('');
      setReasonError('');
      return;
    }

    await togglePresentDay(dateStr);
  };

  // Toggle an already-absent day back to Present (no reason needed, clears stored reason)
  const togglePresentDay = async (dateStr) => {
    setTogglingDate(dateStr);

    const prevAbsentDays = absentDays;
    const prevRecordsByDate = recordsByDate;
    const newAbsentDays = absentDays.filter((d) => d !== dateStr);
    const nextRecords = { ...recordsByDate };
    delete nextRecords[dateStr];

    // Optimistic update
    setAbsentDays(newAbsentDays);
    setRecordsByDate(nextRecords);
    if (onAttendanceChangeRef.current) {
      onAttendanceChangeRef.current(
        newAbsentDays.length,
        Math.max(0, daysInMonth - newAbsentDays.length),
        daysInMonth,
        teacherId
      );
    }

    try {
      const res = await teacherApi.toggleAttendance(teacherId, { date: dateStr });
      const updated = applyAttendanceResponse(res);
      if (onAttendanceChangeRef.current) {
        onAttendanceChangeRef.current(
          updated.length,
          Math.max(0, daysInMonth - updated.length),
          daysInMonth,
          teacherId
        );
      }
      success(`Marked present on ${dateStr}`);
    } catch (err) {
      // Rollback on failure
      setAbsentDays(prevAbsentDays);
      setRecordsByDate(prevRecordsByDate);
      if (onAttendanceChangeRef.current) {
        onAttendanceChangeRef.current(
          prevAbsentDays.length,
          Math.max(0, daysInMonth - prevAbsentDays.length),
          daysInMonth,
          teacherId
        );
      }
      error(err.message || 'Failed to update attendance');
    } finally {
      setTogglingDate(null);
    }
  };

  // Confirm marking a day ABSENT with required reason
  const handleConfirmAbsent = async (e) => {
    e.preventDefault();
    if (!absentModalDate || submittingAbsent) return;

    const trimmedReason = absentReason.trim();
    if (!trimmedReason) {
      setReasonError('Please select or enter a reason for absence.');
      return;
    }

    setSubmittingAbsent(true);
    setTogglingDate(absentModalDate);
    setReasonError('');

    try {
      const res = await teacherApi.toggleAttendance(teacherId, {
        date: absentModalDate,
        reason: trimmedReason,
      });
      const updated = applyAttendanceResponse(res);
      if (onAttendanceChangeRef.current) {
        onAttendanceChangeRef.current(
          updated.length,
          Math.max(0, daysInMonth - updated.length),
          daysInMonth,
          teacherId
        );
      }
      success(`Marked absent on ${absentModalDate} (${trimmedReason})`);
      setAbsentModalDate(null);
      setAbsentReason('');
    } catch (err) {
      error(err.message || 'Failed to mark absent');
    } finally {
      setSubmittingAbsent(false);
      setTogglingDate(null);
    }
  };

  // Clear all absences (mark all present)
  const handleMarkAllPresent = async () => {
    if (!teacherId || absentDays.length === 0) return;
    try {
      const res = await teacherApi.saveMonthlyAttendance(teacherId, {
        month_year: activeMonthYear,
        absent_dates: [],
        absent_days: [],
      });
      applyAttendanceResponse(res);
      if (onAttendanceChangeRef.current) {
        onAttendanceChangeRef.current(0, daysInMonth, daysInMonth, teacherId);
      }
      success('All days marked present for this month');
    } catch (err) {
      error(err.message || 'Failed to clear absent days');
    }
  };

  const sortedAbsentDates = [...absentDays].sort();

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
              value={activeMonthYear}
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="font-medium">
            Click a present day to mark <strong>Absent</strong> (with reason), or click an absent day to restore <strong>Present</strong>.
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
              className="min-h-[92px] sm:min-h-[108px] rounded-lg bg-slate-50/40 border border-dashed border-slate-200"
            />
          ))}

          {/* Month days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayStr = String(dayNum).padStart(2, '0');
            const dateStr = `${activeMonthYear}-${dayStr}`;
            const isAbsent = absentSet.has(dateStr);
            const record = recordsByDate[dateStr];
            const reasonText = record?.reason?.trim();
            const markedByText = record?.marked_by?.trim();
            const isToggling = togglingDate === dateStr;
            const dayOfWeek = new Date(yearNum, monthNum - 1, dayNum).getDay();
            const isSunday = dayOfWeek === 0;

            const tooltipText = isAbsent
              ? `Absent${reasonText ? ` — ${reasonText}` : ''}${
                  markedByText ? ` • Marked by ${markedByText}` : ''
                } (click to mark Present)`
              : `Present on ${dateStr} (click to mark Absent)`;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleDayClick(dateStr)}
                disabled={isToggling}
                title={tooltipText}
                className={`relative min-h-[92px] sm:min-h-[108px] p-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between gap-1 group ${
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

                {/* Status Badge + Reason / Marked By */}
                <div className="w-full space-y-1 min-w-0">
                  {isAbsent ? (
                    <>
                      <div className="w-full text-center py-0.5 px-1 rounded bg-rose-600 text-white font-bold text-[10px] tracking-wide uppercase shadow-2xs">
                        Absent
                      </div>
                      {reasonText && (
                        <p className="text-[10px] font-semibold text-rose-900 truncate leading-tight">
                          {reasonText}
                        </p>
                      )}
                      {markedByText && (
                        <p className="text-[9px] font-medium text-rose-700/90 truncate leading-tight">
                          By {markedByText}
                        </p>
                      )}
                    </>
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

        {/* Absent Days Detail Panel */}
        {sortedAbsentDates.length > 0 && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquareText className="w-3.5 h-3.5 text-rose-600" />
                <span>Absent Days Details ({sortedAbsentDates.length})</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                Includes reason and who marked each absence
              </span>
            </div>

            <div className="divide-y divide-rose-100 rounded-lg border border-rose-200 bg-rose-50/40 overflow-hidden">
              {sortedAbsentDates.map((dateStr) => {
                const rec = recordsByDate[dateStr];
                const reasonText = rec?.reason?.trim();
                const markedByText = rec?.marked_by?.trim();
                const markedByEmp = rec?.marked_by_employee_id?.trim();

                return (
                  <div
                    key={dateStr}
                    className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-rose-50/80 transition"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-rose-800">
                          {formatDisplayDate(dateStr)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] uppercase">
                          Absent
                        </span>
                        <span className="font-semibold text-slate-900">
                          — {reasonText || 'No reason recorded'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-600">
                        <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>
                          Marked by{' '}
                          <strong className="text-slate-800">
                            {markedByText || 'Unknown'}
                          </strong>
                          {markedByEmp ? (
                            <span className="font-mono text-[10px] text-slate-500 ml-1">
                              ({markedByEmp})
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => togglePresentDay(dateStr)}
                      disabled={togglingDate === dateStr}
                      className="shrink-0 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      Mark Present
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Why Absent? Modal */}
      <Modal
        isOpen={Boolean(absentModalDate)}
        onClose={closeAbsentModal}
        title={teacherName ? `Mark Absent — ${teacherName}` : 'Mark Teacher Absent'}
        subtitle={absentModalDate ? `Date: ${formatDisplayDate(absentModalDate)} (${absentModalDate})` : ''}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmAbsent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Why absent? <span className="text-rose-600">*</span>
            </label>

            {/* Quick-pick options */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_ABSENT_REASONS.map((option) => {
                const isSelected = absentReason.trim().toLowerCase() === option.toLowerCase();
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setAbsentReason(option);
                      setReasonError('');
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={3}
              value={absentReason}
              onChange={(e) => {
                setAbsentReason(e.target.value);
                if (reasonError && e.target.value.trim()) {
                  setReasonError('');
                }
              }}
              placeholder="Enter reason or note (e.g. Sick Leave, Personal Work, Emergency)..."
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-2 focus:ring-odoo-500/20"
            />
            {reasonError && (
              <p className="mt-1 text-xs font-semibold text-rose-600">{reasonError}</p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              A reason is required to mark a day absent. Who marks it is recorded automatically.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeAbsentModal}
              disabled={submittingAbsent}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={submittingAbsent}
              disabled={!absentReason.trim() || submittingAbsent}
            >
              Mark Absent
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
