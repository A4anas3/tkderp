import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  BookOpen,
  Users,
  MapPin,
  Clock,
  School,
  Calendar,
  ExternalLink,
  RefreshCw,
  LayoutGrid,
  List,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { subjectApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export function generateSubjectCode(name) {
  if (!name || !name.trim()) return '';
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = clean.length >= 4 ? clean.slice(0, 4) : (clean + 'SUBJ').slice(0, 4);
  const randNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randNum}`;
}

const DAYS_OF_WEEK = [
  { value: 'Mon', label: 'Mon (Monday)' },
  { value: 'Tue', label: 'Tue (Tuesday)' },
  { value: 'Wed', label: 'Wed (Wednesday)' },
  { value: 'Thu', label: 'Thu (Thursday)' },
  { value: 'Fri', label: 'Fri (Friday)' },
  { value: 'Sat', label: 'Sat (Saturday)' },
  { value: 'Sun', label: 'Sun (Sunday)' },
];

const DAY_PRESETS = [
  { label: 'Mon - Sat', start: 'Mon', end: 'Sat', custom: null },
  { label: 'Mon - Fri', start: 'Mon', end: 'Fri', custom: null },
  { label: 'Mon, Wed, Fri', start: 'Mon', end: 'Fri', custom: 'Mon, Wed, Fri' },
  { label: 'Tue, Thu, Sat', start: 'Tue', end: 'Sat', custom: 'Tue, Thu, Sat' },
  { label: 'Sat - Sun', start: 'Sat', end: 'Sun', custom: null },
  { label: 'Daily', start: 'Mon', end: 'Sun', custom: 'Daily' },
];

function time24To12(time24) {
  if (!time24) return '09:00 AM';
  const parts = time24.split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  if (isNaN(hours)) return '09:00 AM';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  return `${strHours}:${minutes} ${ampm}`;
}

function time12To24(time12) {
  if (!time12) return '09:00';
  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '09:00';
  let [, hStr, mStr, ampm] = match;
  let h = parseInt(hStr, 10);
  if (ampm) {
    const isPM = ampm.toUpperCase() === 'PM';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
  }
  const hh = h < 10 ? `0${h}` : `${h}`;
  return `${hh}:${mStr}`;
}

function parseSchedule(scheduleStr) {
  const defaultState = {
    startDay: 'Mon',
    endDay: 'Sat',
    customDays: '',
    startTime: '09:00',
    endTime: '10:30',
  };

  if (!scheduleStr || typeof scheduleStr !== 'string') {
    return defaultState;
  }

  const s = scheduleStr.trim();
  const timeMatch = s.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);

  let startT = '09:00';
  let endT = '10:30';
  let daysStr = '';

  if (timeMatch) {
    startT = time12To24(timeMatch[1]);
    endT = time12To24(timeMatch[2]);
    daysStr = s.substring(0, timeMatch.index).trim();
  } else {
    daysStr = s;
  }

  const rangeMatch = daysStr.match(/^([A-Za-z]{3})\s*-\s*([A-Za-z]{3})$/);
  if (rangeMatch) {
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    return {
      startDay: capitalize(rangeMatch[1]),
      endDay: capitalize(rangeMatch[2]),
      customDays: '',
      startTime: startT,
      endTime: endT,
    };
  }

  if (daysStr) {
    return {
      startDay: 'Mon',
      endDay: 'Sat',
      customDays: daysStr,
      startTime: startT,
      endTime: endT,
    };
  }

  return {
    ...defaultState,
    startTime: startT,
    endTime: endT,
  };
}

function buildScheduleString(schedState) {
  let daysText = '';
  if (schedState.customDays) {
    daysText = schedState.customDays;
  } else if (schedState.startDay === schedState.endDay) {
    daysText = schedState.startDay;
  } else {
    daysText = `${schedState.startDay}-${schedState.endDay}`;
  }

  const sTime = time24To12(schedState.startTime);
  const eTime = time24To12(schedState.endTime);
  return `${daysText} ${sTime} - ${eTime}`.trim();
}

export default function SubjectsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin, isTeacher } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('subjects_view_mode') || 'table';
    } catch (_) {
      return 'table';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('subjects_view_mode', viewMode);
    } catch (_) {}
  }, [viewMode]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isCustomCode, setIsCustomCode] = useState(false);
  const [scheduleState, setScheduleState] = useState({
    startDay: 'Mon',
    endDay: 'Sat',
    customDays: '',
    startTime: '09:00',
    endTime: '10:30',
  });
  const [formData, setFormData] = useState({
    subject_code: '',
    name: '',
    description: '',
    teacher_id: '',
    hall_number: 'Hall 13',
    schedule: 'Mon-Sat 09:00 AM - 10:30 AM',
    default_fee: '1000.00',
    default_discount_percentage: '10.00',
    status: 'ACTIVE',
  });

  const handleNameChange = (e) => {
    const newName = e.target.value;
    if (!editingSubject && !isCustomCode) {
      const autoCode = generateSubjectCode(newName);
      setFormData((prev) => ({ ...prev, name: newName, subject_code: autoCode }));
    } else {
      setFormData((prev) => ({ ...prev, name: newName }));
    }
  };

  const handleCodeChange = (e) => {
    setIsCustomCode(true);
    setFormData((prev) => ({ ...prev, subject_code: e.target.value.toUpperCase() }));
  };

  const handleRegenerateCode = () => {
    if (formData.name) {
      const code = generateSubjectCode(formData.name);
      setFormData((prev) => ({ ...prev, subject_code: code }));
      setIsCustomCode(false);
    }
  };

  const handleDayChange = (key, val) => {
    const next = {
      ...scheduleState,
      [key]: val,
      customDays: '',
    };
    setScheduleState(next);
    setFormData((prev) => ({
      ...prev,
      schedule: buildScheduleString(next),
    }));
  };

  const handlePresetClick = (preset) => {
    const next = {
      ...scheduleState,
      startDay: preset.start,
      endDay: preset.end,
      customDays: preset.custom || '',
    };
    setScheduleState(next);
    setFormData((prev) => ({
      ...prev,
      schedule: buildScheduleString(next),
    }));
  };

  const handleTimeChange = (key, val) => {
    const next = {
      ...scheduleState,
      [key]: val,
    };
    setScheduleState(next);
    setFormData((prev) => ({
      ...prev,
      schedule: buildScheduleString(next),
    }));
  };

  const loadTeachers = useCallback(async () => {
    try {
      const res = await teacherApi.list({ page_size: 100, status: 'ACTIVE', status_filter: 'ACTIVE' });
      setTeachers(res.items || []);
    } catch (err) {
      console.error('Failed to load teachers:', err);
    }
  }, []);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await subjectApi.list({
        page,
        page_size: 50,
        search: search.trim() || undefined,
        status_filter: statusFilter || undefined,
      });
      setSubjects(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to fetch subjects');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, viewMode]);

  useEffect(() => {
    loadSubjects();
    if (isAdmin) {
      loadTeachers();
    }
  }, [loadSubjects, loadTeachers, isAdmin]);

  const handleOpenAdd = () => {
    setEditingSubject(null);
    setIsCustomCode(false);
    const initialSchedule = {
      startDay: 'Mon',
      endDay: 'Sat',
      customDays: '',
      startTime: '09:00',
      endTime: '10:30',
    };
    setScheduleState(initialSchedule);
    const activeTeachers = teachers.filter((t) => t.status === 'ACTIVE');
    setFormData({
      subject_code: '',
      name: '',
      description: '',
      teacher_id: activeTeachers.length > 0 ? activeTeachers[0].id : '',
      hall_number: 'Hall 13',
      schedule: buildScheduleString(initialSchedule),
      default_fee: '1000.00',
      default_discount_percentage: '10.00',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (s) => {
    setEditingSubject(s);
    setIsCustomCode(true);
    const parsedSched = parseSchedule(s.schedule || 'Mon-Sat 09:00 AM - 10:30 AM');
    setScheduleState(parsedSched);
    setFormData({
      subject_code: s.subject_code,
      name: s.name,
      description: s.description || '',
      teacher_id: s.teacher_id || '',
      hall_number: s.hall_number || 'Main Hall',
      schedule: s.schedule || buildScheduleString(parsedSched),
      default_fee: Number(s.default_fee).toFixed(2),
      default_discount_percentage: s.default_discount_percentage !== undefined && s.default_discount_percentage !== null
        ? Number(s.default_discount_percentage).toFixed(2)
        : '10.00',
      status: s.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Subject name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        subject_code: formData.subject_code.trim().toUpperCase() || undefined,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        teacher_id: formData.teacher_id || null,
        hall_number: formData.hall_number.trim() || 'Main Hall',
        schedule: formData.schedule.trim() || null,
        default_fee: parseFloat(formData.default_fee) || 0,
        default_discount_percentage: formData.default_discount_percentage !== ''
          ? parseFloat(formData.default_discount_percentage)
          : 10.0,
        status: formData.status,
      };

      if (editingSubject) {
        await subjectApi.update(editingSubject.id, payload);
        success(`Subject updated: ${formData.name}`);
      } else {
        const res = await subjectApi.create(payload);
        success(`Subject created: ${res.name}`);
      }

      setModalOpen(false);
      loadSubjects();
    } catch (err) {
      error(err.message || 'Failed to save subject');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Code',
      accessor: 'subject_code',
      className: 'font-mono font-bold text-odoo-700 w-28 whitespace-nowrap',
    },
    {
      header: 'Subject Name',
      render: (s) => (
        <div className="min-w-[160px]">
          <button
            onClick={() => navigate(`/subjects/${s.id}`)}
            className="font-bold text-black text-sm hover:text-odoo-700 transition text-left block"
          >
            {s.name}
          </button>
          {s.description && (
            <span className="text-[11px] text-slate-600 block line-clamp-1 mt-0.5">
              {s.description}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Faculty / Teacher',
      render: (s) => {
        const teacherObj = teachers.find((t) => t.id === s.teacher_id);
        const teacherName = s.teacher_name_snapshot || teacherObj?.name || 'Not Assigned';
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-900 min-w-[140px]">
            <Users className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
            <span className="font-semibold text-black truncate">{teacherName}</span>
          </div>
        );
      },
    },
    {
      header: 'Classroom / Hall',
      className: 'w-32 whitespace-nowrap',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-900">
          <MapPin className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
          <span className="font-medium text-black">{s.hall_number || 'Main Hall'}</span>
        </div>
      ),
    },
    {
      header: 'Schedule / Timing',
      className: 'w-44 whitespace-nowrap',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-900">
          <Clock className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
          <span className="font-mono text-xs text-black">{s.schedule || 'Flexible'}</span>
        </div>
      ),
    },
    {
      header: 'Monthly Fee & Disc.',
      className: 'text-right font-mono font-bold text-black w-36 whitespace-nowrap',
      render: (s) => (
        <div>
          <div className="font-mono font-bold text-emerald-800 text-sm">
            ₹{Number(s.default_fee).toFixed(2)}{' '}
            <span className="text-[10px] text-slate-600 font-sans font-normal">/mo</span>
          </div>
          {Number(s.default_discount_percentage) > 0 && (
            <span className="inline-block text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 font-sans font-semibold mt-0.5">
              {Number(s.default_discount_percentage).toFixed(0)}% Disc.
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      className: 'text-center w-24 whitespace-nowrap',
      render: (s) => (
        <Badge size="xs" variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {s.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-40 whitespace-nowrap',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {isAdmin && (
            <Button
              size="xs"
              variant="amber"
              icon={Edit2}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEdit(s);
              }}
              title="Edit Subject"
            >
              Edit
            </Button>
          )}
          <Button
            size="xs"
            variant="info"
            icon={ExternalLink}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/subjects/${s.id}`);
            }}
            title="Open Subject Roster"
          >
            Detail
          </Button>
        </div>
      ),
    },
  ];

  const kanbanPageSize = 50;
  const kanbanTotalPages = Math.max(1, Math.ceil(total / kanbanPageSize));

  return (
    <div className="space-y-4">
      {/* Odoo Control Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {isTeacher ? 'Assigned Subjects & Rosters' : 'Institute Subjects & Courses'}
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            {isTeacher
              ? 'Your assigned teaching subjects, classroom halls, timings, and enrolled students.'
              : 'Manage subject catalog with assigned faculty, classroom halls, timings, and standard fees.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle - Odoo style matching Students page */}
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'table'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-700 hover:text-black'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('kanban');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-700 hover:text-black'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-black focus:outline-none focus:border-odoo-600 min-h-[34px] w-full sm:w-auto shadow-2xs"
          >
            <option value="">All Subjects</option>
            <option value="ACTIVE">Active Subjects</option>
            <option value="INACTIVE">Inactive Subjects</option>
          </select>

          {isAdmin && (
            <Button variant="primary" icon={Plus} onClick={handleOpenAdd} className="w-full sm:w-auto h-9">
              New Subject
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={subjects}
          total={total}
          page={page}
          pageSize={50}
          alwaysShowPagination
          onPageChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          onRefresh={loadSubjects}
          loading={loading}
          onRowClick={(s) => navigate(`/subjects/${s.id}`)}
          searchPlaceholder="Search by subject, code, class, faculty or hall..."
          emptyMessage="No subjects found."
        />
      ) : (
        /* Odoo Kanban Card Grid View */
        <div className="space-y-4">
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by subject, code, class, faculty or hall..."
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-black placeholder-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs bg-white"
              />
            </div>
            <div className="text-xs text-slate-600 font-medium self-start sm:self-auto">
              Showing <span className="font-bold text-black">{subjects.length}</span> of <span className="font-bold text-black">{total}</span> subjects
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-600 animate-pulse bg-white border border-slate-200 rounded-lg">
              Loading subject cards...
            </div>
          ) : subjects.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
              No subjects found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {subjects.map((s) => {
                const teacherObj = teachers.find((t) => t.id === s.teacher_id);
                const teacherName = s.teacher_name_snapshot || teacherObj?.name || 'Not Assigned';
                return (
                  <div
                    key={s.id}
                    className="bg-white border border-slate-200 hover:border-odoo-300 rounded-lg p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3
                            onClick={() => navigate(`/subjects/${s.id}`)}
                            className="font-bold text-black text-sm hover:text-odoo-700 truncate cursor-pointer transition-colors block"
                            title={s.name}
                          >
                            {s.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[10px] font-bold text-odoo-800 bg-purple-50 border border-odoo-200 px-1.5 py-0.5 rounded-full">
                              {s.subject_code}
                            </span>
                            <Badge size="xs" variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {s.description && (
                        <p className="text-[11px] text-slate-600 mt-2 line-clamp-2">
                          {s.description}
                        </p>
                      )}

                      {/* Key Info Details: Faculty, Hall, Timing, Fee */}
                      <div className="mt-3 space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-semibold flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-odoo-600 shrink-0" /> Teacher:
                          </span>
                          <span className="font-bold text-black truncate max-w-[145px] text-right" title={teacherName}>
                            {teacherName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-semibold flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-odoo-600 shrink-0" /> Classroom:
                          </span>
                          <span className="font-semibold text-zinc-950">
                            {s.hall_number || 'Main Hall'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-odoo-600 shrink-0" /> Timings:
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-zinc-950 truncate max-w-[145px] text-right" title={s.schedule || 'Flexible'}>
                            {s.schedule || 'Flexible'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <span className="text-slate-700 font-semibold">Monthly Fee:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-emerald-800 text-sm">
                              ₹{Number(s.default_fee).toFixed(0)}
                            </span>
                            <span className="text-[10px] text-slate-600 font-normal">/mo</span>
                            {Number(s.default_discount_percentage) > 0 && (
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                                {Number(s.default_discount_percentage).toFixed(0)}% off
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                      {isAdmin && (
                        <Button
                          size="xs"
                          variant="amber"
                          icon={Edit2}
                          onClick={() => handleOpenEdit(s)}
                          className="flex-1 justify-center"
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="info"
                        icon={ExternalLink}
                        onClick={() => navigate(`/subjects/${s.id}`)}
                        className="flex-1 justify-center"
                        title="Open Subject Roster"
                      >
                        Detail
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Kanban Pagination */}
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center justify-between text-xs">
            <span className="text-slate-700">
              Showing <span className="font-bold text-black">{total === 0 ? 0 : (page - 1) * kanbanPageSize + 1}</span> to{' '}
              <span className="font-bold text-black">{Math.min(page * kanbanPageSize, total)}</span> of{' '}
              <span className="font-bold text-black">{total}</span> records •{' '}
              Page <span className="font-bold text-black">{page}</span> of <span className="font-bold text-black">{kanbanTotalPages}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[30px]"
              >
                Previous
              </Button>
              <Button
                size="xs"
                variant="secondary"
                disabled={page >= kanbanTotalPages}
                onClick={() => setPage((p) => Math.min(kanbanTotalPages, p + 1))}
                className="min-h-[30px]"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Subject Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
        subtitle="Configure subject details, assigned teacher, classroom hall, and fee"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Subject Name *"
            value={formData.name}
            onChange={handleNameChange}
            placeholder="e.g. Higher Mathematics"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-black">
                  Subject Code {editingSubject ? '' : '(Auto-generated)'}
                </label>
                {!editingSubject && (
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="text-[11px] text-odoo-600 hover:text-odoo-800 flex items-center gap-1 font-medium transition cursor-pointer"
                    title="Regenerate random unique code"
                  >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                )}
              </div>
              <Input
                value={formData.subject_code}
                onChange={handleCodeChange}
                placeholder="Auto-generated (e.g. MATH-4821)"
                disabled={!!editingSubject}
                helperText={
                  editingSubject
                    ? 'Subject code cannot be changed once created.'
                    : 'Auto-generated from first 4 characters of name + random number.'
                }
              />
            </div>

            <Select
              label="Assigned Faculty / Teacher"
              value={formData.teacher_id}
              onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
              options={[
                { value: '', label: '-- No Teacher Assigned --' },
                ...teachers
                  .filter((t) => t.status === 'ACTIVE' || t.id === formData.teacher_id)
                  .map((t) => ({
                    value: t.id,
                    label: `${t.name} (${t.specialization || 'Faculty'})${t.status === 'INACTIVE' ? ' [Inactive]' : ''}`,
                  })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Classroom / Hall No."
              value={formData.hall_number}
              onChange={(e) => setFormData({ ...formData, hall_number: e.target.value })}
              placeholder="e.g. Hall 13, Room 102"
              required
            />

            <Input
              label="Monthly Subject Fee (₹ / Month) *"
              type="number"
              step="0.01"
              value={formData.default_fee}
              onChange={(e) => setFormData({ ...formData, default_fee: e.target.value })}
              placeholder="1000.00"
              required
            />
          </div>

          {/* Choosable Schedule & Timings Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-odoo-600 shrink-0" />
                Schedule & Timings (Days & Hours)
              </span>
              <span className="text-xs font-mono font-semibold text-odoo-700 bg-purple-50 border border-odoo-200 px-2 py-0.5 rounded shadow-2xs self-start sm:self-auto">
                {formData.schedule || 'Not scheduled'}
              </span>
            </div>

            {/* Quick Day Presets */}
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">
                Quick Day Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAY_PRESETS.map((preset) => {
                  const isActive =
                    (preset.custom && scheduleState.customDays === preset.custom) ||
                    (!preset.custom &&
                      !scheduleState.customDays &&
                      scheduleState.startDay === preset.start &&
                      scheduleState.endDay === preset.end);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePresetClick(preset)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition cursor-pointer ${
                        isActive
                          ? 'bg-odoo-600 text-white border-odoo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day Dropdowns: Starting Day -> To Day */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Starting Day (From)
                </label>
                <select
                  value={scheduleState.startDay}
                  onChange={(e) => handleDayChange('startDay', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-sm font-medium"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  To Day (Ending)
                </label>
                <select
                  value={scheduleState.endDay}
                  onChange={(e) => handleDayChange('endDay', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-sm font-medium"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time Pickers: Starting Time -> To Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Starting Time (From)
                </label>
                <input
                  type="time"
                  value={scheduleState.startTime}
                  onChange={(e) => handleTimeChange('startTime', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-sm"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block font-mono">
                  From: <strong>{time24To12(scheduleState.startTime)}</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  To Time (Ending)
                </label>
                <input
                  type="time"
                  value={scheduleState.endTime}
                  onChange={(e) => handleTimeChange('endTime', e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-sm"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block font-mono">
                  To: <strong>{time24To12(scheduleState.endTime)}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Optional Discount (%)"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.default_discount_percentage}
              onChange={(e) => setFormData({ ...formData, default_discount_percentage: e.target.value })}
              placeholder="10.00"
            />

            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active Subject' },
                { value: 'INACTIVE', label: 'Inactive / Archived' },
              ]}
            />
          </div>

          <Input
            label="Description / Syllabus Scope (Optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g. Covers Trigonometry, Calculus & Algebra"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingSubject ? 'Save Changes' : 'Create Subject'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
