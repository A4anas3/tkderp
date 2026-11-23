import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  GraduationCap,
  Phone,
  Mail,
  Calendar,
  Award,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
  Edit2,
  BookOpen,
  Users,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  X,
  Camera,
  AlertTriangle,
  PieChart,
  History,
  CreditCard,
  TrendingUp,
  Layers,
  Wallet,
  Clock,
  ArrowRight,
  FileText,
  CalendarCheck,
} from 'lucide-react';
import TeacherAttendanceCalendar from '../../components/teachers/TeacherAttendanceCalendar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Avatar from '../../components/common/Avatar';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import { teacherApi, expenseApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { compressImage } from '../../utils/imageCompressor';

const ROSTER_PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 10;

export default function TeacherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  // 1. Core Profile State
  const [teacher, setTeacher] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // 2. Active Tab State ('HISTORY' | 'BREAKUP' | 'COLLECTIONS')
  const [activeTab, setActiveTab] = useState('HISTORY');

  // 3. Database Breakup State (Part c)
  const [breakup, setBreakup] = useState(null);
  const [breakupLoading, setBreakupLoading] = useState(false);

  // 4. Chronological History State (Part b)
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyMetrics, setHistoryMetrics] = useState({
    total_events: 0,
    admissions_count: 0,
    renewals_count: 0,
    expiries_count: 0,
    changes_count: 0,
    cancellations_count: 0,
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL' | 'ADMISSION' | 'RENEWAL' | 'EXPIRY' | 'CHANGE' | 'CANCELLATION'
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  // 5. Collections Handled State (Part d)
  const [collections, setCollections] = useState({
    total_collected: 0,
    collections_count: 0,
    by_mode: {},
    items: [],
  });
  const [collectionsLoading, setCollectionsLoading] = useState(false);

  // 6. Roster State (from database roster endpoint)
  const [rosterItems, setRosterItems] = useState([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterTotalPages, setRosterTotalPages] = useState(1);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterMetrics, setRosterMetrics] = useState({
    total_enrollments: 0,
    active_enrollments: 0,
    inactive_enrollments: 0,
    cancelled_enrollments: 0,
    unique_students_count: 0,
  });
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  // 7. Monthly Salary History State (Requirement 5)
  const [salaries, setSalaries] = useState([]);
  const [salariesLoading, setSalariesLoading] = useState(false);

  // 8. Modals State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payAdmissionId, setPayAdmissionId] = useState(null);
  const [paymentReceiptToShow, setPaymentReceiptToShow] = useState(null);

  // Photo Upload State
  const [compressing, setCompressing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(null);

  // Mobile Uniqueness Check State
  const [existingTeacherWithMobile, setExistingTeacherWithMobile] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    qualification: '',
    specialization: '',
    joining_date: '',
    status: 'ACTIVE',
  });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load core teacher profile
  const loadProfile = useCallback(async () => {
    if (!id) return;
    setProfileLoading(true);
    try {
      const tData = await teacherApi.get(id);
      setTeacher(tData);
      setPhotoPreview(tData.photo_url || null);
      setFormData({
        name: tData.name || '',
        mobile: tData.mobile || '',
        email: tData.email || '',
        qualification: tData.qualification || '',
        specialization: tData.specialization || '',
        joining_date: tData.joining_date || '',
        status: tData.status || 'ACTIVE',
      });
    } catch (err) {
      error(err.message || 'Failed to load faculty profile');
    } finally {
      setProfileLoading(false);
    }
  }, [id, error]);

  // Load teacher breakup (Part c)
  const loadBreakup = useCallback(async () => {
    if (!id) return;
    setBreakupLoading(true);
    try {
      const data = await teacherApi.getBreakup(id);
      setBreakup(data);
    } catch (err) {
      console.error('Failed to load teacher breakup:', err);
    } finally {
      setBreakupLoading(false);
    }
  }, [id]);

  // Load chronological history (Part b)
  const loadHistory = useCallback(async () => {
    if (!id) return;
    setHistoryLoading(true);
    try {
      const data = await teacherApi.getHistory(id, {
        event_type: historyFilter !== 'ALL' ? historyFilter : undefined,
        search: historySearch.trim() || undefined,
        page: historyPage,
        page_size: HISTORY_PAGE_SIZE,
      });
      setHistoryEvents(data.events || []);
      setHistoryTotal(typeof data.total === 'number' ? data.total : (data.events?.length || 0));
      setHistoryTotalPages(typeof data.total_pages === 'number' ? data.total_pages : 1);
      setHistoryMetrics({
        total_events: data.total_events || 0,
        admissions_count: data.admissions_count || 0,
        renewals_count: data.renewals_count || 0,
        expiries_count: data.expiries_count || 0,
        changes_count: data.changes_count || 0,
        cancellations_count: data.cancellations_count || 0,
      });
    } catch (err) {
      console.error('Failed to load teacher history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [id, historyFilter, historySearch, historyPage]);

  // Load collections handled by teacher (Part d)
  const loadCollections = useCallback(async () => {
    if (!id) return;
    setCollectionsLoading(true);
    try {
      const data = await teacherApi.getCollections(id);
      setCollections(data);
    } catch (err) {
      console.error('Failed to load teacher collections:', err);
    } finally {
      setCollectionsLoading(false);
    }
  }, [id]);

  // Load course enrollments roster
  const loadRoster = useCallback(async () => {
    if (!id) return;
    setRosterLoading(true);
    try {
      const res = await teacherApi.getRoster(id, {
        page: rosterPage,
        page_size: ROSTER_PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        status_filter: statusFilter === 'ALL' ? undefined : statusFilter,
        subject_id: subjectFilter || undefined,
      });
      setRosterItems(res.items || []);
      setRosterTotal(res.total || 0);
      setRosterTotalPages(res.total_pages || 1);
      if (res.metrics) setRosterMetrics(res.metrics);
      if (res.subjects && res.subjects.length > 0) setSubjectOptions(res.subjects);
    } catch (err) {
      console.error('Failed to load faculty roster:', err);
    } finally {
      setRosterLoading(false);
    }
  }, [id, rosterPage, debouncedSearch, statusFilter, subjectFilter]);

  // Load monthly salary history (Requirement 5)
  const loadSalaries = useCallback(async () => {
    if (!id) return;
    setSalariesLoading(true);
    try {
      let data = [];
      try {
        data = await teacherApi.getSalaries(id);
      } catch (err) {
        const res = await expenseApi.listSalaries({ employee_id: id, page_size: 100 });
        data = res.items || [];
      }
      setSalaries(data || []);
    } catch (err) {
      console.error('Failed to load teacher salary history:', err);
    } finally {
      setSalariesLoading(false);
    }
  }, [id]);

  // Master refresh function
  const refreshAll = useCallback(() => {
    loadProfile();
    loadBreakup();
    loadHistory();
    loadCollections();
    loadRoster();
    loadSalaries();
  }, [loadProfile, loadBreakup, loadHistory, loadCollections, loadRoster, loadSalaries]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Reset history page when filter or search changes
  useEffect(() => {
    setHistoryPage(1);
  }, [historyFilter, historySearch]);

  // Reload history when page or loadHistory changes
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reload roster when filters change
  useEffect(() => {
    loadRoster();
  }, [rosterPage, debouncedSearch, statusFilter, subjectFilter, loadRoster]);

  // Mobile check during edit
  useEffect(() => {
    const cleanMob = cleanMobileInput(formData.mobile);
    if (cleanMob.length === 10) {
      let isCurrent = true;
      teacherApi
        .getByMobile(cleanMob)
        .then((existing) => {
          if (!isCurrent) return;
          if (existing && existing.id !== id) {
            setExistingTeacherWithMobile(existing);
          } else {
            setExistingTeacherWithMobile(null);
          }
        })
        .catch(() => {
          if (isCurrent) setExistingTeacherWithMobile(null);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setExistingTeacherWithMobile(null);
    }
  }, [formData.mobile, id]);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const result = await compressImage(file, 20);
      setPhotoFile(result.file);
      setPhotoPreview(result.previewUrl);
      setPhotoSizeKb(result.sizeKb);
      success(`Photo compressed to ${result.sizeKb} KB (under 20 KB limit)`);
    } catch (err) {
      error(err.message || 'Failed to process photo');
    } finally {
      setCompressing(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return error('Faculty name is required');
    const cleanMob = cleanMobileInput(formData.mobile);
    if (!cleanMob || cleanMob.length !== 10) return error('Mobile must be 10 digits');
    if (existingTeacherWithMobile) return error(`Mobile already in use by ${existingTeacherWithMobile.name}`);

    setSubmitting(true);
    try {
      let finalPhotoUrl = teacher?.photo_url || null;
      if (photoFile) {
        try {
          const photoRes = await teacherApi.uploadPhoto(id, photoFile);
          finalPhotoUrl = photoRes.photo_url;
        } catch (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
        }
      } else if (!photoPreview) {
        finalPhotoUrl = null;
      }

      await teacherApi.update(id, {
        ...formData,
        mobile: cleanMob,
        photo_url: finalPhotoUrl,
      });
      success('Faculty profile updated successfully');
      setEditModalOpen(false);
      refreshAll();
    } catch (err) {
      error(err.message || 'Failed to update faculty profile');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!teacher) return;
    const newStatus = teacher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setStatusSubmitting(true);
    try {
      await teacherApi.updateStatus(teacher.id, newStatus, statusReason.trim() || `User toggled status to ${newStatus}`);
      success(`Faculty status updated to ${newStatus}`);
      setStatusModalOpen(false);
      setStatusReason('');
      refreshAll();
    } catch (err) {
      error(err.message || 'Failed to update faculty status');
    } finally {
      setStatusSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-odoo-600" />
          <span>Loading faculty profile, history & financial ledger...</span>
        </div>
        <div className="bg-white rounded-xl p-8 border border-slate-200 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-100 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/teachers')}>
          Back to Faculty & Teachers
        </Button>
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <p className="text-sm font-semibold text-rose-700">Faculty record not found.</p>
        </div>
      </div>
    );
  }

  const isActive = teacher.status === 'ACTIVE';
  const subjectsTaught = teacher.subjects_taught || [];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/teachers')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Back to Faculty & Teachers"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black break-words leading-tight">
                {teacher.name}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200 shrink-0">
                {teacher.teacher_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              {teacher.specialization || 'Educator'} • {teacher.qualification || 'Faculty'} • Joined {formatIndianDate(teacher.joining_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={refreshAll}
            className="px-2.5 py-1.5 min-h-[36px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="Refresh from backend ledger"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            <span>Refresh</span>
          </button>

          <Button
            size="sm"
            variant={isActive ? 'danger-soft' : 'success-soft'}
            icon={isActive ? UserX : UserCheck}
            onClick={() => {
              setStatusReason('');
              setStatusModalOpen(true);
            }}
            title={isActive ? 'Deactivate Faculty' : 'Activate Faculty'}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>

          <Button
            variant="amber"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            size="sm"
          >
            Edit Profile
          </Button>
        </div>
      </div>

      {/* Prominent Active vs Inactive Status Banner (H2 Mirror) */}
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
              Faculty Status: {isActive ? 'ACTIVE FACULTY MEMBER' : 'INACTIVE / ON LEAVE'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? `Active faculty member currently assigned to ${subjectsTaught.length} subjects with ${breakup?.students_enrolled ?? 0} active scholars`
                : 'Faculty member is currently inactive; teaching assignments and roster pickers restricted'}
            </div>
          </div>
        </div>
        <Badge
          variant={isActive ? 'success' : 'neutral'}
          size="md"
          className="uppercase font-bold tracking-wider self-start sm:self-auto"
        >
          {teacher.status}
        </Badge>
      </div>

      {/* Teacher Details Bio Grid (Part a) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3.5">
            <Avatar
              src={teacher.photo_url}
              name={teacher.name}
              size="lg"
              status={teacher.status}
            />
            <div>
              <h2 className="font-bold text-black text-lg leading-tight">
                {teacher.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
                <span className="font-semibold text-odoo-700">{teacher.qualification || 'Faculty Educator'}</span>
                <span>•</span>
                <span className="font-mono text-slate-500">{teacher.teacher_code}</span>
              </div>
            </div>
          </div>

          {/* Quick Contact Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {teacher.mobile && (
              <a
                href={`tel:${teacher.mobile}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800 transition"
                title="Call Teacher"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>{teacher.mobile}</span>
              </a>
            )}
            {teacher.email && (
              <a
                href={`mailto:${teacher.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800 transition"
                title="Email Teacher"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{teacher.email}</span>
              </a>
            )}
          </div>
        </div>

        {/* Subjects Taught Section (Part a) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Assigned Subjects Curriculum ({subjectsTaught.length})
            </span>
            <Link to="/subjects" className="text-[11px] text-odoo-700 hover:underline font-semibold">
              Browse All Subjects →
            </Link>
          </div>
          {subjectsTaught.length === 0 ? (
            <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              No subjects currently assigned directly to this faculty member.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subjectsTaught.map((sub) => (
                <Link
                  key={sub.id}
                  to={`/subjects/${sub.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-950 text-xs font-semibold shadow-2xs transition group"
                  title={`Open Subject Detail for ${sub.name}`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                  <span>{sub.name}</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-white rounded border border-purple-200 text-purple-800">
                    {sub.subject_code}
                  </span>
                  {sub.students_count != null && (
                    <span className="text-[11px] font-bold text-emerald-800">
                      • {sub.students_count} active
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Financial & KPI Summary Cards (Single Source of Truth from DB Ledger) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 text-xs">
        {/* Total Billed */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Billed</span>
          <span className="font-mono font-black text-black text-lg sm:text-xl mt-1 block truncate">
            ₹{Number(breakup?.total_fees_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-medium mt-1 block">Tuition ledger booked</span>
        </div>

        {/* Actual Collected */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Actual Collected</span>
          <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl mt-1 block truncate">
            ₹{Number(breakup?.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-emerald-700 font-medium mt-1 block">Net payments realized</span>
        </div>

        {/* Balance Due */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Balance Due</span>
          <span className="font-mono font-black text-rose-700 text-lg sm:text-xl mt-1 block truncate">
            ₹{Number(breakup?.total_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-rose-600 font-medium mt-1 block">Outstanding receivables</span>
        </div>

        {/* Waived & Refunded */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Waived / Refunded</span>
          <div className="font-mono font-black text-slate-800 text-sm mt-1">
            <span className="text-amber-800">₹{Number(breakup?.total_waived || 0).toFixed(0)}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-orange-700">₹{Number(breakup?.total_refunded || 0).toFixed(0)}</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1 block">Waivers & refunds</span>
        </div>

        {/* Active Enrolled Scholars */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Active Scholars</span>
            <span className="text-[10px] text-slate-500 font-medium">({breakup?.unique_students_count ?? 0} unique)</span>
          </div>
          <span className="font-mono font-black text-odoo-900 text-lg sm:text-xl mt-1 block flex items-center gap-1.5">
            <Users className="w-5 h-5 text-odoo-600" />
            <span>{breakup?.students_enrolled ?? 0}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-medium mt-1 block">
            {breakup?.total_enrollments ?? 0} total enrolled cycles
          </span>
        </div>

        {/* Collections Handled by Teacher (Part d) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Handled Receipts</span>
            <span className="text-[10px] text-emerald-800 font-medium">({collections.collections_count} txns)</span>
          </div>
          <span className="font-mono font-black text-indigo-900 text-lg sm:text-xl mt-1 block truncate">
            ₹{Number(collections.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-indigo-700 font-medium mt-1 block">Desk collections handled</span>
        </div>

        {/* Monthly Salary Paid Card (Requirement 5) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Monthly Salary</span>
            <span className="text-[10px] text-emerald-800 font-medium">({salaries.length} records)</span>
          </div>
          <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl mt-1 block truncate">
            ₹{salaries.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-medium mt-1 block truncate">
            Payable: ₹{salaries.reduce((sum, s) => sum + Number(s.salary_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Main Feature Tabs mirroring Subject module (G3) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'HISTORY'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Subject History & Lifecycle Events ({historyMetrics.total_events})</span>
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
          <span>Teacher & Subject Fee Breakup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('COLLECTIONS')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'COLLECTIONS'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Collections Handled ({collections.collections_count})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ATTENDANCE')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'ATTENDANCE'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Teacher Attendance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SALARY')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
            activeTab === 'SALARY'
              ? 'bg-odoo-700 text-white shadow-2xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Monthly Salary History ({salaries.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SUBJECT HISTORY & LIFECYCLE EVENTS (Part b) */}
      {/* ========================================================================= */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-5">
          {/* Chronological History Ledger */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-black text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-odoo-600" />
                  <span>Chronological Lifecycle History ({historyMetrics.total_events} Events)</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Every admission, renewal, expiry, change and cancellation for this faculty's subjects in chronological order
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="primary" size="xs">Chronological Order</Badge>
              </div>
            </div>

            {/* Filter Toolbar for History */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              {/* Event Type Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('ALL')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-black text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All ({historyMetrics.total_events})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('ADMISSION')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'ADMISSION'
                      ? 'bg-blue-700 text-white shadow-2xs'
                      : 'bg-white text-blue-800 border border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  Admissions ({historyMetrics.admissions_count})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('RENEWAL')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'RENEWAL'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  Renewals ({historyMetrics.renewals_count})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('EXPIRY')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'EXPIRY'
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  Expiries ({historyMetrics.expiries_count})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('CHANGE')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'CHANGE'
                      ? 'bg-purple-700 text-white shadow-2xs'
                      : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  Changes ({historyMetrics.changes_count})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('CANCELLATION')}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    historyFilter === 'CANCELLATION'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  Cancellations ({historyMetrics.cancellations_count})
                </button>
              </div>

              {/* History Search Box */}
              <div className="relative flex-1 lg:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter student, course, adm #..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-odoo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* History Events Table */}
            {historyLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200 animate-pulse">
                <RefreshCw className="w-5 h-5 animate-spin text-odoo-600 mx-auto mb-2" />
                <span>Loading chronological history from database...</span>
              </div>
            ) : historyEvents.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
                <History className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="font-semibold text-black">No lifecycle events found</div>
                <p className="text-slate-500">No events matched the selected filter criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-32">Event Type</th>
                      <th className="p-3">Scholar & Admission</th>
                      <th className="p-3">Subject / Course</th>
                      <th className="p-3">Cycle Period</th>
                      <th className="p-3 text-right">Fee / Due</th>
                      <th className="p-3">Status & Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyEvents.map((ev) => (
                      <tr key={ev.event_id} className="hover:bg-slate-50/80 transition">
                        {/* Event Type & Date */}
                        <td className="p-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                              ev.event_type === 'ADMISSION'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : ev.event_type === 'RENEWAL'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : ev.event_type === 'EXPIRY'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : ev.event_type === 'CHANGE'
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            ● {ev.event_type}
                          </span>
                          <span className="block font-mono text-[11px] text-slate-500 mt-1">
                            {formatIndianDate(ev.event_date)}
                          </span>
                        </td>

                        {/* Scholar */}
                        <td className="p-3 align-top">
                          <Link
                            to={`/students/${ev.student_id}`}
                            className="font-bold text-black hover:text-odoo-600 block leading-tight"
                          >
                            {ev.student_name}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            #{ev.student_code} • {ev.admission_number}
                          </span>
                          {ev.mobile && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              📞 {ev.mobile}
                            </span>
                          )}
                        </td>

                        {/* Subject */}
                        <td className="p-3 align-top">
                          <span className="font-semibold text-black block">{ev.subject_name}</span>
                          {ev.subject_code && (
                            <span className="text-[10px] font-mono text-slate-500 block">
                              {ev.subject_code}
                            </span>
                          )}
                        </td>

                        {/* Validity */}
                        <td className="p-3 align-top font-mono text-[11px] text-slate-700">
                          {ev.valid_from && ev.valid_to ? (
                            <span>
                              {formatIndianDate(ev.valid_from)} → {formatIndianDate(ev.valid_to)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Financials */}
                        <td className="p-3 align-top text-right font-mono">
                          <span className="font-bold text-black block">
                            ₹{Number(ev.fee_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {ev.balance_due > 0 ? (
                            <span className="text-[10px] text-rose-700 font-bold block">
                              Due: ₹{Number(ev.balance_due).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-800 font-bold block">
                              Paid
                            </span>
                          )}
                        </td>

                        {/* Notes / Reason */}
                        <td className="p-3 align-top">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Badge
                              size="xs"
                              variant={
                                ev.status === 'ACTIVE'
                                  ? 'success'
                                  : ev.status === 'EXPIRED'
                                  ? 'warning'
                                  : ev.status === 'DISCONTINUED'
                                  ? 'purple'
                                  : ev.status === 'CANCELLED'
                                  ? 'danger'
                                  : 'neutral'
                              }
                            >
                              {ev.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2">
                            {ev.reason_or_notes || ev.event_title}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* History Pagination */}
            {(historyTotal > HISTORY_PAGE_SIZE || historyTotalPages > 1 || (historyEvents.length > 0 && historyPage > 1)) && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500">
                  Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1} to{' '}
                  {Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal)} of {historyTotal} events
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-bold text-black">
                    Page {historyPage} of {historyTotalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assigned Course Enrollments Roster */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-black text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-odoo-600" />
                  <span>Assigned Course Enrollments Roster ({rosterTotal})</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Complete active and expired student course cycles with direct collection & ledger actions
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="primary" size="xs">Live Roster</Badge>
              </div>
            </div>

            {/* Roster Filter Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setRosterPage(1);
                  }}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-black text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All ({rosterMetrics.total_enrollments})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ACTIVE');
                    setRosterPage(1);
                  }}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  Active ({rosterMetrics.active_enrollments})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('INACTIVE');
                    setRosterPage(1);
                  }}
                  className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    statusFilter === 'INACTIVE'
                      ? 'bg-rose-700 text-white shadow-2xs'
                      : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  Inactive / Expired ({rosterMetrics.inactive_enrollments})
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {subjectOptions.length > 1 && (
                  <select
                    value={subjectFilter}
                    onChange={(e) => {
                      setSubjectFilter(e.target.value);
                      setRosterPage(1);
                    }}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-black font-semibold focus:outline-none shadow-2xs"
                  >
                    <option value="">All Subjects</option>
                    {subjectOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search student, code, course..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-odoo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Roster Table */}
            {rosterLoading ? (
              <div className="py-10 text-center text-xs text-slate-500 animate-pulse">
                <RefreshCw className="w-5 h-5 animate-spin text-odoo-600 mx-auto mb-2" />
                <span>Loading enrollments...</span>
              </div>
            ) : rosterItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No course enrollments matching filter.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs min-w-[800px]">
                  <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Scholar Details</th>
                      <th className="p-3">Course / Subject</th>
                      <th className="p-3">Hall</th>
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
                    {rosterItems.map((s) => (
                      <tr key={s.item_id} className="hover:bg-purple-50/40 transition">
                        <td className="p-3">
                          <Link
                            to={`/students/${s.student_id}`}
                            className="font-bold text-black hover:text-odoo-600 block"
                          >
                            {s.student_name}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono">
                            #{s.student_code} • {s.mobile || '—'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-black block">{s.subject_name}</span>
                          {s.subject_code && (
                            <span className="text-[10px] text-slate-500 font-mono">{s.subject_code}</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700">
                          {s.hall_number || 'Main Hall'}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-700">
                          {s.cycle_period_label}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            size="xs"
                            variant={
                              s.cycle_status === 'ACTIVE'
                                ? 'success'
                                : s.cycle_status === 'INACTIVE'
                                ? 'danger'
                                : 'neutral'
                            }
                          >
                            {s.cycle_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-black">
                          ₹{Number(s.fee_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-800">
                          ₹{Number(s.fee_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-700">
                          ₹{Number(s.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            size="xs"
                            variant={
                              s.payment_status === 'PAID'
                                ? 'success'
                                : s.payment_status === 'PARTIALLY_PAID' || s.payment_status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {s.payment_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {s.balance_due > 0 && (
                              <button
                                onClick={() => setPayAdmissionId(s.admission_id)}
                                className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold rounded-md border border-emerald-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                                title="Collect balance fee"
                              >
                                <CreditCard className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>Collect</span>
                              </button>
                            )}
                            <Link
                              to={`/students/${s.student_id}`}
                              className="h-8 min-h-[32px] px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-md border border-blue-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
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

            {/* Roster Pagination */}
            {rosterTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500">
                  Showing {(rosterPage - 1) * ROSTER_PAGE_SIZE + 1} to{' '}
                  {Math.min(rosterPage * ROSTER_PAGE_SIZE, rosterTotal)} of {rosterTotal} enrollments
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                    disabled={rosterPage === 1}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-bold text-black">
                    Page {rosterPage} of {rosterTotalPages}
                  </span>
                  <button
                    onClick={() => setRosterPage((p) => Math.min(rosterTotalPages, p + 1))}
                    disabled={rosterPage === rosterTotalPages}
                    className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEACHER & SUBJECT FEE BREAKUP (Part c) */}
      {/* ========================================================================= */}
      {activeTab === 'BREAKUP' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-600" />
                <span>Financial & Fee Breakup Ledger</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Single source of truth from backend ledger • Per-subject financial metrics, realizations & dues
              </p>
            </div>
            <Badge variant="primary" size="xs">Ledger Reconciled</Badge>
          </div>

          {/* Breakup Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Invoiced</span>
              <span className="font-mono font-bold text-black text-sm">
                ₹{Number(breakup?.total_fees_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Realized Cash</span>
              <span className="font-mono font-bold text-emerald-800 text-sm">
                ₹{Number(breakup?.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Balance Due</span>
              <span className="font-mono font-bold text-rose-700 text-sm">
                ₹{Number(breakup?.total_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Waived</span>
              <span className="font-mono font-bold text-amber-800 text-sm">
                ₹{Number(breakup?.total_waived || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Refunded</span>
              <span className="font-mono font-bold text-orange-700 text-sm">
                ₹{Number(breakup?.total_refunded || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Collection Efficiency</span>
              <span className="font-mono font-bold text-indigo-900 text-sm">
                {breakup?.collection_efficiency ?? 100}%
              </span>
            </div>
          </div>

          {/* Per-Subject Breakup Table */}
          <div>
            <h4 className="font-bold text-black text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-odoo-600" />
              <span>Per-Subject Financial Breakup</span>
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Subject / Course</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Enrolled (Active)</th>
                    <th className="p-3 text-right">Fee Billed</th>
                    <th className="p-3 text-right text-emerald-800">Collected</th>
                    <th className="p-3 text-right text-rose-700">Due</th>
                    <th className="p-3 text-right text-amber-700">Waived</th>
                    <th className="p-3 text-right text-orange-700">Refunded</th>
                    <th className="p-3 text-center">Efficiency</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!breakup?.subjects || breakup.subjects.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-500">
                        No subjects associated with this teacher in the ledger.
                      </td>
                    </tr>
                  ) : (
                    breakup.subjects.map((s) => (
                      <tr key={s.subject_id} className="hover:bg-purple-50/30 transition">
                        <td className="p-3">
                          <Link
                            to={`/subjects/${s.subject_id}`}
                            className="font-bold text-black hover:text-odoo-600 block"
                          >
                            {s.subject_name}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {s.subject_code} • ₹{s.default_fee}/mo
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Badge size="xs" variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-semibold">
                          <span className="text-emerald-800 font-bold">{s.students_enrolled}</span>
                          <span className="text-slate-400 font-normal"> / {s.total_enrollments}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-black">
                          ₹{Number(s.fees_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-800">
                          ₹{Number(s.collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-700">
                          ₹{Number(s.due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-800">
                          ₹{Number(s.waived || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-orange-700">
                          ₹{Number(s.refunded || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-indigo-900">
                          {s.collection_efficiency}%
                        </td>
                        <td className="p-3 text-center">
                          <Link
                            to={`/subjects/${s.subject_id}`}
                            className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded inline-flex items-center gap-1 shadow-2xs"
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

          {/* Scholar-wise Financial Ledger */}
          <div>
            <h4 className="font-bold text-black text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-odoo-600" />
              <span>Scholar-wise Financial Breakdown ({breakup?.students?.length ?? 0} Students)</span>
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Scholar Details</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3 text-right">Fee Billed</th>
                    <th className="p-3 text-right text-emerald-800">Collected</th>
                    <th className="p-3 text-right text-rose-700">Due</th>
                    <th className="p-3 text-center">Payment Status</th>
                    <th className="p-3 text-center">Cycle</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!breakup?.students || breakup.students.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        No financial student records found for this teacher.
                      </td>
                    </tr>
                  ) : (
                    breakup.students.slice(0, 50).map((stu, sIdx) => (
                      <tr key={sIdx} className="hover:bg-slate-50/60 transition">
                        <td className="p-3">
                          <Link
                            to={`/students/${stu.student_id}`}
                            className="font-bold text-black hover:text-odoo-600 block"
                          >
                            {stu.student_name}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono">#{stu.student_code}</span>
                        </td>
                        <td className="p-3 text-slate-700">{stu.subject_name}</td>
                        <td className="p-3 text-right font-mono font-bold text-black">
                          ₹{Number(stu.fee_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-800">
                          ₹{Number(stu.fee_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-700">
                          ₹{Number(stu.balance_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            size="xs"
                            variant={
                              stu.payment_status === 'PAID'
                                ? 'success'
                                : stu.payment_status === 'PARTIALLY_PAID' || stu.payment_status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {stu.payment_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            size="xs"
                            variant={
                              stu.cycle_status === 'ACTIVE'
                                ? 'success'
                                : stu.cycle_status === 'INACTIVE'
                                ? 'danger'
                                : 'neutral'
                            }
                          >
                            {stu.cycle_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Link
                            to={`/students/${stu.student_id}`}
                            className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded inline-flex items-center gap-1 shadow-2xs"
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COLLECTIONS HANDLED BY TEACHER (Part d) */}
      {/* ========================================================================= */}
      {activeTab === 'COLLECTIONS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-black text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Collections Handled by Faculty ({collections.collections_count} Receipts)</span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Financial receipt transactions where the central ledger records this faculty member as receiving collector
              </p>
            </div>
            <Badge variant="primary" size="xs">Collector Ledger</Badge>
          </div>

          {/* Collection Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 text-xs">
            <div>
              <span className="text-[10px] font-bold text-emerald-900 uppercase block tracking-wider">
                Total Handled by Faculty
              </span>
              <span className="text-xl font-black text-emerald-950 font-mono mt-0.5 block">
                ₹{Number(collections.total_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-800 font-medium mt-0.5 block">
                Across {collections.collections_count} receipt transactions
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-emerald-900 uppercase block tracking-wider">
                Payment Modes Handled
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.keys(collections.by_mode || {}).length === 0 ? (
                  <span className="text-slate-500 text-xs italic">No transactions handled</span>
                ) : (
                  Object.entries(collections.by_mode).map(([mode, amt]) => (
                    <span
                      key={mode}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white text-emerald-900 border border-emerald-300 font-mono"
                    >
                      {mode}: ₹{Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-emerald-900 uppercase block tracking-wider">
                Ledger Source Information
              </span>
              <span className="text-xs text-slate-700 block mt-0.5 leading-snug">
                Matched via user account <span className="font-mono font-bold text-black">{teacher.teacher_code}</span> and collector snapshot <span className="font-semibold text-black">"{teacher.name}"</span>.
              </span>
            </div>
          </div>

          {/* Collections Table */}
          {collections.items.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
              <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="font-semibold text-black">No Direct Collections Handled by Faculty</div>
              <p className="text-slate-500 max-w-md mx-auto text-[11px]">
                The ledger records 0 payment receipts handled directly under this faculty member's user credentials. All student tuition fee collections are processed through the institute cashier counters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Receipt #</th>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Scholar Details</th>
                    <th className="p-3">Course / Subjects</th>
                    <th className="p-3 text-right">Amount Handled</th>
                    <th className="p-3 text-center">Payment Mode</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {collections.items.map((c) => (
                    <tr key={c.payment_id} className="hover:bg-emerald-50/30 transition">
                      <td className="p-3 font-mono font-bold text-emerald-900">
                        {c.payment_number}
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {formatIndianDate(c.payment_date)}
                      </td>
                      <td className="p-3">
                        <Link
                          to={`/students/${c.student_id}`}
                          className="font-bold text-black hover:text-odoo-600 block"
                        >
                          {c.student_name}
                        </Link>
                        <span className="text-[10px] text-slate-500 font-mono">
                          #{c.student_code} • {c.admission_number}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">
                        {c.subject_names?.length > 0 ? c.subject_names.join(', ') : 'Tuition Fee'}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-black">
                        ₹{Number(c.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        <Badge size="xs" variant="primary">
                          {c.payment_mode}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setPaymentReceiptToShow(c.payment_id)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <FileText className="w-3 h-3 text-slate-600" />
                          <span>Receipt</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TEACHER ATTENDANCE (Mark absent per month) */}
      {/* ========================================================================= */}
      {activeTab === 'ATTENDANCE' && teacher && (
        <div className="space-y-4">
          <TeacherAttendanceCalendar
            teacherId={teacher.id}
            teacherName={teacher.name}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: MONTHLY SALARY HISTORY (Requirement 5) */}
      {/* ========================================================================= */}
      {activeTab === 'SALARY' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-black text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-odoo-600" />
                  <span>Monthly Salary History for {teacher.name}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Monthly payroll records showing payable amount, paid amount, payment mode, and attendance deductions
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Total Paid: ₹{salaries.reduce((acc, s) => acc + Number(s.paid_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                  Total Payable: ₹{salaries.reduce((acc, s) => acc + Number(s.salary_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {salariesLoading ? (
              <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
                Loading monthly salary history...
              </div>
            ) : salaries.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">No monthly salary entries recorded yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Salary records created in Expenses &gt; Faculty &amp; Staff Payroll will appear here with monthly amounts, payment modes, and attendance deductions.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-3 text-right">Payable Amount</th>
                      <th className="py-2.5 px-3 text-right">Paid Amount</th>
                      <th className="py-2.5 px-3 text-center">Payment Mode</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Absent Days</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3">Payment Date</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {salaries.map((s) => {
                      const variants = {
                        PAID: 'success',
                        PARTIALLY_PAID: 'warning',
                        PENDING: 'danger',
                      };
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-black">
                            {s.month_year}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-black">
                            ₹{Number(s.salary_amount).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                            ₹{Number(s.paid_amount).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {s.payment_mode ? (
                              <Badge
                                size="xs"
                                variant={s.payment_mode === 'UPI' ? 'info' : s.payment_mode === 'CASH' ? 'warning' : 'neutral'}
                              >
                                {s.payment_mode}
                              </Badge>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge size="xs" variant={variants[s.status] || 'neutral'}>
                              {s.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            {s.absent_days_count != null ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  s.absent_days_count > 0
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {s.absent_days_count} {s.absent_days_count === 1 ? 'day' : 'days'}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {s.due_date ? formatIndianDate(s.due_date) : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {s.payment_date ? formatIndianDate(s.payment_date) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate" title={s.notes || ''}>
                            {s.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. Quick Payment Modal */}
      {payAdmissionId && (
        <QuickPaymentModal
          isOpen={!!payAdmissionId}
          onClose={() => setPayAdmissionId(null)}
          admissionId={payAdmissionId}
          onSuccess={(payment) => {
            setPayAdmissionId(null);
            success('Fee collected successfully');
            if (payment?.id) setPaymentReceiptToShow(payment.id);
            refreshAll();
          }}
        />
      )}

      {/* 2. Payment Receipt Modal */}
      {paymentReceiptToShow && (
        <PaymentReceiptModal
          paymentId={paymentReceiptToShow}
          isOpen={!!paymentReceiptToShow}
          onClose={() => setPaymentReceiptToShow(null)}
        />
      )}

      {/* 3. Status Toggle Confirmation Modal (H2) */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={isActive ? 'Deactivate Faculty Member' : 'Activate Faculty Member'}
        subtitle={`Faculty: ${teacher.name} (${teacher.teacher_code})`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            {isActive
              ? 'Deactivating this faculty member will mark them as INACTIVE and prevent them from being assigned to new subjects. An audit log entry will be created.'
              : 'Activating this faculty member will mark them as ACTIVE and allow them to be assigned to subjects and timetables.'}
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Reason for Status Change (Recorded in Audit Log)
            </label>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={isActive ? 'e.g. Sabbatical leave, medical leave, resigned...' : 'e.g. Returned from leave, resumed teaching...'}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-black focus:outline-none focus:ring-1 focus:ring-odoo-500 font-medium"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStatusModalOpen(false)}
              disabled={statusSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant={isActive ? 'danger' : 'success'}
              size="sm"
              onClick={handleConfirmToggleStatus}
              loading={statusSubmitting}
            >
              {isActive ? 'Confirm Deactivation' : 'Confirm Activation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. Edit Profile Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Faculty Profile"
        subtitle={`Teacher Code: ${teacher.teacher_code}`}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {/* Photo Preview & Upload */}
          <div className="flex items-center gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="relative">
              <Avatar
                src={photoPreview}
                name={formData.name || teacher.name}
                size="lg"
                status={formData.status}
              />
              <label
                htmlFor="teacher-edit-photo"
                className="absolute -bottom-1 -right-1 p-1.5 bg-odoo-700 hover:bg-odoo-800 text-white rounded-full cursor-pointer shadow-xs transition"
                title="Change Photo"
              >
                <Camera className="w-3.5 h-3.5" />
                <input
                  id="teacher-edit-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            </div>
            <div>
              <div className="text-xs font-bold text-black">Faculty Portrait Photo</div>
              <div className="text-[11px] text-slate-500">
                Compressed to &lt;= 20 KB automatically for fast ERP loading
              </div>
              {photoSizeKb && (
                <span className="inline-block mt-1 text-[10px] font-mono font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded border border-emerald-200">
                  {photoSizeKb} KB compressed
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Faculty Name <span className="text-rose-600">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Mobile Number (10 Digits) <span className="text-rose-600">*</span>
              </label>
              <Input
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                maxLength={10}
                required
              />
              {existingTeacherWithMobile && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1">
                  Already registered to {existingTeacherWithMobile.name} ({existingTeacherWithMobile.teacher_code})
                </p>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Qualification <span className="text-rose-600">*</span>
              </label>
              <Input
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Specialization <span className="text-rose-600">*</span>
              </label>
              <Input
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Joining Date <span className="text-rose-600">*</span>
              </label>
              <Input
                type="date"
                value={formData.joining_date}
                onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={submitting || compressing}
            >
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
