import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Check,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Phone,
  Search,
  CheckCircle2,
  Calendar,
  CreditCard,
  GraduationCap,
  Sparkles,
  ArrowUpRight,
  Filter,
  XCircle,
  Clock,
  User,
  BookOpen,
  Layers,
  X,
  History,
  Send,
} from 'lucide-react';
import { remindersApi, subjectApi } from '../../services/allApis';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import { WhatsAppIcon, buildWhatsAppLink } from '../../utils/whatsappHelpers';
import { useToast } from '../../context/ToastContext';

const formatCurrency = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(val);
  }
};

const formatDateTime = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(val);
  }
};

function renderKindBadge(kind) {
  switch (kind) {
    case 'due_today':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-900 border border-orange-300">
          Due Today
        </span>
      );
    case 'due_soon':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          Due Soon
        </span>
      );
    case 'overdue_3':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
          Overdue 3d+
        </span>
      );
    case 'overdue_7':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-950 border border-red-400">
          Overdue 7d+
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
          Current Due
        </span>
      );
  }
}

function renderAgeingBadge(bucket, days) {
  let color = 'bg-blue-50 text-blue-800 border-blue-200';
  if (bucket === '31-60') color = 'bg-amber-50 text-amber-800 border-amber-200';
  else if (bucket === '61-90') color = 'bg-orange-50 text-orange-900 border-orange-300';
  else if (bucket === '90+') color = 'bg-red-50 text-red-900 border-red-300';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${color}`}>
      {days != null ? `${days}d (${bucket})` : bucket}
    </span>
  );
}

export default function RemindersPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [reminders, setReminders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const [counts, setCounts] = useState({
    pending: 0,
    sent: 0,
    failed: 0,
    expired_dues: 0,
    total_due_amount: 0,
    formatted_total_due: '₹0.00',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Metadata for filter dropdowns
  const [subjectsList, setSubjectsList] = useState([]);

  // Active filters
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'sent' | 'failed' | 'all'
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');
  const [dueAgeFilter, setDueAgeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Payment modal state
  const [selectedAdmissionForPay, setSelectedAdmissionForPay] = useState(null);

  // Mark Failed Modal state
  const [failedModalItem, setFailedModalItem] = useState(null);
  const [failedReason, setFailedReason] = useState('Invalid phone number / unreachable');

  // Preload subjects once on mount
  useEffect(() => {
    async function loadMeta() {
      try {
        const subs = await subjectApi.getAll();
        setSubjectsList(Array.isArray(subs) ? subs : []);
      } catch (err) {
        console.warn('Failed to preload metadata for reminders filter:', err);
      }
    }
    loadMeta();
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        status: statusFilter,
        page,
        page_size: pageSize,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (selectedSubjectFilter !== 'ALL') {
        params.subject_id = selectedSubjectFilter;
      }

      if (dueAgeFilter !== 'ALL') {
        params.due_age = dueAgeFilter;
      }

      const res = await remindersApi.getQueue(params);
      const list = Array.isArray(res) ? res : res?.items || [];
      setReminders(list);
      setTotalCount(typeof res.total === 'number' ? res.total : list.length);
      setTotalPages(typeof res.total_pages === 'number' ? res.total_pages : 1);
      if (res.counts) {
        setCounts(res.counts);
      }
    } catch (err) {
      console.error('Failed to load reminders queue:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load reminders from server. Please retry.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedSubjectFilter, dueAgeFilter, debouncedSearch, page, pageSize]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Handler: Scan for dues
  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await remindersApi.generate();
      success(res?.message || `Queued ${res?.count ?? 0} active due reminder(s)`);
      await loadQueue();
    } catch (err) {
      console.error('Failed to generate reminders:', err);
      toastError(err?.response?.data?.detail || err?.message || 'Failed to scan reminders');
    } finally {
      setGenerating(false);
    }
  };

  // Handler: Mark Sent
  const handleMarkSent = async (id) => {
    try {
      setActionLoadingId(id);
      await remindersApi.markSent(id);
      success('Reminder marked as sent');
      await loadQueue();
    } catch (err) {
      console.error('Failed to mark sent:', err);
      toastError(err?.response?.data?.detail || err?.message || 'Failed to mark as sent');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Mark Failed Confirm
  const handleConfirmFailed = async () => {
    if (!failedModalItem) return;
    try {
      setActionLoadingId(failedModalItem.id);
      await remindersApi.markFailed(failedModalItem.id, failedReason);
      success('Reminder marked as failed');
      setFailedModalItem(null);
      await loadQueue();
    } catch (err) {
      console.error('Failed to mark reminder failed:', err);
      toastError(err?.response?.data?.detail || err?.message || 'Failed to update reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Reset Pending
  const handleResetPending = async (id) => {
    try {
      setActionLoadingId(id);
      await remindersApi.resetPending(id);
      success('Reminder reset back to pending queue');
      await loadQueue();
    } catch (err) {
      console.error('Failed to reset reminder:', err);
      toastError(err?.response?.data?.detail || err?.message || 'Failed to reset reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Open WhatsApp click-to-chat
  const handleOpenWhatsApp = (rem) => {
    const url =
      rem.whatsapp_url ||
      buildWhatsAppLink(rem.student_mobile, rem.message);
    if (!url) {
      toastError('No valid mobile phone number recorded for this student');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const hasActiveFilters =
    selectedSubjectFilter !== 'ALL' ||
    dueAgeFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  const clearFilters = () => {
    setSelectedSubjectFilter('ALL');
    setDueAgeFilter('ALL');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-2xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-black tracking-tight">
                Fee Reminders & WhatsApp Queue
              </h1>
              <p className="text-xs text-slate-700 font-medium">
                Real outstanding coaching dues, click-to-send via wa.me, status tracking (pending / sent / failed), and sent history.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={loadQueue}
            loading={loading}
            className="min-h-[36px]"
          >
            Refresh
          </Button>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-[#714B67] hover:bg-[#5e3c54] active:bg-[#4d3145] text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? 'Scanning Dues...' : 'Scan Dues & Queue'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards (Hostel Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Pending Reminders"
          value={counts.pending}
          subtext="Students awaiting WhatsApp reminder"
          icon={AlertCircle}
          color="amber"
          onClick={() => {
            setStatusFilter('pending');
            setPage(1);
          }}
        />
        <StatCard
          title="Sent History"
          value={counts.sent}
          subtext="Reminders delivered / marked sent"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => {
            setStatusFilter('sent');
            setPage(1);
          }}
        />
        <StatCard
          title="Failed Delivery"
          value={counts.failed}
          subtext="Invalid number or unreachable"
          icon={XCircle}
          color="rose"
          onClick={() => {
            setStatusFilter('failed');
            setPage(1);
          }}
        />
        <StatCard
          title="Total Active Dues"
          value={counts.formatted_total_due}
          subtext="Across active pending queue"
          icon={CreditCard}
          color="purple"
        />
      </div>

      {/* Filter and Search Bar with Subject, Due-Age Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs space-y-3">
        {/* Status Queue Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-bold">
            <button
              onClick={() => {
                setStatusFilter('pending');
                setPage(1);
              }}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-white text-black shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Pending Queue ({counts.pending})
            </button>
            <button
              onClick={() => {
                setStatusFilter('sent');
                setPage(1);
              }}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'sent'
                  ? 'bg-white text-black shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Sent History ({counts.sent})
            </button>
            <button
              onClick={() => {
                setStatusFilter('failed');
                setPage(1);
              }}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'failed'
                  ? 'bg-white text-black shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Failed ({counts.failed})
            </button>
            <button
              onClick={() => {
                setStatusFilter('all');
                setPage(1);
              }}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-black shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              All Records
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, mobile, subject, ref..."
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm min-h-[34px] border border-slate-300 rounded-lg bg-white text-black placeholder:text-slate-400 focus:outline-none focus:border-[#714B67] focus:ring-1 focus:ring-[#714B67] shadow-2xs"
            />
          </div>
        </div>

        {/* Multi-Filters: Subject, Due-Age */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
          {/* Subject Filter */}
          <div>
            <label className="block text-[11px] font-bold text-black mb-1">
              Filter by Subject
            </label>
            <select
              value={selectedSubjectFilter}
              onChange={(e) => {
                setSelectedSubjectFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67] shadow-2xs"
            >
              <option value="ALL">All Subjects</option>
              {subjectsList.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} {sub.subject_code ? `(${sub.subject_code})` : ''}
                </option>
              ))}
            </select>
          </div>



          {/* Due-Age Filter */}
          <div>
            <label className="block text-[11px] font-bold text-black mb-1">
              Filter by Due-Age
            </label>
            <select
              value={dueAgeFilter}
              onChange={(e) => {
                setDueAgeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67] shadow-2xs"
            >
              <option value="ALL">All Due Ages</option>
              <option value="0-30">0 - 30 Days (Current)</option>
              <option value="31-60">31 - 60 Days</option>
              <option value="61-90">61 - 90 Days</option>
              <option value="90+">90+ Days (High Overdue)</option>
            </select>
          </div>

          {/* Reset Filters Shortcut */}
          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full h-8 px-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reminders Table / Desktop View */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {loading && reminders.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 font-medium">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#714B67] mb-2" />
            Loading reminders queue...
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3 bg-rose-50 border-b border-rose-200">
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <p className="text-sm text-rose-800 font-bold">{error}</p>
            <Button size="xs" variant="secondary" onClick={loadQueue}>
              Retry Load
            </Button>
          </div>
        ) : reminders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black">
                {statusFilter === 'pending'
                  ? 'No Pending Due Reminders'
                  : statusFilter === 'sent'
                  ? 'No Sent Reminders Recorded Yet'
                  : statusFilter === 'failed'
                  ? 'No Failed Delivery Reminders'
                  : 'No Reminders Found'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5 font-medium">
                {statusFilter === 'pending'
                  ? 'All student fees are fully settled or no active dues match your filter criteria.'
                  : 'No reminder records matching your criteria.'}
              </p>
            </div>
            {statusFilter === 'pending' && (
              <div className="pt-1">
                <Button size="xs" variant="primary" onClick={handleGenerate} loading={generating}>
                  Scan For Active Dues
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-black font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Student Details</th>
                    <th className="py-3 px-3">Mobile Contact</th>
                    <th className="py-3 px-3">Subject</th>
                    <th className="py-3 px-3 text-right">Due Amount</th>
                    <th className="py-3 px-3">Due Date & Age</th>
                    <th className="py-3 px-3 text-center">Delivery Status</th>
                    <th className="py-3 px-3.5 text-right">WhatsApp Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                  {reminders.map((rem) => {
                    const hasMobile = Boolean(rem.student_mobile && rem.student_mobile.trim());
                    const isPending = rem.status === 'pending';
                    const isSent = rem.status === 'sent';
                    const isFailed = rem.status === 'failed';

                    return (
                      <tr
                        key={rem.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isFailed ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        {/* Student Name & Code */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-black uppercase shrink-0">
                              {rem.student_name ? rem.student_name.charAt(0) : 'S'}
                            </div>
                            <div className="min-w-0">
                              <span
                                onClick={() => navigate(`/students/${rem.student_id}`)}
                                className="font-bold text-black text-xs sm:text-sm block truncate hover:text-[#714B67] hover:underline cursor-pointer"
                                title="View student profile"
                              >
                                {rem.student_name}
                              </span>
                              <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1">
                                <span>{rem.student_code}</span>
                                {rem.father_name && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-500">F: {rem.father_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Mobile Contact */}
                        <td className="py-3 px-3">
                          {hasMobile ? (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-mono text-xs font-bold text-black">
                                {rem.student_mobile}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              No Mobile
                            </span>
                          )}
                        </td>

                        {/* Subject */}
                        <td className="py-3 px-3">
                          <div className="min-w-0">
                            <span className="font-bold text-black text-xs block truncate max-w-xs">
                              {rem.subject_name || rem.course_name}
                            </span>
                            <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-slate-500 text-[10px]">
                                {rem.admission_number}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Due Amount */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono text-xs sm:text-sm font-black text-rose-700 block">
                            {rem.formatted_due_amount || formatCurrency(rem.due_amount)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold block">
                            Outstanding Balance
                          </span>
                        </td>

                        {/* Due Date & Age */}
                        <td className="py-3 px-3">
                          <div>
                            <span className="font-mono font-bold text-black text-xs block">
                              {rem.formatted_due_date || formatDate(rem.due_date)}
                            </span>
                            <div className="flex items-center gap-1 mt-1">
                              {renderKindBadge(rem.kind)}
                              {renderAgeingBadge(rem.ageing_bucket, rem.due_age_days)}
                            </div>
                          </div>
                        </td>

                        {/* Delivery Status */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {isSent ? (
                              <Badge variant="success" size="xs">
                                <span className="flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Sent
                                </span>
                              </Badge>
                            ) : isFailed ? (
                              <Badge variant="danger" size="xs">
                                <span className="flex items-center gap-1">
                                  <X className="w-3 h-3" /> Failed
                                </span>
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mr-1" />
                                Pending
                              </Badge>
                            )}

                            {isSent && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {rem.handled_by_name ? `By ${rem.handled_by_name}` : 'Handled'}
                                {rem.handled_at && ` · ${formatDateTime(rem.handled_at)}`}
                              </div>
                            )}

                            {isFailed && rem.error_reason && (
                              <span className="text-[10px] text-rose-600 font-medium max-w-[140px] truncate" title={rem.error_reason}>
                                {rem.error_reason}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* WhatsApp Action Buttons */}
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* WhatsApp Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsApp(rem)}
                              disabled={!hasMobile}
                              title={
                                hasMobile
                                  ? `Open WhatsApp to send polite reminder to ${rem.student_mobile}`
                                  : 'Student has no mobile number recorded'
                              }
                              className={`h-8 min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shadow-2xs ${
                                hasMobile
                                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0 text-white" />
                              <span>WhatsApp</span>
                              <ExternalLink className="w-3 h-3 text-emerald-200" />
                            </button>

                            {/* Mark Sent / Mark Failed / Reset */}
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarkSent(rem.id)}
                                  disabled={actionLoadingId === rem.id}
                                  title="Mark this reminder as sent"
                                  className="h-8 min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Mark Sent</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setFailedModalItem(rem)}
                                  disabled={actionLoadingId === rem.id}
                                  title="Mark reminder as failed"
                                  className="h-8 min-h-[32px] px-2 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5 text-rose-700" />
                                  <span>Failed</span>
                                </button>
                              </>
                            )}

                            {isSent && (
                              <button
                                type="button"
                                onClick={() => handleResetPending(rem.id)}
                                disabled={actionLoadingId === rem.id}
                                title="Reset reminder back to pending"
                                className="h-8 min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 transition-colors shadow-2xs cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3 text-violet-700" />
                                <span>Reset</span>
                              </button>
                            )}

                            {isFailed && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleMarkSent(rem.id)}
                                  disabled={actionLoadingId === rem.id}
                                  title="Mark as sent"
                                  className="h-8 min-h-[32px] px-2 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Sent</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleResetPending(rem.id)}
                                  disabled={actionLoadingId === rem.id}
                                  title="Reset reminder back to pending"
                                  className="h-8 min-h-[32px] px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3 text-slate-700" />
                                  <span>Reset</span>
                                </button>
                              </>
                            )}

                            {/* Collect Fee Shortcut */}
                            <button
                              type="button"
                              onClick={() => setSelectedAdmissionForPay(rem.admission_id)}
                              title="Collect payment now"
                              className="h-8 min-h-[32px] px-2 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-slate-700" />
                              <span>Pay</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100 p-2 space-y-2.5">
              {reminders.map((rem) => {
                const hasMobile = Boolean(rem.student_mobile && rem.student_mobile.trim());
                const isPending = rem.status === 'pending';
                const isSent = rem.status === 'sent';
                const isFailed = rem.status === 'failed';

                return (
                  <div key={rem.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div
                          onClick={() => navigate(`/students/${rem.student_id}`)}
                          className="font-bold text-black text-sm hover:underline cursor-pointer"
                        >
                          {rem.student_name}
                        </div>
                        <div className="text-xs text-slate-600 font-mono">
                          {rem.student_code}
                          {rem.father_name ? ` • F: ${rem.father_name}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {isSent ? (
                          <Badge variant="success" size="xs">Sent</Badge>
                        ) : isFailed ? (
                          <Badge variant="danger" size="xs">Failed</Badge>
                        ) : (
                          <Badge variant="warning" size="xs">Pending</Badge>
                        )}
                        {renderKindBadge(rem.kind)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Subject / Course</span>
                        <span className="font-bold text-black truncate block">
                          {rem.subject_name || rem.course_name}
                        </span>

                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Due Amount</span>
                        <span className="font-mono font-bold text-rose-700 text-sm">
                          {rem.formatted_due_amount || formatCurrency(rem.due_amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Due Date</span>
                        <span className="font-mono font-semibold text-black">
                          {rem.formatted_due_date || formatDate(rem.due_date)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Contact Mobile</span>
                        <span className="font-mono font-semibold text-black">
                          {rem.student_mobile || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsApp(rem)}
                        disabled={!hasMobile}
                        className={`flex-1 py-1.5 px-3 rounded text-xs font-bold text-center inline-flex items-center justify-center gap-1 shadow-2xs ${
                          hasMobile
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                        <ExternalLink className="w-3 h-3 text-emerald-200" />
                      </button>

                      {isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMarkSent(rem.id)}
                            disabled={actionLoadingId === rem.id}
                            className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-semibold inline-flex items-center justify-center gap-1 shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Mark Sent</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFailedModalItem(rem)}
                            className="py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded text-xs font-semibold inline-flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleResetPending(rem.id)}
                          disabled={actionLoadingId === rem.id}
                          className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-semibold inline-flex items-center justify-center gap-1 shadow-2xs"
                        >
                          <RotateCcw className="w-3 h-3 text-violet-700" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {(totalCount > 0 || totalPages > 1) && (
              <div className="p-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 font-medium">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} reminders (Page {page} of {totalPages})
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="px-2 font-bold text-slate-800">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Payment Modal */}
      {selectedAdmissionForPay && (
        <QuickPaymentModal
          isOpen={Boolean(selectedAdmissionForPay)}
          onClose={() => setSelectedAdmissionForPay(null)}
          admissionId={selectedAdmissionForPay}
          onSuccess={() => {
            setSelectedAdmissionForPay(null);
            loadQueue();
          }}
        />
      )}

      {/* Mark Failed Modal */}
      {failedModalItem && (
        <Modal
          isOpen={Boolean(failedModalItem)}
          onClose={() => setFailedModalItem(null)}
          title="Mark Reminder Delivery Failed"
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-slate-700">
              Please specify the failure reason for reminder to{' '}
              <strong className="text-black">{failedModalItem.student_name}</strong>:
            </p>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-black">
                Failure Reason
              </label>
              <select
                value={failedReason}
                onChange={(e) => setFailedReason(e.target.value)}
                className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="Invalid phone number / unreachable">Invalid phone number / unreachable</option>
                <option value="Student phone number not registered on WhatsApp">Student phone number not registered on WhatsApp</option>
                <option value="Number blocked or incoming restricted">Number blocked or incoming restricted</option>
                <option value="Guardian asked not to message on this number">Guardian asked not to message on this number</option>
                <option value="Wrong student contact details">Wrong student contact details</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setFailedModalItem(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleConfirmFailed}
                loading={actionLoadingId === failedModalItem.id}
              >
                Confirm Failed
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
