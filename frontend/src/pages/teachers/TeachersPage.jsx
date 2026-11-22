import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, UserCheck, UserX, Phone, Mail, Award, BookOpen, ExternalLink, Camera, X, AlertTriangle, LayoutGrid, List } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Avatar from '../../components/common/Avatar';
import TeacherDetailModal from '../../components/modals/TeacherDetailModal';
import { teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { compressImage } from '../../utils/imageCompressor';

export default function TeachersPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [detailTeacher, setDetailTeacher] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Photo Upload State
  const [compressing, setCompressing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(null);

  // Mobile Uniqueness Check State
  const [existingTeacherWithMobile, setExistingTeacherWithMobile] = useState(null);
  const [checkingMobile, setCheckingMobile] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    qualification: '',
    specialization: '',
    photo_url: null,
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

  // Check mobile uniqueness whenever mobile reaches 10 digits
  useEffect(() => {
    const cleanMob = cleanMobileInput(formData.mobile);
    if (cleanMob.length === 10) {
      let isCurrent = true;
      setCheckingMobile(true);
      teacherApi
        .getByMobile(cleanMob)
        .then((existing) => {
          if (!isCurrent) return;
          if (existing && (!editingTeacher || existing.id !== editingTeacher.id)) {
            setExistingTeacherWithMobile(existing);
          } else {
            setExistingTeacherWithMobile(null);
          }
        })
        .catch(() => {
          if (isCurrent) setExistingTeacherWithMobile(null);
        })
        .finally(() => {
          if (isCurrent) setCheckingMobile(false);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setExistingTeacherWithMobile(null);
    }
  }, [formData.mobile, editingTeacher]);

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoSizeKb(null);
    setExistingTeacherWithMobile(null);
    setFormData({
      name: '',
      mobile: '',
      email: '',
      qualification: '',
      specialization: '',
      photo_url: null,
      joining_date: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTeacher(t);
    setPhotoPreview(t.photo_url || null);
    setPhotoFile(null);
    setPhotoSizeKb(null);
    setExistingTeacherWithMobile(null);
    setFormData({
      name: t.name,
      mobile: t.mobile,
      email: t.email || '',
      qualification: t.qualification || '',
      specialization: t.specialization || '',
      photo_url: t.photo_url || null,
      joining_date: t.joining_date,
      status: t.status,
    });
    setModalOpen(true);
  };

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
    setFormData((prev) => ({ ...prev, photo_url: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      error('Teacher full name is required');
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
      error('Qualification is required (e.g. M.Sc. Mathematics, B.Ed.)');
      return;
    }

    if (!formData.specialization.trim()) {
      error('Specialization / Subject is required (e.g. Higher Secondary Mathematics)');
      return;
    }

    if (!formData.joining_date) {
      error('Joining date is required');
      return;
    }

    setSubmitting(true);
    try {
      let finalPhotoUrl = editingTeacher?.photo_url || null;

      // Handle standalone upload for new teacher
      if (!editingTeacher && photoFile) {
        try {
          const uploadRes = await teacherApi.uploadStandalonePhoto(photoFile);
          finalPhotoUrl = uploadRes.photo_url;
        } catch (uploadErr) {
          console.warn('Teacher photo upload failed:', uploadErr);
        }
      } else if (editingTeacher && !photoPreview) {
        // Teacher photo was removed
        finalPhotoUrl = null;
      }

      const payload = {
        name: formData.name.trim(),
        mobile: cleanMob,
        email: formData.email.trim() || null,
        qualification: formData.qualification.trim(),
        specialization: formData.specialization.trim(),
        photo_url: finalPhotoUrl,
        joining_date: formData.joining_date,
        status: formData.status,
      };

      if (editingTeacher) {
        await teacherApi.update(editingTeacher.id, payload);
        // If an existing teacher has a new photo file, upload it directly
        if (photoFile) {
          try {
            await teacherApi.uploadPhoto(editingTeacher.id, photoFile);
          } catch (uploadErr) {
            console.warn('Faculty photo upload warning:', uploadErr);
          }
        }
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
      className: 'font-mono font-bold text-odoo-700 w-24',
    },
    {
      header: 'Faculty Name',
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={t.photo_url} name={t.name} size="sm" status={t.status} />
          <div>
            <span className="font-bold text-black block">{t.name}</span>
            <span className="text-[11px] text-slate-500">{t.specialization}</span>
          </div>
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
      className: 'text-right w-44 whitespace-nowrap',
      render: (t) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="secondary"
            icon={ExternalLink}
            onClick={() => navigate(`/teachers/${t.id}`)}
            title="Open Dedicated Faculty Roster Page"
          >
            Detail
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
      {/* Odoo Control Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Faculty & Teachers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage coaching teaching staff, credentials, and batch assignments
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
            Add Teacher
          </Button>
        </div>
      </div>

      {viewMode === 'table' ? (
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
                placeholder="Search teacher by name, specialization, or mobile..."
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-black placeholder-slate-400 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-semibold text-black">{teachers.length}</span> of <span className="font-semibold text-black">{total}</span> faculty members
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 animate-pulse bg-white border border-slate-200 rounded-lg">
              Loading faculty cards...
            </div>
          ) : teachers.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
              No faculty records found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {teachers.map((t) => (
                <div
                  key={t.id}
                  className="bg-white border border-slate-200 hover:border-odoo-300 rounded-lg p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start gap-2.5">
                      <Avatar
                        src={t.photo_url}
                        name={t.name}
                        size="md"
                        status={t.status}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h3
                          onClick={() => navigate(`/teachers/${t.id}`)}
                          className="font-bold text-black text-sm hover:text-odoo-700 truncate cursor-pointer block"
                          title={t.name}
                        >
                          {t.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] font-bold text-odoo-800 bg-purple-50 border border-odoo-200 px-1.5 py-0.2 rounded-full">
                            {t.teacher_code}
                          </span>
                          <Badge size="xs" variant={t.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {t.status}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                      {t.specialization && (
                        <div className="text-[11px] text-slate-800 font-medium truncate">
                          <span className="text-slate-700 font-bold">Subject:</span> {t.specialization}
                        </div>
                      )}

                      {t.qualification && (
                        <div className="text-[11px] text-slate-800 truncate">
                          <span className="text-slate-700 font-bold">Qualification:</span> {t.qualification}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 font-bold">Mobile:</span>
                        {t.mobile ? (
                          <a
                            href={`tel:${t.mobile}`}
                            className="font-mono font-bold text-slate-900 hover:text-odoo-600 flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-odoo-600" />
                            {t.mobile}
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">None</span>
                        )}
                      </div>

                      {t.email && (
                        <div className="flex items-center justify-between text-[11px] truncate">
                          <span className="text-slate-700 font-bold">Email:</span>
                          <span className="text-slate-800 truncate max-w-[140px] font-medium">{t.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={Edit2}
                      onClick={() => handleOpenEdit(t)}
                      className="flex-1 justify-center"
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={ExternalLink}
                      onClick={() => navigate(`/teachers/${t.id}`)}
                      className="flex-1 justify-center"
                    >
                      Detail
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

      {/* Add / Edit Teacher Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTeacher ? 'Edit Faculty Details' : 'Add New Teacher'}
        subtitle="Teaching faculty details are snapshotted in batches and admissions"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Faculty Photo Upload Section */}
          <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <Avatar
              src={photoPreview}
              name={formData.name || 'Faculty'}
              size="lg"
              status={formData.status}
            />
            <div className="flex-1 space-y-1">
              <span className="text-xs font-bold text-black block">Faculty Photograph</span>
              <p className="text-[11px] text-slate-500">
                Auto-compressed to under 20 KB. Allowed formats: JPG, PNG, WEBP.
              </p>
              {photoSizeKb && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ Size: {photoSizeKb} KB
                </span>
              )}
              <div className="flex items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs transition">
                  <Camera className="w-3.5 h-3.5 text-odoo-700" />
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
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <Input
            label="Teacher Full Name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. K.K. Chauhan"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Mobile Number *"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: cleanMobileInput(e.target.value) })}
              placeholder="10-digit mobile"
              required
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
            <Input
              label="Email (Optional)"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. teacher@gmail.com"
            />
          </div>

          {/* Existing Teacher Profile Card if Mobile Already Exists */}
          {existingTeacherWithMobile && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Avatar
                  src={existingTeacherWithMobile.photo_url}
                  name={existingTeacherWithMobile.name}
                  size="md"
                  status={existingTeacherWithMobile.status}
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-bold text-amber-950">{existingTeacherWithMobile.name}</span>
                    <span className="font-mono text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                      {existingTeacherWithMobile.teacher_code}
                    </span>
                    <Badge size="xs" variant={existingTeacherWithMobile.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {existingTeacherWithMobile.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                    {existingTeacherWithMobile.specialization || 'Faculty'} • Mobile:{' '}
                    <strong className="font-mono">{existingTeacherWithMobile.mobile}</strong>
                  </p>
                  <span className="text-[10px] text-amber-800 font-semibold block mt-0.5">
                    ⚠️ A faculty member is already registered with this mobile number.
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  setModalOpen(false);
                  navigate(`/teachers/${existingTeacherWithMobile.id}`);
                }}
              >
                View Profile ↗
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Qualification *"
              value={formData.qualification}
              onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
              placeholder="e.g. M.Sc. Mathematics, B.Ed."
              required
            />
            <Input
              label="Specialization / Subject *"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              placeholder="e.g. Higher Secondary Mathematics"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Joining Date *"
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
            {(() => {
              const cleanMob = cleanMobileInput(formData.mobile);
              const isFormValid =
                formData.name.trim().length >= 2 &&
                cleanMob.length === 10 &&
                !existingTeacherWithMobile &&
                formData.qualification.trim().length >= 2 &&
                formData.specialization.trim().length >= 2 &&
                Boolean(formData.joining_date);

              let buttonLabel = editingTeacher ? 'Save Changes' : 'Register Faculty';
              if (!formData.name.trim()) buttonLabel = 'Enter Teacher Name';
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
