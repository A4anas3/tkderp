import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, BookOpen, Users, MapPin, Clock, School, Calendar, ExternalLink, RefreshCw } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { subjectApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

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
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
      const res = await teacherApi.list({ page_size: 100, status_filter: 'ACTIVE' });
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
        page_size: 15,
        search: search.trim() || undefined,
      });
      setSubjects(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to fetch subjects');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadSubjects();
    loadTeachers();
  }, [loadSubjects, loadTeachers]);

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
    setFormData({
      subject_code: '',
      name: '',
      description: '',
      teacher_id: teachers.length > 0 ? teachers[0].id : '',
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
      className: 'font-mono font-bold text-indigo-700 w-28',
    },
    {
      header: 'Subject Name',
      render: (s) => (
        <div>
          <span className="font-bold text-black text-sm block">{s.name}</span>
          {s.description && (
            <span className="text-[11px] text-slate-500 block">
              {s.description}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Assigned Faculty',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Users className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
          <span className="font-medium text-black">
            {s.teacher_name_snapshot || 'Not Assigned'}
          </span>
        </div>
      ),
    },
    {
      header: 'Classroom / Hall',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>{s.hall_number || 'Main Hall'}</span>
        </div>
      ),
    },
    {
      header: 'Schedule / Timing',
      render: (s) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>{s.schedule || 'Flexible'}</span>
        </div>
      ),
    },
    {
      header: 'Monthly Fee & Disc.',
      className: 'text-right font-mono font-bold text-black w-32',
      render: (s) => (
        <div>
          <div>
            ₹{Number(s.default_fee).toFixed(2)}{' '}
            <span className="text-[10px] text-slate-500 font-sans font-normal">/mo</span>
          </div>
          {Number(s.default_discount_percentage) > 0 && (
            <span className="inline-block text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-sans font-semibold">
              {Number(s.default_discount_percentage).toFixed(0)}% Disc.
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      className: 'text-center w-24',
      render: (s) => (
        <Badge size="xs" variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {s.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-44',
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="secondary"
            icon={ExternalLink}
            onClick={() => navigate(`/subjects/${s.id}`)}
            title="Open Dedicated Subject Roster Page"
          >
            Detail ↗
          </Button>
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => handleOpenEdit(s)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Institute Subjects & Courses</h1>
          <p className="text-xs text-slate-500">
            Manage subject catalog with assigned faculty, classroom halls, timings, and standard fees. Combine any subjects at purchase time.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
          Add Subject
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={subjects}
        total={total}
        page={page}
        pageSize={15}
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
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium transition cursor-pointer"
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
                ...teachers.map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t.specialization || 'Faculty'})`,
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
                <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                Schedule & Timings (Days & Hours)
              </span>
              <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs self-start sm:self-auto">
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
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
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
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm font-medium"
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
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm font-medium"
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
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
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
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
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
