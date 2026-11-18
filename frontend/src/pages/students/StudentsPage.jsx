import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Phone, Award, ChevronRight, Eye } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
      });
      setStudents(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const columns = [
    {
      header: 'Student ID',
      accessor: 'student_code',
      className: 'font-mono font-bold text-indigo-700 w-28',
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
      className: 'text-center w-20',
      render: (s) => (
        <Badge size="xs" variant={s.status === 'ACTIVE' ? 'success' : 'neutral'}>
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

        <Button variant="primary" icon={UserPlus} onClick={() => setAddModalOpen(true)}>
          Register Student
        </Button>
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
        searchPlaceholder="Search by student name, code, or phone number..."
        emptyMessage="No students registered yet."
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
