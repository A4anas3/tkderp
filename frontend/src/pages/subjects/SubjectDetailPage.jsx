import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  Layers,
  Calendar,
  RefreshCw,
  X
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import { subjectApi, reportApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate, formatCycleLabel } from '../../utils/dateCycleUtils';

const PAGE_SIZE = 10;

export default function SubjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { error } = useToast();

  const [subject, setSubject] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Status & Search Filtering for Course Enrollments
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [rosterSearch, setRosterSearch] = useState('');
  const [page, setPage] = useState(1);

  // Quick Payment Modal
  const [payAdmissionId, setPayAdmissionId] = useState(null);
  const [paymentReceiptToShow, setPaymentReceiptToShow] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch from subject revenue report to get live metrics and enrolled roster
      const reportRes = await reportApi.getSubjectRevenue({});
      const items = reportRes?.items || [];
      const foundInReport = items.find(
        (itm) => String(itm.subject_id) === String(id) || itm.subject_code === id
      );

      if (foundInReport) {
        setSubject(foundInReport);
        setStudents(foundInReport.students || []);
      } else {
        // Fallback to subjectApi
        try {
          const sData = await subjectApi.get(id);
          setSubject({
            subject_id: sData.id,
            subject_name: sData.name,
            subject_code: sData.subject_code,
            default_fee: sData.default_fee || 0,
            enrolled_count: 0,
            total_enrollments: 0,
            active_enrollments: 0,
            inactive_enrollments: 0,
            unique_students_count: 0,
            total_booked: 0,
            total_collected: 0,
            balance_due: 0,
            status: sData.status,
          });
          setStudents([]);
        } catch {
          // If green-card or not found
          if (id === 'green-card-all-access' || id === 'GREEN-CARD') {
            const gc = items.find((itm) => itm.subject_code === 'GREEN-CARD');
            if (gc) {
              setSubject(gc);
              setStudents(gc.students || []);
            }
          }
        }
      }
    } catch (err) {
      error(err.message || 'Failed to load subject details');
    } finally {
      setLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived Counts and Metrics
  const totalEnrollments = subject?.total_enrollments ?? subject?.enrolled_count ?? students.length;
  const activeCount = useMemo(() => {
    if (subject?.active_enrollments != null) return subject.active_enrollments;
    return students.filter((s) => s.cycle_status === 'ACTIVE' || (s.days_remaining != null && s.days_remaining >= 0)).length;
  }, [subject, students]);

  const inactiveCount = useMemo(() => {
    if (subject?.inactive_enrollments != null) return subject.inactive_enrollments;
    return students.filter((s) => s.cycle_status === 'INACTIVE' || s.cycle_status === 'OVERDUE' || (s.days_remaining != null && s.days_remaining < 0)).length;
  }, [subject, students]);

  const uniqueStudentsCount = useMemo(() => {
    if (subject?.unique_students_count != null) return subject.unique_students_count;
    const uniqueIds = new Set(students.map((s) => s.student_id));
    return uniqueIds.size;
  }, [subject, students]);

  // Filtered & Paginated Course Enrollments
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    let list = students;

    // Status filter
    if (statusFilter === 'ACTIVE') {
      list = list.filter((s) => s.cycle_status === 'ACTIVE' || (s.days_remaining != null && s.days_remaining >= 0));
    } else if (statusFilter === 'INACTIVE') {
      list = list.filter((s) => s.cycle_status === 'INACTIVE' || s.cycle_status === 'OVERDUE' || (s.days_remaining != null && s.days_remaining < 0));
    }

    // Search query
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.student_name?.toLowerCase().includes(q) ||
          s.student_code?.toLowerCase().includes(q) ||
          s.mobile?.includes(q) ||
          s.teacher_name?.toLowerCase().includes(q) ||
          s.batch_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, statusFilter, rosterSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading subject curriculum & course enrollments...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/reports/subject-revenue')}>
          Back to Subject Revenue
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Subject curriculum record not found.</p>
        </div>
      </div>
    );
  }

  const isGreenCard = subject.subject_code === 'GREEN-CARD';
  const isActive = (totalEnrollments > 0 || subject.total_booked > 0 || subject.status === 'ACTIVE');
  const hasActiveFilters = statusFilter !== 'ALL' || rosterSearch.trim() !== '';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reports/subject-revenue')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title="Back to Subject Revenue"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black">
                {subject.subject_name}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200">
                {subject.subject_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Standard Monthly Fee: ₹{Number(subject.default_fee || 0).toFixed(2)} • {activeCount} active course enrollments ({totalEnrollments} total cycles across {uniqueStudentsCount} scholars)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={Layers}
            onClick={() => navigate('/reports/subject-revenue')}
            size="sm"
          >
            View All Ledgers
          </Button>
        </div>
      </div>

      {/* Prominent Active vs Inactive Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          isActive
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-slate-100 border-slate-300 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          {isActive ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-slate-500 shrink-0" />
          )}
          <div>
            <div className="text-xs font-black uppercase tracking-wider">
              Curriculum Status: {isActive ? 'ACTIVE COURSE / SUBJECT' : 'INACTIVE / NO ACTIVE COHORT'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? `Active subject curriculum with ${activeCount} active course enrollments (${totalEnrollments} total historical cycles across ${uniqueStudentsCount} scholars)`
                : 'No active enrollments recorded for this subject curriculum in the current period'}
            </div>
          </div>
        </div>
        <Badge
          variant={isActive ? 'success' : 'neutral'}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {isActive ? 'ACTIVE' : 'INACTIVE'}
        </Badge>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Billed</span>
          <span className="font-mono font-black text-black text-lg sm:text-xl mt-1 block">
            ₹{Number(subject.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Actual Collected</span>
          <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl mt-1 block">
            ₹{Number(subject.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Balance Due</span>
          <span className="font-mono font-black text-rose-700 text-lg sm:text-xl mt-1 block">
            ₹{Number(subject.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Course Enrollments Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Course Enrollments</span>
            <span className="text-[10px] text-slate-500 font-medium">({uniqueStudentsCount} scholars)</span>
          </div>
          <span className="font-mono font-black text-indigo-900 text-lg sm:text-xl mt-1 block flex items-center gap-1.5">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <span>{totalEnrollments}</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ● {activeCount} Active
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              ● {inactiveCount} Inactive (Expired)
            </span>
          </div>
        </div>
      </div>

      {/* Complete Course Enrollments Roster with Status Filtering */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
        {/* Header with Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Assigned Course Enrollments ({filteredStudents.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Active and expired course cycles • Filtered by cycle status and search
            </p>
          </div>

          <button
            onClick={loadData}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
            title="Refresh course enrollments"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filtering Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {/* Segmented Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-black text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All ({totalEnrollments})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ACTIVE');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'ACTIVE' ? 'bg-white' : 'bg-emerald-500'}`} />
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('INACTIVE');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'INACTIVE' ? 'bg-white' : 'bg-rose-500'}`} />
              Inactive / Expired ({inactiveCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student, code, mobile..."
                value={rosterSearch}
                onChange={(e) => {
                  setRosterSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
              />
              {rosterSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setRosterSearch('');
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setRosterSearch('');
                  setPage(1);
                }}
                className="px-2 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition cursor-pointer"
                title="Reset filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Roster Table */}
        {filteredStudents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="font-semibold text-black">No course enrollments found</div>
            <p className="text-slate-500 max-w-sm mx-auto">
              No assigned course enrollments matched your current filter criteria.
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setRosterSearch('');
                  setPage(1);
                }}
                className="mt-2 text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Faculty & Hall</th>
                  <th className="p-3">Rolling Billing Cycle</th>
                  <th className="p-3 text-center">Cycle Status</th>
                  <th className="p-3 text-right">Fee Billed</th>
                  <th className="p-3 text-right text-emerald-800">Collected</th>
                  <th className="p-3 text-right text-rose-700">Due</th>
                  <th className="p-3 text-center">Payment</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedStudents.map((s, idx) => (
                  <tr
                    key={idx}
                    onClick={() => navigate(`/students/${s.student_id}`)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    title="Click to view full student profile & ledger"
                  >
                    {/* Student Info */}
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        {s.photo_url ? (
                          <img
                            src={s.photo_url}
                            alt={s.student_name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shrink-0 border border-indigo-200">
                            {s.student_name ? s.student_name.slice(0, 2).toUpperCase() : 'ST'}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-black hover:text-indigo-600 transition">
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

                    {/* Faculty & Hall */}
                    <td className="p-3 text-slate-700">
                      <div className="font-semibold text-black">{s.teacher_name || 'Faculty'}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'} • {s.batch_name}
                      </div>
                    </td>

                    {/* Rolling Billing Cycle */}
                    <td className="p-3">
                      <div className="font-mono font-bold text-black text-xs">
                        {s.cycle_label || formatCycleLabel(s.valid_from, s.valid_to)}
                      </div>
                      <div className="text-[11px] text-indigo-700 font-semibold">
                        {s.billing_cycle_anchor || `Day ${s.billing_day || 1} of month`}
                      </div>
                    </td>

                    {/* Cycle Status */}
                    <td className="p-3 text-center">
                      <Badge
                        variant={s.badge_variant || (s.days_remaining != null && s.days_remaining < 0 ? 'danger' : 'success')}
                        size="xs"
                      >
                        {s.status_label || (s.days_remaining != null && s.days_remaining < 0 ? 'Inactive (Expired)' : 'Active')}
                      </Badge>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        {s.status_subtext}
                      </div>
                    </td>

                    {/* Fee Billed */}
                    <td className="p-3 text-right font-mono font-bold text-black">
                      ₹{(s.net_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Amount Collected */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">
                      ₹{(s.amount_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Balance Due */}
                    <td className="p-3 text-right font-mono font-bold text-rose-700">
                      ₹{(s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Payment Status */}
                    <td className="p-3 text-center">
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
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {Number(s.balance_due || 0) > 0 && (
                          <button
                            onClick={() => setPayAdmissionId(s.admission_id)}
                            className="px-2 py-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold rounded border border-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                            title="Collect balance payment"
                          >
                            <CreditCard className="w-3 h-3 text-emerald-700" />
                            <span>Collect</span>
                          </button>
                        )}

                        <Link
                          to={`/students/${s.student_id}`}
                          className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-black font-semibold rounded border border-slate-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3 text-slate-600" />
                          <span>Profile</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-200 text-xs">
            <span className="text-slate-600 font-medium">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} course enrollments
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="First Page"
              >
                <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <span className="px-2 font-bold text-black">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Last Page"
              >
                <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Collect Payment Modal */}
      {payAdmissionId && (
        <QuickPaymentModal
          isOpen={!!payAdmissionId}
          onClose={() => setPayAdmissionId(null)}
          admissionId={payAdmissionId}
          onSuccess={(payment) => {
            setPayAdmissionId(null);
            setPaymentReceiptToShow(payment);
            loadData();
          }}
        />
      )}

      {/* Payment Receipt Modal */}
      {paymentReceiptToShow && (
        <PaymentReceiptModal
          isOpen={!!paymentReceiptToShow}
          onClose={() => setPaymentReceiptToShow(null)}
          payment={paymentReceiptToShow}
        />
      )}
    </div>
  );
}