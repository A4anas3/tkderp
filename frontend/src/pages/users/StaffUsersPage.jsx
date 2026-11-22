import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { userApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

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
    employee_id: '',
    full_name: '',
    email: '',
    password: '',
    role: 'CASHIER',
  });

  const [editForm, setEditForm] = useState({
    full_name: '',
    role: 'CASHIER',
    status: 'ACTIVE',
  });

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
      employee_id: '',
      full_name: '',
      email: '',
      password: '',
      role: 'CASHIER',
    });
    setAddModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.employee_id.trim() || !addForm.full_name.trim() || !addForm.password) {
      error('Employee ID, Name and Password are required');
      return;
    }
    setSubmitting(true);
    try {
      await userApi.create({
        employee_id: addForm.employee_id.trim().toUpperCase(),
        full_name: addForm.full_name.trim(),
        email: addForm.email.trim().toLowerCase(),
        password: addForm.password,
        role: addForm.role,
      });
      success(`Staff account created: ${addForm.employee_id}`);
      setAddModalOpen(false);
      loadUsers();
    } catch (err) {
      error(err.message || 'Failed to create staff account');
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
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await userApi.update(selectedUser.id, {
        full_name: editForm.full_name.trim(),
        role: editForm.role,
        status: editForm.status,
      });
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
      className: 'text-right w-40',
      render: (u) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => handleOpenEdit(u)}
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="secondary"
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

        <Button variant="primary" icon={Plus} onClick={handleOpenAdd} className="w-full sm:w-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Employee ID"
              value={addForm.employee_id}
              onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })}
              placeholder="e.g. CSH002 or TCH004"
              required
              autoFocus
            />

            <Select
              label="System Role"
              value={addForm.role}
              onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              options={[
                { value: 'ADMIN', label: 'Admin (Full Access)' },
                { value: 'CASHIER', label: 'Cashier (Fees & Admissions)' },
                { value: 'TEACHER', label: 'Teacher (Assigned Batches)' },
              ]}
            />
          </div>

          <Input
            label="Staff Full Name"
            value={addForm.full_name}
            onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
            placeholder="e.g. Ramesh Kumar"
            required
          />

          <Input
            label="Staff Email"
            type="email"
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
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
        subtitle="Update employee role or toggle account active/inactive status"
        maxWidth="max-w-md"
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
