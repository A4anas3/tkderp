import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  CreditCard,
  ReceiptIndianRupee,
  GraduationCap,
  Clock,
  ArrowDownLeft,
  Edit2,
  UserX,
  RotateCcw,
  AlertTriangle,
  PlayCircle,
  XCircle,
  AlertCircle,
  Wallet,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  SlidersHorizontal,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { auditApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StatCard from '../../components/common/StatCard';
import Modal from '../../components/common/Modal';

export function getActionMeta(action) {
  switch (action) {
    case 'STUDENT_CREATED':
    case 'STUDENT_CREATED_FROM_ENQUIRY':
      return { label: 'Student Registered', variant: 'success', icon: GraduationCap };
    case 'STUDENT_UPDATED':
      return { label: 'Student Profile Updated', variant: 'primary', icon: Edit2 };
    case 'REVOKE_STUDENT':
      return { label: 'Student Revoked', variant: 'danger', icon: UserX };
    case 'RESTORE_STUDENT':
      return { label: 'Student Restored', variant: 'teal', icon: RotateCcw };
    case 'ADMISSION_CREATED':
      return { label: 'Course Purchase / Admission', variant: 'primary', icon: CreditCard };
    case 'PAYMENT_RECORDED':
      return { label: 'Fee Payment Collected', variant: 'success', icon: ReceiptIndianRupee };
    case 'PAYMENT_EDITED':
      return { label: 'Payment Edited', variant: 'warning', icon: Edit2 };
    case 'REFUND_PROCESSED':
      return { label: 'Refund Issued', variant: 'warning', icon: ArrowDownLeft };
    case 'SUBJECT_RENEWED':
      return { label: 'Subject Renewed', variant: 'teal', icon: RefreshCw };
    case 'SUBJECT_CHANGED':
      return { label: 'Subject Changed', variant: 'purple', icon: ArrowLeftRight };
    case 'ADMISSION_ITEM_VALIDITY_UPDATED':
      return { label: 'Validity Adjusted', variant: 'info', icon: Calendar };
    case 'ADMISSION_SUSPENDED':
    case 'ADMISSION_ITEM_SUSPENDED':
      return { label: 'Suspended', variant: 'warning', icon: AlertTriangle };
    case 'ADMISSION_RESUMED':
    case 'ADMISSION_ITEM_RESUMED':
      return { label: 'Resumed', variant: 'success', icon: PlayCircle };
    case 'ADMISSION_DISCONTINUED':
    case 'ADMISSION_ITEM_DISCONTINUED':
      return { label: 'Discontinued', variant: 'danger', icon: XCircle };
    case 'BATCH_PURCHASE_REVOKED':
      return { label: 'Purchase Revoked', variant: 'danger', icon: AlertCircle };
    case 'BATCH_PURCHASE_RESTORED':
      return { label: 'Purchase Restored', variant: 'teal', icon: RotateCcw };
    case 'BATCH_PURCHASE_CANCELLED':
      return { label: 'Purchase Cancelled', variant: 'danger', icon: XCircle };
    case 'EXPENSE_CREATED':
      return { label: 'Expense Recorded', variant: 'purple', icon: Wallet };
    case 'SALARY_PAID':
      return { label: 'Salary Paid', variant: 'purple', icon: Wallet };
    case 'TEACHER_PAYOUT_RECORDED':
      return { label: 'Teacher Payout', variant: 'purple', icon: Wallet };
    case 'REFRESH_STATUSES_JOB_RUN':
      return { label: 'Daily Status Refresh', variant: 'neutral', icon: Clock };
    case 'FEE_DUE_WAIVED':
      return { label: 'Fee Due Waived', variant: 'warning', icon: Sparkles };
    default:
      return {
        label: action ? action.replace(/_/g, ' ') : 'System Action',
        variant: 'neutral',
        icon: History,
      };
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

export function AuditDetailsSummary({ audit }) {
  const parsed = audit.parsed_details;
  if (!parsed) return <span className="text-slate-600 text-xs truncate max-w-xs">{audit.details || '—'}</span>;

  if (parsed.waived_amount !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
          ₹{Number(parsed.waived_amount).toLocaleString('en-IN')} Waived
        </span>
        {parsed.admission_number && (
          <span className="font-mono text-[10px] text-black bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
            {parsed.admission_number}
          </span>
        )}
        {parsed.reason && (
          <span className="text-slate-800 text-xs italic truncate max-w-xs">
            "{parsed.reason}"
          </span>
        )}
      </div>
    );
  }

  if (parsed.amount !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-black">₹{Number(parsed.amount).toLocaleString('en-IN')}</span>
        {parsed.payment_mode && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-black font-mono text-[10px] uppercase font-bold border border-slate-200">
            {parsed.payment_mode}
          </span>
        )}
        {parsed.payment_number && <span className="text-black font-mono text-[11px] font-semibold">{parsed.payment_number}</span>}
        {parsed.admission_number && <span className="text-slate-600 text-[11px]">({parsed.admission_number})</span>}
      </div>
    );
  }

  if (parsed.gross_amount !== undefined || parsed.net_amount !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-rose-700">₹{Number(parsed.net_amount || parsed.gross_amount).toLocaleString('en-IN')}</span>
        {parsed.refund_number && <span className="text-black font-mono text-[11px] font-semibold">{parsed.refund_number}</span>}
        {parsed.reason && <span className="text-slate-800 italic truncate max-w-xs">"{parsed.reason}"</span>}
      </div>
    );
  }

  if (parsed.new_subject) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-black">{parsed.student_name}</span>
        <span className="text-slate-600 text-[11px]">
          {parsed.old_subject ? `${parsed.old_subject} → ` : ''}
          <span className="text-odoo-800 font-bold">{parsed.new_subject}</span>
        </span>
        {parsed.new_admission_number && (
          <span className="text-slate-500 font-mono text-[10px]">({parsed.new_admission_number})</span>
        )}
      </div>
    );
  }

  if (parsed.name || parsed.student_name || parsed.student_code) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-black">{parsed.name || parsed.student_name}</span>
        {parsed.student_code && <span className="font-mono text-black font-semibold text-[11px]">{parsed.student_code}</span>}
        {parsed.reason && <span className="text-rose-700 font-medium text-[11px]">Reason: {parsed.reason}</span>}
      </div>
    );
  }

  if (parsed.items_renewed) {
    return (
      <div className="text-xs text-black font-medium">
        Renewed {parsed.items_renewed.length} subject(s)
        {parsed.admission_number && <span className="text-slate-600 font-mono ml-1 text-[11px]">({parsed.admission_number})</span>}
      </div>
    );
  }

  if (parsed.title) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-black">{parsed.title}</span>
        {parsed.amount && <span className="font-bold text-purple-900">₹{Number(parsed.amount).toLocaleString('en-IN')}</span>}
        {parsed.category && (
          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold">
            {parsed.category}
          </span>
        )}
      </div>
    );
  }

  if (parsed.reason) {
    return <span className="text-xs text-black italic font-medium">"{parsed.reason}"</span>;
  }

  return <span className="text-xs text-slate-700 truncate max-w-xs block">{JSON.stringify(parsed)}</span>;
}

export default function AuditLogPage() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [stats, setStats] = useState({
    total_events: 0,
    financial_events: 0,
    student_events: 0,
    today_events: 0,
  });

  // Filter Options
  const [actionList, setActionList] = useState([]);
  const [entityTypeList, setEntityTypeList] = useState([]);
  const [userList, setUserList] = useState([]);

  // Active Filters
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedEntityType, setSelectedEntityType] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Inspector Modal State
  const [selectedLog, setSelectedLog] = useState(null);

  // Fetch Filter Dropdowns & Stats
  useEffect(() => {
    async function loadMeta() {
      try {
        const [acts, ents, usrs, st] = await Promise.allSettled([
          auditApi.getActions(),
          auditApi.getEntityTypes(),
          auditApi.getUsers(),
          auditApi.getStats(),
        ]);
        if (acts.status === 'fulfilled') setActionList(acts.value || []);
        if (ents.status === 'fulfilled') setEntityTypeList(ents.value || []);
        if (usrs.status === 'fulfilled') setUserList(usrs.value || []);
        if (st.status === 'fulfilled') setStats(st.value);
      } catch (err) {
        console.error('Failed to load audit metadata', err);
      }
    }
    loadMeta();
  }, []);

  // Fetch Audit Logs
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (selectedAction && selectedAction !== 'ALL') params.action = selectedAction;
      if (selectedEntityType && selectedEntityType !== 'ALL') params.entity_type = selectedEntityType;
      if (selectedUser && selectedUser !== 'ALL') params.user_id = selectedUser;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await auditApi.list(params);
      setLogs(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err) {
      toast?.error(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, selectedAction, selectedEntityType, selectedUser, fromDate, toDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleResetFilters = () => {
    setSelectedAction('ALL');
    setSelectedEntityType('ALL');
    setSelectedUser('ALL');
    setSearchQuery('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleExportCsv = () => {
    if (!logs.length) {
      toast?.error('No logs to export');
      return;
    }
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'User', 'Role', 'IP Address', 'Details'];
    const rows = logs.map((l) => [
      l.created_at,
      l.action,
      l.entity_type,
      l.entity_id || '',
      l.user_name || 'System',
      l.user_role || '',
      l.ip_address || '',
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast?.success('Audit log export initiated');
  };

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-odoo-50 text-odoo-700 border border-odoo-200">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight">System Audit Trail</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
            Permanent, verifiable log of all administrative actions, student registrations, fee collections, refunds, and adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            icon={Download}
            disabled={loading || logs.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchLogs}
            icon={RefreshCw}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. Key Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Events"
          value={stats.total_events.toLocaleString('en-IN')}
          icon={History}
          trend={null}
          subtitle="All recorded activities"
        />
        <StatCard
          title="Financial Events"
          value={stats.financial_events.toLocaleString('en-IN')}
          icon={ReceiptIndianRupee}
          trend={null}
          subtitle="Payments, refunds, expenses"
        />
        <StatCard
          title="Student & Courses"
          value={stats.student_events.toLocaleString('en-IN')}
          icon={GraduationCap}
          trend={null}
          subtitle="Admissions & enrollments"
        />
        <StatCard
          title="Today's Activity"
          value={stats.today_events.toLocaleString('en-IN')}
          icon={Clock}
          trend={null}
          subtitle="Actions taken today"
        />
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-black uppercase tracking-wider">
            <SlidersHorizontal className="w-3.5 h-3.5 text-odoo-600" />
            Filters & Activity Search
          </div>
          {(selectedAction !== 'ALL' || selectedEntityType !== 'ALL' || selectedUser !== 'ALL' || searchQuery || fromDate || toDate) && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition"
            >
              Reset All Filters
            </button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Keyword Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reference, details, notes, staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500 placeholder:text-slate-400"
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
            >
              <option value="ALL">All Actions</option>
              {actionList.map((act) => (
                <option key={act} value={act}>
                  {getActionMeta(act).label} ({act})
                </option>
              ))}
            </select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <select
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
            >
              <option value="ALL">All Entities</option>
              {entityTypeList.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>

          {/* User / Staff Filter */}
          <div>
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
            >
              <option value="ALL">All Staff & Actors</option>
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              title="From Date"
              className="w-1/2 px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              title="To Date"
              className="w-1/2 px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-black font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
            />
          </div>
        </form>
      </div>

      {/* 4. Audit Log Table / Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-odoo-600 mx-auto" />
            <p className="text-xs text-slate-600 font-semibold">Loading audit trail entries...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <History className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-black">No Audit Logs Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No audit log entries matched your current filters. Try adjusting your search query, action, or date range.
            </p>
            <Button variant="secondary" size="sm" onClick={handleResetFilters} className="mt-2">
              Reset Filters
            </Button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-black font-bold uppercase text-[11px] tracking-wider">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Acting User</th>
                    <th className="py-3 px-4">Details Summary</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {logs.map((log) => {
                    const meta = getActionMeta(log.action);
                    const ActionIcon = meta.icon;
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-black">{formatDateTime(log.created_at)}</div>
                          {log.ip_address && (
                            <div className="text-[10px] text-slate-400 font-mono">IP: {log.ip_address}</div>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge variant={meta.variant} size="xs" className="font-bold">
                            <ActionIcon className="w-3 h-3 shrink-0" />
                            {meta.label}
                          </Badge>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{log.action}</div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-black font-mono font-bold text-[10px]">
                            {log.entity_type}
                          </span>
                          {log.entity_id && (
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[100px]">
                              {String(log.entity_id).slice(0, 8)}...
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-odoo-100 text-odoo-800 flex items-center justify-center font-bold text-[10px]">
                              {(log.user_name || 'S')[0].toUpperCase()}
                            </span>
                            <div>
                              <div className="font-bold text-black">{log.user_name || 'System'}</div>
                              {log.user_role && (
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                  {log.user_role}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <AuditDetailsSummary audit={log} />
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-black hover:bg-slate-200 transition"
                            title="Inspect Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {logs.map((log) => {
                const meta = getActionMeta(log.action);
                const ActionIcon = meta.icon;
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="p-3.5 space-y-2 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={meta.variant} size="xs" className="font-bold">
                        <ActionIcon className="w-3 h-3 shrink-0" />
                        {meta.label}
                      </Badge>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>

                    <div className="text-xs">
                      <AuditDetailsSummary audit={log} />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-50">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="font-bold text-black">{log.user_name || 'System'}</span>
                        {log.user_role && <span className="text-[10px] text-slate-400">({log.user_role})</span>}
                      </div>
                      <span className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">
                        {log.entity_type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. Pagination Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
              <div className="text-slate-700 font-medium">
                Showing <span className="font-bold text-black">{logs.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> to{' '}
                <span className="font-bold text-black">{Math.min(page * pageSize, total)}</span> of{' '}
                <span className="font-bold text-black">{total.toLocaleString('en-IN')}</span> entries
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-slate-600 font-medium mr-2">
                  <span>Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-black font-semibold focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="p-1 rounded border border-slate-300 bg-white text-black hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded border border-slate-300 bg-white text-black hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-bold text-black">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1 rounded border border-slate-300 bg-white text-black hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    className="p-1 rounded border border-slate-300 bg-white text-black hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Detailed Event Modal */}
      {selectedLog && (
        <Modal
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`Audit Event Details: ${getActionMeta(selectedLog.action).label}`}
          subtitle={`Recorded on ${formatDateTime(selectedLog.created_at)}`}
          maxWidth="max-w-2xl"
        >
          <div className="p-4 sm:p-6 space-y-4 text-xs">
            {/* Meta Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Action Code</span>
                <div className="font-mono font-bold text-black text-xs break-all">{selectedLog.action}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Entity</span>
                <div className="font-bold text-black text-xs">{selectedLog.entity_type}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Acting User</span>
                <div className="font-bold text-black text-xs">{selectedLog.user_name || 'System'}</div>
                {selectedLog.user_role && (
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">{selectedLog.user_role}</span>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">IP Address</span>
                <div className="font-mono text-black text-xs">{selectedLog.ip_address || 'Internal / Local'}</div>
              </div>
            </div>

            {/* Parsed Fields (if JSON) */}
            {selectedLog.parsed_details ? (
              <div className="space-y-1.5">
                <h4 className="font-bold text-black text-xs uppercase tracking-wider">Event Details & Parameters</h4>
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                  {Object.entries(selectedLog.parsed_details).map(([key, val]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 gap-1">
                      <span className="font-mono text-slate-700 font-semibold uppercase text-[11px]">{key}</span>
                      <span className="font-medium text-black break-all">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedLog.details ? (
              <div className="space-y-1.5">
                <h4 className="font-bold text-black text-xs uppercase tracking-wider">Event Details & Parameters</h4>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <span className="font-medium text-black break-all">{selectedLog.details}</span>
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
