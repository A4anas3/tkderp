import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, KeyRound, Eye, EyeOff, GraduationCap } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { userApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { formatIndianDate } from '../../utils/dateCycleUtils';
import { cleanMobileInput } from '../../utils/phoneUtils';

export default function StaffUsersPage() {
  const { success, error } = useToast();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [addForm, setAddForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'CASHIER',
  });
  const [addError, setAddError] = useState('');

  const [editForm, setEditForm] = useState({
    full_name: '',
    role: 'CASHIER',
    status: 'ACTIVE',
    new_password: '',
  });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [linkedTeacher, setLinkedTeacher] = useState(null);
  const [linkedTeacherLoading, setLinkedTeacherLoading] = useState(false);

  const [newPassword, setNewPassword] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
      });
      setUsers(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load staff accounts');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleOpenAdd = () => {
    setAddForm({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'CASHIER',
    });
    setAddError('');
    setAddModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.full_name.trim() || !addForm.email.trim() || !addForm.password) {
      const msg = 'Full Name, Email and Password are required';
      setAddError(msg);
      error(msg);
      return;
    }
    const cleanPhone = cleanMobileInput(addForm.phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      const msg = 'Phone number must be exactly 10 numeric digits';
      setAddError(msg);
      error(msg);
      return;
    }
    setSubmitting(true);
    try {
      const created = await userApi.create({
        full_name: addForm.full_name.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: cleanPhone,
        password: addForm.password,
        role: addForm.role,
      });
      success(`Staff account created: ${created.employee_id}`);
      setAddModalOpen(false);
      loadUsers();
    } catch (err) {
      const msg = err.message || 'Failed to create staff account';
      setAddError(msg);
      error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (u) => {
    setSelectedUser(u);
    setEditForm({
      full_name: u.full_name,
      role: u.role,
      status: u.status,
      new_password: '',
    });
    setShowEditPassword(false);
    setLinkedTeacher(null);
    setEditModalOpen(true);
  };

  useEffect(() => {
    if (!editModalOpen || !selectedUser?.employee_id || editForm.role !== 'TEACHER') {
      setLinkedTeacher(null);
      setLinkedTeacherLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedTeacherLoading(true);
    userApi
      .getLinkedTeacher(selectedUser.employee_id)
      .then((res) => {
        if (!cancelled) {
          setLinkedTeacher(res?.found ? res.teacher : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLinkedTeacher(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLinkedTeacherLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editModalOpen, selectedUser?.employee_id, editForm.role]);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (editForm.new_password) {
      if (!editForm.new_password.trim()) {
        error('New password cannot be blank spaces');
        return;
      }
      if (editForm.new_password.length < 6) {
        error('New password must be at least 6 characters');
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        full_name: editForm.full_name.trim(),
        role: editForm.role,
        status: editForm.status,
      };
      if (editForm.new_password) {
        payload.new_password = editForm.new_password;
      }
      await userApi.update(selectedUser.id, payload);
      success(`Updated staff account: ${selectedUser.employee_id}`);
      setEditModalOpen(false);
      loadUsers();
    } catch (err) {
      error(err.message || 'Failed to update staff account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReset = (u) => {
    setSelectedUser(u);
    setNewPassword('');
    setResetModalOpen(true);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    setSubmitting(true);
    try {
      await userApi.resetPassword(selectedUser.id, newPassword);
      success(`Password reset successfully for ${selectedUser.employee_id}`);
      setResetModalOpen(false);
    } catch (err) {
      error(err.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      header: 'Employee ID',
      accessor: 'employee_id',
      className: 'font-mono font-bold text-odoo-700 w-28',
    },
    {
      header: 'Staff Name',
      render: (u) => (
        <div>
          <span className="font-bold text-black block">{u.full_name}</span>
          <span className="text-[11px] text-slate-700 font-mono font-medium">{u.email}</span>
        </div>
      ),
    },
    {
      header: 'Assigned Role',
      className: 'text-center w-28',
      render: (u) => {
        const variants = {
          ADMIN: 'primary',
          CASHIER: 'warning',
          TEACHER: 'success',
        };
        return (
          <Badge size="xs" variant={variants[u.role] || 'neutral'}>
            {u.role}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      className: 'text-center w-24',
      render: (u) => (
        <Badge size="xs" variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
          {u.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-40 whitespace-nowrap',
      render: (u) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="amber"
            icon={Edit2}
            onClick={() => handleOpenEdit(u)}
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="violet"
            icon={KeyRound}
            onClick={() => handleOpenReset(u)}
            title="Reset Password"
          >
            Reset
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Staff & Role Permissions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage internal employees (Admin, Cashier, Faculty), role authorizations, and password credentials
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd} className="w-full sm:w-auto h-9">
          Add Staff Account
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadUsers}
        loading={loading}
        searchPlaceholder="Search staff by name or employee ID..."
        emptyMessage="No staff accounts found."
      />

      {/* Add Staff Account Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Create Internal Staff Account"
        subtitle="Only Admin can create or provision ERP staff accounts"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-3">
          {addError && (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {addError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Employee ID"
              value={`Auto-generated (${addForm.role === 'TEACHER' ? 'TCH' : addForm.role === 'ADMIN' ? 'ADM' : 'CSH'}###)`}
              readOnly
              disabled
              helperText="Assigned automatically by backend"
            />

            <Select
              label="System Role"
              value={addForm.role}
              onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              options={[
                { value: 'ADMIN', label: 'Admin (Full Access)' },
                { value: 'CASHIER', label: 'Cashier (Fees & Admissions)' },
                { value: 'TEACHER', label: 'Teacher (Assigned Subjects)' },
              ]}
            />
          </div>

          <Input
            label="Staff Full Name"
            value={addForm.full_name}
            onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
            placeholder="e.g. Ramesh Kumar"
            required
            autoFocus
          />

          <Input
            label="Phone Number"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            value={addForm.phone}
            onChange={(e) => {
              setAddError('');
              setAddForm({ ...addForm, phone: cleanMobileInput(e.target.value) });
            }}
            placeholder="10-digit mobile number"
            required
            error={
              addForm.phone && addForm.phone.length < 10
                ? `Must be 10 digits (${addForm.phone.length}/10)`
                : null
            }
            helperText={
              addForm.phone && addForm.phone.length === 10
                ? '✓ Valid 10-digit phone number'
                : 'Required 10-digit phone number'
            }
          />

          <Input
            label="Staff Email"
            type="email"
            value={addForm.email}
            onChange={(e) => {
              setAddError('');
              setAddForm({ ...addForm, email: e.target.value });
            }}
            placeholder="e.g. ramesh@thakurdwara.local"
            required
          />

          <Input
            label="Initial Password"
            type="password"
            value={addForm.password}
            onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
            placeholder="Set secure initial password"
            required
          />

          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={submitting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} className="w-full sm:w-auto">
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Staff Account Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Staff — ${selectedUser?.employee_id}`}
        subtitle="Update employee role, password, or toggle account active/inactive status"
        maxWidth={editForm.role === 'TEACHER' ? 'max-w-lg' : 'max-w-md'}
      >
        <form onSubmit={handleEditSubmit} className="space-y-3">
          <Input
            label="Staff Full Name"
            value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="System Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              options={[
                { value: 'ADMIN', label: 'Admin' },
                { value: 'CASHIER', label: 'Cashier' },
                { value: 'TEACHER', label: 'Teacher' },
              ]}
            />

            <Select
              label="Account Status"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive / Suspended' },
              ]}
            />
          </div>

          <div className="w-full">
            <label
              htmlFor="edit-staff-new-password"
              className="block text-xs font-bold text-black mb-1.5"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="edit-staff-new-password"
                type={showEditPassword ? 'text' : 'password'}
                value={editForm.new_password}
                onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                placeholder="Leave blank to keep current password"
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-xs sm:text-sm min-h-[38px] sm:min-h-[34px] text-black font-medium placeholder:text-slate-500 focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword((prev) => !prev)}
                aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500 hover:text-black transition-colors"
              >
                {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-600 font-medium">
              Leave blank to keep the current password (min 6 characters if changing).
            </p>
          </div>

          {editForm.role === 'TEACHER' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-odoo-700" />
                  <h4 className="text-xs font-bold text-black uppercase tracking-wide">
                    Linked Teacher
                  </h4>
                </div>
                {linkedTeacher && (
                  <Badge size="xs" variant={linkedTeacher.status === 'ACTIVE' ? 'success' : 'danger'}>
                    {linkedTeacher.teacher_code} • {linkedTeacher.status}
                  </Badge>
                )}
              </div>

              {linkedTeacherLoading ? (
                <p className="text-xs text-slate-500 py-2">Loading linked teacher details...</p>
              ) : !linkedTeacher ? (
                <p className="text-xs text-slate-600 font-medium py-1">No linked teacher record</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Full Name</span>
                    <span className="font-semibold text-black">{linkedTeacher.name}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Designation / Specialization</span>
                    <span className="font-semibold text-black">{linkedTeacher.specialization || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Qualification</span>
                    <span className="font-semibold text-black">{linkedTeacher.qualification || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Email</span>
                    <span className="font-medium text-black break-all">{linkedTeacher.email || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Phone Number</span>
                    <span className="font-mono font-semibold text-black">{linkedTeacher.mobile || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Joining Date</span>
                    <span className="font-mono font-semibold text-black">
                      {linkedTeacher.joining_date ? formatIndianDate(linkedTeacher.joining_date) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 font-medium">Monthly Salary</span>
                    <span className="font-mono font-semibold text-black">
                      {linkedTeacher.monthly_salary !== null && linkedTeacher.monthly_salary !== undefined
                        ? `₹${Number(linkedTeacher.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="block text-[11px] text-slate-500 font-medium">Assigned Subjects</span>
                    <span className="font-semibold text-black">
                      {linkedTeacher.assigned_subjects && linkedTeacher.assigned_subjects.length > 0
                        ? linkedTeacher.assigned_subjects.join(', ')
                        : 'None assigned'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)} disabled={submitting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} className="w-full sm:w-auto">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={`Reset Password — ${selectedUser?.employee_id}`}
        subtitle={`Set a new login password for ${selectedUser?.full_name}`}
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleResetSubmit} className="space-y-3">
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            required
            autoFocus
          />

          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setResetModalOpen(false)} disabled={submitting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={submitting} className="w-full sm:w-auto">
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
