import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, BookOpen } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function SubjectsPage() {
  const { success, error } = useToast();
  const [subjects, setSubjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    subject_code: '',
    name: '',
    description: '',
    default_fee: '1000.00',
    status: 'ACTIVE',
  });

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
  }, [loadSubjects]);

  const handleOpenAdd = () => {
    setEditingSubject(null);
    setFormData({
      subject_code: '',
      name: '',
      description: '',
      default_fee: '1000.00',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (s) => {
    setEditingSubject(s);
    setFormData({
      subject_code: s.subject_code,
      name: s.name,
      description: s.description || '',
      default_fee: Number(s.default_fee).toFixed(2),
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
        default_fee: parseFloat(formData.default_fee) || 0,
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
          <span className="font-bold text-black block">{s.name}</span>
          <span className="text-[11px] text-slate-500">{s.description || 'No description'}</span>
        </div>
      ),
    },
    {
      header: 'Default Fee (₹)',
      className: 'text-right font-mono font-bold text-black w-32',
      render: (s) => `₹${Number(s.default_fee).toFixed(2)}`,
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
      className: 'text-right w-20',
      render: (s) => (
        <Button
          size="xs"
          variant="secondary"
          icon={Edit2}
          onClick={() => handleOpenEdit(s)}
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
          <h1 className="text-xl font-bold text-black tracking-tight">Institute Subjects</h1>
          <p className="text-xs text-slate-500">
            Define curriculum subjects, default fee benchmarks, and reusable subject catalog
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
        searchPlaceholder="Search subject by name or code..."
        emptyMessage="No subjects found."
      />

      {/* Add / Edit Subject Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
        subtitle="Subjects can be attached to multiple batches with customized fees"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Subject Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Higher Mathematics"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Subject Code"
              value={formData.subject_code}
              onChange={(e) => setFormData({ ...formData, subject_code: e.target.value })}
              placeholder="e.g. SUB_MATH"
            />

            <Input
              label="Default Fee (₹)"
              type="number"
              step="0.01"
              value={formData.default_fee}
              onChange={(e) => setFormData({ ...formData, default_fee: e.target.value })}
              placeholder="1000.00"
              required
            />
          </div>

          <Input
            label="Description / Syllabus Scope (Optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g. Covers Trigonometry, Calculus & Algebra"
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
