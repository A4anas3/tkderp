import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  User,
  GraduationCap,
  BookOpen,
  ArrowRight,
  Phone,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { renewalsApi, subjectApi } from '../../services/allApis';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { WhatsAppIcon, buildWhatsAppLink, formatINR, formatSlipDate } from '../../utils/whatsappHelpers';
import { useToast } from '../../context/ToastContext';

export default function RenewalsPage() {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [expiringList, setExpiringList] = useState([]);
  const [recentlyExpiredList, setRecentlyExpiredList] = useState([]);
  const [counts, setCounts] = useState({
    expiring_count: 0,
    recently_expired_count: 0,
    total_count: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'EXPIRING' | 'EXPIRED'
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [subjectsList, setSubjectsList] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleSubjectChange = (val) => {
    setSelectedSubject(val);
    setPage(1);
  };
  useEffect(() => {
    async function fetchSubjects() {
      try {
        const subs = await subjectApi.getAll();
        setSubjectsList(Array.isArray(subs) ? subs : []);
      } catch (err) {
        console.warn('Failed to load subjects for filter:', err);
      }
    }
    fetchSubjects();
  }, []);

  // Debounce search and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        page_size: pageSize,
      };
      if (activeTab !== 'ALL') {
        params.category = activeTab;
      }
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (selectedSubject !== 'ALL') {
        params.subject_id = selectedSubject;
      }
      const data = await renewalsApi.getSummary(params);
      setExpiringList(Array.isArray(data?.expiring) ? data.expiring : []);
      setRecentlyExpiredList(Array.isArray(data?.recently_expired) ? data.recently_expired : []);
      if (data?.counts) {
        setCounts(data.counts);
      }
      setTotal(typeof data?.total === 'number' ? data.total : (data?.counts?.total_count || 0));
      setTotalPages(typeof data?.total_pages === 'number' ? data.total_pages : 1);
    } catch (err) {
      console.error('Failed to load renewals data:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load course renewals data';
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedSubject, activeTab, page, pageSize, toastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenWhatsApp = (item, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const url = item.whatsapp_url || buildWhatsAppLink(item.student_mobile, item.whatsapp_message);
    if (!url) {
      toastError('No valid mobile number recorded for this student');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRowClick = (studentId) => {
    if (studentId) {
      navigate(`/students/${studentId}`);
    }
  };

  // Render a list table
  const renderListTable = (items, type) => {
    const isExpiring = type === 'EXPIRING';

    if (items.length === 0) {
      return (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            {isExpiring ? <Clock className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            {isExpiring
              ? 'No courses expiring in 1–5 days'
              : 'No courses recently expired (1–5 days ago)'}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {isExpiring
              ? 'There are currently no active student course admissions expiring within the next 1 to 5 days.'
              : 'There are no student course admissions that expired within the last 1 to 5 days.'}
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Course / Subject</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Timeline</th>
                <th className="py-3 px-4">Fee Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const initial = item.student_name ? item.student_name.charAt(0).toUpperCase() : 'S';
                return (
                  <tr
                    key={item.item_id}
                    onClick={() => handleRowClick(item.student_id)}
                    className="hover:bg-purple-50/40 cursor-pointer transition-colors group"
                    title={`Click to view profile of ${item.student_name}`}
                  >
                    {/* Student Column */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 border border-purple-200 flex items-center justify-center font-bold text-xs shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 group-hover:text-purple-950 transition-colors">
                              {item.student_name}
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-purple-700 transition-colors shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-700 mt-0.5">
                            <span className="font-mono font-semibold text-slate-700">
                              {item.student_code}
                            </span>
                            {item.student_mobile && (
                              <span className="flex items-center gap-0.5 text-slate-700">
                                <Phone className="w-2.5 h-2.5" />
                                {item.student_mobile}
                              </span>
                            )}
                          </div>
                          {item.father_name && (
                            <p className="text-[10px] text-slate-700 truncate">
                              S/O: {item.father_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Course / Subject Column */}
                    <td className="py-3 px-4">
                      <div className="min-w-0 max-w-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{item.subject_name}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700 mt-0.5">
                          {item.batch_name && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium truncate max-w-[140px]">
                              {item.batch_name}
                            </span>
                          )}
                          {item.hall_number && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                              {item.hall_number}
                            </span>
                          )}
                        </div>
                        {item.teacher_name && (
                          <p className="text-[10px] text-slate-700 mt-0.5 truncate">
                            Faculty: {item.teacher_name}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Expiry Date Column */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatSlipDate(item.valid_to)}</span>
                      </div>
                      {item.valid_from && (
                        <p className="text-[10px] text-slate-700 mt-0.5">
                          Since {formatSlipDate(item.valid_from)}
                        </p>
                      )}
                    </td>

                    {/* Timeline Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isExpiring ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {item.status_label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-900 border border-rose-300">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          {item.status_label}
                        </span>
                      )}
                    </td>

                    {/* Fee Status Column */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-[11px]">
                        <span className="font-semibold text-slate-800">
                          {formatINR(item.net_price)}
                        </span>
                        {Number(item.balance_due) > 0 ? (
                          <div className="text-rose-600 font-bold text-[10px]">
                            Due: {formatINR(item.balance_due)}
                          </div>
                        ) : (
                          <div className="text-emerald-700 font-semibold text-[10px]">
                            Fee Cleared
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenWhatsApp(item, e)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-2xs transition-colors cursor-pointer"
                          title="Open WhatsApp course renewal message"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WhatsApp Renew</span>
                          <span className="sm:hidden">WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(item.student_id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                          title="Open Student Profile"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900 flex items-center justify-center text-white shadow-2xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-black tracking-tight">
                Renewals
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                Live monitoring of course validity expiring in 1–5 days and recently expired admissions (1–5 days ago).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={loadData}
            loading={loading}
            className="min-h-[36px]"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="Expiring in 1–5 Days"
          value={counts.expiring_count}
          subtext="Admissions expiring within the next 1 to 5 days"
          icon={Clock}
          color="amber"
          onClick={() => handleTabChange('EXPIRING')}
        />
        <StatCard
          title="Recently Expired (1–5 Days Ago)"
          value={counts.recently_expired_count}
          subtext="Admissions expired within the last 1 to 5 days"
          icon={AlertTriangle}
          color="rose"
          onClick={() => handleTabChange('EXPIRED')}
        />
        <StatCard
          title="Total Renewal Candidates"
          value={counts.total_count}
          subtext="Combined candidates requiring course renewal"
          icon={RotateCcw}
          color="purple"
          onClick={() => handleTabChange('ALL')}
        />
      </div>

      {/* Filter and Tab Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Tab buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-bold">
            <button
              type="button"
              onClick={() => handleTabChange('ALL')}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-white text-black shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Both Lists ({counts.total_count})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('EXPIRING')}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'EXPIRING'
                  ? 'bg-white text-amber-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Expiring in 1–5 Days ({counts.expiring_count})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('EXPIRED')}
              className={`min-h-[32px] px-3.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'EXPIRED'
                  ? 'bg-white text-rose-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-black font-semibold'
              }`}
            >
              Recently Expired ({counts.recently_expired_count})
            </button>
          </div>

          {/* Quick info note */}
          <div className="text-[11px] text-slate-500 italic">
            * Renewed courses automatically disappear from both lists once their validity is extended.
          </div>
        </div>

        {/* Search & Subject Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student name, roll number, mobile, or course name..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-900/30 focus:border-purple-900 bg-white placeholder-slate-400 font-medium"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={selectedSubject}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-900/30 focus:border-purple-900 bg-white font-medium text-slate-700"
            >
              <option value="ALL">All Subjects & Courses</option>
              {subjectsList.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading && expiringList.length === 0 && recentlyExpiredList.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 mx-auto text-purple-900 animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-700">Loading course renewals...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* List 1: Expiring in 1-5 days */}
          {(activeTab === 'ALL' || activeTab === 'EXPIRING') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    (1) Expiring in 1–5 days
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    {expiringList.length} student{expiringList.length === 1 ? '' : 's'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Validity ending within 1 to 5 days
                </span>
              </div>
              {renderListTable(expiringList, 'EXPIRING')}
            </div>
          )}

          {/* List 2: Recently Expired (1-5 days ago) */}
          {(activeTab === 'ALL' || activeTab === 'EXPIRED') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    (2) Recently Expired (1–5 days ago)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                    {recentlyExpiredList.length} student{recentlyExpiredList.length === 1 ? '' : 's'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Validity concluded within the last 1 to 5 days
                </span>
              </div>
              {renderListTable(recentlyExpiredList, 'EXPIRED')}
            </div>
          )}

          {/* Pagination Controls */}
          {total > 0 && (
            <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
              <span className="text-slate-600 font-medium">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} candidates (Page {page} of {totalPages})
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
        </div>
      )}
    </div>
  );
}
