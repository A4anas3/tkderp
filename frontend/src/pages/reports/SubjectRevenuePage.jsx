import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedImage from '../../components/common/ProtectedImage';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Layers,
  Award,
  ChevronDown,
  ChevronRight,
  Users,
  CreditCard,
  ExternalLink,
  Search,
  BookOpen,
  GraduationCap,
  Calendar,
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  Info
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import DateRangeFilter from '../../components/common/DateRangeFilter';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import SubjectDetailModal from '../../components/modals/SubjectDetailModal';
import TeacherDetailModal from '../../components/modals/TeacherDetailModal';
import { reportApi } from '../../services/allApis';
import { formatIndianDate, formatCycleLabel, evaluateCycleStatus } from '../../utils/dateCycleUtils';

const PAGE_SIZE = 50;

/**
 * Sub-table displaying enrolled students with rolling date-to-date billing cycles.
 * Equipped with dedicated server-side search, pagination, and clickable rows to student profile.
 */
function StudentRosterSubtable({ entityId, filters = {}, contextType = 'subject', onCollectFee }) {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingRoster, setLoadingRoster] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterText);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterText]);

  const loadRoster = useCallback(async () => {
    if (!entityId) return;
    setLoadingRoster(true);
    try {
      const params = {
        ...filters,
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
      };
      const res =
        contextType === 'teacher'
          ? await reportApi.getTeacherRevenueStudents(entityId, params)
          : await reportApi.getSubjectRevenueStudents(entityId, params);
      setStudents(res?.items || []);
      setTotal(res?.total ?? 0);
      setTotalAll(res?.total_all ?? (res?.total ?? 0));
      setTotalPages(Math.max(1, res?.total_pages || 1));
    } catch (err) {
      console.error('Failed to load student roster subtable:', err);
    } finally {
      setLoadingRoster(false);
    }
  }, [entityId, filters, contextType, page, debouncedSearch]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  if (!loadingRoster && totalAll === 0) {
    return (
      <div className="py-4 px-6 text-center text-xs text-slate-600 bg-white rounded-lg border border-dashed border-slate-300">
        No active students enrolled in this selection for the chosen date period.
      </div>
    );
  }

  const currentPage = Math.min(page, totalPages);
  const pagedStudents = students;

  return (
    <div className="bg-slate-50/90 p-3 sm:p-4 rounded-lg border border-slate-200 space-y-3 shadow-inner">
      {/* Search and count header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-black uppercase tracking-wider">
            Enrolled Students ({total} of {totalAll})
          </span>
          <span className="text-[11px] text-slate-600 hidden sm:inline font-medium">
            · Date-to-date rolling monthly cycle roster (click any student row for profile)
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search student, code, mobile..."
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 text-black placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Roster Table */}
      <div className="overflow-x-auto bg-white rounded border border-slate-200 shadow-sm -webkit-overflow-scrolling-touch">
        <table className="w-full text-left text-xs min-w-[750px]">
          <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-2.5">Student</th>
              {contextType === 'subject' && <th className="p-2.5">Faculty & Hall</th>}
              {contextType === 'teacher' && <th className="p-2.5">Subject</th>}
              <th className="p-2.5">Rolling Billing Cycle</th>
              <th className="p-2.5 text-center">Cycle Status</th>
              <th className="p-2.5 text-right">Fee Billed</th>
              <th className="p-2.5 text-right text-emerald-800">Collected</th>
              <th className="p-2.5 text-right text-rose-700">Due</th>
              <th className="p-2.5 text-center">Payment</th>
              <th className="p-2.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedStudents.map((s, idx) => (
              <tr
                key={idx}
                onClick={(e) => {
                  if (e.target.closest('button, a, input, [data-no-click]')) return;
                  navigate(`/students/${s.student_id}`);
                }}
                className="hover:bg-purple-50/40 cursor-pointer transition-colors"
                title="Click to view student profile & enrollment ledger"
              >
                {/* Student info */}
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    <ProtectedImage
                      src={s.photo_url}
                      alt={s.student_name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                      fallback={
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-xs shrink-0 border border-odoo-200">
                          {s.student_name ? s.student_name.slice(0, 2).toUpperCase() : 'ST'}
                        </div>
                      }
                    />
                    <div>
                      <div className="font-bold text-black hover:text-odoo-600 transition">
                        {s.student_name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 font-semibold">
                        {s.student_code}
                      </div>
                      {s.mobile && (
                        <div className="text-[11px] text-slate-600 font-mono">
                          📞 {s.mobile}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Context specific column */}
                {contextType === 'subject' && (
                  <td className="p-2.5 text-slate-700">
                    <div className="font-semibold text-black">{s.teacher_name || 'Faculty'}</div>
                    <div className="text-[11px] text-slate-600">{s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'}</div>
                  </td>
                )}
                {contextType === 'teacher' && (
                  <td className="p-2.5 text-slate-700">
                    <div className="font-semibold text-black">{s.subject_name || 'Subject'}</div>
                    <div className="text-[11px] text-slate-600">{s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'}</div>
                  </td>
                )}

                {/* Rolling Cycle Window */}
                <td className="p-2.5">
                  <div className="font-mono font-bold text-black text-xs">
                    {s.cycle_label || formatCycleLabel(s.valid_from, s.valid_to)}
                  </div>
                  <div className="text-[11px] text-odoo-700 font-semibold">
                    {s.billing_cycle_anchor || `Day ${s.billing_day || 1} cycle`}
                  </div>
                  <div className="text-[10px] text-slate-600 font-medium">
                    Next Due: {s.next_due_date || '—'}
                  </div>
                </td>

                {/* Cycle Status */}
                <td className="p-2.5 text-center">
                  <Badge variant={s.badge_variant || 'neutral'} size="xs">
                    {s.status_label || s.cycle_status}
                  </Badge>
                  <div className="text-[10px] text-slate-600 mt-0.5 font-medium">
                    {s.status_subtext}
                  </div>
                </td>

                {/* Fee Billed */}
                <td className="p-2.5 text-right font-mono font-bold text-black">
                  ₹{(s.net_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>

                {/* Amount Collected */}
                <td className="p-2.5 text-right font-mono font-bold text-emerald-800">
                  ₹{(s.amount_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>

                {/* Balance Due */}
                <td className="p-2.5 text-right font-mono font-bold text-rose-700">
                  ₹{(s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>

                {/* Payment Status */}
                <td className="p-2.5 text-center">
                  <Badge
                    size="xs"
                    variant={
                      s.payment_status === 'PAID'
                        ? 'success'
                        : s.payment_status === 'PARTIAL'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {s.payment_status}
                  </Badge>
                </td>

                {/* Actions */}
                <td className="p-2.5 text-center" data-no-click>
                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/students/${s.student_id}`)}
                      title="View Student Profile"
                      className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 hover:text-blue-800 font-semibold rounded-md border border-blue-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Profile</span>
                    </button>
                    {(s.balance_due > 0 || s.cycle_status === 'OVERDUE' || s.cycle_status === 'RENEWAL_DUE' || s.cycle_status === 'DUE_SOON') && (
                      <button
                        onClick={() => onCollectFee(s.admission_id)}
                        title="Collect Fee Payment"
                        className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 font-bold rounded-md border border-emerald-300 shadow-2xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Pay Fee</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Subtable Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-600 pt-1 px-1">
        <span>
          Showing <strong className="text-black">{total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
          <strong className="text-black">{Math.min(currentPage * PAGE_SIZE, total)}</strong> of{' '}
          <strong className="text-black">{total}</strong> students
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={currentPage <= 1 || loadingRoster}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5 text-black" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || loadingRoster}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-black" />
          </button>
          <span className="px-2 py-0.5 font-medium text-black">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || loadingRoster}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5 text-black" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={currentPage >= totalPages || loadingRoster}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Last Page"
          >
            <ChevronsRight className="w-3.5 h-3.5 text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubjectRevenuePage() {
  const [subjectData, setSubjectData] = useState(null);
  const [teacherData, setTeacherData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFilters, setCurrentFilters] = useState({});

  // View state
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'subjects', 'teachers'
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [expandedTeachers, setExpandedTeachers] = useState({});

  // Searches & Pagination for each Ledger
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectPage, setSubjectPage] = useState(1);

  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherPage, setTeacherPage] = useState(1);

  // Detail Modals
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState(null);
  const [selectedTeacherDetail, setSelectedTeacherDetail] = useState(null);

  // Fee collection modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAdmissionId, setPayAdmissionId] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, tRes] = await Promise.all([
        reportApi.getSubjectRevenue({
          ...currentFilters,
          page: subjectPage,
          page_size: PAGE_SIZE,
          search: subjectSearch.trim() || undefined,
        }),
        reportApi.getTeacherRevenue({
          ...currentFilters,
          page: teacherPage,
          page_size: PAGE_SIZE,
          search: teacherSearch.trim() || undefined,
        }),
      ]);
      setSubjectData(subRes);
      setTeacherData(tRes || []);
    } catch (err) {
      console.error('Failed to load revenue reports:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFilters, subjectPage, subjectSearch, teacherPage, teacherSearch]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFilterChange = (newFilters) => {
    setCurrentFilters(newFilters);
    setSubjectPage(1);
    setTeacherPage(1);
  };

  const toggleSubjectExpand = (subId) => {
    setExpandedSubjects((prev) => ({
      ...prev,
      [subId]: !prev[subId],
    }));
  };

  const toggleTeacherExpand = (teacherId) => {
    setExpandedTeachers((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  };

  const handleOpenFeeModal = (admissionId) => {
    setPayAdmissionId(admissionId);
    setPayModalOpen(true);
  };

  const summary = subjectData?.summary || {};
  const pagedSubjects = subjectData?.items || [];
  const subjectTotal = subjectData?.total ?? pagedSubjects.length;
  const subjectTotalPages = subjectData?.total_pages ?? 1;

  const pagedTeachers = Array.isArray(teacherData) ? teacherData : teacherData?.items || [];
  const teacherTotal = teacherData?.total ?? pagedTeachers.length;
  const teacherTotalPages = teacherData?.total_pages ?? 1;

  // Chart data formatting: Show active top subjects and avoid label crowding
  const chartData = useMemo(() => {
    const activeItems = pagedSubjects
      .filter((itm) => itm.total_booked > 0)
      .sort((a, b) => b.total_booked - a.total_booked)
      .slice(0, 10);

    return activeItems.map((itm) => ({
      fullName: itm.subject_name,
      name: itm.subject_name.length > 12 ? `${itm.subject_name.substring(0, 12)}...` : itm.subject_name,
      Booked: itm.total_booked,
      Collected: itm.total_collected,
      Outstanding: itm.balance_due,
    }));
  }, [pagedSubjects]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
          Subject & Teacher Revenue Distribution
        </h1>
        <p className="text-xs text-slate-500">
          Industry-standard rolling date-to-date monthly cycle rosters, revenue allocations, and collection dues
        </p>
      </div>

      {/* Choosable Date-to-Date & Month Filter */}
      <DateRangeFilter
        onFilterChange={handleFilterChange}
        title="Revenue Date Range & Month Filter"
      />

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse bg-white border border-slate-200 rounded-lg">
          Loading revenue records for selected date range...
        </div>
      ) : (
        <>
          {/* Active Range Notice */}
          {currentFilters.from_date && currentFilters.to_date && (
            <div className="bg-purple-50 border border-odoo-200 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 text-odoo-900 font-medium">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-odoo-700" />
                Active Date Range: <span className="font-bold underline text-black">{currentFilters.from_date}</span> to <span className="font-bold underline text-black">{currentFilters.to_date}</span>
                <span className="text-[11px] text-slate-600 font-normal">
                  (Showing students whose rolling cycle overlaps with this window)
                </span>
              </span>
              <span className="text-[11px] bg-white px-2.5 py-0.5 rounded border border-odoo-300 font-bold text-black">
                {rawItems.length} Subjects Active
              </span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              title="Total Billed Revenue"
              value={`₹${(summary.total_booked_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Total booked admission value"
              icon={BarChart3}
              color="indigo"
            />
            <StatCard
              title="Total Actual Cash Collected"
              value={`₹${(summary.total_collected_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Realized fees allocated to subjects"
              icon={TrendingUp}
              color="emerald"
            />
            <StatCard
              title="Total Outstanding Balance"
              value={`₹${(summary.total_balance_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              subtext="Pending student fees due"
              icon={Layers}
              color="rose"
            />
          </div>

          {/* Visual Chart with Angled & Truncated Labels */}
          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                  Booked vs Collected Revenue (Top Active Subjects)
                </h2>
                <span className="text-[11px] text-slate-500 font-medium">Real-time performance comparison</span>
              </div>

              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#09090b', fontWeight: 600 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip
                      formatter={(val, name, entry) => [`₹${Number(val).toLocaleString('en-IN')}`, name]}
                      labelFormatter={(label, payload) => {
                        if (payload && payload[0] && payload[0].payload) {
                          return payload[0].payload.fullName || label;
                        }
                        return label;
                      }}
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '12px', color: '#000000', borderRadius: '6px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="Booked" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Billed / Booked" />
                    <Bar dataKey="Collected" fill="#059669" radius={[4, 4, 0, 0]} name="Collected Cash" />
                    <Bar dataKey="Outstanding" fill="#e11d48" radius={[4, 4, 0, 0]} name="Pending Balance" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Section Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-1">
            <button
              onClick={() => {
                setActiveTab('all');
                setSubjectPage(1);
                setTeacherPage(1);
              }}
              className={`min-h-[36px] px-3 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Ledgers
            </button>
            <button
              onClick={() => {
                setActiveTab('subjects');
                setSubjectPage(1);
              }}
              className={`min-h-[36px] px-3 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'subjects'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Subject Ledgers ({subjectTotal})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('teachers');
                setTeacherPage(1);
              }}
              className={`min-h-[36px] px-3 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'teachers'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Teacher Ledgers ({teacherTotal})</span>
            </button>
          </div>

          {/* 1. Subject Revenue & Enrollment Ledger */}
          {(activeTab === 'all' || activeTab === 'subjects') && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                <div>
                  <h2 className="text-sm font-bold text-black flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-odoo-600" />
                    <span>Subject Revenue & Enrolled Student Rosters</span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Click any subject row or Detail to open dedicated curriculum & enrolled rolling cycle roster page
                  </p>
                </div>

                {/* Subject Search Box */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search subject by name or code..."
                    value={subjectSearch}
                    onChange={(e) => {
                      setSubjectSearch(e.target.value);
                      setSubjectPage(1);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 text-black placeholder:text-slate-400 font-medium"
                  />
                </div>
              </div>

              <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Subject Name</th>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5 text-right">Standard Fee</th>
                      <th className="p-2.5 text-center">Enrollments</th>
                      <th className="p-2.5 text-right">Total Billed</th>
                      <th className="p-2.5 text-right text-emerald-800">Actual Collected</th>
                      <th className="p-2.5 text-right text-rose-700">Balance Due</th>
                      <th className="p-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedSubjects.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No subjects matching '{subjectSearch}'.
                        </td>
                      </tr>
                    ) : (
                      pagedSubjects.map((s, idx) => {
                        const isExpanded = !!expandedSubjects[s.subject_id];
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                                isExpanded ? 'bg-purple-50/20' : ''
                              }`}
                              onClick={() => navigate(`/reports/subject/${s.subject_id}`)}
                              title="Click to open dedicated subject page with rolling cycle student roster"
                            >
                              <td className="p-2.5 font-bold text-black flex items-center gap-1.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-odoo-600 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                {s.subject_code === 'GREEN-CARD' ? (
                                  <Award className="w-4 h-4 text-purple-600 shrink-0" />
                                ) : null}
                                <span className="hover:text-odoo-600">{s.subject_name}</span>
                              </td>
                              <td className="p-2.5 font-mono text-slate-700 font-semibold">{s.subject_code}</td>
                              <td className="p-2.5 text-right font-mono text-slate-800 font-semibold">
                                ₹{s.default_fee.toFixed(2)}
                              </td>
                              <td className="p-2.5 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold transition-all ${
                                    isExpanded
                                      ? 'bg-odoo-600 text-white shadow-xs'
                                      : s.enrolled_count > 0
                                      ? 'bg-purple-100 text-odoo-900 border border-odoo-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <Users className="w-3 h-3" />
                                  {s.enrolled_count}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-black">
                                ₹{s.total_booked.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-800">
                                ₹{s.total_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-rose-700">
                                ₹{s.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => navigate(`/reports/subject/${s.subject_id}`)}
                                    title="Open Dedicated Subject Roster Page"
                                    className="px-2 py-0.5 text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3 text-blue-600" />
                                    <span>Detail / Roster ↗</span>
                                  </button>
                                  <button
                                    onClick={() => toggleSubjectExpand(s.subject_id)}
                                    title="Toggle in-page preview"
                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1 py-0.5"
                                  >
                                    {isExpanded ? 'Hide ▲' : 'Inline ▾'}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Student Roster Accordion */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="p-0 border-b border-odoo-200 bg-purple-50/20">
                                  <div className="p-3 border-l-4 border-odoo-600">
                                    <StudentRosterSubtable
                                      entityId={s.subject_id}
                                      filters={currentFilters}
                                      contextType="subject"
                                      onCollectFee={handleOpenFeeModal}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Subject Ledger Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                <span>
                  Showing <strong className="text-black">{subjectTotal === 0 ? 0 : (subjectPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                  <strong className="text-black">{Math.min(subjectPage * PAGE_SIZE, subjectTotal)}</strong> of{' '}
                  <strong className="text-black">{subjectTotal}</strong> subjects
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSubjectPage(1)}
                    disabled={subjectPage <= 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5 text-black" />
                  </button>
                  <button
                    onClick={() => setSubjectPage((p) => Math.max(1, p - 1))}
                    disabled={subjectPage <= 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-black" />
                  </button>
                  <span className="px-2 py-0.5 font-medium text-black">
                    Page {subjectPage} of {Math.max(1, subjectTotalPages)}
                  </span>
                  <button
                    onClick={() => setSubjectPage((p) => Math.min(Math.max(1, subjectTotalPages), p + 1))}
                    disabled={subjectPage >= Math.max(1, subjectTotalPages)}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-black" />
                  </button>
                  <button
                    onClick={() => setSubjectPage(Math.max(1, subjectTotalPages))}
                    disabled={subjectPage >= Math.max(1, subjectTotalPages)}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5 text-black" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Teacher-Wise Associated Subject Revenue */}
          {(activeTab === 'all' || activeTab === 'teachers') && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                <div>
                  <h2 className="text-sm font-bold text-black flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-odoo-600" />
                    <span>Teacher-Wise Revenue & Student Rosters</span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Click any teacher row or Detail to open dedicated faculty profile & assigned rolling cycle roster page
                  </p>
                </div>

                {/* Teacher Search Box */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search teacher by name or specialization..."
                    value={teacherSearch}
                    onChange={(e) => {
                      setTeacherSearch(e.target.value);
                      setTeacherPage(1);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600 text-black placeholder:text-slate-400 font-medium"
                  />
                </div>
              </div>

              <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Teacher Code</th>
                      <th className="p-2.5">Faculty Name</th>
                      <th className="p-2.5">Specialization</th>
                      <th className="p-2.5 text-center">Students</th>
                      <th className="p-2.5 text-right">Total Billed</th>
                      <th className="p-2.5 text-right text-emerald-800">Collected</th>
                      <th className="p-2.5 text-right text-rose-700">Due</th>
                      <th className="p-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedTeachers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No teachers matching '{teacherSearch}'.
                        </td>
                      </tr>
                    ) : (
                      pagedTeachers.map((t, idx) => {
                        const isExpanded = !!expandedTeachers[t.teacher_id];
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                                isExpanded ? 'bg-purple-50/20' : ''
                              }`}
                              onClick={() => navigate(`/teachers/${t.teacher_id}`)}
                              title="Click to open dedicated faculty page with student roster"
                            >
                              <td className="p-2.5 font-mono font-bold text-odoo-700">{t.teacher_code}</td>
                              <td className="p-2.5 font-bold text-black flex items-center gap-1.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-odoo-600 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span>{t.teacher_name}</span>
                              </td>
                              <td className="p-2.5 text-slate-700 font-medium">{t.specialization}</td>
                              <td className="p-2.5 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold transition-all ${
                                    isExpanded
                                      ? 'bg-odoo-600 text-white shadow-xs'
                                      : t.enrolled_count > 0
                                      ? 'bg-purple-100 text-odoo-900 border border-odoo-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <Users className="w-3 h-3" />
                                  {t.enrolled_count}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-black">
                                ₹{t.total_booked.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-800">
                                ₹{t.total_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-rose-700">
                                ₹{t.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => navigate(`/teachers/${t.teacher_id}`)}
                                    title="Open Dedicated Faculty Roster Page"
                                    className="px-2 py-0.5 text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3 text-blue-600" />
                                    <span>Detail / Roster ↗</span>
                                  </button>
                                  <button
                                    onClick={() => toggleTeacherExpand(t.teacher_id)}
                                    title="Toggle in-page preview"
                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1 py-0.5"
                                  >
                                    {isExpanded ? 'Hide ▲' : 'Inline ▾'}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Teacher Student Roster */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} className="p-0 border-b border-odoo-200 bg-purple-50/20">
                                  <div className="p-3 border-l-4 border-odoo-600">
                                    <StudentRosterSubtable
                                      entityId={t.teacher_id}
                                      filters={currentFilters}
                                      contextType="teacher"
                                      onCollectFee={handleOpenFeeModal}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Teacher Ledger Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                <span>
                  Showing <strong className="text-black">{teacherTotal === 0 ? 0 : (teacherPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                  <strong className="text-black">{Math.min(teacherPage * PAGE_SIZE, teacherTotal)}</strong> of{' '}
                  <strong className="text-black">{teacherTotal}</strong> teachers
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTeacherPage(1)}
                    disabled={teacherPage <= 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5 text-black" />
                  </button>
                  <button
                    onClick={() => setTeacherPage((p) => Math.max(1, p - 1))}
                    disabled={teacherPage <= 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-black" />
                  </button>
                  <span className="px-2 py-0.5 font-medium text-black">
                    Page {teacherPage} of {Math.max(1, teacherTotalPages)}
                  </span>
                  <button
                    onClick={() => setTeacherPage((p) => Math.min(Math.max(1, teacherTotalPages), p + 1))}
                    disabled={teacherPage >= Math.max(1, teacherTotalPages)}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-black" />
                  </button>
                  <button
                    onClick={() => setTeacherPage(Math.max(1, teacherTotalPages))}
                    disabled={teacherPage >= Math.max(1, teacherTotalPages)}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5 text-black" />
                  </button>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {/* Quick Collect Fee Modal */}
      {payModalOpen && (
        <QuickPaymentModal
          isOpen={payModalOpen}
          onClose={() => {
            setPayModalOpen(false);
            setPayAdmissionId(null);
          }}
          initialAdmissionId={payAdmissionId}
          onPaymentSuccess={() => {
            fetchReports(currentFilters);
          }}
        />
      )}

      {/* Subject Detail Modal */}
      <SubjectDetailModal
        isOpen={!!selectedSubjectDetail}
        onClose={() => setSelectedSubjectDetail(null)}
        subject={selectedSubjectDetail}
        onToggleRoster={(subId) => toggleSubjectExpand(subId)}
      />

      {/* Teacher Detail Modal */}
      <TeacherDetailModal
        isOpen={!!selectedTeacherDetail}
        onClose={() => setSelectedTeacherDetail(null)}
        teacher={selectedTeacherDetail}
        onViewRoster={(t) => toggleTeacherExpand(t.teacher_id)}
      />


    </div>
  );
}
