import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Phone, Award, ChevronRight, Eye, UserX, AlertTriangle } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import QuickStudentModal from '../../components/modals/QuickStudentModal';
import { studentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function StudentsPage() {
  const navigate = useNavigate();
  const { error } = useToast();
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setStudents(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const columns = [
    {
      header: 'Student / Admission No',
      render: (s) => (
        <div>
          <span className="font-mono font-bold text-indigo-700 block">{s.student_code}</span>
          {s.latest_admission_number && (
            <span className="font-mono text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 inline-block mt-0.5">
              Adm: {s.latest_admission_number}
            </span>
          )}
        </div>
      ),
      className: 'w-36',
    },
    {
      header: 'Student Name',
      render: (s) => (
        <div>
          <button
            onClick={() => navigate(`/students/${s.id}`)}
            className="font-bold text-black hover:text-indigo-600 transition text-left"
          >
            {s.name}
          </button>
          {s.father_name && (
            <span className="text-[11px] text-slate-500 block">S/O {s.father_name}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Mobile Contact',
      render: (s) =>
        s.mobile ? (
          <span className="flex items-center gap-1 font-mono text-xs text-slate-700">
            <Phone className="w-3 h-3 text-slate-400" />
            {s.mobile}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">No mobile</span>
        ),
    },
    {
      header: 'Green Card Access',
      className: 'w-36 text-center',
      render: (s) =>
        s.has_green_card ? (
          <Badge size="xs" variant="purple" className="gap-1">
            <Award className="w-3 h-3" /> All-Access Pass
          </Badge>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        ),
    },
    {
      header: 'Reg Date',
      accessor: 'registration_date',
      className: 'font-mono text-xs w-24',
    },
    {
      header: 'Status',
      className: 'text-center w-24',
      render: (s) => (
        <Badge
          size="xs"
          variant={
            s.status === 'REVOKED'
              ? 'danger'
              : s.status === 'ACTIVE'
              ? 'success'
              : 'neutral'
          }
        >
          {s.status}
        </Badge>
      ),
    },
    {
      header: 'Action',
      className: 'text-right w-24',
      render: (s) => (
        <Button
          size="xs"
          variant="secondary"
          icon={Eye}
          onClick={() => navigate(`/students/${s.id}`)}
        >
          Profile
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Registered Students</h1>
          <p className="text-xs text-slate-500">
            Student database, batch enrollments, Green Card memberships, and payment histories
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-black focus:outline-none focus:border-indigo-600"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active Students</option>
            <option value="REVOKED">Revoked Students</option>
            <option value="INACTIVE">Inactive Students</option>
          </select>

          <Button variant="primary" icon={UserPlus} onClick={() => setAddModalOpen(true)}>
            Register Student
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={students}
        total={total}
        page={page}
        pageSize={15}
        onPageChange={(p) => setPage(p)}
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onRefresh={loadStudents}
        loading={loading}
        searchPlaceholder="Search by student name, mobile no, student code, or admission no..."
        emptyMessage="No students found."
      />

      <QuickStudentModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          loadStudents();
        }}
      />
    </div>
  );
}
