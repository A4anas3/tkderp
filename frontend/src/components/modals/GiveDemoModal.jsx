import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  User,
  MapPin,
  Calendar,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { studentApi, subjectApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysISO(dateStr, days) {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + (Number(days) || 0));
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDaysISO(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const sParts = startStr.split('-').map(Number);
  const eParts = endStr.split('-').map(Number);
  if (sParts.length !== 3 || eParts.length !== 3) return 0;
  const s = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const e = new Date(eParts[0], eParts[1] - 1, eParts[2]);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

export default function GiveDemoModal({
  isOpen,
  onClose,
  student,
  onSuccess,
}) {
  const { success, error } = useToast();

  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [availableTeachers, setAvailableTeachers] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [purpose, setPurpose] = useState('Trial Demo');
  const [notes, setNotes] = useState('');
  const [demoCart, setDemoCart] = useState([]);
  const [cartDraft, setCartDraft] = useState(() => {
    const today = getTodayISO();
    return {
      subject_id: '',
      teacher_id: '',
      hall_number_snapshot: 'Main Hall',
      demo_start_date: today,
      demo_duration_days: 3,
      demo_end_date: addDaysISO(today, 3),
    };
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const today = getTodayISO();
    setPurpose('Trial Demo');
    setNotes('');
    setDemoCart([]);
    setCartDraft({
      subject_id: '',
      teacher_id: '',
      hall_number_snapshot: 'Main Hall',
      demo_start_date: today,
      demo_duration_days: 3,
      demo_end_date: addDaysISO(today, 3),
    });

    let cancelled = false;
    setCatalogLoading(true);
    Promise.all([
      subjectApi.getAll({ all_institute: true }),
      teacherApi.getAll(),
    ])
      .then(([subs, teachers]) => {
        if (cancelled) return;
        setAvailableSubjects(subs || []);
        setAvailableTeachers(teachers || []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Failed to load subjects or teachers:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubjectChange = (subjectId) => {
    const foundSub = availableSubjects.find((s) => s.id === subjectId);
    if (foundSub) {
      setCartDraft((prev) => ({
        ...prev,
        subject_id: subjectId,
        teacher_id: foundSub.teacher_id || '',
        hall_number_snapshot: foundSub.hall_number || 'Main Hall',
      }));
    } else {
      setCartDraft((prev) => ({ ...prev, subject_id: subjectId }));
    }
  };

  const handleStartDateChange = (newStart) => {
    setCartDraft((prev) => {
      const duration = Math.max(1, parseInt(prev.demo_duration_days, 10) || 3);
      return {
        ...prev,
        demo_start_date: newStart,
        demo_end_date: newStart ? addDaysISO(newStart, duration) : '',
      };
    });
  };

  const handleDurationChange = (rawDays) => {
    const parsed = parseInt(rawDays, 10);
    const clamped = Number.isNaN(parsed) ? 1 : Math.min(30, Math.max(1, parsed));
    setCartDraft((prev) => ({
      ...prev,
      demo_duration_days: clamped,
      demo_end_date: prev.demo_start_date
        ? addDaysISO(prev.demo_start_date, clamped)
        : prev.demo_end_date,
    }));
  };

  const handleEndDateChange = (newEnd) => {
    setCartDraft((prev) => {
      const diff = diffDaysISO(prev.demo_start_date, newEnd);
      return {
        ...prev,
        demo_end_date: newEnd,
        demo_duration_days: diff >= 1 ? Math.min(30, diff) : prev.demo_duration_days,
      };
    });
  };

  const buildCartItem = (draft) => {
    const foundSub = availableSubjects.find((s) => s.id === draft.subject_id);
    const foundTeacher = availableTeachers.find((t) => t.id === draft.teacher_id);
    const startDate = draft.demo_start_date || getTodayISO();
    const duration = Math.min(30, Math.max(1, parseInt(draft.demo_duration_days, 10) || 3));
    const endDate = draft.demo_end_date || addDaysISO(startDate, duration);

    return {
      tempId: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subject_id: draft.subject_id,
      subject_name_snapshot: foundSub?.name || 'Academic Subject',
      teacher_id: draft.teacher_id || foundSub?.teacher_id || null,
      teacher_name_snapshot:
        foundTeacher?.name || foundSub?.teacher_name_snapshot || null,
      hall_number_snapshot:
        (draft.hall_number_snapshot || '').trim() ||
        foundSub?.hall_number ||
        'Main Hall',
      demo_start_date: startDate,
      demo_end_date: endDate,
      demo_duration_days: duration,
      notes: notes.trim() || null,
    };
  };

  const validateDraft = (draft) => {
    if (!draft.subject_id) {
      error('Please select a trial subject');
      return false;
    }
    if (!draft.demo_start_date) {
      error('Please select a demo start date');
      return false;
    }
    if (draft.demo_end_date && draft.demo_end_date < draft.demo_start_date) {
      error('Demo end date cannot be before start date');
      return false;
    }
    const diff = draft.demo_end_date
      ? diffDaysISO(draft.demo_start_date, draft.demo_end_date)
      : draft.demo_duration_days;
    if (diff > 30) {
      error('Demo duration cannot exceed 30 days');
      return false;
    }
    return true;
  };

  const handleAddSubjectToCart = () => {
    if (!validateDraft(cartDraft)) return;
    if (demoCart.some((item) => item.subject_id === cartDraft.subject_id)) {
      error('This subject is already in the demo list');
      return;
    }
    const newItem = buildCartItem(cartDraft);
    setDemoCart((prev) => [...prev, newItem]);
    setCartDraft((prev) => ({
      ...prev,
      subject_id: '',
      teacher_id: '',
      hall_number_snapshot: 'Main Hall',
    }));
    success(`Added ${newItem.subject_name_snapshot} to demo list`);
  };

  const handleRemoveCartItem = (tempId) => {
    setDemoCart((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!student?.id) return;

    let itemsToSubmit = [...demoCart];

    if (cartDraft.subject_id) {
      if (!validateDraft(cartDraft)) return;
      const alreadyInCart = itemsToSubmit.some(
        (item) => item.subject_id === cartDraft.subject_id
      );
      if (!alreadyInCart) {
        itemsToSubmit.push(buildCartItem(cartDraft));
      }
    }

    if (itemsToSubmit.length === 0) {
      error('Please select at least one subject to give a demo');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        purpose: purpose.trim() || 'Trial Demo',
        notes: notes.trim() || null,
        demo_items: itemsToSubmit.map((item) => ({
          subject_id: item.subject_id,
          teacher_id: item.teacher_id || null,
          subject_name_snapshot: item.subject_name_snapshot,
          teacher_name_snapshot: item.teacher_name_snapshot,
          hall_number_snapshot: item.hall_number_snapshot,
          demo_start_date: item.demo_start_date,
          demo_end_date: item.demo_end_date,
          demo_duration_days: item.demo_duration_days,
          notes: item.notes || null,
        })),
      };

      const res = await studentApi.giveDemo(student.id, payload);
      const count = res?.demo_items?.length || itemsToSubmit.length;
      const refPreview = res?.demo_items?.[0]?.demo_reference_number;
      success(
        `Demo ${refPreview ? `(${refPreview}${count > 1 ? ` +${count - 1} more` : ''}) ` : ''}created for ${student.name}!`
      );
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      error(err?.response?.data?.detail || err?.message || 'Failed to give demo');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !student) return null;

  const totalPendingCount =
    demoCart.length +
    (cartDraft.subject_id &&
    !demoCart.some((i) => i.subject_id === cartDraft.subject_id)
      ? 1
      : 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Give Trial Demo"
      subtitle={`Assign classroom demo for ${student.name} (${student.student_code})`}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Already Registered Student Banner */}
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-emerald-950 text-sm truncate">
                  {student.name}
                </span>
                <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300 text-[11px]">
                  {student.student_code}
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Mobile: <span className="font-mono">{student.mobile || '—'}</span>
                {student.father_name && ` • Father: ${student.father_name}`}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 shrink-0">
            ✓ Registered Student
          </span>
        </div>

        {/* Purpose */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
          <Input
            label="Purpose / Target Class"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Trial Demo / Class 10 Foundation"
          />
        </div>

        {/* Subject, Teacher, Hall & Demo Dates */}
        <div className="bg-white p-3.5 rounded-xl border-2 border-purple-100 space-y-3">
          <div className="flex items-center justify-between border-b border-purple-50 pb-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-odoo-600" />
              <h4 className="font-bold text-black text-xs uppercase tracking-wider">
                Demo Class Details
              </h4>
            </div>
            {demoCart.length > 0 && (
              <span className="text-[10px] font-bold text-odoo-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                {demoCart.length} Subject(s) Added
              </span>
            )}
          </div>

          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Select Trial Subject *
                </label>
                <select
                  value={cartDraft.subject_id}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  disabled={catalogLoading}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                >
                  <option value="">
                    {catalogLoading ? 'Loading subjects...' : '-- Choose Subject to Demo --'}
                  </option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.subject_code || 'SUB'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Faculty / Teacher Assigned
                </label>
                <select
                  value={cartDraft.teacher_id}
                  onChange={(e) =>
                    setCartDraft((prev) => ({ ...prev, teacher_id: e.target.value }))
                  }
                  disabled={catalogLoading}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                >
                  <option value="">-- Select Teacher --</option>
                  {availableTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Hall / Room
                </label>
                <input
                  type="text"
                  value={cartDraft.hall_number_snapshot}
                  onChange={(e) =>
                    setCartDraft((prev) => ({
                      ...prev,
                      hall_number_snapshot: e.target.value,
                    }))
                  }
                  placeholder="e.g. Main Hall"
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Demo Start Date *
                </label>
                <input
                  type="date"
                  value={cartDraft.demo_start_date}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={cartDraft.demo_duration_days}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Demo End Date
                </label>
                <input
                  type="date"
                  value={cartDraft.demo_end_date}
                  min={cartDraft.demo_start_date || undefined}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg text-black font-semibold focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                icon={Plus}
                onClick={handleAddSubjectToCart}
                disabled={!cartDraft.subject_id}
              >
                Add Another Subject
              </Button>
            </div>
          </div>

          {demoCart.length > 0 && (
            <div className="space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-white">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Queued Demo Subjects (Each receives a unique DEM-ID):
              </span>
              <div className="divide-y divide-slate-100">
                {demoCart.map((item, index) => (
                  <div
                    key={item.tempId}
                    className="py-2 px-1.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 rounded"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-odoo-700 bg-purple-50 px-1.5 py-0.2 rounded text-[10px] border border-purple-200">
                          #{index + 1}
                        </span>
                        <span className="font-bold text-black truncate">
                          {item.subject_name_snapshot}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <strong className="text-slate-700">
                            {item.teacher_name_snapshot || 'Assigned Faculty'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <strong className="text-slate-700">{item.hall_number_snapshot}</strong>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3" />
                          {item.demo_start_date} → {item.demo_end_date} ({item.demo_duration_days}d)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveCartItem(item.tempId)}
                      className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                      title="Remove subject"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <Input
          label="Notes / Remarks (Optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Existing student trying out Physics morning batch"
        />

        {/* Footer Actions */}
        <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={Sparkles}
            loading={submitting}
            disabled={submitting || totalPendingCount === 0}
          >
            {totalPendingCount > 1
              ? `Give Demo (${totalPendingCount} Subjects)`
              : 'Give Demo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
