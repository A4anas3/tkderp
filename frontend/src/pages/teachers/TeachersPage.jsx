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
import { teacherApi, userApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { cleanMobileInput } from '../../utils/phoneUtils';
import { compressImage } from '../../utils/imageCompressor';

export default function TeachersPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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

  // Staff Account Link State (for Add Teacher)
  const [teacherStaffAccounts, setTeacherStaffAccounts] = useState([]);
  const [loadingStaffAccounts, setLoadingStaffAccounts] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [inlineStaffOpen, setInlineStaffOpen] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [inlineStaffError, setInlineStaffError] = useState('');
  const [inlineStaffForm, setInlineStaffForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
  });

  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    mobile: '',
    email: '',
    qualification: '',
    specialization: '',
    photo_url: null,
    joining_date: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
    monthly_salary: '',
  });

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teacherApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        status_filter: statusFilter || undefined,
      });
      setTeachers(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to fetch teachers');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const handleToggleStatus = async (teacher) => {
    const newStatus = teacher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await teacherApi.updateStatus(teacher.id, newStatus, `User toggled status to ${newStatus}`);
      success(`Faculty ${teacher.name} status updated to ${newStatus}`);
      loadTeachers();
    } catch (err) {
      error(err.message || 'Failed to update teacher status');
    }
  };

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

  const loadTeacherStaffAccounts = useCallback(async () => {
    setLoadingStaffAccounts(true);
    try {
      const staffRes = await userApi.list({
        role: 'TEACHER',
        status: 'ACTIVE',
        unlinked_only: true,
        page: 1,
        page_size: 100,
      });
      setTeacherStaffAccounts(staffRes?.items || []);
    } catch (err) {
      error(err.message || 'Failed to load teacher staff accounts');
      setTeacherStaffAccounts([]);
    } finally {
      setLoadingStaffAccounts(false);
    }
  }, []);

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoSizeKb(null);
    setExistingTeacherWithMobile(null);
    setStaffSearch('');
    setInlineStaffOpen(false);
    setInlineStaffError('');
    setInlineStaffForm({
      full_name: '',
      phone: '',
      email: '',
      password: '',
    });
    setFormData({
      employee_id: '',
      name: '',
      mobile: '',
      email: '',
      qualification: '',
      specialization: '',
      photo_url: null,
      joining_date: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
      monthly_salary: '',
    });
    loadTeacherStaffAccounts();
    setModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTeacher(t);
    setPhotoPreview(t.photo_url || null);
    setPhotoFile(null);
    setPhotoSizeKb(null);
    setExistingTeacherWithMobile(null);
    setStaffSearch('');
    setFormData({
      employee_id: t.teacher_code || '',
      name: t.name,
      mobile: t.mobile,
      email: t.email || '',
      qualification: t.qualification || '',
      specialization: t.specialization || '',
      photo_url: t.photo_url || null,
      joining_date: t.joining_date,
      status: t.status,
      monthly_salary:
        t.monthly_salary !== null && t.monthly_salary !== undefined
          ? String(t.monthly_salary)
          : '',
    });
    setModalOpen(true);
  };

  const applySelectedStaffAccount = (selected) => {
    if (!selected) {
      setFormData((prev) => ({
        ...prev,
        employee_id: '',
        name: '',
        mobile: '',
        email: '',
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      employee_id: selected.employee_id,
      name: selected.full_name || '',
      mobile: cleanMobileInput(selected.phone || ''),
      email: selected.email || '',
    }));
  };

  const handleSelectStaffAccount = (empId) => {
    const selected = teacherStaffAccounts.find((u) => u.employee_id === empId);
    applySelectedStaffAccount(selected);
  };

  const handleInlineCreateStaff = async () => {
    setInlineStaffError('');
    const trimmedName = inlineStaffForm.full_name.trim();
    const cleanPhone = cleanMobileInput(inlineStaffForm.phone);
    const trimmedEmail = inlineStaffForm.email.trim().toLowerCase();
    const pwd = inlineStaffForm.password;

    if (trimmedName.length < 2) {
      const msg = 'Staff Full Name must be at least 2 characters';
      setInlineStaffError(msg);
      error(msg);
      return;
    }
    if (!cleanPhone || cleanPhone.length !== 10) {
      const msg = 'Phone number must be exactly 10 numeric digits';
      setInlineStaffError(msg);
      error(msg);
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      const msg = 'Please enter a valid staff email address';
      setInlineStaffError(msg);
      error(msg);
      return;
    }
    if (!pwd || !pwd.trim() || pwd.length < 6) {
      const msg = 'Password must be at least 6 characters';
      setInlineStaffError(msg);
      error(msg);
      return;
    }

    setCreatingStaff(true);
    try {
      const created = await userApi.create({
        full_name: trimmedName,
        phone: cleanPhone,
        email: trimmedEmail,
        password: pwd,
        role: 'TEACHER',
      });
      success(`Staff account created: ${created.employee_id}`);
      setTeacherStaffAccounts((prev) => [
        created,
        ...prev.filter((u) => u.id !== created.id && u.employee_id !== created.employee_id),
      ]);
      setStaffSearch('');
      applySelectedStaffAccount(created);
      setInlineStaffOpen(false);
      setInlineStaffError('');
      setInlineStaffForm({
        full_name: '',
        phone: '',
        email: '',
        password: '',
      });
    } catch (err) {
      const msg = err.message || 'Failed to create staff account';
      setInlineStaffError(msg);
      error(msg);
    } finally {
      setCreatingStaff(false);
    }
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
    if (!editingTeacher && !formData.employee_id) {
      error('Please select a Teacher Staff Account to link');
      return;
    }
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

    const rawSalary = String(formData.monthly_salary ?? '').trim();
    let parsedSalary = null;
    if (rawSalary !== '') {
      const numSalary = Number(rawSalary);
      if (!Number.isFinite(numSalary) || numSalary < 0) {
        error('Monthly salary must be a non-negative number');
        return;
      }
      parsedSalary = numSalary;
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
        ...(editingTeacher ? {} : { employee_id: formData.employee_id }),
        name: formData.name.trim(),
        mobile: cleanMob,
        email: formData.email.trim() || null,
        qualification: formData.qualification.trim(),
        specialization: formData.specialization.trim(),
        photo_url: finalPhotoUrl,
        joining_date: formData.joining_date,
        status: formData.status,
        monthly_salary: parsedSalary,
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
      className: 'text-center w-24 whitespace-nowrap',
      render: (t) => (
        <Badge size="xs" variant={t.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-56 whitespace-nowrap',
      render: (t) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {isAdmin && (
            <>
              <Button
                size="xs"
                variant={t.status === 'ACTIVE' ? 'danger-soft' : 'success-soft'}
                icon={t.status === 'ACTIVE' ? UserX : UserCheck}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStatus(t);
                }}
                title={t.status === 'ACTIVE' ? 'Deactivate Faculty' : 'Activate Faculty'}
              >
                {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </Button>
              <Button
                size="xs"
                variant="amber"
                icon={Edit2}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(t);
                }}
                title="Edit Teacher"
              >
                Edit
              </Button>
            </>
          )}
          <Button
            size="xs"
            variant="info"
            icon={ExternalLink}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/teachers/${t.id}`);
            }}
            title="Open Dedicated Faculty Roster Page"
          >
            Detail
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
            Manage coaching teaching staff, credentials, and subject assignments
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

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-black focus:outline-none focus:border-odoo-600 min-h-[34px] w-full sm:w-auto shadow-2xs"
          >
            <option value="">All Teachers</option>
            <option value="ACTIVE">Active Teachers</option>
            <option value="INACTIVE">Inactive Teachers</option>
          </select>

          {isAdmin && (
            <Button variant="primary" icon={Plus} onClick={handleOpenAdd} className="w-full sm:w-auto h-9">
              Add Teacher
            </Button>
          )}
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
                    {isAdmin && (
                      <>
                        <Button
                          size="xs"
                          variant={t.status === 'ACTIVE' ? 'danger-soft' : 'success-soft'}
                          icon={t.status === 'ACTIVE' ? UserX : UserCheck}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(t);
                          }}
                          className="flex-1 justify-center"
                          title={t.status === 'ACTIVE' ? 'Deactivate Faculty' : 'Activate Faculty'}
                        >
                          {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="xs"
                          variant="amber"
                          icon={Edit2}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(t);
                          }}
                          className="flex-1 justify-center"
                        >
                          Edit
                        </Button>
                      </>
                    )}
                    <Button
                      size="xs"
                      variant="info"
                      icon={ExternalLink}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/teachers/${t.id}`);
                      }}
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
        subtitle="Teaching faculty details are snapshotted in subject enrollments and admissions"
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

          {!editingTeacher && (() => {
            const q = staffSearch.trim().toLowerCase();
            const filteredStaff = teacherStaffAccounts.filter((u) => {
              if (!q) return true;
              return (
                (u.employee_id || '').toLowerCase().includes(q) ||
                (u.full_name || '').toLowerCase().includes(q) ||
                (u.phone || '').toLowerCase().includes(q)
              );
            });
            return (
              <div className="p-3 bg-purple-50/60 border border-odoo-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label
                    htmlFor="link-staff-account-select"
                    className="block text-xs font-bold text-black"
                  >
                    Link Staff Account <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {formData.employee_id && (
                      <span className="font-mono text-[11px] font-bold text-odoo-800 bg-white border border-odoo-300 px-2 py-0.5 rounded">
                        Code: {formData.employee_id}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInlineStaffError('');
                        setInlineStaffOpen((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-odoo-300 bg-white px-2 py-0.5 text-[11px] font-bold text-odoo-700 hover:bg-odoo-50 transition-colors shadow-2xs"
                    >
                      {inlineStaffOpen ? 'Close' : '+ Create new staff account'}
                    </button>
                  </div>
                </div>

                {inlineStaffOpen && (
                  <div className="rounded-md border border-odoo-300 bg-white p-3 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-xs font-bold text-black">
                        New Teacher Staff Account
                      </span>
                      <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        Role: Teacher
                      </span>
                    </div>

                    {inlineStaffError && (
                      <div className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800">
                        {inlineStaffError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Input
                        label="Full Name *"
                        value={inlineStaffForm.full_name}
                        onChange={(e) => {
                          setInlineStaffError('');
                          setInlineStaffForm({ ...inlineStaffForm, full_name: e.target.value });
                        }}
                        placeholder="e.g. Ramesh Kumar"
                      />
                      <Input
                        label="Phone Number *"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={inlineStaffForm.phone}
                        onChange={(e) => {
                          setInlineStaffError('');
                          setInlineStaffForm({
                            ...inlineStaffForm,
                            phone: cleanMobileInput(e.target.value),
                          });
                        }}
                        placeholder="10-digit mobile"
                        error={
                          inlineStaffForm.phone && inlineStaffForm.phone.length < 10
                            ? `Must be 10 digits (${inlineStaffForm.phone.length}/10)`
                            : null
                        }
                        helperText={
                          inlineStaffForm.phone && inlineStaffForm.phone.length === 10
                            ? '✓ Valid 10-digit phone'
                            : null
                        }
                      />
                      <Input
                        label="Email *"
                        type="email"
                        value={inlineStaffForm.email}
                        onChange={(e) => {
                          setInlineStaffError('');
                          setInlineStaffForm({ ...inlineStaffForm, email: e.target.value });
                        }}
                        placeholder="e.g. ramesh@thakurdwara.local"
                      />
                      <Input
                        label="Password *"
                        type="password"
                        value={inlineStaffForm.password}
                        onChange={(e) => {
                          setInlineStaffError('');
                          setInlineStaffForm({ ...inlineStaffForm, password: e.target.value });
                        }}
                        placeholder="Min 6 characters"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        disabled={creatingStaff}
                        onClick={() => {
                          setInlineStaffOpen(false);
                          setInlineStaffError('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="primary"
                        loading={creatingStaff}
                        onClick={handleInlineCreateStaff}
                      >
                        Create &amp; Select Staff
                      </Button>
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff by Employee ID or name..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-black font-medium placeholder:text-slate-500 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                />

                <select
                  id="link-staff-account-select"
                  value={formData.employee_id}
                  onChange={(e) => handleSelectStaffAccount(e.target.value)}
                  required
                  disabled={loadingStaffAccounts}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm min-h-[38px] sm:min-h-[34px] text-black font-medium focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 disabled:bg-slate-100 disabled:text-slate-600 shadow-2xs transition-colors"
                >
                  <option value="">
                    {loadingStaffAccounts
                      ? 'Loading active Teacher staff accounts...'
                      : '-- Select Active Teacher Staff Account --'}
                  </option>
                  {filteredStaff.map((u) => (
                    <option key={u.id} value={u.employee_id}>
                      {u.employee_id} — {u.full_name}
                      {u.phone ? ` (${u.phone})` : ''}
                    </option>
                  ))}
                </select>

                {!loadingStaffAccounts && teacherStaffAccounts.length === 0 ? (
                  <p className="text-[11px] font-semibold text-amber-800">
                    No unlinked active Teacher staff accounts found. Click &ldquo;+ Create new staff account&rdquo; above to create one.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 font-medium">
                    Teacher code, name, phone, and email are linked from the selected staff account.
                  </p>
                )}
              </div>
            );
          })()}

          {(() => {
            const selectedStaff = !editingTeacher
              ? teacherStaffAccounts.find((u) => u.employee_id === formData.employee_id)
              : null;
            const lockStaffFields = !editingTeacher;
            const lockMobileField = !editingTeacher && Boolean(selectedStaff?.phone);
            return (
              <>
                <Input
                  label="Teacher Full Name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={lockStaffFields ? 'Auto-filled from linked staff account' : 'e.g. K.K. Chauhan'}
                  readOnly={lockStaffFields}
                  required
                  autoFocus={Boolean(editingTeacher)}
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
                    placeholder={lockMobileField ? 'Auto-filled from staff' : '10-digit mobile'}
                    readOnly={lockMobileField}
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
                    label={lockStaffFields ? 'Email (From Staff Account)' : 'Email (Optional)'}
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder={lockStaffFields ? 'Auto-filled from staff' : 'e.g. teacher@gmail.com'}
                    readOnly={lockStaffFields}
                  />
                </div>
              </>
            );
          })()}

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
                variant="info"
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

          {(() => {
            const rawSalary = String(formData.monthly_salary ?? '').trim();
            const parsedSalary = rawSalary === '' ? null : Number(rawSalary);
            const salaryError =
              rawSalary !== '' && (!Number.isFinite(parsedSalary) || parsedSalary < 0)
                ? 'Monthly salary must be a non-negative number'
                : null;
            return (
              <Input
                label="Monthly Salary (₹)"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={formData.monthly_salary}
                onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                placeholder="Optional, e.g. 25000"
                error={salaryError}
                helperText={!salaryError ? 'Optional fixed monthly salary in ₹ (does not create payroll records)' : null}
              />
            );
          })()}

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            {(() => {
              const cleanMob = cleanMobileInput(formData.mobile);
              const hasStaffLink = Boolean(editingTeacher) || Boolean(formData.employee_id);
              const rawSalary = String(formData.monthly_salary ?? '').trim();
              const parsedSalary = rawSalary === '' ? null : Number(rawSalary);
              const isSalaryValid = rawSalary === '' || (Number.isFinite(parsedSalary) && parsedSalary >= 0);
              const isFormValid =
                hasStaffLink &&
                formData.name.trim().length >= 2 &&
                cleanMob.length === 10 &&
                !existingTeacherWithMobile &&
                formData.qualification.trim().length >= 2 &&
                formData.specialization.trim().length >= 2 &&
                Boolean(formData.joining_date) &&
                isSalaryValid;

              let buttonLabel = editingTeacher ? 'Save Changes' : 'Register Faculty';
              if (!editingTeacher && !formData.employee_id) buttonLabel = 'Select Staff Account';
              else if (!formData.name.trim()) buttonLabel = 'Enter Teacher Name';
              else if (cleanMob.length !== 10) buttonLabel = 'Enter 10-Digit Mobile';
              else if (existingTeacherWithMobile) buttonLabel = 'Mobile Already Registered';
              else if (!formData.qualification.trim()) buttonLabel = 'Enter Qualification';
              else if (!formData.specialization.trim()) buttonLabel = 'Enter Specialization';
              else if (!isSalaryValid) buttonLabel = 'Enter Valid Monthly Salary';

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
