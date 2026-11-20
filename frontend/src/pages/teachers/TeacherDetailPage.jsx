import React, { useState, useEffect, useCallback } from 'react';
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
  Filter,
  Camera,
  AlertTriangle
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Avatar from '../../components/common/Avatar';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { compressImage } from '../../utils/imageCompressor';

const PAGE_SIZE = 10;

export default function TeacherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [teacher, setTeacher] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Database-driven Roster State
  const [rosterItems, setRosterItems] = useState([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterTotalPages, setRosterTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [metrics, setMetrics] = useState({
    total_enrollments: 0,
    active_enrollments: 0,
    inactive_enrollments: 0,
    cancelled_enrollments: 0,
    unique_students_count: 0,
  });
  const [subjectOptions, setSubjectOptions] = useState([]);

  // Database-level Filter State
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CANCELLED'
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, subjectFilter]);

  // Check mobile uniqueness when 10 digits entered
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

  // Load teacher profile once on mount / id change
  const loadProfile = useCallback(async () => {
    if (!id) return;
    setProfileLoading(true);
    try {
      const tData = await teacherApi.get(id);
      setTeacher(tData);
      setPhotoPreview(tData.photo_url || null);
      setPhotoFile(null);
      setPhotoSizeKb(null);
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
      error(err.message || 'Failed to load faculty details');
    } finally {
      setProfileLoading(false);
    }
  }, [id, error]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoSizeKb(null);
  };

  // Fetch paginated, database-filtered roster
  const loadRoster = useCallback(async () => {
    if (!id) return;
    setRosterLoading(true);
    try {
      const res = await teacherApi.getRoster(id, {
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        status_filter: statusFilter === 'ALL' ? undefined : statusFilter,
        subject_id: subjectFilter || undefined,
      });

      setRosterItems(res.items || []);
      setRosterTotal(res.total || 0);
      setRosterTotalPages(res.total_pages || 1);
      if (res.metrics) {
        setMetrics(res.metrics);
      }
      if (res.subjects && res.subjects.length > 0) {
        setSubjectOptions(res.subjects);
      }
    } catch (err) {
      console.error('Failed to load faculty roster', err);
      error(err.message || 'Failed to load course enrollments');
    } finally {
      setRosterLoading(false);
    }
  }, [id, page, debouncedSearch, statusFilter, subjectFilter, error]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Faculty name is required');
      return;
    }

    const cleanMob = cleanMobileInput(formData.mobile);
    if (!cleanMob || cleanMob.length !== 10) {
      error('Mobile number must be exactly 10 numeric digits');
      return;
    }

    if (existingTeacherWithMobile) {
      error(`Mobile number is already registered to ${existingTeacherWithMobile.name} (${existingTeacherWithMobile.teacher_code})`);
      return;
    }

    if (!formData.qualification.trim()) {
      error('Qualification is required');
      return;
    }

    if (!formData.specialization.trim()) {
      error('Specialization is required');
      return;
    }

    if (!formData.joining_date) {
      error('Joining date is required');
      return;
    }

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
      loadProfile();
      loadRoster();
    } catch (err) {
      error(err.message || 'Failed to update faculty details');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
    setDebouncedSearch('');
    setSubjectFilter('');
    setPage(1);
  };

  if (profileLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <ArrowLeft className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading faculty profile & roster...</span>
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
  const hasActiveFilters = statusFilter !== 'ALL' || debouncedSearch.trim() !== '' || subjectFilter !== '';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/teachers')}
            className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            title="Back to Faculty & Teachers"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-black">
                {teacher.name}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold border border-slate-200">
                {teacher.teacher_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {teacher.specialization || 'Faculty Member'} • Joined on {formatIndianDate(teacher.joining_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            size="sm"
          >
            Edit Faculty Profile
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
              Faculty Status: {isActive ? 'ACTIVE FACULTY MEMBER' : 'INACTIVE / ON LEAVE'}
            </div>
            <div className="text-xs text-slate-700 font-medium mt-0.5">
              {isActive
                ? 'Faculty is actively assigned to subject curriculum and ongoing batch schedules'
                : 'Faculty member is currently inactive or on leave'}
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

      {/* Faculty Bio Grid */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-3">
          <Avatar
            src={teacher.photo_url}
            name={teacher.name}
            size="lg"
            status={teacher.status}
          />
          <div>
            <h2 className="font-bold text-black text-lg">
              {teacher.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
              <span className="font-semibold text-indigo-700">{teacher.qualification || 'Educator'}</span>
              <span>•</span>
              <span className="font-mono">{teacher.teacher_code}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Contact Mobile */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-semibold uppercase tracking-wider">Contact Mobile</span>
            <span className="font-mono font-bold text-black text-sm mt-0.5 block">
              {teacher.mobile || '—'}
            </span>
          </div>

          {/* Email Address */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block font-semibold uppercase tracking-wider">Email Address</span>
            <span className="font-semibold text-black text-sm truncate block mt-0.5">
              {teacher.email || '—'}
            </span>
          </div>

          {/* Course Enrollments Breakdown */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 block font-semibold uppercase tracking-wider">
                Course Enrollments
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                ({metrics.unique_students_count} unique scholars)
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-black text-black text-base">
                {metrics.total_enrollments}
              </span>
              <span className="text-xs text-slate-600 font-semibold">Total Enrollments</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-200">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ● {metrics.active_enrollments} Active
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                ● {metrics.inactive_enrollments} Inactive (Expired)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Course Enrollments Roster with Database-Level Filtering */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4 p-4 sm:p-5">
        {/* Header with Title and Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-bold text-black text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Assigned Course Enrollments ({rosterTotal})</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Active and expired course cycles assigned to faculty • Filtered directly at database level
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadRoster}
              disabled={rosterLoading}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
              title="Refresh roster from database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rosterLoading ? 'animate-spin text-indigo-600' : 'text-slate-600'}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Database-Level Filtering Toolbar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {/* Segmented Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-black text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All ({metrics.total_enrollments})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'ACTIVE' ? 'bg-white' : 'bg-emerald-500'}`} />
              Active ({metrics.active_enrollments})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'INACTIVE' ? 'bg-white' : 'bg-rose-500'}`} />
              Inactive / Expired ({metrics.inactive_enrollments})
            </button>
            {metrics.cancelled_enrollments > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('CANCELLED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'CANCELLED'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Cancelled ({metrics.cancelled_enrollments})
              </button>
            )}
          </div>

          {/* Subject Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {subjectOptions.length > 1 && (
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-black font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="">All Assigned Subjects</option>
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
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black placeholder:text-slate-400 font-medium shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
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
                onClick={handleClearFilters}
                className="px-2 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition cursor-pointer"
                title="Reset all filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Roster Table */}
        {rosterLoading ? (
          <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200 animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 mx-auto mb-2" />
            <span>Fetching assigned course enrollments from database...</span>
          </div>
        ) : rosterItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="font-semibold text-black">No course enrollments found</div>
            <p className="text-slate-500 max-w-sm mx-auto">
              No assigned course enrollments matched your current filter criteria.
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
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
                  <th className="p-3">Enrolled Student</th>
                  <th className="p-3">Subject & Batch</th>
                  <th className="p-3">Hall Room</th>
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
                  <tr
                    key={s.item_id}
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

                    {/* Subject & Batch */}
                    <td className="p-3 text-slate-700">
                      <div className="font-semibold text-black">{s.subject_name || 'Subject'}</div>
                      <div className="text-[11px] text-slate-500">{s.batch_name}</div>
                    </td>

                    {/* Hall Room */}
                    <td className="p-3 text-slate-700 font-medium">
                      {s.hall_number ? `Hall: ${s.hall_number}` : 'Main Campus'}
                    </td>

                    {/* Rolling Billing Cycle */}
                    <td className="p-3">
                      <div className="font-mono font-bold text-black text-xs">
                        {s.cycle_period_label}
                      </div>
                      <div className="text-[11px] text-indigo-700 font-semibold">
                        {s.billing_day ? `Day ${s.billing_day} cycle` : 'Rolling cycle'}
                      </div>
                    </td>

                    {/* Cycle Status */}
                    <td className="p-3 text-center">
                      <Badge variant={s.badge_variant || 'neutral'} size="xs">
                        {s.status_label || s.cycle_status}
                      </Badge>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        {s.status_subtext}
                      </div>
                    </td>

                    {/* Fee Billed */}
                    <td className="p-3 text-right font-mono font-bold text-black">
                      ₹{(s.fee_billed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Amount Collected */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">
                      ₹{(s.fee_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                      <Link
                        to={`/students/${s.student_id}`}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-black font-semibold rounded border border-slate-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-600" />
                        <span>Profile</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Controls */}
        {rosterTotal > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-200 text-xs">
            <span className="text-slate-600 font-medium">
              Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(page * PAGE_SIZE, rosterTotal)} of {rosterTotal} course enrollments
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1 || rosterLoading}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="First Page"
              >
                <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || rosterLoading}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <span className="px-2 font-bold text-black">
                Page {page} of {rosterTotalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(rosterTotalPages, p + 1))}
                disabled={page >= rosterTotalPages || rosterLoading}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
              </button>
              <button
                onClick={() => setPage(rosterTotalPages)}
                disabled={page >= rosterTotalPages || rosterLoading}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                title="Last Page"
              >
                <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Faculty Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Faculty Profile"
        subtitle={`Teacher Code: ${teacher.teacher_code}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdate} className="space-y-3 text-xs">
          {/* Profile Photo Upload */}
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Avatar
              src={photoPreview}
              name={formData.name || 'Faculty'}
              size="lg"
              status={formData.status}
            />
            <div className="flex-1 space-y-1">
              <span className="text-xs font-bold text-black block">Faculty Photograph</span>
              <p className="text-[11px] text-slate-500">
                Auto-compressed to under 20 KB. Formats: JPG, PNG, WEBP.
              </p>
              {photoSizeKb && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ Size: {photoSizeKb} KB
                </span>
              )}
              <div className="flex items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs transition">
                  <Camera className="w-3.5 h-3.5 text-indigo-700" />
                  {compressing ? 'Compressing...' : photoPreview ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    disabled={compressing}
                    className="hidden"
                  />
                </label>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                    title="Remove Photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <Input
            label="Faculty Name *"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Mobile Number *"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            required
            value={formData.mobile}
            onChange={(e) => setFormData({ ...formData, mobile: cleanMobileInput(e.target.value) })}
            placeholder="10-digit mobile"
            error={
              existingTeacherWithMobile
                ? `Already registered to ${existingTeacherWithMobile.name} (${existingTeacherWithMobile.teacher_code})`
                : formData.mobile && formData.mobile.length < 10
                ? `Must be 10 digits (${formData.mobile.length}/10)`
                : null
            }
            helperText={
              existingTeacherWithMobile
                ? null
                : formData.mobile && formData.mobile.length === 10
                ? '✓ Valid 10-digit mobile'
                : '10-digit mobile number'
            }
          />

          {/* Existing Teacher Warning Card */}
          {existingTeacherWithMobile && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Avatar
                  src={existingTeacherWithMobile.photo_url}
                  name={existingTeacherWithMobile.name}
                  size="sm"
                  status={existingTeacherWithMobile.status}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-bold text-amber-950">{existingTeacherWithMobile.name}</span>
                    <span className="font-mono text-[10px] bg-amber-200/80 text-amber-900 px-1 rounded font-bold">
                      {existingTeacherWithMobile.teacher_code}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-800 font-semibold block">
                    ⚠️ Mobile already registered to another faculty member.
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  setEditModalOpen(false);
                  navigate(`/teachers/${existingTeacherWithMobile.id}`);
                }}
              >
                View ↗
              </Button>
            </div>
          )}

          <Input
            label="Email Address (Optional)"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Qualification *"
              required
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
            />
            <Input
              label="Specialization *"
              required
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Joining Date *"
              type="date"
              required
              value={formData.joining_date}
              onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
            />
            <Select
              label="Faculty Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active Faculty' },
                { value: 'INACTIVE', label: 'Inactive / On Leave' },
              ]}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            {(() => {
              const cleanMob = cleanMobileInput(formData.mobile);
              const isFormValid =
                formData.name.trim().length >= 2 &&
                cleanMob.length === 10 &&
                !existingTeacherWithMobile &&
                formData.qualification.trim().length >= 2 &&
                formData.specialization.trim().length >= 2 &&
                Boolean(formData.joining_date);

              let buttonLabel = 'Save Changes';
              if (!formData.name.trim()) buttonLabel = 'Enter Faculty Name';
              else if (cleanMob.length !== 10) buttonLabel = 'Enter 10-Digit Mobile';
              else if (existingTeacherWithMobile) buttonLabel = 'Mobile Already Registered';
              else if (!formData.qualification.trim()) buttonLabel = 'Enter Qualification';
              else if (!formData.specialization.trim()) buttonLabel = 'Enter Specialization';

              return (
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={submitting || !isFormValid}
                >
                  {buttonLabel}
                </Button>
              );
            })()}
          </div>
        </form>
      </Modal>
    </div>
  );
}