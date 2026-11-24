import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  CreditCard,
  Calendar,
  Users,
  BookOpen,
  UserCheck,
  CalendarDays,
  LifeBuoy,
  FileCheck2,
  RotateCcw,
  Receipt,
  BarChart3,
  Download,
  Printer,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
  Building,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import InstituteLogo from '../../components/common/InstituteLogo';
import { reportApi, subjectApi } from '../../services/allApis';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useInstitute } from '../../context/InstituteContext';

const PIE_COLORS = ['#059669', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'];

// List of all 9 Reports with identifiers, titles, and icons
const REPORT_TABS = [
  { id: 'collections', label: 'Collections', sublabel: 'Payment Modes & Cashiers', icon: CreditCard, color: 'emerald' },
  { id: 'dues-ageing', label: 'Dues & Ageing', sublabel: '0-30, 31-60, 61-90, 90+ Buckets', icon: Clock, color: 'rose' },
  { id: 'subject-breakup', label: 'Subject-wise', sublabel: 'Billed, Collected & Due', icon: BookOpen, color: 'purple' },
  { id: 'teacher-breakup', label: 'Teacher-wise', sublabel: 'Faculty Collections & Dues', icon: UserCheck, color: 'indigo' },
  { id: 'admissions-conversion', label: 'Admissions & Conversion', sublabel: 'Enquiries, Sources & Conversion', icon: LifeBuoy, color: 'amber' },
  { id: 'waivers', label: 'Waivers', sublabel: 'Admin Due Forgiveness & Audit', icon: FileCheck2, color: 'amber' },
  { id: 'refunds', label: 'Refunds', sublabel: 'Disbursed Fees & Deductions', icon: RotateCcw, color: 'rose' },
  { id: 'expenses', label: 'Expenses', sublabel: 'Operations & Staff Salaries', icon: Receipt, color: 'blue' },
  { id: 'summary-dashboard', label: 'Summary Dashboard', sublabel: 'Daily / Monthly Net Cash', icon: BarChart3, color: 'odoo' },
];

export default function ReportsHubPage() {
  const { reportTab } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { institute } = useInstitute();
  const instituteName = institute?.institute_name || 'THAKURDWARA COACHING INSTITUTE';

  // Active tab state
  const activeTab = useMemo(() => {
    if (reportTab && REPORT_TABS.some((t) => t.id === reportTab)) {
      return reportTab;
    }
    return 'collections';
  }, [reportTab]);

  const handleTabChange = (tabId) => {
    navigate(`/reports/${tabId}`);
  };

  // Date filters
  const currentYear = new Date().getFullYear();
  const [activePreset, setActivePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Preloaded metadata
  const [subjectsList, setSubjectsList] = useState([]);

  // Per-report filters
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('ALL');
  const [cashierFilter, setCashierFilter] = useState('ALL');
  const [ageingBucketFilter, setAgeingBucketFilter] = useState('ALL');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');
  const [enquirySourceFilter, setEnquirySourceFilter] = useState('ALL');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('ALL');
  const [refundModeFilter, setRefundModeFilter] = useState('ALL');
  const [summaryPeriod, setSummaryPeriod] = useState('daily'); // 'daily' | 'monthly'

  // Preload subjects once on mount (deduped by ID)
  useEffect(() => {
    async function loadMeta() {
      try {
        const subs = await subjectApi.getAll();
        if (Array.isArray(subs)) {
          const uniqueSubs = [];
          const seen = new Set();
          for (const s of subs) {
            if (s && s.id && !seen.has(s.id)) {
              seen.add(s.id);
              uniqueSubs.push(s);
            }
          }
          setSubjectsList(uniqueSubs);
        } else {
          setSubjectsList([]);
        }
      } catch (err) {
        console.warn('Failed to preload metadata for reports filters:', err);
      }
    }
    loadMeta();
  }, []);

  // Data & loading states
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const PAGE_SIZE = 15;

  // Clear previous tab's data immediately upon tab change to prevent rendering mismatched data shapes
  useEffect(() => {
    setData(null);
  }, [activeTab]);

  // Deduplicate waiver items defensively in the UI
  const dedupedWaivers = useMemo(() => {
    if (!data?.items || !Array.isArray(data.items)) return [];
    if (activeTab !== 'waivers') return [];
    const seen = new Set();
    const result = [];
    for (const item of data.items) {
      const key = item.id || item.waiver_number || item.audit_reference || `${item.student_id}-${item.admission_id}`;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  }, [data?.items, activeTab]);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const applyDatePreset = (presetKey) => {
    setActivePreset(presetKey);
    const now = new Date();
    let f = '';
    let t = '';
    let m = '';
    let y = selectedYear;

    if (presetKey === 'today') {
      f = formatDate(now);
      t = formatDate(now);
    } else if (presetKey === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      f = formatDate(monday);
      t = formatDate(new Date());
    } else if (presetKey === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      f = formatDate(firstDay);
      t = formatDate(new Date());
      m = now.getMonth() + 1;
      y = now.getFullYear();
    } else if (presetKey === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      f = formatDate(firstDay);
      t = formatDate(lastDay);
      m = firstDay.getMonth() + 1;
      y = firstDay.getFullYear();
    } else if (presetKey === 'this_year') {
      f = `${now.getFullYear()}-01-01`;
      t = `${now.getFullYear()}-12-31`;
      y = now.getFullYear();
    } else if (presetKey === 'all') {
      f = '';
      t = '';
      m = '';
      y = '';
    }

    setFromDate(f);
    setToDate(t);
    setSelectedMonth(m);
    setSelectedYear(y || currentYear);
  };

  // Reset tablePage to 1 whenever any filter or tab changes
  useEffect(() => {
    setTablePage(1);
  }, [
    activeTab,
    fromDate,
    toDate,
    selectedMonth,
    selectedYear,
    searchQuery,
    paymentModeFilter,
    cashierFilter,
    ageingBucketFilter,
    selectedSubjectFilter,
    enquirySourceFilter,
    refundModeFilter,
    expenseCategoryFilter,
    summaryPeriod,
  ]);

  // Build query params
  const buildQueryParams = useCallback((includePagination = true) => {
    const params = {};
    if (includePagination) {
      params.page = tablePage;
      params.page_size = PAGE_SIZE;
    }
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (selectedMonth) params.month = selectedMonth;
    if (selectedYear) params.year = selectedYear;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    if (activeTab === 'collections') {
      if (paymentModeFilter !== 'ALL') params.payment_mode = paymentModeFilter;
      if (cashierFilter !== 'ALL') params.cashier_id = cashierFilter;
    }
    if (activeTab === 'dues-ageing') {
      if (ageingBucketFilter !== 'ALL') params.ageing_bucket = ageingBucketFilter;
      if (selectedSubjectFilter !== 'ALL') params.subject_id = selectedSubjectFilter;
    }
    if (activeTab === 'admissions-conversion') {
      if (enquirySourceFilter !== 'ALL') params.source = enquirySourceFilter;
      if (selectedSubjectFilter !== 'ALL') params.subject_id = selectedSubjectFilter;
    }
    if (activeTab === 'refunds') {
      if (refundModeFilter !== 'ALL') params.refund_mode = refundModeFilter;
    }
    if (activeTab === 'expenses') {
      if (expenseCategoryFilter !== 'ALL') params.category_id = expenseCategoryFilter;
      if (paymentModeFilter !== 'ALL') params.payment_mode = paymentModeFilter;
    }
    if (activeTab === 'summary-dashboard') {
      params.period = summaryPeriod;
    }
    return params;
  }, [
    tablePage,
    fromDate,
    toDate,
    selectedMonth,
    selectedYear,
    searchQuery,
    activeTab,
    paymentModeFilter,
    cashierFilter,
    ageingBucketFilter,
    selectedSubjectFilter,
    enquirySourceFilter,
    expenseCategoryFilter,
    refundModeFilter,
    summaryPeriod,
  ]);

  // Fetch report data
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildQueryParams(true);
      let res;
      switch (activeTab) {
        case 'collections':
          res = await reportApi.getCollections(params);
          break;
        case 'dues-ageing':
          res = await reportApi.getDuesAgeing(params);
          break;
        case 'subject-breakup':
          res = await reportApi.getSubjectBreakup(params);
          break;
        case 'teacher-breakup':
          res = await reportApi.getTeacherBreakup(params);
          break;
        case 'admissions-conversion':
          res = await reportApi.getAdmissionsConversion(params);
          break;
        case 'waivers':
          res = await reportApi.getWaivers(params);
          break;
        case 'refunds':
          res = await reportApi.getRefunds(params);
          break;
        case 'expenses':
          res = await reportApi.getExpenses(params);
          break;
        case 'summary-dashboard':
          res = await reportApi.getSummaryDashboard(params);
          break;
        default:
          res = await reportApi.getCollections(params);
      }
      setData(res);
    } catch (err) {
      console.error(`Failed to fetch report [${activeTab}]:`, err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQueryParams]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Handle CSV export
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = buildQueryParams(false);
      params.format = 'csv';
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
          query.append(k, v);
        }
      });

      let endpoint = `/reports/${activeTab}`;
      if (activeTab === 'subject-breakup') endpoint = '/reports/subject-breakup';
      if (activeTab === 'teacher-breakup') endpoint = '/reports/teacher-breakup';

      const response = await api.get(`${endpoint}/csv?${query.toString()}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab}_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Active Tab Info
  const currentTabInfo = REPORT_TABS.find((t) => t.id === activeTab) || REPORT_TABS[0];

  return (
    <div className="space-y-4 max-w-full">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3.5 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#714B67] text-white flex items-center justify-center shadow-xs">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight">
              Institutional Reports & Ledger Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Single-source-of-truth financial ledgers, dues ageing, subject-wise revenues, faculty payouts & conversion
          </p>
        </div>

        {/* Action Buttons: Export CSV, Print View, Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchReportData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-black shadow-2xs transition-all cursor-pointer"
            title="Refresh Ledger Numbers"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            className="inline-flex items-center gap-1.5 h-8 min-h-[32px] px-3 py-1 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Export full ledger data to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-8 min-h-[32px] px-3 py-1 text-xs font-bold rounded-md bg-[#714B67] hover:bg-[#5e3c54] text-white shadow-2xs transition-all cursor-pointer"
            title="Print formal institutional report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print View</span>
          </button>
        </div>
      </div>

      {/* 2. Top Navigation Tabs (10 reports with badges & icons) */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#714B67] text-white shadow-xs'
                    : 'text-slate-800 hover:bg-slate-100 hover:text-black'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Global Filters Bar (Date Presets + Specific Filters) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs space-y-3 print:hidden">
        {/* Preset chips & title */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-black uppercase tracking-wider">
              {currentTabInfo.label} Filters
            </span>
            <Badge variant="primary" size="xs">
              {currentTabInfo.sublabel}
            </Badge>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id)}
                className={`h-7 px-2.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  activePreset === p.id
                    ? 'bg-[#714B67] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 items-end">
          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold text-black mb-1">
              Start Date (From)
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset('custom');
              }}
              className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-bold text-black mb-1">
              End Date (To)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset('custom');
              }}
              className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
            />
          </div>

          {/* Per-Report Specific Filters */}
          {activeTab === 'collections' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Modes</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / QR</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Cashier Desk
                </label>
                <select
                  value={cashierFilter}
                  onChange={(e) => setCashierFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Cashiers</option>
                  {data?.by_cashier?.map((c, idx) => (
                    <option key={c.cashier_id ? `cashier-${c.cashier_id}-${idx}` : `cashier-${idx}`} value={c.cashier_id || c.user_id}>
                      {c.cashier_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {activeTab === 'dues-ageing' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Ageing Bucket
                </label>
                <select
                  value={ageingBucketFilter}
                  onChange={(e) => setAgeingBucketFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Buckets</option>
                  <option value="0-30">0 - 30 Days (Current)</option>
                  <option value="31-60">31 - 60 Days</option>
                  <option value="61-90">61 - 90 Days</option>
                  <option value="90+">90+ Days (High Overdue)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Course Subject
                </label>
                <select
                  value={selectedSubjectFilter}
                  onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Subjects</option>
                  {subjectsList.map((s, idx) => (
                    <option key={s.id ? `due-subj-${s.id}-${idx}` : `due-subj-${idx}`} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {activeTab === 'admissions-conversion' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Lead Source
                </label>
                <select
                  value={enquirySourceFilter}
                  onChange={(e) => setEnquirySourceFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Sources</option>
                  <option value="Direct Walk-in">Direct Walk-in</option>
                  <option value="Referral">Student / Teacher Referral</option>
                  <option value="School Visit">School / College Visit</option>
                  <option value="Social Media / Digital">Social Media / Online</option>
                  <option value="Phone Enquiry">Phone Enquiry</option>
                  <option value="Demo Pass">Demo Pass Attended</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Subject
                </label>
                <select
                  value={selectedSubjectFilter}
                  onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Subjects</option>
                  {subjectsList.map((s, idx) => (
                    <option key={s.id ? `adm-subj-${s.id}-${idx}` : `adm-subj-${idx}`} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {activeTab === 'refunds' && (
            <div>
              <label className="block text-[11px] font-bold text-black mb-1">
                Refund Mode
              </label>
              <select
                value={refundModeFilter}
                onChange={(e) => setRefundModeFilter(e.target.value)}
                className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
              >
                <option value="ALL">All Modes</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / QR</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          )}

          {activeTab === 'expenses' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Expense Category
                </label>
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Categories</option>
                  {data?.by_category?.map((c) => (
                    <option key={c.category_name} value={c.category_name}>
                      {c.category_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-black mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                  className="w-full h-8 px-2 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
                >
                  <option value="ALL">All Modes</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / QR</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'summary-dashboard' && (
            <div>
              <label className="block text-[11px] font-bold text-black mb-1">
                Interval Mode
              </label>
              <div className="flex rounded-md border border-slate-300 p-0.5 bg-slate-50 h-8">
                <button
                  type="button"
                  onClick={() => setSummaryPeriod('daily')}
                  className={`flex-1 text-[11px] font-bold rounded transition cursor-pointer ${
                    summaryPeriod === 'daily' ? 'bg-[#714B67] text-white shadow-2xs' : 'text-slate-700'
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryPeriod('monthly')}
                  className={`flex-1 text-[11px] font-bold rounded transition cursor-pointer ${
                    summaryPeriod === 'monthly' ? 'bg-[#714B67] text-white shadow-2xs' : 'text-slate-700'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-black mb-1">
              Search Record / Reference
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search student, code, receipt, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs font-semibold text-black bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#714B67]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Active Report Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-2xs animate-pulse">
          <div className="w-8 h-8 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-700">Loading {currentTabInfo.label} from Ledger...</p>
          <p className="text-[11px] text-slate-500 mt-1">Sourcing real ledger entries as single source of truth</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ========================================================= */}
          {/* TAB 1: COLLECTIONS REPORT (a) */}
          {/* ========================================================= */}
          {activeTab === 'collections' && (
            <div className="space-y-4">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Gross Collections"
                  value={`₹${(data?.summary?.gross_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.payment_count || 0} Total payments received`}
                  icon={ArrowUpRight}
                  color="emerald"
                />
                <StatCard
                  title="Total Fee Refunds"
                  value={`₹${(data?.summary?.total_refunded || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Returned student fees"
                  icon={ArrowDownRight}
                  color="rose"
                />
                <StatCard
                  title="Net Realized Cash"
                  value={`₹${(data?.summary?.net_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Gross collected minus refunds"
                  icon={CreditCard}
                  color="indigo"
                />
                <StatCard
                  title="Transactions Logged"
                  value={`${data?.transactions?.length || 0}`}
                  subtext={`Matching date & mode filters`}
                  icon={Calendar}
                  color="teal"
                />
              </div>

              {/* Mode Breakdown + Cashier Breakdown Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Breakdown by Payment Mode */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                    <span>Collections by Payment Mode</span>
                    <Badge variant="teal" size="xs">Reconciled</Badge>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Payment Mode</th>
                          <th className="p-2 text-center">Txns</th>
                          <th className="p-2 text-right">Gross (₹)</th>
                          <th className="p-2 text-right text-rose-700">Refunds (₹)</th>
                          <th className="p-2 text-right font-black text-emerald-800">Net (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold">
                        {data?.by_mode?.map((m) => (
                          <tr key={m.mode} className="hover:bg-slate-50">
                            <td className="p-2 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="font-bold text-black">{m.mode}</span>
                            </td>
                            <td className="p-2 text-center font-mono">{m.payment_count}</td>
                            <td className="p-2 text-right font-mono">₹{m.gross_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono text-rose-700">₹{m.total_refunded.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono font-black text-emerald-800">₹{m.net_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Breakdown by Cashier Staff */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                    <span>Collections by Cashier</span>
                    <Badge variant="primary" size="xs">Staff Desk</Badge>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Cashier Staff</th>
                          <th className="p-2 text-center">Payments</th>
                          <th className="p-2 text-right">Gross (₹)</th>
                          <th className="p-2 text-right font-black text-emerald-800">Net (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold">
                        {data?.by_cashier?.map((c) => (
                          <tr key={c.cashier_name} className="hover:bg-slate-50">
                            <td className="p-2">
                              <p className="font-bold text-black">{c.cashier_name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{c.username}</p>
                            </td>
                            <td className="p-2 text-center font-mono">{c.payment_count}</td>
                            <td className="p-2 text-right font-mono">₹{c.gross_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right font-mono font-black text-emerald-800">₹{c.net_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider">
                    Receipt Ledger ({data?.transactions?.length || 0} Transactions)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">Click student name to view profile</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Receipt / Txn #</th>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Admission #</th>
                        <th className="p-2.5 text-right">Amount (₹)</th>
                        <th className="p-2.5 text-center">Mode</th>
                        <th className="p-2.5">Cashier Desk</th>
                        <th className="p-2.5">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {data?.transactions?.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {t.payment_date ? t.payment_date.slice(0, 10) : '-'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-[#714B67] whitespace-nowrap">
                            {t.payment_number}
                          </td>
                          <td className="p-2.5">
                            <span
                              onClick={() => navigate(`/students/${t.student_id}`)}
                              className="font-bold text-black hover:text-[#714B67] hover:underline cursor-pointer"
                            >
                              {t.student_name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">{t.student_code}</span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{t.admission_number}</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-800 whitespace-nowrap">
                            ₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant={t.payment_mode === 'CASH' ? 'success' : 'teal'} size="xs">
                              {t.payment_mode}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">{t.cashier_name}</td>
                          <td className="p-2.5 font-mono text-slate-500 text-[11px] truncate max-w-[120px]">
                            {t.transaction_reference || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.transactions?.length ?? 0)} of {data.total ?? data.transactions?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: DUES & AGEING REPORT (b) */}
          {/* ========================================================= */}
          {activeTab === 'dues-ageing' && (
            <div className="space-y-4">
              {/* Stat Cards with Ageing Buckets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard
                  title="Total Outstanding"
                  value={`₹${(data?.summary?.total_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.total_students || 0} Students with dues`}
                  icon={AlertTriangle}
                  color="rose"
                />
                <StatCard
                  title="0 - 30 Days Due"
                  value={`₹${(data?.summary?.buckets?.['0-30']?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.buckets?.['0-30']?.count || 0} Current cycle items`}
                  icon={Clock}
                  color="amber"
                />
                <StatCard
                  title="31 - 60 Days Due"
                  value={`₹${(data?.summary?.buckets?.['31-60']?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.buckets?.['31-60']?.count || 0} Past due 1 month`}
                  icon={Clock}
                  color="rose"
                />
                <StatCard
                  title="61 - 90 Days Due"
                  value={`₹${(data?.summary?.buckets?.['61-90']?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.buckets?.['61-90']?.count || 0} Past due 2 months`}
                  icon={AlertTriangle}
                  color="rose"
                />
                <StatCard
                  title="90+ Days Due"
                  value={`₹${(data?.summary?.buckets?.['90+']?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext={`${data?.summary?.buckets?.['90+']?.count || 0} High ageing balance`}
                  icon={AlertTriangle}
                  color="rose"
                />
              </div>

              {/* Dues Ageing Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider">
                    Student-wise Dues & Ageing Ledger ({data?.items?.length || 0} items)
                  </h3>
                  <Badge variant="danger" size="xs">Actionable Receivables</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Mobile</th>
                        <th className="p-2.5">Course Subject</th>
                        <th className="p-2.5 text-right">Fee Billed</th>
                        <th className="p-2.5 text-right text-emerald-700">Paid</th>
                        <th className="p-2.5 text-right font-black text-rose-700">Due Amount</th>
                        <th className="p-2.5 text-center">Overdue</th>
                        <th className="p-2.5 text-center">Ageing Bucket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {data?.items?.map((i) => (
                        <tr key={i.item_id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5">
                            <span
                              onClick={() => navigate(`/students/${i.student_id}`)}
                              className="font-bold text-black hover:text-[#714B67] hover:underline cursor-pointer"
                            >
                              {i.student_name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {i.student_code} · {i.admission_number}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-700">{i.mobile || '-'}</td>
                          <td className="p-2.5 font-bold text-black">{i.subject_name}</td>
                          <td className="p-2.5 text-right font-mono">₹{i.net_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-emerald-700 font-semibold">₹{i.amount_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-rose-700">₹{i.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-center font-mono font-bold text-slate-800">{i.age_days}d</td>
                          <td className="p-2.5 text-center">
                            <Badge
                              variant={
                                i.ageing_bucket === '0-30'
                                  ? 'warning'
                                  : i.ageing_bucket === '31-60'
                                  ? 'danger'
                                  : 'danger'
                              }
                              size="xs"
                            >
                              {i.ageing_bucket} days
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: SUBJECT-WISE BREAKUP (c) */}
          {/* ========================================================= */}
          {activeTab === 'subject-breakup' && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Total Fees Billed"
                  value={`₹${(data?.summary?.total_booked_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Sum of course fees booked"
                  icon={BookOpen}
                  color="purple"
                />
                <StatCard
                  title="Total Fee Collected"
                  value={`₹${(data?.summary?.total_collected_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Directly from allocation ledger"
                  icon={CheckCircle2}
                  color="emerald"
                />
                <StatCard
                  title="Total Outstanding Due"
                  value={`₹${(data?.summary?.total_balance_all || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Balance due from enrolled students"
                  icon={AlertTriangle}
                  color="rose"
                />
                <StatCard
                  title="Course Subjects"
                  value={`${data?.items?.length || 0}`}
                  subtext="Active academic disciplines"
                  icon={GraduationCap}
                  color="indigo"
                />
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Subject-wise Academic & Revenue Breakdown</span>
                  <Badge variant="primary" size="xs">Ledger Reconciled</Badge>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Subject</th>
                        <th className="p-2.5 text-center">Enrolled</th>
                        <th className="p-2.5 text-center">Active</th>
                        <th className="p-2.5 text-right">Fees Billed</th>
                        <th className="p-2.5 text-right font-black text-emerald-800">Collected</th>
                        <th className="p-2.5 text-right font-black text-rose-700">Due</th>
                        <th className="p-2.5 text-right text-amber-700">Waived</th>
                        <th className="p-2.5 text-right text-rose-600">Refunded</th>
                        <th className="p-2.5 text-right font-black text-indigo-900">Net Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {data?.items?.map((s, idx) => (
                        <tr
                          key={s.subject_id ? `sb-${s.subject_id}-${idx}` : `sb-${idx}`}
                          onClick={() => s.subject_id && navigate(`/subjects/${s.subject_id}`)}
                          className="hover:bg-purple-50/50 cursor-pointer transition"
                          title="Click to view subject history, breakup & conversion"
                        >
                          <td className="p-2.5">
                            <p className="font-bold text-black">{s.subject_name}</p>
                            <span className="text-[10px] text-slate-500 font-mono">{s.subject_code}</span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-black">{s.enrolled_count}</td>
                          <td className="p-2.5 text-center font-mono text-emerald-700">{s.active_enrollments || 0}</td>
                          <td className="p-2.5 text-right font-mono">₹{s.fees_billed?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || s.total_booked?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-800">₹{s.collected?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || s.total_collected?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-rose-700">₹{s.due?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || s.balance_due?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-amber-700">₹{(s.waived || s.total_waived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-rose-600">₹{(s.refunded || s.total_refunded || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-indigo-900">₹{(s.net_revenue || s.collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: TEACHER-WISE BREAKUP (d) */}
          {/* ========================================================= */}
          {activeTab === 'teacher-breakup' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Total Faculty"
                  value={`${data?.summary?.total_teachers ?? (Array.isArray(data) ? data.length : data?.total || data?.items?.length || 0)}`}
                  subtext="Teaching staff members"
                  icon={UserCheck}
                  color="indigo"
                />
                <StatCard
                  title="Total Collections"
                  value={`₹${(data?.summary?.total_collected ?? (
                    (Array.isArray(data) ? data : data?.items || []).reduce(
                      (acc, t) => acc + (t.collections || t.total_collected || 0),
                      0
                    )
                  )).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Derived from allocation ledger"
                  icon={CheckCircle2}
                  color="emerald"
                />
                <StatCard
                  title="Total Fees Billed"
                  value={`₹${(data?.summary?.total_billed ?? (
                    (Array.isArray(data) ? data : data?.items || []).reduce(
                      (acc, t) => acc + (t.fees_billed || t.total_booked || 0),
                      0
                    )
                  )).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Gross tuition fee booked"
                  icon={BookOpen}
                  color="purple"
                />
                <StatCard
                  title="Total Dues"
                  value={`₹${(data?.summary?.total_due ?? (
                    (Array.isArray(data) ? data : data?.items || []).reduce(
                      (acc, t) => acc + (t.due || t.balance_due || 0),
                      0
                    )
                  )).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Outstanding student balances"
                  icon={AlertTriangle}
                  color="rose"
                />
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Teacher-wise Subject & Collection Performance</span>
                  <Badge variant="teal" size="xs">Faculty Matrix</Badge>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Faculty Member</th>
                        <th className="p-2.5">Specialization</th>
                        <th className="p-2.5">Subjects Taught</th>
                        <th className="p-2.5 text-center">Enrolled</th>
                        <th className="p-2.5 text-right">Billed (₹)</th>
                        <th className="p-2.5 text-right font-black text-emerald-800">Collections (₹)</th>
                        <th className="p-2.5 text-right text-rose-700">Dues (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {(Array.isArray(data) ? data : data?.items || []).map((t) => (
                        <tr key={t.teacher_id} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <span
                              onClick={() => navigate(`/teachers/${t.teacher_id}`)}
                              className="font-bold text-black hover:text-[#714B67] hover:underline cursor-pointer"
                            >
                              {t.teacher_name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">{t.teacher_code}</span>
                          </td>
                          <td className="p-2.5 text-slate-700">{t.specialization || 'General Faculty'}</td>
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {t.subjects?.length > 0 ? (
                                t.subjects.map((sub, idx) => (
                                  <span key={idx} className="bg-slate-100 text-black px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    {sub}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 text-[10px]">Direct Subject</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-black">{t.enrolled_count}</td>
                          <td className="p-2.5 text-right font-mono">₹{(t.fees_billed || t.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-800">₹{(t.collections || t.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-700">₹{(t.due || t.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: ADMISSIONS & CONVERSION REPORT (e) */}
          {/* ========================================================= */}
          {activeTab === 'admissions-conversion' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Enquiries Received"
                  value={`${data?.summary?.total_enquiries || 0}`}
                  subtext="Prospective student inquiries"
                  icon={LifeBuoy}
                  color="amber"
                />
                <StatCard
                  title="Admissions Converted"
                  value={`${data?.summary?.total_converted || 0}`}
                  subtext="Enrolled into coaching subjects"
                  icon={GraduationCap}
                  color="emerald"
                />
                <StatCard
                  title="Conversion Rate"
                  value={`${data?.summary?.overall_conversion_rate || 0}%`}
                  subtext="Lead-to-admission ratio"
                  icon={TrendingUp}
                  color="indigo"
                />
                <StatCard
                  title="Lead Channels"
                  value={`${data?.by_source?.length || 0}`}
                  subtext="Active acquisition sources"
                  icon={Users}
                  color="purple"
                />
              </div>

              {/* Breakdowns: By Source & By Subject */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By Source Table */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                    <span>Conversion by Acquisition Source</span>
                    <Badge variant="primary" size="xs">Channel ROI</Badge>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Lead Source</th>
                          <th className="p-2 text-center">Enquiries</th>
                          <th className="p-2 text-center">Converted</th>
                          <th className="p-2 text-right">Conversion Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold">
                        {data?.by_source?.map((src) => (
                          <tr key={src.source_name} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-black">{src.source_name}</td>
                            <td className="p-2 text-center font-mono">{src.enquiries_count}</td>
                            <td className="p-2 text-center font-mono text-emerald-700">{src.converted_count}</td>
                            <td className="p-2 text-right font-mono font-black text-indigo-900">
                              {src.conversion_rate_pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* By Subject Table */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                    <span>Conversion by Course Subject</span>
                    <Badge variant="teal" size="xs">Subject Demand</Badge>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Subject</th>
                          <th className="p-2 text-center">Enquiries</th>
                          <th className="p-2 text-center">Converted</th>
                          <th className="p-2 text-right">Conversion Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold">
                        {data?.by_subject?.map((sub) => (
                          <tr key={sub.subject_name} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-black">{sub.subject_name}</td>
                            <td className="p-2 text-center font-mono">{sub.enquiries_count}</td>
                            <td className="p-2 text-center font-mono text-emerald-700">{sub.converted_count}</td>
                            <td className="p-2 text-right font-mono font-black text-indigo-900">
                              {sub.conversion_rate_pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Detailed Enquiries Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider">
                    Inquiries Register ({data?.items?.length || 0} Records)
                  </h3>
                  <span className="text-[11px] text-slate-500">Recent enquiries and admission conversion status</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Enquiry Code</th>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Mobile</th>
                        <th className="p-2.5">Interested Subject</th>
                        <th className="p-2.5">Lead Source</th>
                        <th className="p-2.5 text-center">Status</th>
                        <th className="p-2.5">Converted Admission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {data?.items?.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {e.created_at ? e.created_at.slice(0, 10) : '-'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-[#714B67] whitespace-nowrap">{e.enquiry_code}</td>
                          <td className="p-2.5 font-bold text-black">{e.student_name}</td>
                          <td className="p-2.5 font-mono text-slate-700">{e.mobile || '-'}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{e.interested_subject}</td>
                          <td className="p-2.5 text-slate-700">{e.source}</td>
                          <td className="p-2.5 text-center">
                            <Badge variant={e.is_converted ? 'success' : 'amber'} size="xs">
                              {e.status}
                            </Badge>
                          </td>
                          <td className="p-2.5">
                            {e.is_converted ? (
                              <span className="font-mono text-emerald-800 font-bold">
                                {e.admission_number || e.converted_student_code || 'Enrolled'}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: WAIVERS REPORT (g) */}
          {/* ========================================================= */}
          {activeTab === 'waivers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  title="Total Waived Dues"
                  value={`₹${(Number(data?.summary?.total_waived_amount ?? data?.summary?.total_amount) || (dedupedWaivers.reduce((sum, w) => sum + (Number(w.waived_amount ?? w.amount) || 0), 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Authorized fee dues forgiven"
                  icon={FileCheck2}
                  color="amber"
                />
                <StatCard
                  title="Waiver Vouchers"
                  value={`${data?.summary?.waivers_count ?? data?.summary?.count ?? dedupedWaivers.length}`}
                  subtext="Official financial transactions"
                  icon={Receipt}
                  color="purple"
                />
                <StatCard
                  title="Students Benefited"
                  value={`${data?.summary?.unique_students_count ?? (new Set(dedupedWaivers.map(w => w.student_id).filter(Boolean)).size)}`}
                  subtext="Unique student accounts"
                  icon={Users}
                  color="teal"
                />
              </div>

              {/* Waivers Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <h3 className="text-xs font-black text-black uppercase tracking-wider">
                    Authorised Dues Waivers & Audit Trail ({dedupedWaivers.length} Records)
                  </h3>
                  <Badge variant="warning" size="xs">Admin Authorization Audit</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Waiver Voucher #</th>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Admission #</th>
                        <th className="p-2.5 text-right font-black text-amber-800">Waived Amount</th>
                        <th className="p-2.5">Authorizing Admin</th>
                        <th className="p-2.5">Reason / Justification</th>
                        <th className="p-2.5">Audit Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {dedupedWaivers.map((w, idx) => (
                        <tr key={w.id ? `${w.id}-${idx}` : `waiver-${w.waiver_number || idx}-${idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {w.date ? w.date.slice(0, 10) : '—'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-[#714B67] whitespace-nowrap">{w.waiver_number || '—'}</td>
                          <td className="p-2.5">
                            <span
                              onClick={() => w.student_id && navigate(`/students/${w.student_id}`)}
                              className="font-bold text-black hover:text-[#714B67] hover:underline cursor-pointer"
                            >
                              {w.student_name || '—'}
                            </span>
                            {w.student_code && (
                              <span className="block text-[10px] text-slate-500 font-mono">{w.student_code}</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{w.admission_number || '—'}</td>
                          <td className="p-2.5 text-right font-mono font-black text-amber-800 whitespace-nowrap">
                            ₹{(Number(w.waived_amount ?? w.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5">
                            <span className="font-bold text-black">{w.admin_name || 'System Administrator'}</span>
                            <span className="block text-[10px] text-purple-700 font-semibold">{w.admin_role || 'ADMIN'}</span>
                          </td>
                          <td className="p-2.5 text-slate-800 max-w-[260px] truncate" title={w.reason || ''}>
                            {w.reason || '—'}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">{w.audit_reference || w.waiver_number || '—'}</td>
                        </tr>
                      ))}
                      {dedupedWaivers.length === 0 && !loading && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500">
                            No waiver records found matching the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? dedupedWaivers.length) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data?.total ?? dedupedWaivers.length)} of {data?.total ?? dedupedWaivers.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data?.total_pages ?? Math.max(1, Math.ceil((data?.total || dedupedWaivers.length) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data?.total_pages ?? Math.max(1, Math.ceil((data?.total || dedupedWaivers.length) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: REFUNDS REPORT (h) */}
          {/* ========================================================= */}
          {activeTab === 'refunds' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Net Refunds Disbursed"
                  value={`₹${(data?.summary?.total_refunded_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Returned student fees"
                  icon={RotateCcw}
                  color="rose"
                />
                <StatCard
                  title="Gross Requested"
                  value={`₹${(data?.summary?.gross_requested_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Original fee refundable"
                  icon={ArrowDownRight}
                  color="amber"
                />
                <StatCard
                  title="Deductions Retained"
                  value={`₹${(data?.summary?.total_deductions_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Cancellation / processing fees"
                  icon={CheckCircle2}
                  color="emerald"
                />
                <StatCard
                  title="Total Refunds"
                  value={`${data?.summary?.total_refunds_count || 0}`}
                  subtext="Disbursement vouchers issued"
                  icon={Receipt}
                  color="purple"
                />
              </div>

              {/* Refunds Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Student Fee Refunds Register ({data?.items?.length || 0} Records)</span>
                  <Badge variant="danger" size="xs">Disbursement Vouchers</Badge>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Refund #</th>
                        <th className="p-2.5">Student</th>
                        <th className="p-2.5">Admission #</th>
                        <th className="p-2.5 text-right">Gross Req</th>
                        <th className="p-2.5 text-right text-amber-700">Deductions</th>
                        <th className="p-2.5 text-right font-black text-rose-700">Net Paid</th>
                        <th className="p-2.5 text-center">Mode</th>
                        <th className="p-2.5">Processed By</th>
                        <th className="p-2.5">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {data?.items?.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {r.refund_date ? r.refund_date.slice(0, 10) : '-'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-[#714B67] whitespace-nowrap">{r.refund_number}</td>
                          <td className="p-2.5">
                            <span
                              onClick={() => navigate(`/students/${r.student_id}`)}
                              className="font-bold text-black hover:text-[#714B67] hover:underline cursor-pointer"
                            >
                              {r.student_name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">{r.student_code}</span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{r.admission_number}</td>
                          <td className="p-2.5 text-right font-mono">₹{r.refund_amount_requested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-amber-700">₹{r.deduction_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-rose-700 whitespace-nowrap">₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-center">
                            <Badge variant="danger" size="xs">{r.refund_mode}</Badge>
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">{r.processor_name}</td>
                          <td className="p-2.5 text-slate-800 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 9: EXPENSES REPORT (i) */}
          {/* ========================================================= */}
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Total Expenditures"
                  value={`₹${(data?.summary?.total_expenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Operational expenses + salaries"
                  icon={ArrowDownRight}
                  color="rose"
                />
                <StatCard
                  title="Operational Expenses"
                  value={`₹${(data?.summary?.total_operational_expenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Rent, utilities, printing, maintenance"
                  icon={Building}
                  color="blue"
                />
                <StatCard
                  title="Salaries Disbursed"
                  value={`₹${(data?.summary?.total_salaries_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Paid faculty and staff payroll"
                  icon={UserCheck}
                  color="indigo"
                />
                <StatCard
                  title="Expense Entries"
                  value={`${data?.summary?.expense_count || 0}`}
                  subtext="Vouchers and payout records"
                  icon={Receipt}
                  color="teal"
                />
              </div>

              {/* Category Breakdown Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>Expenses by Category</span>
                  <Badge variant="primary" size="xs">Operating Ledger</Badge>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {data?.by_category?.map((c) => (
                    <div key={c.category_name} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-xs font-bold text-black truncate">{c.category_name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] text-slate-500 font-mono">{c.count} records</span>
                        <span className="text-sm font-black font-mono text-rose-800">
                          ₹{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Items Table */}
                <h4 className="text-xs font-black text-black uppercase tracking-wider mb-2 pt-2 border-t border-slate-100">
                  Detailed Expense Ledger ({data?.items?.length || 0} Entries)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Expense Title / Description</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5 text-right font-black text-rose-800">Amount (₹)</th>
                        <th className="p-2.5 text-center">Mode</th>
                        <th className="p-2.5">Reference</th>
                        <th className="p-2.5">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {data?.items?.map((i) => (
                        <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">{i.date}</td>
                          <td className="p-2.5">
                            <Badge variant={i.type === 'SALARY' ? 'primary' : 'teal'} size="xs">{i.type}</Badge>
                          </td>
                          <td className="p-2.5 font-bold text-black">{i.title}</td>
                          <td className="p-2.5 text-slate-700">{i.category_name}</td>
                          <td className="p-2.5 text-right font-mono font-black text-rose-800 whitespace-nowrap">
                            ₹{i.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant="neutral" size="xs">{i.payment_mode}</Badge>
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 text-[11px]">{i.reference || '-'}</td>
                          <td className="p-2.5 text-slate-800 font-semibold">{i.added_by_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 10: SUMMARY DASHBOARD (j) */}
          {/* ========================================================= */}
          {activeTab === 'summary-dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard
                  title="Fees Billed"
                  value={`₹${(data?.summary?.total_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Gross course fees booked"
                  icon={BookOpen}
                  color="purple"
                />
                <StatCard
                  title="Fee Collected"
                  value={`₹${(data?.summary?.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Actual fee inflows"
                  icon={ArrowUpRight}
                  color="emerald"
                />
                <StatCard
                  title="Outstanding Due"
                  value={`₹${(data?.summary?.total_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Unpaid student balances"
                  icon={AlertTriangle}
                  color="rose"
                />
                <StatCard
                  title="Total Outflows"
                  value={`₹${((data?.summary?.total_expenses || 0) + (data?.summary?.total_refunds || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Expenses, salaries & refunds"
                  icon={ArrowDownRight}
                  color="amber"
                />
                <StatCard
                  title="Net Operating Cash"
                  value={`₹${(data?.summary?.net_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  subtext="Collected minus outflows"
                  icon={TrendingUp}
                  color={data?.summary?.net_cash >= 0 ? 'emerald' : 'rose'}
                />
              </div>

              {/* Chart: Billed, Collected, Expenses, Net Cash */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span>{summaryPeriod === 'daily' ? 'Daily' : 'Monthly'} Financial Summary Trend</span>
                  <Badge variant="primary" size="xs">Cash Velocity</Badge>
                </h3>
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.intervals || []} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 10, fill: '#000000' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={(val) => `₹${val}`} />
                      <Tooltip
                        formatter={(val) => [`₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '']}
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="billed" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Billed (₹)" />
                      <Bar dataKey="collected" fill="#059669" radius={[3, 3, 0, 0]} name="Collected (₹)" />
                      <Bar dataKey="expenses" fill="#e11d48" radius={[3, 3, 0, 0]} name="Expenses (₹)" />
                      <Bar dataKey="net_cash" fill="#0284c7" radius={[3, 3, 0, 0]} name="Net Cash (₹)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Intervals Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <h3 className="text-xs font-black text-black uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                  {summaryPeriod === 'daily' ? 'Daily' : 'Monthly'} Breakdown Ledger
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Period Interval</th>
                        <th className="p-2.5 text-right font-bold text-purple-900">Fees Billed</th>
                        <th className="p-2.5 text-right font-black text-emerald-800">Collected</th>
                        <th className="p-2.5 text-right font-bold text-rose-700">Due</th>
                        <th className="p-2.5 text-right text-rose-800">Expenses & Salaries</th>
                        <th className="p-2.5 text-right text-amber-700">Refunds</th>
                        <th className="p-2.5 text-right font-black text-indigo-950">Net Cash Position</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {data?.intervals?.map((row) => (
                        <tr key={row.period_key} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-black">{row.period_label}</td>
                          <td className="p-2.5 text-right font-mono text-purple-900">₹{row.billed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-800">₹{row.collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-rose-700">₹{row.due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-rose-800">₹{row.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-amber-700">₹{row.refunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className={`p-2.5 text-right font-mono font-black ${row.net_cash >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                            ₹{row.net_cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {((data?.total ?? 0) > PAGE_SIZE || (data?.total_pages ?? 1) > 1 || tablePage > 1) && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Showing {(tablePage - 1) * PAGE_SIZE + 1} to {Math.min(tablePage * PAGE_SIZE, data.total ?? data.items?.length ?? 0)} of {data.total ?? data.items?.length ?? 0}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {tablePage} / {data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => setTablePage((p) => p + 1)}
                        disabled={tablePage >= (data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))}
                        className="px-2 py-1 rounded border border-slate-200 disabled:opacity-50 font-bold"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. FORMAL PRINT VIEW (Visible exclusively during window.print) */}
      {/* ========================================================= */}
      <div id="printable-report" className="hidden print:block text-black bg-white">
        {/* Printable Header */}
        <div className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {institute?.logo_url && (
                <div className="w-14 h-14 border border-black rounded bg-white p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                  <InstituteLogo
                    src={institute.logo_url}
                    alt={instituteName}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight text-black">
                  {instituteName}
                </h1>
                <p className="text-xs font-bold text-black">
                  {institute?.address || 'Civil Lines Road, Thakurdwara, UP'}
                </p>
                <p className="text-[10px] text-slate-700">
                  GSTIN / Reg: {institute?.gstin || '09AAACT1234F1Z5'} · Contact: {institute?.phone || '+91 98765 43210'} · {institute?.email || 'accounts@thakurdwara.edu.in'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block border border-black px-2 py-0.5 text-xs font-black uppercase">
                OFFICIAL REPORT
              </span>
              <p className="text-[10px] text-black mt-1 font-mono">
                Generated: {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
              <p className="text-[10px] text-black font-semibold">
                By Staff: {user?.full_name || 'Admin'}
              </p>
            </div>
          </div>
        </div>

        {/* Report Identification */}
        <div className="mb-4 bg-slate-100 border border-black p-2 flex items-center justify-between text-xs font-bold">
          <div>
            <span className="uppercase tracking-wider">Report: </span>
            <span className="text-base font-black underline">{currentTabInfo.label} Report</span>
            <span className="text-[11px] ml-2 font-normal">({currentTabInfo.sublabel})</span>
          </div>
          <div className="text-right">
            <span>Period: </span>
            <span>
              {fromDate || 'Earliest'} to {toDate || 'Present'}
            </span>
          </div>
        </div>

        {/* Printable Summary KPIs */}
        {data?.summary && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {Object.entries(data.summary)
              .filter(([k, v]) => typeof v === 'number' && k !== 'total_records' && k !== 'filtered_transactions_count')
              .slice(0, 4)
              .map(([key, val]) => (
                <div key={key} className="border border-black p-2 text-center bg-white">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-black">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm font-black font-mono text-black mt-0.5">
                    {key.includes('count') || key.includes('students') || key.includes('rate') || key.includes('enquiries')
                      ? key.includes('rate')
                        ? `${val}%`
                        : val
                      : `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* Printable Data Table */}
        <div className="mb-6">
          <table className="w-full text-left text-xs border border-black">
            <thead className="bg-slate-200 border-b border-black font-black text-black">
              {activeTab === 'collections' && (
                <tr>
                  <th className="p-1.5 border border-black">Date</th>
                  <th className="p-1.5 border border-black">Receipt #</th>
                  <th className="p-1.5 border border-black">Student Name</th>
                  <th className="p-1.5 border border-black">Adm #</th>
                  <th className="p-1.5 border border-black text-right">Amount (₹)</th>
                  <th className="p-1.5 border border-black">Mode</th>
                  <th className="p-1.5 border border-black">Cashier</th>
                </tr>
              )}
              {activeTab === 'dues-ageing' && (
                <tr>
                  <th className="p-1.5 border border-black">Student</th>
                  <th className="p-1.5 border border-black">Mobile</th>
                  <th className="p-1.5 border border-black">Subject</th>
                  <th className="p-1.5 border border-black text-right">Billed (₹)</th>
                  <th className="p-1.5 border border-black text-right">Paid (₹)</th>
                  <th className="p-1.5 border border-black text-right">Due (₹)</th>
                  <th className="p-1.5 border border-black text-center">Overdue</th>
                  <th className="p-1.5 border border-black text-center">Bucket</th>
                </tr>
              )}
              {activeTab === 'subject-breakup' && (
                <tr>
                  <th className="p-1.5 border border-black">Subject</th>
                  <th className="p-1.5 border border-black text-center">Enrolled</th>
                  <th className="p-1.5 border border-black text-right">Billed (₹)</th>
                  <th className="p-1.5 border border-black text-right">Collected (₹)</th>
                  <th className="p-1.5 border border-black text-right">Due (₹)</th>
                  <th className="p-1.5 border border-black text-right">Waived (₹)</th>
                  <th className="p-1.5 border border-black text-right">Refunded (₹)</th>
                  <th className="p-1.5 border border-black text-right">Net Revenue (₹)</th>
                </tr>
              )}
              {activeTab === 'teacher-breakup' && (
                <tr>
                  <th className="p-1.5 border border-black">Teacher Name</th>
                  <th className="p-1.5 border border-black">Specialization</th>
                  <th className="p-1.5 border border-black text-center">Students</th>
                  <th className="p-1.5 border border-black text-right">Billed (₹)</th>
                  <th className="p-1.5 border border-black text-right">Collections (₹)</th>
                  <th className="p-1.5 border border-black text-right">Dues (₹)</th>
                </tr>
              )}
              {activeTab === 'admissions-conversion' && (
                <tr>
                  <th className="p-1.5 border border-black">Date</th>
                  <th className="p-1.5 border border-black">Enquiry #</th>
                  <th className="p-1.5 border border-black">Student Name</th>
                  <th className="p-1.5 border border-black">Subject</th>
                  <th className="p-1.5 border border-black">Lead Source</th>
                  <th className="p-1.5 border border-black text-center">Status</th>
                  <th className="p-1.5 border border-black">Admission #</th>
                </tr>
              )}
              {activeTab === 'waivers' && (
                <tr>
                  <th className="p-1.5 border border-black">Date</th>
                  <th className="p-1.5 border border-black">Waiver Voucher #</th>
                  <th className="p-1.5 border border-black">Student Name</th>
                  <th className="p-1.5 border border-black">Admission #</th>
                  <th className="p-1.5 border border-black text-right">Waived (₹)</th>
                  <th className="p-1.5 border border-black">Admin Approval</th>
                  <th className="p-1.5 border border-black">Reason</th>
                </tr>
              )}
              {activeTab === 'refunds' && (
                <tr>
                  <th className="p-1.5 border border-black">Date</th>
                  <th className="p-1.5 border border-black">Refund Voucher #</th>
                  <th className="p-1.5 border border-black">Student Name</th>
                  <th className="p-1.5 border border-black">Admission #</th>
                  <th className="p-1.5 border border-black text-right">Gross (₹)</th>
                  <th className="p-1.5 border border-black text-right">Deductions (₹)</th>
                  <th className="p-1.5 border border-black text-right">Net Paid (₹)</th>
                  <th className="p-1.5 border border-black">Mode</th>
                </tr>
              )}
              {activeTab === 'expenses' && (
                <tr>
                  <th className="p-1.5 border border-black">Date</th>
                  <th className="p-1.5 border border-black">Type</th>
                  <th className="p-1.5 border border-black">Expense Title</th>
                  <th className="p-1.5 border border-black">Category</th>
                  <th className="p-1.5 border border-black text-right">Amount (₹)</th>
                  <th className="p-1.5 border border-black">Mode</th>
                  <th className="p-1.5 border border-black">Added By</th>
                </tr>
              )}
              {activeTab === 'summary-dashboard' && (
                <tr>
                  <th className="p-1.5 border border-black">Period Interval</th>
                  <th className="p-1.5 border border-black text-right">Billed (₹)</th>
                  <th className="p-1.5 border border-black text-right">Collected (₹)</th>
                  <th className="p-1.5 border border-black text-right">Due (₹)</th>
                  <th className="p-1.5 border border-black text-right">Expenses (₹)</th>
                  <th className="p-1.5 border border-black text-right">Refunds (₹)</th>
                  <th className="p-1.5 border border-black text-right">Net Cash (₹)</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-black font-semibold text-[11px]">
              {/* Dynamic printable rows matching the active tab */}
              {activeTab === 'collections' &&
                data?.transactions?.slice(0, 50).map((t) => (
                  <tr key={t.id}>
                    <td className="p-1 border border-black font-mono">{t.payment_date?.slice(0, 10)}</td>
                    <td className="p-1 border border-black font-mono font-bold">{t.payment_number}</td>
                    <td className="p-1 border border-black">{t.student_name}</td>
                    <td className="p-1 border border-black font-mono">{t.admission_number}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black">{t.payment_mode}</td>
                    <td className="p-1 border border-black">{t.cashier_name}</td>
                  </tr>
                ))}
              {activeTab === 'dues-ageing' &&
                data?.items?.slice(0, 50).map((i) => (
                  <tr key={i.item_id}>
                    <td className="p-1 border border-black font-bold">{i.student_name} ({i.student_code})</td>
                    <td className="p-1 border border-black font-mono">{i.mobile || '-'}</td>
                    <td className="p-1 border border-black">{i.subject_name}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{i.net_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{i.amount_collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{i.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-center font-mono">{i.age_days}d</td>
                    <td className="p-1 border border-black text-center font-bold">{i.ageing_bucket}</td>
                  </tr>
                ))}
              {activeTab === 'subject-breakup' &&
                data?.items?.map((s, idx) => (
                  <tr key={s.subject_id ? `print-subj-${s.subject_id}-${idx}` : `print-subj-${idx}`}>
                    <td className="p-1 border border-black font-bold">{s.subject_name}</td>
                    <td className="p-1 border border-black text-center font-mono">{s.enrolled_count}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(s.fees_billed || s.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{(s.collected || s.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(s.due || s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(s.waived || s.total_waived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(s.refunded || s.total_refunded || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{(s.net_revenue || s.collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              {activeTab === 'teacher-breakup' &&
                (Array.isArray(data) ? data : data?.items || []).map((t, idx) => (
                  <tr key={t.teacher_id ? `print-tea-${t.teacher_id}-${idx}` : `print-tea-${idx}`}>
                    <td className="p-1 border border-black font-bold">{t.teacher_name}</td>
                    <td className="p-1 border border-black">{t.specialization}</td>
                    <td className="p-1 border border-black text-center font-mono">{t.enrolled_count}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(t.fees_billed || t.total_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{(t.collections || t.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{(t.due || t.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              {activeTab === 'admissions-conversion' &&
                data?.items?.slice(0, 50).map((e, idx) => (
                  <tr key={e.id ? `print-adm-${e.id}-${idx}` : `print-adm-${idx}`}>
                    <td className="p-1 border border-black font-mono">{e.created_at?.slice(0, 10)}</td>
                    <td className="p-1 border border-black font-mono font-bold">{e.enquiry_code}</td>
                    <td className="p-1 border border-black">{e.student_name}</td>
                    <td className="p-1 border border-black">{e.interested_subject}</td>
                    <td className="p-1 border border-black">{e.source}</td>
                    <td className="p-1 border border-black text-center font-bold">{e.status}</td>
                    <td className="p-1 border border-black font-mono">{e.admission_number || e.converted_student_code || '-'}</td>
                  </tr>
                ))}
              {activeTab === 'waivers' &&
                dedupedWaivers?.slice(0, 50).map((w, idx) => (
                  <tr key={w.id ? `print-w-${w.id}-${idx}` : `print-waiver-${w.waiver_number || idx}-${idx}`}>
                    <td className="p-1 border border-black font-mono">{w.date ? w.date.slice(0, 10) : '—'}</td>
                    <td className="p-1 border border-black font-mono font-bold">{w.waiver_number || '—'}</td>
                    <td className="p-1 border border-black">{w.student_name || '—'} {w.student_code ? `(${w.student_code})` : ''}</td>
                    <td className="p-1 border border-black font-mono">{w.admission_number || '—'}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">
                      ₹{(Number(w.waived_amount ?? w.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-1 border border-black">{w.admin_name || 'System Administrator'}</td>
                    <td className="p-1 border border-black">{w.reason || '—'}</td>
                  </tr>
                ))}
              {activeTab === 'refunds' &&
                data?.items?.slice(0, 50).map((r, idx) => (
                  <tr key={r.id ? `print-ref-${r.id}-${idx}` : `print-ref-${idx}`}>
                    <td className="p-1 border border-black font-mono">{r.refund_date?.slice(0, 10)}</td>
                    <td className="p-1 border border-black font-mono font-bold">{r.refund_number}</td>
                    <td className="p-1 border border-black">{r.student_name} ({r.student_code})</td>
                    <td className="p-1 border border-black font-mono">{r.admission_number}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{r.refund_amount_requested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{r.deduction_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black">{r.refund_mode}</td>
                  </tr>
                ))}
              {activeTab === 'expenses' &&
                data?.items?.slice(0, 50).map((i, idx) => (
                  <tr key={i.id ? `print-exp-${i.id}-${idx}` : `print-exp-${idx}`}>
                    <td className="p-1 border border-black font-mono">{i.date}</td>
                    <td className="p-1 border border-black font-bold">{i.type}</td>
                    <td className="p-1 border border-black">{i.title}</td>
                    <td className="p-1 border border-black">{i.category_name}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{i.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black">{i.payment_mode}</td>
                    <td className="p-1 border border-black">{i.added_by_name}</td>
                  </tr>
                ))}
              {activeTab === 'summary-dashboard' &&
                data?.intervals?.map((row, idx) => (
                  <tr key={row.period_key ? `print-period-${row.period_key}-${idx}` : `print-period-${idx}`}>
                    <td className="p-1 border border-black font-bold">{row.period_label}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{row.billed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{row.collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{row.due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{row.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono">₹{row.refunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="p-1 border border-black text-right font-mono font-black">₹{row.net_cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Printable Footer / Signatures */}
        <div className="pt-8 border-t border-black flex items-center justify-between text-xs font-bold">
          <div>
            <p>Prepared by: {user?.full_name || 'Staff Administrator'}</p>
            <p className="text-[10px] text-slate-600">{instituteName} • ERP System Verified</p>
          </div>
          <div className="text-center">
            <p className="w-36 border-b border-black mb-1 mx-auto" />
            <p>Auditor / Finance Manager</p>
          </div>
          <div className="text-right">
            <p className="w-44 border-b border-black mb-1 ml-auto" />
            <p>Director / Principal Signature & Seal</p>
          </div>
        </div>
      </div>
    </div>
  );
}
