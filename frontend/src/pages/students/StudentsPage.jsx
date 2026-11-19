import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Phone,
  Award,
  ChevronRight,
  Eye,
  UserX,
  AlertTriangle,
  LayoutGrid,
  List,
  CreditCard,
  Plus,
  Calendar,
  Edit2,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Avatar from '../../components/common/Avatar';
import QuickStudentModal from '../../components/modals/QuickStudentModal';
import EditStudentModal from '../../components/modals/EditStudentModal';
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
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban'
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentApi.list({
        page,
        page_size: viewMode === 'kanban' ? 24 : 15,
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
  }, [page, search, statusFilter, viewMode]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const columns = [
    {
      header: 'Student',
      render: (s) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={s.photo_url} name={s.name} size="sm" status={s.status} />
          <div>
            <button
              onClick={() => navigate(`/students/${s.id}`)}
              className="font-bold text-black hover:text-indigo-600 transition text-left block"
            >
              {s.name}
            </button>
            {s.father_name && (
              <span className="text-[10px] text-slate-500 block">S/O {s.father_name}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Student Code / Purchase ID',
      render: (s) => (
        <div>
          <span className="font-mono font-bold text-indigo-700 block">{s.student_code}</span>
          {s.latest_admission_number && (
            <span className="font-mono text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 inline-block mt-0.5">
              Txn: {s.latest_admission_number}
            </span>
          )}
        </div>
      ),
      className: 'w-40',
    },
    {
      header: 'Mobile Contact',
      render: (s) =>
        s.mobile ? (
          <a
            href={`tel:${s.mobile}`}
            className="flex items-center gap-1 font-mono text-xs text-slate-700 hover:text-indigo-600"
          >
            <Phone className="w-3 h-3 text-slate-400" />
            {s.mobile}
          </a>
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
      className: 'text-right w-36',
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => {
              setEditingStudent(s);
              setEditModalOpen(true);
            }}
            title="Edit Student Information"
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="secondary"
            icon={Eye}
            onClick={() => navigate(`/students/${s.id}`)}
            title="View Student Profile"
          >
            Profile
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(total / (viewMode === 'kanban' ? 24 : 15)) || 1;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Registered Students</h1>
          <p className="text-xs text-slate-500">
            Student database with profile photos (&le; 20 KB), batch fee cycles, and Kanban view
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-indigo-700 shadow-2xs'
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

      {/* Render Table or Kanban View */}
      {viewMode === 'table' ? (
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
          onRowClick={(s) => navigate(`/students/${s.id}`)}
          searchPlaceholder="Search by student name, mobile no, student code, or admission no..."
          emptyMessage="No students found."
        />
      ) : (
        /* Kanban Card Grid View */
        <div className="space-y-4">
          {/* Kanban Search Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by student name, code, phone, or admission no..."
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-black placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing {students.length} of {total} registered students
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 animate-pulse">
              Loading student cards...
            </div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
              No students found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {students.map((s) => {
                const isRev = s.status === 'REVOKED';
                return (
                  <div
                    key={s.id}
                    className={`bg-white border rounded-lg p-3.5 shadow-2xs transition hover:shadow-md flex flex-col justify-between ${
                      isRev ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {/* Top Row: Avatar + Name + Code */}
                    <div>
                      <div className="flex items-start gap-2.5">
                        <Avatar
                          src={s.photo_url}
                          name={s.name}
                          size="md"
                          status={s.status}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => navigate(`/students/${s.id}`)}
                            className="font-bold text-black text-sm hover:text-indigo-600 truncate block text-left w-full"
                            title={s.name}
                          >
                            {s.name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded">
                              {s.student_code}
                            </span>
                            <Badge
                              size="xs"
                              variant={isRev ? 'danger' : s.status === 'ACTIVE' ? 'success' : 'neutral'}
                            >
                              {s.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Bio Details */}
                      <div className="mt-3 space-y-1 text-xs border-t border-slate-100 pt-2.5">
                        {s.father_name && (
                          <div className="text-[11px] text-slate-600 truncate">
                            <span className="text-slate-400">Father:</span> {s.father_name}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Mobile:</span>
                          {s.mobile ? (
                            <a
                              href={`tel:${s.mobile}`}
                              className="font-mono font-semibold text-slate-800 hover:text-indigo-600 flex items-center gap-0.5"
                            >
                              <Phone className="w-2.5 h-2.5 text-slate-400" />
                              {s.mobile}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </div>

                        {s.latest_admission_number && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">Purchase ID:</span>
                            <span className="font-mono font-bold text-indigo-900 bg-slate-50 px-1 py-0.2 rounded border border-slate-200">
                              {s.latest_admission_number}
                            </span>
                          </div>
                        )}

                        {s.has_green_card && (
                          <div className="pt-1">
                            <Badge size="xs" variant="purple" className="w-full justify-center gap-1">
                              <Award className="w-3 h-3" /> All-Access Pass
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Card Actions */}
                    <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={Edit2}
                        onClick={() => {
                          setEditingStudent(s);
                          setEditModalOpen(true);
                        }}
                        title="Edit Student Information"
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        className="flex-1 justify-center"
                        icon={Eye}
                        onClick={() => navigate(`/students/${s.id}`)}
                      >
                        Profile
                      </Button>
                      {!isRev && (
                        <Button
                          size="xs"
                          variant="primary"
                          className="flex-1 justify-center"
                          icon={Plus}
                          onClick={() =>
                            navigate(
                              `/admissions/new?student_id=${s.id}&name=${encodeURIComponent(s.name)}`
                            )
                          }
                          title="Purchase Batch / Renew Fee"
                        >
                          + Batch
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Kanban Pagination */}
          {totalPages > 1 && (
            <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
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
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Register Modal */}
      <QuickStudentModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          loadStudents();
        }}
      />

      {/* Edit Student Modal */}
      <EditStudentModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingStudent(null);
        }}
        student={editingStudent}
        onSuccess={() => {
          loadStudents();
        }}
      />
    </div>
  );
}
