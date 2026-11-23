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
  X,
  MessageSquare,
  TrendingUp,
  PieChart,
  History,
  Target,
  UserCheck,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import { subjectApi, reportApi, remindersApi, enquiryApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate, formatCycleLabel } from '../../utils/dateCycleUtils';
import { WhatsAppIcon } from '../../utils/whatsappHelpers';

const PAGE_SIZE = 10;

export default function SubjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [subject, setSubject] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingSubjectReminders, setSendingSubjectReminders] = useState(false);

  const handleSendSubjectReminders = async () => {
    if (!subject?.subject_id) return;
    try {
      setSendingSubjectReminders(true);
      const res = await remindersApi.sendSubjectReminders(subject.subject_id);
      success(res?.message || 'Queued due reminders for this subject');
      navigate(`/reminders?subject_id=${subject.subject_id}`);
    } catch (err) {
      console.error('Failed to send subject reminders:', err);
      error(err?.response?.data?.detail || err?.message || 'Failed to queue subject reminders');
    } finally {
      setSendingSubjectReminders(false);
    }
  };

  const handleSendStudentReminder = async (studentId) => {
    try {
      const res = await remindersApi.sendStudentReminder(studentId);
      success(res?.message || 'WhatsApp reminder ready');
      if (res?.whatsapp_url) {
        window.open(res.whatsapp_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to send student reminder:', err);
      error(err?.response?.data?.detail || err?.message || 'Failed to trigger reminder');
    }
  };

  // Main Tabs: History & Enrollments, Revenue Breakup, Conversion History
  const [activeTab, setActiveTab] = useState('ENROLLMENTS'); // 'ENROLLMENTS' | 'BREAKUP' | 'CONVERSION'

  // Conversion History State
  const [conversionData, setConversionData] = useState({
    totalDemos: 0,
    convertedCount: 0,
    conversionRate: 0,
    items: [],
  });

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
      // 1. Fetch core subject info, demo leads and conversion report concurrently
      const [sDataResult, demosResult, convReportResult] = await Promise.allSettled([
        subjectApi.get(id),
        enquiryApi.listDemos({ subject_id: id, page_size: 100 }),
        reportApi.getAdmissionsConversion({}),
      ]);

      const sData = sDataResult.status === 'fulfilled' ? sDataResult.value : null;
      let currentSub = sData
        ? {
            subject_id: sData.id,
            subject_name: sData.name,
            subject_code: sData.subject_code,
            default_fee: sData.default_fee || 0,
            teacher_id: sData.teacher_id,
            teacher_name: sData.teacher_name_snapshot,
            enrolled_count: 0,
            total_enrollments: 0,
            active_enrollments: 0,
            inactive_enrollments: 0,
            unique_students_count: 0,
            total_booked: 0,
            total_collected: 0,
            balance_due: 0,
            status: sData.status,
          }
        : null;

      // Immediately process demo leads and conversion statistics
      let totalDemos = 0;
      let convertedCount = 0;
      let conversionRate = 0;
      let demoItems = [];

      if (demosResult.status === 'fulfilled' && demosResult.value) {
        demoItems = demosResult.value.items || [];
        totalDemos = demosResult.value.total ?? demoItems.length;
        convertedCount = demoItems.filter((d) => d.status === 'CONVERTED').length;
      }

      if (convReportResult.status === 'fulfilled' && convReportResult.value?.by_subject) {
        const subName = currentSub?.subject_name;
        const match = convReportResult.value.by_subject.find(
          (s) => String(s.subject_id) === String(id) || (subName && s.subject_name === subName)
        );
        if (match) {
          totalDemos = Math.max(totalDemos, match.enquiries_count || 0);
          convertedCount = Math.max(convertedCount, match.converted_count || 0);
          conversionRate = match.conversion_rate_pct || 0;
        }
      }

      if (totalDemos > 0 && conversionRate === 0) {
        conversionRate = Math.round((convertedCount / totalDemos) * 100);
      }

      setConversionData({
        totalDemos,
        convertedCount,
        conversionRate,
        items: demoItems,
      });

      if (currentSub) {
        setSubject(currentSub);
        setLoading(false);
      }

      // 2. Fetch subject revenue report for enrolled roster & financials in background
      try {
        const reportRes = await reportApi.getSubjectRevenue({});
        const items = reportRes?.items || [];
        const foundInReport = items.find(
          (itm) => String(itm.subject_id) === String(id) || itm.subject_code === id
        );

        if (foundInReport) {
          setSubject((prev) => ({ ...prev, ...foundInReport }));
          setStudents(foundInReport.students || []);
        } else if (!currentSub) {
          if (id === 'green-card-all-access' || id === 'GREEN-CARD') {
            const gc = items.find((itm) => itm.subject_code === 'GREEN-CARD');
            if (gc) {
              setSubject(gc);
              setStudents(gc.students || []);
            }
          }
        }
      } catch (repErr) {
        console.warn('Failed to fetch full subject revenue:', repErr);
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
  const isCancelledStudent = (s) => s.cycle_status === 'CANCELLED' || s.admission_status === 'CANCELLED' || s.admission_status === 'REVOKED';
  const totalEnrollments = subject?.total_enrollments ?? subject?.enrolled_count ?? students.length;
  const activeCount = useMemo(() => {
    if (subject?.active_enrollments != null) return subject.active_enrollments;
    return students.filter((s) => !isCancelledStudent(s) && (s.cycle_status === 'ACTIVE' || (s.days_remaining != null && s.days_remaining >= 0))).length;
  }, [subject, students]);

  const inactiveCount = useMemo(() => {
    if (subject?.inactive_enrollments != null) return subject.inactive_enrollments;
    return students.filter((s) => !isCancelledStudent(s) && (s.cycle_status === 'INACTIVE' || s.cycle_status === 'OVERDUE' || (s.days_remaining != null && s.days_remaining < 0))).length;
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
      list = list.filter((s) => !isCancelledStudent(s) && (s.cycle_status === 'ACTIVE' || (s.days_remaining != null && s.days_remaining >= 0)));
    } else if (statusFilter === 'INACTIVE') {
      list = list.filter((s) => !isCancelledStudent(s) && (s.cycle_status === 'INACTIVE' || s.cycle_status === 'OVERDUE' || (s.days_remaining != null && s.days_remaining < 0)));
    }

    // Search query
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.student_name?.toLowerCase().includes(q) ||
          s.student_code?.toLowerCase().includes(q) ||
          s.mobile?.includes(q) ||
          s.teacher_name?.toLowerCase().includes(q)
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
          <ArrowLeft className="w-4 h-4 animate-spin text-odoo-600" />
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
    <div className="space-y-4 sm:space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/reports/subject-revenue')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Back to Subject Revenue"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black break-words leading-tight">
                {subject.subject_name}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200 shrink-0">
                {subject.subject_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Standard Monthly Fee: ₹{Number(subject.default_fee || 0).toFixed(2)} • {activeCount} active course enrollments ({totalEnrollments} total cycles across {uniqueStudentsCount} scholars)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* One-Click Send Subject Dues Reminders */}
          <Button
            variant="primary"
            icon={MessageSquare}
            onClick={handleSendSubjectReminders}
            loading={sendingSubjectReminders}
            size="sm"
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            title="Queue WhatsApp reminders for all students with dues in this subject"
          >
            Send Due Reminders
          </Button>

          <Button
            variant="secondary"
            icon={Layers}
            onClick={() => navigate('/reports/subject-revenue')}
            size="sm"
            className="w-full sm:w-auto"
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

      {/* Financial & Conversion KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Billed</span>
          <span className="font-mono font-black text-black text-lg sm:text-xl mt-1 block break-all sm:break-normal">
            ₹{Number(subject.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-medium mt-1 block">Tuition ledger booked</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Actual Collected</span>
          <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl mt-1 block break-all sm:break-normal">
            ₹{Number(subject.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-emerald-700 font-medium mt-1 block">Net payments realized</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Balance Due</span>
          <span className="font-mono font-black text-rose-700 text-lg sm:text-xl mt-1 block break-all sm:break-normal">
            ₹{Number(subject.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-rose-600 font-medium mt-1 block">Outstanding receivables</span>
        </div>

        {/* Course Enrollments History Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Cycle History</span>
            <span className="text-[10px] text-slate-500 font-medium">({uniqueStudentsCount} scholars)</span>
          </div>
          <span className="font-mono font-black text-odoo-900 text-lg sm:text-xl mt-1 block flex items-center gap-1.5">
            <BookOpen className="w-5 h-5 text-odoo-600" />
            <span>{totalEnrollments}</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              ● {activeCount} Active
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              ● {inactiveCount} Inactive
            </span>
          </div>
        </div>

        {/* Conversion History Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Enquiry Conversion</span>
            <span className="text-[10px] text-amber-700 font-medium">({conversionData.totalDemos} leads)</span>
          </div>
          <span className="font-mono font-black text-amber-900 text-lg sm:text-xl mt-1 block flex items-center gap-1.5">
            <TrendingUp className="w-5 h-5 text-amber-600" />
            <span>{conversionData.conversionRate}%</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-200 text-[11px] font-semibold text-slate-600">
            <span>{conversionData.convertedCount} of {conversionData.totalDemos} converted</span>
          </div>
        </div>
      </div>

      {/* Main Feature Tabs: History, Breakup & Conversion History */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('ENROLLMENTS')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'ENROLLMENTS'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Course History & Roster ({totalEnrollments})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BREAKUP')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'BREAKUP'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Revenue & Fee Breakup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CONVERSION')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'CONVERSION'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Enquiries & Conversion History ({conversionData.totalDemos || conversionData.items.length})</span>
        </button>
      </div>

      {/* TAB 1: Complete Course Enrollments Roster with Status Filtering */}
      {activeTab === 'ENROLLMENTS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
          {/* Header with Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-odoo-600" />
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
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-odoo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
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
                  className="mt-2 text-xs font-bold text-odoo-700 hover:underline cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 -webkit-overflow-scrolling-touch">
              <table className="w-full text-left text-xs min-w-[750px]">
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
                      className="hover:bg-purple-50/40 cursor-pointer transition-colors"
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
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-xs shrink-0 border border-purple-200">
                              {s.student_name ? s.student_name.slice(0, 2).toUpperCase() : 'ST'}
                            </div>
                          )}
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

                      {/* Faculty & Hall */}
                      <td className="p-3 text-slate-700">
                        {s.teacher_id || subject.teacher_id ? (
                          <Link
                            to={`/teachers/${s.teacher_id || subject.teacher_id}`}
                            className="font-semibold text-odoo-700 hover:text-odoo-900 hover:underline inline-block"
                            onClick={(e) => e.stopPropagation()}
                            title="Open Teacher detail page"
                          >
                            {s.teacher_name || subject.teacher_name || 'Faculty'}
                          </Link>
                        ) : (
                          <div className="font-semibold text-black">{s.teacher_name || 'Faculty'}</div>
                        )}
                        <div className="text-[11px] text-slate-500">
                          {s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'}
                        </div>
                      </td>

                      {/* Rolling Billing Cycle */}
                      <td className="p-3">
                        <div className="font-mono font-bold text-black text-xs">
                          {s.cycle_label || formatCycleLabel(s.valid_from, s.valid_to)}
                        </div>
                        <div className="text-[11px] text-odoo-700 font-semibold">
                          {s.billing_cycle_anchor || `Day ${s.billing_day || 1} of month`}
                        </div>
                      </td>

                      {/* Cycle Status */}
                      <td className="p-3 text-center">
                        <Badge
                          variant={isCancelledStudent(s) ? 'danger' : (s.badge_variant || (s.days_remaining != null && s.days_remaining < 0 ? 'danger' : 'success'))}
                          size="xs"
                        >
                          {isCancelledStudent(s) ? 'Cancelled' : (s.status_label || (s.days_remaining != null && s.days_remaining < 0 ? 'Inactive (Expired)' : 'Active'))}
                        </Badge>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                          {isCancelledStudent(s) ? 'Cancelled' : s.status_subtext}
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
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {Number(s.balance_due || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSendStudentReminder(s.student_id)}
                              className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-md border border-emerald-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                              title={`Send WhatsApp due reminder to ${s.student_name}`}
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>Remind</span>
                            </button>
                          )}

                          {Number(s.balance_due || 0) > 0 && (
                            <button
                              onClick={() => setPayAdmissionId(s.admission_id)}
                              className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-900 font-bold rounded-md border border-emerald-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                              title="Collect balance payment"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>Collect</span>
                            </button>
                          )}

                          <Link
                            to={`/students/${s.student_id}`}
                            className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 hover:text-blue-800 font-semibold rounded-md border border-blue-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0" />
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
      )}

      {/* TAB 2: Dedicated Revenue & Fee Breakup View */}
      {activeTab === 'BREAKUP' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-600" />
                <span>Financial & Fee Breakup Ledger</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Detailed billing, realizations, collection efficiency & receivables breakdown
              </p>
            </div>
            <Badge variant="primary" size="xs">Ledger Reconciled</Badge>
          </div>

          {/* Breakup Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Base Tuition Fee</span>
              <span className="font-mono font-bold text-black text-sm">
                ₹{Number(subject.default_fee || 0).toFixed(2)}/mo
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Invoiced</span>
              <span className="font-mono font-bold text-black text-sm">
                ₹{Number(subject.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Realized Cash</span>
              <span className="font-mono font-bold text-emerald-800 text-sm">
                ₹{Number(subject.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Collection Efficiency</span>
              <span className="font-mono font-bold text-indigo-900 text-sm">
                {subject.total_booked ? `${Math.min(100, Math.round((Number(subject.total_collected) / Number(subject.total_booked)) * 100))}%` : '100%'}
              </span>
            </div>
          </div>

          {/* Financial Breakdown Table per Student */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Scholar Details</th>
                  <th className="p-3">Hall</th>
                  <th className="p-3 text-right">Fee Billed</th>
                  <th className="p-3 text-right text-emerald-800">Collected</th>
                  <th className="p-3 text-right text-rose-700">Due</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No financial transactions recorded for this subject curriculum yet.
                    </td>
                  </tr>
                ) : (
                  students.map((s, idx) => (
                    <tr key={idx} className="hover:bg-purple-50/30 transition">
                      <td className="p-3">
                        <span className="font-bold text-black block">{s.student_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{s.student_code}</span>
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-medium">{s.hall_number || 'Main Hall'}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-black">
                        ₹{(s.net_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-800">
                        ₹{(s.amount_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-700">
                        ₹{(s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
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
                      <td className="p-3 text-center">
                        <Link
                          to={`/students/${s.student_id}`}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 text-slate-600" />
                          <span>Ledger</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Enquiries & Conversion History View */}
      {activeTab === 'CONVERSION' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span>Enquiries & Demo Conversion History</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Prospective student enquiries, trial demo passes and admission conversion metrics
              </p>
            </div>
            <Link
              to="/enquiries"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs self-start sm:self-auto"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
              <span>Open Enquiries Desk</span>
            </Link>
          </div>

          {/* Conversion Metrics Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/60 p-4 rounded-xl border border-amber-200 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                <Target className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">Total Enquiries & Demos</span>
                <span className="text-lg font-black text-black font-mono">
                  {conversionData.totalDemos} leads
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">Converted to Admission</span>
                <span className="text-lg font-black text-emerald-900 font-mono">
                  {conversionData.convertedCount} admissions
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-odoo-800 flex items-center justify-center font-bold shrink-0">
                <TrendingUp className="w-5 h-5 text-odoo-700" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-600 uppercase block">Overall Conversion Rate</span>
                <span className="text-lg font-black text-odoo-900 font-mono">
                  {conversionData.conversionRate}%
                </span>
              </div>
            </div>
          </div>

          {/* Demos & Enquiries Roster */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Demo Reference</th>
                  <th className="p-3">Candidate Name</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Demo Period</th>
                  <th className="p-3">Faculty / Hall</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Admission Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversionData.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-black">No demo items directly mapped</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Historical conversion rate is {conversionData.conversionRate}% across {conversionData.totalDemos} enquiries.
                      </p>
                    </td>
                  </tr>
                ) : (
                  conversionData.items.map((d, dIdx) => {
                    const isConverted = d.status === 'CONVERTED';
                    const isScheduled = d.status === 'SCHEDULED';
                    const isAttended = d.status === 'ATTENDED';

                    return (
                      <tr key={d.demo_item_id || d.id || dIdx} className="hover:bg-amber-50/30 transition">
                        <td className="p-3 font-mono font-bold text-odoo-800">
                          {d.demo_reference_number}
                        </td>
                        <td className="p-3 font-bold text-black">
                          {d.student_name}
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {d.mobile || '—'}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          {d.demo_start_date} → {d.demo_end_date}
                          <span className="block text-[10px] text-slate-500 font-sans">
                            {d.demo_duration_days} days trial
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">
                          <span>{d.teacher_name_snapshot || 'Faculty'}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            {d.hall_number_snapshot || 'Main Hall'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            size="xs"
                            variant={
                              isConverted
                                ? 'success'
                                : isAttended
                                ? 'info'
                                : isScheduled
                                ? 'primary'
                                : 'neutral'
                            }
                          >
                            {d.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-mono">
                          {isConverted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Enrolled</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              {d.drop_reason || 'Pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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