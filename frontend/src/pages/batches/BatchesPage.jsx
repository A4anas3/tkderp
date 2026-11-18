import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Calendar,
  MapPin,
  Users,
  Phone,
  BookOpen,
  CheckSquare,
  Square,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { batchApi, teacherApi, subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function BatchesPage() {
  const { success, error } = useToast();
  const [batches, setBatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // References
  const [teachers, setTeachers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    teacher_id: '',
    class_category: 'Class 9-10',
    hall_number: 'Hall 13',
    schedule: 'Mon-Fri 09:00 AM - 11:00 AM',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    status: 'ACTIVE',
  });
  const [selectedSubjects, setSelectedSubjects] = useState({}); // { subject_id: fee }

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await batchApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
      });
      setBatches(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    const fetchReferences = async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          teacherApi.list({ page: 1, page_size: 100 }),
          subjectApi.getAll(),
        ]);
        setTeachers(tRes.items || []);
        setAllSubjects(sRes || []);
      } catch (err) {
        console.error('Failed to load batch references:', err);
      }
    };
    fetchReferences();
  }, []);

  const handleOpenAdd = () => {
    setEditingBatch(null);
    setFormData({
      name: '',
      teacher_id: teachers.length > 0 ? teachers[0].id : '',
      class_category: 'Class 9-10',
      hall_number: 'Hall 13',
      schedule: 'Mon-Fri 09:00 AM - 11:00 AM',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      status: 'ACTIVE',
    });
    // Default select first subject if available
    const initialSub = {};
    if (allSubjects.length > 0) {
      initialSub[allSubjects[0].id] = allSubjects[0].default_fee;
    }
    setSelectedSubjects(initialSub);
    setModalOpen(true);
  };

  const handleOpenEdit = (b) => {
    setEditingBatch(b);
    setFormData({
      name: b.name,
      teacher_id: b.teacher_id || '',
      class_category: b.class_category,
      hall_number: b.hall_number,
      schedule: b.schedule || '',
      start_date: b.start_date,
      end_date: b.end_date || '',
      status: b.status,
    });
    const subMap = {};
    (b.subjects || []).forEach((bs) => {
      subMap[bs.subject_id] = bs.fee;
    });
    setSelectedSubjects(subMap);
    setModalOpen(true);
  };

  const handleSubjectToggle = (subj) => {
    setSelectedSubjects((prev) => {
      const next = { ...prev };
      if (next[subj.id] !== undefined) {
        delete next[subj.id];
      } else {
        next[subj.id] = subj.default_fee;
      }
      return next;
    });
  };

  const handleSubjectFeeChange = (subjId, feeVal) => {
    setSelectedSubjects((prev) => ({
      ...prev,
      [subjId]: feeVal,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.hall_number.trim()) {
      error('Batch name and hall number are required');
      return;
    }

    const subjectItems = Object.entries(selectedSubjects).map(([subjId, fee]) => ({
      subject_id: subjId,
      fee: parseFloat(fee) || 0,
    }));

    if (subjectItems.length === 0) {
      error('Please select at least one subject for this batch');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        teacher_id: formData.teacher_id || null,
        class_category: formData.class_category.trim(),
        hall_number: formData.hall_number.trim(),
        schedule: formData.schedule.trim() || null,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        status: formData.status,
        subjects: subjectItems,
      };

      if (editingBatch) {
        await batchApi.update(editingBatch.id, payload);
        success(`Batch updated: ${formData.name}`);
      } else {
        const res = await batchApi.create(payload);
        success(`Batch created: ${res.batch_code} - ${res.name}`);
      }

      setModalOpen(false);
      loadBatches();
    } catch (err) {
      error(err.message || 'Failed to save batch');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Batch Code',
      accessor: 'batch_code',
      className: 'font-mono font-bold text-indigo-700 w-28',
    },
    {
      header: 'Batch Name & Class',
      render: (b) => (
        <div>
          <span className="font-bold text-black block">{b.name}</span>
          <span className="text-[11px] text-slate-500 font-medium">
            Category: {b.class_category} • {b.schedule || 'Flexible'}
          </span>
        </div>
      ),
    },
    {
      header: 'Assigned Faculty Snapshot',
      render: (b) => (
        <div className="text-xs">
          <span className="font-semibold text-black block">
            {b.teacher_name_snapshot || 'Unassigned'}
          </span>
          {b.teacher_mobile_snapshot && (
            <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" />
              {b.teacher_mobile_snapshot}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Hall Number',
      accessor: 'hall_number',
      className: 'font-medium text-xs w-24',
    },
    {
      header: 'Subjects Included & Fees',
      render: (b) => (
        <div className="flex flex-wrap gap-1">
          {(b.subjects || []).map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded text-[11px]"
            >
              <strong>{s.subject_name}</strong>: ₹{Number(s.fee).toFixed(0)}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      className: 'text-center w-20',
      render: (b) => (
        <Badge
          size="xs"
          variant={
            b.status === 'ACTIVE'
              ? 'success'
              : b.status === 'UPCOMING'
              ? 'primary'
              : 'neutral'
          }
        >
          {b.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-20',
      render: (b) => (
        <Button
          size="xs"
          variant="secondary"
          icon={Edit2}
          onClick={() => handleOpenEdit(b)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Coaching Batches</h1>
          <p className="text-xs text-slate-500">
            Create batches, attach faculty snapshots, schedule halls, and assign subject fees
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
          Add Batch
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={batches}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadBatches}
        loading={loading}
        searchPlaceholder="Search batch by name, hall, or faculty..."
        emptyMessage="No batches found."
      />

      {/* Add / Edit Batch Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBatch ? 'Edit Batch Configuration' : 'Create New Batch'}
        subtitle="Faculty snapshot is automatically preserved without requiring relational joins"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Batch Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. KK Chauhan 9-10"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Assigned Faculty / Teacher
              </label>
              <select
                value={formData.teacher_id}
                onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
              >
                <option value="">Select Faculty...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.specialization})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Class / Category"
              value={formData.class_category}
              onChange={(e) => setFormData({ ...formData, class_category: e.target.value })}
              placeholder="e.g. Class 9-10 / JEE Foundation"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Hall / Classroom Number"
              value={formData.hall_number}
              onChange={(e) => setFormData({ ...formData, hall_number: e.target.value })}
              placeholder="e.g. Hall 13"
              required
            />

            <Input
              label="Class Schedule"
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              placeholder="e.g. Mon-Fri 09:00 AM - 11:00 AM"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Batch Start Date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              required
            />

            <Select
              label="Batch Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active (Running)' },
                { value: 'UPCOMING', label: 'Upcoming (Enrollments open)' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
            />
          </div>

          {/* Multi-Subject Selection with Custom Fee inputs */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-black">
                Assign Subjects & Custom Fees in this Batch <span className="text-rose-600">*</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {Object.keys(selectedSubjects).length} Selected
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-200 rounded-md">
              {allSubjects.map((s) => {
                const isSelected = selectedSubjects[s.id] !== undefined;
                return (
                  <div
                    key={s.id}
                    className="p-2 flex items-center justify-between text-xs hover:bg-slate-50 transition"
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSubjectToggle(s)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-black">{s.name}</span>
                      <span className="text-[10px] text-slate-400">({s.subject_code})</span>
                    </label>

                    {isSelected && (
                      <div className="flex items-center gap-1.5 w-32">
                        <span className="text-slate-500 text-xs font-mono">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={selectedSubjects[s.id] ?? s.default_fee}
                          onChange={(e) => handleSubjectFeeChange(s.id, e.target.value)}
                          placeholder="Fee"
                          className="w-full text-xs font-mono font-bold text-black border border-slate-300 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-600"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingBatch ? 'Save Batch' : 'Create Batch'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
