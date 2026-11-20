import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, UserCheck, UserX, Phone, Mail, Award, BookOpen, ExternalLink } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import TeacherDetailModal from '../../components/modals/TeacherDetailModal';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { cleanMobileInput } from '../../utils/phoneUtils';

export default function TeachersPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [detailTeacher, setDetailTeacher] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    qualification: '',
    specialization: '',
    joining_date: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
  });

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teacherApi.list({ page, page_size: 15, search: search.trim() || undefined });
      setTeachers(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to fetch teachers');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setFormData({
      name: '',
      mobile: '',
      email: '',
      qualification: '',
      specialization: '',
      joining_date: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTeacher(t);
    setFormData({
      name: t.name,
      mobile: t.mobile,
      email: t.email || '',
      qualification: t.qualification,
      specialization: t.specialization,
      joining_date: t.joining_date,
      status: t.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.mobile.trim()) {
      error('Teacher name and mobile number are required');
      return;
    }

    const cleanMob = cleanMobileInput(formData.mobile);
    if (!cleanMob || cleanMob.length !== 10) {
      error('Mobile number must be exactly 10 numeric digits');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        mobile: cleanMob,
        email: formData.email.trim() || null,
        qualification: formData.qualification.trim(),
        specialization: formData.specialization.trim(),
        joining_date: formData.joining_date,
        status: formData.status,
      };

      if (editingTeacher) {
        await teacherApi.update(editingTeacher.id, payload);
        success(`Teacher updated: ${formData.name}`);
      } else {
        const res = await teacherApi.create(payload);
        success(`Teacher added: ${res.teacher_code} - ${formData.name}`);
      }

      setModalOpen(false);
      loadTeachers();
    } catch (err) {
      error(err.message || 'Failed to save teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Code',
      accessor: 'teacher_code',
      className: 'font-mono font-bold text-indigo-700 w-24',
    },
    {
      header: 'Faculty Name',
      render: (t) => (
        <div>
          <span className="font-bold text-black block">{t.name}</span>
          <span className="text-[11px] text-slate-500">{t.specialization}</span>
        </div>
      ),
    },
    {
      header: 'Contact Info',
      render: (t) => (
        <div className="space-y-0.5 text-xs text-slate-700">
          <div className="flex items-center gap-1 font-mono">
            <Phone className="w-3 h-3 text-slate-400" /> {t.mobile}
          </div>
          {t.email && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Mail className="w-3 h-3 text-slate-400" /> {t.email}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Qualification',
      accessor: 'qualification',
      className: 'text-xs text-slate-600',
    },
    {
      header: 'Joining Date',
      accessor: 'joining_date',
      className: 'font-mono text-xs w-28',
    },
    {
      header: 'Status',
      className: 'text-center w-20',
      render: (t) => (
        <Badge size="xs" variant={t.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-44',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="secondary"
            icon={ExternalLink}
            onClick={() => navigate(`/teachers/${t.id}`)}
            title="Open Dedicated Faculty Roster Page"
          >
            Detail ↗
          </Button>
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => handleOpenEdit(t)}
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
          <h1 className="text-xl font-bold text-black tracking-tight">Faculty & Teachers</h1>
          <p className="text-xs text-slate-500">
            Manage coaching teaching staff, credentials, and batch assignments
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
          Add Teacher
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={teachers}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadTeachers}
        loading={loading}
        onRowClick={(t) => navigate(`/teachers/${t.id}`)}
        searchPlaceholder="Search teacher by name or mobile..."
        emptyMessage="No faculty records found."
      />

      {/* Add / Edit Teacher Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTeacher ? 'Edit Faculty Details' : 'Add New Teacher'}
        subtitle="Teaching faculty details are snapshotted in batches and admissions"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Teacher Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. K.K. Chauhan"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Mobile Number"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: cleanMobileInput(e.target.value) })}
              placeholder="10-digit mobile"
              required
              error={
                formData.mobile && formData.mobile.length < 10
                  ? `Must be 10 digits (${formData.mobile.length}/10)`
                  : null
              }
              helperText={
                formData.mobile && formData.mobile.length === 10
                  ? '✓ Valid 10-digit mobile'
                  : '10-digit mobile number'
              }
            />
            <Input
              label="Email (Optional)"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. teacher@gmail.com"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Qualification"
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              placeholder="e.g. M.Sc. Mathematics, B.Ed."
              required
            />
            <Input
              label="Specialization / Subject"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              placeholder="e.g. Higher Secondary Mathematics"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Joining Date"
              type="date"
              value={formData.joining_date}
              onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
              required
            />
            <Select
              label="Account Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active Faculty' },
                { value: 'INACTIVE', label: 'Inactive / On Leave' },
              ]}
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting || formData.mobile.length !== 10}
            >
              {formData.mobile.length !== 10
                ? 'Enter 10-Digit Mobile'
                : editingTeacher
                ? 'Save Changes'
                : 'Register Faculty'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Teacher Detail Modal */}
      <TeacherDetailModal
        isOpen={!!detailTeacher}
        onClose={() => setDetailTeacher(null)}
        teacher={detailTeacher}
        onEditTeacher={(t) => handleOpenEdit(t)}
        onViewRoster={(t) => navigate('/reports/subject-revenue')}
      />
    </div>
  );
}
