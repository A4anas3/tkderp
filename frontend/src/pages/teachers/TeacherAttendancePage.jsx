import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  UserCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import TeacherAttendanceCalendar from '../../components/teachers/TeacherAttendanceCalendar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { getDaysInMonth, parseMonthYear } from '../../utils/calendarUtils';

export default function TeacherAttendancePage() {
  const { error } = useToast();

  const getCurrentMonthYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [teachers, setTeachers] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('CALENDAR'); // 'CALENDAR' | 'SUMMARY'

  // Tab 2 Summary Server-Side Pagination
  const [summaryItems, setSummaryItems] = useState([]);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryTotalPages, setSummaryTotalPages] = useState(1);
  const summaryPageSize = 15;

  const loadSummaryData = useCallback(async () => {
    try {
      const res = await teacherApi.getAttendanceSummary({
        month_year: monthYear,
        page: summaryPage,
        page_size: summaryPageSize,
      });
      const items = Array.isArray(res) ? res : res?.items || [];
      setSummaryItems(items);
      setSummaryTotal(typeof res?.total === 'number' ? res.total : items.length);
      setSummaryTotalPages(typeof res?.total_pages === 'number' ? res.total_pages : 1);
    } catch (err) {
      console.error('Failed to load attendance summary page:', err);
    }
  }, [monthYear, summaryPage, summaryPageSize]);

  useEffect(() => {
    loadSummaryData();
  }, [loadSummaryData]);

  // Reset summary page on month change
  useEffect(() => {
    setSummaryPage(1);
  }, [monthYear]);

  // Load teacher attendance summary for the given month
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tchRes, summaryRes] = await Promise.all([
        teacherApi.list({ page: 1, page_size: 100 }),
        teacherApi.getAttendanceSummary({ month_year: monthYear }),
      ]);

      const tList = tchRes.items || [];
      setTeachers(tList);
      setAttendanceSummary(summaryRes || []);

      setSelectedTeacherId((prev) => prev || (tList.length > 0 ? tList[0].id : null));
    } catch (err) {
      console.error('Failed to load teacher attendance data:', err);
      error(err.message || 'Failed to load teacher attendance data');
    } finally {
      setLoading(false);
    }
  }, [monthYear, error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigate months
  const handlePrevMonth = () => {
    const parts = (monthYear || '').split('-');
    if (parts.length !== 2) return;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const date = new Date(y, m - 2, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    setMonthYear(`${newY}-${newM}`);
  };

  const handleNextMonth = () => {
    const parts = (monthYear || '').split('-');
    if (parts.length !== 2) return;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const date = new Date(y, m, 1);
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    setMonthYear(`${newY}-${newM}`);
  };

  // Build lookup map for absent counts
  const summaryMap = React.useMemo(() => {
    const map = new Map();
    for (const item of attendanceSummary) {
      map.set(item.teacher_id, item);
    }
    return map;
  }, [attendanceSummary]);

  // Filtered teachers list
  const filteredTeachers = React.useMemo(() => {
    return teachers.filter((t) => {
      const q = search.toLowerCase();
      return (
        t.name?.toLowerCase().includes(q) ||
        t.specialization?.toLowerCase().includes(q) ||
        t.teacher_code?.toLowerCase().includes(q)
      );
    });
  }, [teachers, search]);

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);

  // Month label and days from real calendar (including February leap-year rule)
  const { yearNum, monthNum, daysInMonth } = parseMonthYear(monthYear);
  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  // Callback when attendance toggled in calendar
  const handleAttendanceChange = useCallback((newAbsentCount, newPresentCount, realDays, targetTeacherId) => {
    setAttendanceSummary((prev) => {
      const tId = targetTeacherId || selectedTeacherId;
      if (!tId) return prev;
      const dCount = realDays || daysInMonth;
      const pCount = typeof newPresentCount === 'number' ? newPresentCount : Math.max(0, dCount - newAbsentCount);
      const exists = prev.some((item) => item.teacher_id === tId);
      if (exists) {
        return prev.map((item) =>
          item.teacher_id === tId
            ? {
                ...item,
                absent_days_count: newAbsentCount,
                present_days_count: pCount,
                days_in_month: dCount,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          teacher_id: tId,
          absent_days_count: newAbsentCount,
          present_days_count: pCount,
          days_in_month: dCount,
        },
      ];
    });
  }, [selectedTeacherId, daysInMonth]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#714B67] flex items-center justify-center text-white shadow-sm">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Teacher Attendance
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly absent marking per teacher • Days not marked absent automatically count as present
            </p>
          </div>
        </div>

        {/* Global Month Selector */}
        <div className="flex items-center gap-2">
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
              onChange={(e) => e.target.value && setMonthYear(e.target.value)}
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
            onClick={loadData}
            loading={loading}
            title="Refresh attendance records"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('CALENDAR')}
          className={`flex items-center gap-2 px-3 py-2 min-h-[36px] text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'CALENDAR'
              ? 'border-odoo-600 text-odoo-700 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100 rounded-t-lg'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Teacher Monthly Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SUMMARY')}
          className={`flex items-center gap-2 px-3 py-2 min-h-[36px] text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'SUMMARY'
              ? 'border-odoo-600 text-odoo-700 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100 rounded-t-lg'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>All Faculty Summary ({teachers.length})</span>
        </button>
      </div>

      {/* TAB 1: TEACHER MONTHLY CALENDAR VIEW */}
      {activeTab === 'CALENDAR' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Column: Teacher Selection Roster */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 space-y-3">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Select Teacher ({filteredTeachers.length})
              </span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter teacher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-odoo-600"
                />
              </div>
            </div>

            {/* List of Teachers */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-0.5">
              {filteredTeachers.map((t) => {
                const isSelected = t.id === selectedTeacherId;
                const info = summaryMap.get(t.id);
                const absentCount = info ? info.absent_days_count : 0;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-purple-50 border-[#714B67] shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-[#714B67]' : 'text-slate-800'
                        }`}
                      >
                        {t.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {t.specialization || 'Faculty'} •{' '}
                        <span className="font-mono text-[10px]">{t.teacher_code}</span>
                      </p>
                    </div>

                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        absentCount > 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                      title={`${absentCount} holidays / absent days in ${monthLabel}`}
                    >
                      {absentCount} {absentCount === 1 ? 'absent' : 'absent'}
                    </span>
                  </button>
                );
              })}

              {filteredTeachers.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">
                  No teachers match search
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Interactive Monthly Calendar */}
          <div className="lg:col-span-3">
            {selectedTeacher ? (
              <TeacherAttendanceCalendar
                key={selectedTeacher.id}
                teacherId={selectedTeacher.id}
                teacherName={selectedTeacher.name}
                monthYear={monthYear}
                onAttendanceChange={handleAttendanceChange}
                onMonthChange={setMonthYear}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                <UserCheck className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold">Select a teacher to view and mark attendance</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ALL FACULTY SUMMARY OVERVIEW */}
      {activeTab === 'SUMMARY' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Monthly Absent & Present Summary — {monthLabel}
              </h3>
              <p className="text-xs text-slate-500">
                Total holidays / absent days per faculty for payroll calculation
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-600 bg-white px-2.5 py-1 rounded border border-slate-200">
              {daysInMonth} Days in Month
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-bold">
                  <th className="py-2.5 px-4">Faculty Member</th>
                  <th className="py-2.5 px-4">Specialization</th>
                  <th className="py-2.5 px-4">Contact</th>
                  <th className="py-2.5 px-4 text-center">Absent Days (Holidays)</th>
                  <th className="py-2.5 px-4 text-center">Present Days</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryItems.map((info) => {
                  const absentCount = info ? (info.absent_days_count ?? 0) : 0;
                  const rowDaysInMonth = (info && info.days_in_month) || daysInMonth;
                  const presentCount = info && typeof info.present_days_count === 'number'
                    ? info.present_days_count
                    : Math.max(0, rowDaysInMonth - absentCount);

                  return (
                    <tr key={info.teacher_id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-slate-900 block">{info.teacher_name}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {info.teacher_code}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 font-medium">
                        {info.specialization || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                        {info.mobile || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            absentCount > 0
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {absentCount} {absentCount === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-semibold text-emerald-800">
                        {presentCount} / {rowDaysInMonth}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            setSelectedTeacherId(info.teacher_id);
                            setActiveTab('CALENDAR');
                          }}
                          className="inline-flex items-center gap-1"
                        >
                          <span>Mark Days</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {summaryItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                      No faculty members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {summaryTotal > 0 && (
            <div className="p-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-50/50">
              <span className="text-slate-600 font-medium">
                Showing {(summaryPage - 1) * summaryPageSize + 1} to {Math.min(summaryPage * summaryPageSize, summaryTotal)} of {summaryTotal} faculty members (Page {summaryPage} of {summaryTotalPages})
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={summaryPage <= 1}
                  onClick={() => setSummaryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="px-2 font-bold text-slate-800">
                  {summaryPage} / {summaryTotalPages}
                </span>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={summaryPage >= summaryTotalPages}
                  onClick={() => setSummaryPage((p) => Math.min(summaryTotalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
