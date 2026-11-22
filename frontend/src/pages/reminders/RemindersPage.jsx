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
} from 'lucide-react';
import { remindersApi } from '../../services/allApis';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import { WhatsAppIcon, buildWhatsAppLink } from '../../utils/whatsappHelpers';

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

export default function RemindersPage() {
  const navigate = useNavigate();

  const [reminders, setReminders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const [counts, setCounts] = useState({
    pending: 0,
    sent: 0,
    expired_dues: 0,
    total_due_amount: 0,
    formatted_total_due: '₹0.00',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'sent' | 'all'
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Payment modal state
  const [selectedAdmissionForPay, setSelectedAdmissionForPay] = useState(null);

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
      const res = await remindersApi.getQueue({
        status: statusFilter,
        search: debouncedSearch.trim() || undefined,
        page,
        page_size: pageSize,
      });

      const list = Array.isArray(res) ? res : res?.items || [];
      setReminders(list);
      setTotalCount(typeof res.total === 'number' ? res.total : list.length);
      setTotalPages(typeof res.total_pages === 'number' ? res.total_pages : 1);
      if (res.counts) {
        setCounts(res.counts);
      }
    } catch (err) {
      console.error('Failed to load reminders queue:', err);
      setError(err?.message || 'Failed to load reminders from server. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch, page, pageSize]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Handler: Scan for dues
  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await remindersApi.generate();
      await loadQueue();
    } catch (err) {
      console.error('Failed to generate reminders:', err);
      alert(err?.message || 'Failed to scan reminders');
    } finally {
      setGenerating(false);
    }
  };

  // Handler: Mark Sent
  const handleMarkSent = async (id) => {
    try {
      setActionLoadingId(id);
      await remindersApi.markSent(id);
      await loadQueue();
    } catch (err) {
      console.error('Failed to mark sent:', err);
      alert(err?.message || 'Failed to mark as sent');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Reset Pending
  const handleResetPending = async (id) => {
    try {
      setActionLoadingId(id);
      await remindersApi.resetPending(id);
      await loadQueue();
    } catch (err) {
      console.error('Failed to reset reminder:', err);
      alert(err?.message || 'Failed to reset reminder');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler: Open WhatsApp click-to-chat
  const handleOpenWhatsApp = (rem) => {
    const url =
      rem.whatsapp_url ||
      buildWhatsAppLink(rem.student_mobile, rem.message);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Filter items if expiredOnly toggle is active client-side
  const displayedReminders = useMemo(() => {
    if (!expiredOnly) return reminders;
    return reminders.filter((r) => r.is_expired || r.kind === 'expired_due');
  }, [reminders, expiredOnly]);

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-2xs">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-black tracking-tight">
                Due Reminders & WhatsApp Queue
              </h1>
              <p className="text-xs text-slate-700 font-medium">
                Click-to-chat WhatsApp reminders for pending student dues and expired course balances.
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
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-odoo-600 hover:bg-odoo-700 active:bg-odoo-800 text-white shadow-2xs transition-colors"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? 'Scanning...' : 'Scan For Dues'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Pending Due Reminders"
          value={counts.pending}
          subtext="Students with unpaid balances"
          icon={AlertCircle}
          color="amber"
          onClick={() => {
            setStatusFilter('pending');
            setExpiredOnly(false);
          }}
        />
        <StatCard
          title="Expired Course Dues (F1)"
          value={counts.expired_dues}
          subtext="Unpaid dues on expired courses"
          icon={AlertTriangle}
          color="rose"
          onClick={() => {
            setStatusFilter('pending');
            setExpiredOnly(true);
          }}
        />
        <StatCard
          title="Reminders Sent"
          value={counts.sent}
          subtext="Marked as sent by staff"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => {
            setStatusFilter('sent');
            setExpiredOnly(false);
          }}
        />
        <StatCard
          title="Total Receivables Due"
          value={counts.formatted_total_due}
          subtext="Across active reminders queue"
          icon={CreditCard}
          color="purple"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-bold">
            <button
              onClick={() => {
                setStatusFilter('pending');
                setPage(1);
              }}
              className={`min-h-[32px] px-3 py-1 rounded-md transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-white text-black shadow-xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              Pending ({counts.pending})
            </button>
            <button
              onClick={() => {
                setStatusFilter('sent');
                setPage(1);
              }}
              className={`min-h-[32px] px-3 py-1 rounded-md transition-colors ${
                statusFilter === 'sent'
                  ? 'bg-white text-black shadow-xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              Sent ({counts.sent})
            </button>
            <button
              onClick={() => {
                setStatusFilter('all');
                setPage(1);
              }}
              className={`min-h-[32px] px-3 py-1 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-black shadow-xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              All Records
            </button>
          </div>

          {/* Quick Expired Due Filter Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpiredOnly(!expiredOnly)}
              className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                expiredOnly
                  ? 'bg-rose-100 text-rose-950 border-rose-300 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Show Expired Dues Only</span>
              {expiredOnly && <Check className="w-3 h-3 text-rose-600" />}
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, mobile, course..."
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm min-h-[34px] border border-slate-300 rounded-lg bg-white text-black placeholder:text-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main Reminders Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {loading && reminders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-odoo-600 mb-2" />
            Loading reminders queue...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
            {error}
            <div className="mt-2">
              <Button size="xs" variant="secondary" onClick={loadQueue}>
                Retry
              </Button>
            </div>
          </div>
        ) : displayedReminders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black">No Reminders Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5 font-medium">
                {statusFilter === 'pending'
                  ? 'All student fees are fully settled or no pending reminders match your filter.'
                  : 'No sent reminders recorded in this view.'}
              </p>
            </div>
            <div className="pt-1">
              <Button size="xs" variant="primary" onClick={handleGenerate} loading={generating}>
                Scan Admissions For Dues
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-black font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Student Details</th>
                    <th className="py-3 px-3">Mobile Contact</th>
                    <th className="py-3 px-3">Enrolled Course & Ref</th>
                    <th className="py-3 px-3 text-right">Balance Due</th>
                    <th className="py-3 px-3 text-center">Status / Lifecycle</th>
                    <th className="py-3 px-3.5 text-right">WhatsApp Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                  {displayedReminders.map((rem) => {
                    const hasMobile = Boolean(rem.student_mobile && rem.student_mobile.trim());
                    const isSent = rem.status === 'sent';

                    return (
                      <tr
                        key={rem.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          rem.is_expired ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        {/* Student Name & Code */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-black uppercase shrink-0">
                              {rem.student_name ? rem.student_name.charAt(0) : 'S'}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-black text-xs sm:text-sm block truncate">
                                {rem.student_name}
                              </span>
                              <span className="text-[11px] font-mono text-slate-600 block">
                                {rem.student_code}
                              </span>
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

                        {/* Course Name & Admission Reference */}
                        <td className="py-3 px-3">
                          <span className="font-bold text-black text-xs block max-w-xs truncate">
                            {rem.course_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 block">
                            Ref: {rem.admission_number}
                          </span>
                        </td>

                        {/* Due Amount */}
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`font-mono text-xs sm:text-sm font-black block ${
                              rem.is_expired ? 'text-rose-700' : 'text-amber-800'
                            }`}
                          >
                            {rem.formatted_due_amount || formatCurrency(rem.due_amount)}
                          </span>
                          {rem.is_expired && (
                            <span className="text-[10px] text-rose-600 font-bold block uppercase tracking-tight">
                              Expired Balance
                            </span>
                          )}
                        </td>

                        {/* Status & Badges */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isSent ? (
                              <Badge variant="success" size="xs">
                                <span className="flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Sent
                                </span>
                              </Badge>
                            ) : rem.is_expired ? (
                              <Badge variant="danger" size="xs">
                                Expired Due
                              </Badge>
                            ) : rem.kind === 'due_today' ? (
                              <Badge variant="warning" size="xs">
                                Due Today
                              </Badge>
                            ) : rem.kind === 'due_soon' ? (
                              <Badge variant="warning" size="xs">
                                Due Soon
                              </Badge>
                            ) : (
                              <Badge variant="default" size="xs">
                                Pending
                              </Badge>
                            )}

                            {isSent && rem.handled_by_name && (
                              <span className="text-[10px] text-slate-500">
                                by {rem.handled_by_name}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* WhatsApp Ready-to-Click Action */}
                        <td className="py-3 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* WhatsApp Click-to-Chat Button */}
                            <button
                              onClick={() => handleOpenWhatsApp(rem)}
                              disabled={!hasMobile}
                              title={
                                hasMobile
                                  ? `Open WhatsApp to send polite reminder to ${rem.student_mobile}`
                                  : 'Student has no mobile number recorded'
                              }
                              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-2xs touch-manipulation ${
                                hasMobile
                                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="hidden sm:inline">WhatsApp</span>
                              <ExternalLink className="w-3 h-3 opacity-80" />
                            </button>

                            {/* Mark Sent / Reset Action */}
                            {!isSent ? (
                              <button
                                onClick={() => handleMarkSent(rem.id)}
                                disabled={actionLoadingId === rem.id}
                                title="Mark this reminder as sent"
                                className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 border border-slate-300 bg-white text-slate-800 hover:text-black hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-2xs touch-manipulation cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden md:inline">Mark Sent</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleResetPending(rem.id)}
                                disabled={actionLoadingId === rem.id}
                                title="Reset reminder back to pending"
                                className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-slate-300 bg-white text-slate-700 hover:text-black hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-2xs touch-manipulation cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span className="hidden md:inline">Reset</span>
                              </button>
                            )}

                            {/* Collect Fee Shortcut */}
                            <button
                              onClick={() => setSelectedAdmissionForPay(rem.admission_id)}
                              title="Collect payment now"
                              className="min-h-[32px] px-2 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 border border-purple-200 bg-purple-50 text-odoo-800 hover:bg-purple-100 active:bg-purple-200 transition-colors shadow-2xs"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-odoo-700" />
                              <span className="hidden lg:inline">Pay</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  Showing page {page} of {totalPages} ({totalCount} total reminders)
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
    </div>
  );
}
