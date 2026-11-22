import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutGrid,
  List,
  Plus,
  Edit2,
  Calendar,
  MapPin,
  Users,
  Phone,
  BookOpen,
  CheckSquare,
  Square,
  Building,
  UserCheck,
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
  const [viewMode, setViewMode] = useState('table');

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
  // selectedSubjects: { [subject_id]: { fee: number, teacher_id: string, hall_number: string } }
  const [selectedSubjects, setSelectedSubjects] = useState({});

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
    const defaultTeacherId = teachers.length > 0 ? teachers[0].id : '';
    setFormData({
      name: '',
      teacher_id: defaultTeacherId,
      class_category: 'Class 9-10',
      hall_number: 'Hall 13',
      schedule: 'Mon-Fri 09:00 AM - 11:00 AM',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      status: 'ACTIVE',
    });

    const initialSub = {};
    if (allSubjects.length > 0) {
      initialSub[allSubjects[0].id] = {
        fee: allSubjects[0].default_fee,
        teacher_id: defaultTeacherId,
        hall_number: 'Hall 13',
      };
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
      subMap[bs.subject_id] = {
        fee: bs.fee,
        teacher_id: bs.teacher_id || b.teacher_id || '',
        hall_number: bs.hall_number || b.hall_number || 'Hall 13',
      };
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
        next[subj.id] = {
          fee: subj.default_fee,
          teacher_id: formData.teacher_id || '',
          hall_number: formData.hall_number || 'Hall 13',
        };
      }
      return next;
    });
  };

  const handleSubjectFieldChange = (subjId, field, val) => {
    setSelectedSubjects((prev) => ({
      ...prev,
      [subjId]: {
        ...(prev[subjId] || {}),
        [field]: val,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.hall_number.trim()) {
      error('Batch name and default hall number are required');
      return;
    }

    const subjectItems = Object.entries(selectedSubjects).map(([subjId, conf]) => ({
      subject_id: subjId,
      fee: parseFloat(conf.fee) || 0,
      teacher_id: conf.teacher_id || formData.teacher_id || null,
      hall_number: conf.hall_number?.trim() || formData.hall_number.trim(),
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
      className: 'font-mono font-bold text-odoo-700 w-28',
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
      header: 'Assigned Faculty',
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
      header: 'Default Hall',
      accessor: 'hall_number',
      className: 'font-medium text-xs w-24',
    },
    {
      header: 'Subjects, Teachers & Halls',
      render: (b) => (
        <div className="flex flex-wrap gap-1.5 max-w-md">
          {(b.subjects || []).map((s) => (
            <span
              key={s.id}
              className="inline-flex flex-col bg-slate-50 border border-slate-300 text-black px-2 py-1 rounded text-[11px] shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-odoo-900">{s.subject_name}</strong>
                <span className="font-mono font-bold text-emerald-800">₹{Number(s.fee).toFixed(0)}</span>
              </div>
              <div className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
                <span>{s.teacher_name_snapshot || b.teacher_name_snapshot}</span>
                <span>•</span>
                <span className="font-semibold text-black">{s.hall_number || b.hall_number}</span>
              </div>
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
      className: 'text-right w-24 whitespace-nowrap',
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => handleOpenEdit(b)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Odoo Control Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Coaching Batches</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create batches combining subjects, assign specific teachers & hall numbers per subject, and preserve snapshots
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle - Odoo style */}
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 shadow-2xs">
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'table'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-odoo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          <Button variant="primary" icon={Plus} onClick={handleOpenAdd} className="w-full sm:w-auto h-9">
            New Batch
          </Button>
        </div>
      </div>

      {viewMode === 'table' ? (
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
      ) : (
        /* Odoo Kanban Card Grid View */
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70">
            <div className="w-full sm:max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search batch by name, hall, or faculty..."
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-black placeholder-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-semibold text-black">{batches.length}</span> of <span className="font-semibold text-black">{total}</span> batches
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 animate-pulse bg-white border border-slate-200 rounded-lg">
              Loading batch cards...
            </div>
          ) : batches.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
              No batches found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 hover:border-odoo-300 rounded-lg p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-black text-sm truncate" title={b.name}>
                          {b.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-mono text-[10px] font-bold text-odoo-800 bg-purple-50 border border-odoo-200 px-1.5 py-0.2 rounded-full">
                            {b.batch_code}
                          </span>
                          <Badge size="xs" variant={b.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {b.status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 font-bold">Category:</span>
                        <span className="font-semibold text-black">{b.class_category}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 font-bold">Faculty:</span>
                        <span className="font-semibold text-black truncate max-w-[140px]">
                          {b.teacher_name_snapshot || 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 font-bold">Hall:</span>
                        <span className="text-slate-900 font-semibold">{b.hall_number || 'Hall 13'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 font-bold">Schedule:</span>
                        <span className="text-slate-900 font-semibold truncate max-w-[140px]">{b.schedule || 'Flexible'}</span>
                      </div>

                      {/* Included Subjects */}
                      {(b.subjects || []).length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <span className="text-[10px] font-black uppercase text-slate-700 block mb-1">
                            Subjects ({b.subjects.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {b.subjects.map((sub, sIdx) => (
                              <span
                                key={sIdx}
                                className="inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-medium text-black"
                              >
                                <span>{sub.subject_name}</span>
                                <span className="text-emerald-800 font-bold font-mono">₹{Number(sub.fee).toFixed(0)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={Edit2}
                      onClick={() => handleOpenEdit(b)}
                      className="w-full justify-center"
                    >
                      Edit Configuration
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {Math.ceil(total / 15) > 1 && (
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Page <span className="font-semibold text-black">{page}</span> of <span className="font-semibold text-black">{Math.ceil(total / 15)}</span>
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
                  disabled={page >= Math.ceil(total / 15)}
                  onClick={() => setPage((p) => Math.min(Math.ceil(total / 15), p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Batch Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBatch ? 'Edit Batch Configuration' : 'Create New Batch'}
        subtitle="Classes happen in different halls with different faculty. Snapshots are stored cleanly without joins."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Batch Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. KK Chauhan Foundation 9-10"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Primary Batch Coordinator / Teacher
              </label>
              <select
                value={formData.teacher_id}
                onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-black focus:outline-none focus:border-odoo-600"
              >
                <option value="">-- Select Faculty --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.teacher_code})
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
              label="Default Hall / Classroom Number"
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

          {/* Flexible Subject Configuration (Fee, Faculty, Hall Number per subject) */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black block">
                  Select Subjects, Faculty & Hall Numbers <span className="text-rose-600">*</span>
                </label>
                <span className="text-[11px] text-slate-500">
                  Assign each subject its specific teacher and hall number where classes take place
                </span>
              </div>
              <span className="text-xs bg-purple-100 text-odoo-900 font-bold px-2 py-0.5 rounded">
                {Object.keys(selectedSubjects).length} Selected
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-200 rounded-md">
              {allSubjects.map((s) => {
                const conf = selectedSubjects[s.id];
                const isSelected = conf !== undefined;
                return (
                  <div
                    key={s.id}
                    className={`p-2.5 text-xs transition ${isSelected ? 'bg-purple-50/30' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSubjectToggle(s)}
                          className="rounded border-slate-300 text-odoo-600 focus:ring-odoo-500"
                        />
                        <span className="font-bold text-black text-sm">{s.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">({s.subject_code})</span>
                      </label>

                      {isSelected && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-600 text-xs font-mono font-bold">Fee ₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={conf.fee ?? s.default_fee}
                            onChange={(e) => handleSubjectFieldChange(s.id, 'fee', e.target.value)}
                            className="w-24 text-xs font-mono font-bold text-black border border-slate-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-odoo-600"
                          />
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Faculty / Teacher:
                          </label>
                          <select
                            value={conf.teacher_id || ''}
                            onChange={(e) => handleSubjectFieldChange(s.id, 'teacher_id', e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white text-black font-medium focus:outline-none focus:border-odoo-600"
                          >
                            <option value="">-- Batch Main Coordinator --</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Hall / Room Number:
                          </label>
                          <input
                            type="text"
                            value={conf.hall_number || ''}
                            onChange={(e) => handleSubjectFieldChange(s.id, 'hall_number', e.target.value)}
                            placeholder="e.g. Hall 1, Room 102"
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white text-black font-medium focus:outline-none focus:border-odoo-600"
                          />
                        </div>
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
