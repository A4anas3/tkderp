import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Wallet,
  Receipt,
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Tag,
  DollarSign,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { expenseApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function ExpensesPage() {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'salaries' | 'categories'

  // Categories
  const [categories, setCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', is_active: true });

  // Daily Expenses
  const [expenses, setExpenses] = useState([]);
  const [expTotal, setExpTotal] = useState(0);
  const [expPage, setExpPage] = useState(1);
  const [expSearch, setExpSearch] = useState('');
  const [expLoading, setExpLoading] = useState(true);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category_id: '',
    title: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_mode: 'CASH',
    transaction_reference: '',
    notes: '',
  });

  // Salaries
  const [salaries, setSalaries] = useState([]);
  const [salTotal, setSalTotal] = useState(0);
  const [salPage, setSalPage] = useState(1);
  const [salLoading, setSalLoading] = useState(true);
  const [salModalOpen, setSalModalOpen] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [salForm, setSalForm] = useState({
    employee_name_snapshot: '',
    employee_type: 'TEACHER',
    month_year: '2026-11',
    salary_amount: '20000.00',
    due_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Pay Salary Modal
  const [paySalaryModalOpen, setPaySalaryModalOpen] = useState(false);
  const [selectedSalRecord, setSelectedSalRecord] = useState(null);
  const [salTeacherAbsentCount, setSalTeacherAbsentCount] = useState(null);
  const [paySalTeacherAbsentCount, setPaySalTeacherAbsentCount] = useState(null);
  const [paySalForm, setPaySalForm] = useState({
    paid_amount: '',
    payment_mode: 'BANK_TRANSFER',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // Load Categories
  const loadCategories = async () => {
    try {
      const res = await expenseApi.listCategories();
      setCategories(res || []);
      if (res?.length > 0 && !expForm.category_id) {
        setExpForm((prev) => ({ ...prev, category_id: res[0].id }));
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  // Load Expenses
  const loadExpenses = useCallback(async () => {
    setExpLoading(true);
    try {
      const res = await expenseApi.listExpenses({
        page: expPage,
        page_size: 15,
        search: expSearch.trim() || undefined,
      });
      setExpenses(res.items || []);
      setExpTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load expenses');
    } finally {
      setExpLoading(false);
    }
  }, [expPage, expSearch]);

  // Load Salaries
  const loadSalaries = useCallback(async () => {
    setSalLoading(true);
    try {
      const res = await expenseApi.listSalaries({
        page: salPage,
        page_size: 15,
      });
      setSalaries(res.items || []);
      setSalTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load salary records');
    } finally {
      setSalLoading(false);
    }
  }, [salPage]);

  useEffect(() => {
    loadCategories();
    teacherApi.list({ page: 1, page_size: 100 }).then((res) => {
      setTeachers(res.items || []);
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'daily') loadExpenses();
    if (activeTab === 'salaries') loadSalaries();
  }, [activeTab, loadExpenses, loadSalaries]);

  // Fetch teacher absent count when teacher or month changes in create salary form
  useEffect(() => {
    if (salForm.employee_type !== 'TEACHER' || !salForm.employee_name_snapshot) {
      setSalTeacherAbsentCount(null);
      return;
    }
    const matched = teachers.find(
      (t) => t.name.toLowerCase() === salForm.employee_name_snapshot.trim().toLowerCase()
    );
    if (!matched) {
      setSalTeacherAbsentCount(null);
      return;
    }
    teacherApi
      .getTeacherAttendance(matched.id, { month_year: salForm.month_year })
      .then((res) => {
        setSalTeacherAbsentCount(res.absent_days_count ?? 0);
      })
      .catch(() => {
        setSalTeacherAbsentCount(0);
      });
  }, [salForm.employee_name_snapshot, salForm.month_year, salForm.employee_type, teachers]);

  // Create Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    setSubmitting(true);
    try {
      await expenseApi.createCategory({
        name: catForm.name.trim(),
        description: catForm.description.trim() || null,
        is_active: true,
      });
      success(`Expense category created: ${catForm.name}`);
      setCatModalOpen(false);
      setCatForm({ name: '', description: '', is_active: true });
      loadCategories();
    } catch (err) {
      error(err.message || 'Failed to create category');
    } finally {
      setSubmitting(false);
    }
  };

  // Create Daily Expense
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (!expForm.title.trim() || !expForm.amount) {
      error('Title and amount are required');
      return;
    }
    setSubmitting(true);
    try {
      await expenseApi.createExpense({
        category_id: expForm.category_id,
        title: expForm.title.trim(),
        amount: parseFloat(expForm.amount),
        expense_date: expForm.expense_date,
        payment_mode: expForm.payment_mode,
        transaction_reference: expForm.transaction_reference.trim() || null,
        notes: expForm.notes.trim() || null,
      });
      success('Daily expense recorded');
      setExpModalOpen(false);
      setExpForm({
        category_id: categories[0]?.id || '',
        title: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_mode: 'CASH',
        transaction_reference: '',
        notes: '',
      });
      loadExpenses();
    } catch (err) {
      error(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  // Create Salary Record
  const handleCreateSalary = async (e) => {
    e.preventDefault();
    if (!salForm.employee_name_snapshot.trim() || !salForm.salary_amount) {
      error('Employee name and salary amount are required');
      return;
    }
    setSubmitting(true);
    try {
      await expenseApi.createSalary({
        employee_name_snapshot: salForm.employee_name_snapshot.trim(),
        employee_type: salForm.employee_type,
        month_year: salForm.month_year,
        salary_amount: parseFloat(salForm.salary_amount),
        due_date: salForm.due_date,
        notes: salForm.notes.trim() || null,
      });
      success('Monthly salary record created');
      setSalModalOpen(false);
      loadSalaries();
    } catch (err) {
      error(err.message || 'Failed to create salary record');
    } finally {
      setSubmitting(false);
    }
  };

  // Pay Salary
  const handleOpenPaySalary = async (record) => {
    setSelectedSalRecord(record);
    const balance = Number(record.salary_amount) - Number(record.paid_amount);
    setPaySalForm({
      paid_amount: balance > 0 ? balance.toFixed(2) : '0.00',
      payment_mode: 'BANK_TRANSFER',
      payment_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setPaySalTeacherAbsentCount(record.absent_days_count ?? null);
    setPaySalaryModalOpen(true);

    if (record.employee_type === 'TEACHER') {
      const matchTeacher = teachers.find(
        (t) => t.name.toLowerCase() === record.employee_name_snapshot.toLowerCase()
      );
      if (matchTeacher) {
        try {
          const att = await teacherApi.getTeacherAttendance(matchTeacher.id, {
            month_year: record.month_year,
          });
          setPaySalTeacherAbsentCount(att.absent_days_count ?? 0);
        } catch (e) {
          console.error('Error fetching teacher absent count:', e);
        }
      }
    }
  };

  const handlePaySalarySubmit = async (e) => {
    e.preventDefault();
    if (!selectedSalRecord) return;
    setSubmitting(true);
    try {
      await expenseApi.paySalary(selectedSalRecord.id, {
        paid_amount: parseFloat(paySalForm.paid_amount),
        payment_mode: paySalForm.payment_mode,
        payment_date: paySalForm.payment_date,
        notes: paySalForm.notes.trim() || null,
      });
      success(`Salary payment recorded for ${selectedSalRecord.employee_name_snapshot}`);
      setPaySalaryModalOpen(false);
      loadSalaries();
    } catch (err) {
      error(err.message || 'Failed to record salary payment');
    } finally {
      setSubmitting(false);
    }
  };

  const expenseColumns = [
    {
      header: 'Title / Description',
      render: (exp) => (
        <div>
          <span className="font-bold text-black block">{exp.title}</span>
          <span className="text-[11px] text-slate-500 font-medium">
            Category: <strong className="text-slate-700">{exp.category_name}</strong>
          </span>
        </div>
      ),
    },
    {
      header: 'Amount',
      className: 'text-right font-mono font-bold text-rose-800 text-sm w-32',
      render: (exp) => `-₹${Number(exp.amount).toFixed(2)}`,
    },
    {
      header: 'Payment Mode',
      render: (exp) => (
        <div className="text-xs">
          <Badge size="xs" variant="neutral">
            {exp.payment_mode}
          </Badge>
          {exp.transaction_reference && (
            <span className="text-[11px] text-slate-500 block font-mono">
              Ref: {exp.transaction_reference}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Expense Date',
      accessor: 'expense_date',
      className: 'font-mono text-xs w-28',
    },
    {
      header: 'Notes',
      accessor: 'notes',
      className: 'text-xs text-slate-500 max-w-xs truncate',
    },
  ];

  const salaryColumns = [
    {
      header: 'Staff / Faculty Name',
      render: (s) => (
        <div>
          <span className="font-bold text-black block">{s.employee_name_snapshot}</span>
          <span className="text-[11px] text-slate-500">
            Type: {s.employee_type} • Month: <strong className="font-mono text-black">{s.month_year}</strong>
          </span>
        </div>
      ),
    },
    {
      header: 'Salary Amount',
      className: 'text-right font-mono font-bold text-black w-32',
      render: (s) => `₹${Number(s.salary_amount).toFixed(2)}`,
    },
    {
      header: 'Paid Amount',
      className: 'text-right font-mono font-bold text-emerald-800 w-32',
      render: (s) => `₹${Number(s.paid_amount).toFixed(2)}`,
    },
    {
      header: 'Absent Days',
      className: 'text-center w-28',
      render: (s) =>
        s.employee_type === 'TEACHER' ? (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              (s.absent_days_count || 0) > 0
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}
            title={`${s.absent_days_count ?? 0} holidays / absent days in ${s.month_year}`}
          >
            {s.absent_days_count ?? 0} {s.absent_days_count === 1 ? 'day' : 'days'}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        ),
    },
    {
      header: 'Due Date',
      accessor: 'due_date',
      className: 'font-mono text-xs w-28',
    },
    {
      header: 'Status',
      className: 'text-center w-28',
      render: (s) => {
        const variants = {
          PAID: 'success',
          PARTIALLY_PAID: 'warning',
          PENDING: 'danger',
        };
        return (
          <Badge size="xs" variant={variants[s.status] || 'neutral'}>
            {s.status}
          </Badge>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right w-28 whitespace-nowrap',
      render: (s) =>
        s.status !== 'PAID' ? (
          <div className="flex items-center justify-end whitespace-nowrap">
            <Button size="xs" variant="success-soft" onClick={() => handleOpenPaySalary(s)}>
              Pay Salary
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end whitespace-nowrap">
            <Badge size="xs" variant="success">
              Paid
            </Badge>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-black tracking-tight">Expenses & Salary Outflows</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record daily institute operational costs, teacher & staff payroll, and custom expense heads
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeTab === 'daily' && (
            <Button variant="primary" icon={Plus} onClick={() => setExpModalOpen(true)} className="w-full sm:w-auto">
              Add Daily Expense
            </Button>
          )}
          {activeTab === 'salaries' && (
            <Button variant="primary" icon={Plus} onClick={() => setSalModalOpen(true)} className="w-full sm:w-auto">
              Create Salary Entry
            </Button>
          )}
          {activeTab === 'categories' && (
            <Button variant="primary" icon={Plus} onClick={() => setCatModalOpen(true)} className="w-full sm:w-auto">
              Add Category
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 gap-1 pb-1">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-3 py-2 min-h-[36px] text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'daily'
              ? 'border-odoo-600 text-odoo-700 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100 rounded-t-lg'
          }`}
        >
          Daily Miscellaneous Expenses
        </button>
        <button
          onClick={() => setActiveTab('salaries')}
          className={`px-3 py-2 min-h-[36px] text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'salaries'
              ? 'border-odoo-600 text-odoo-700 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100 rounded-t-lg'
          }`}
        >
          Faculty & Staff Payroll
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-3 py-2 min-h-[36px] text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'categories'
              ? 'border-odoo-600 text-odoo-700 bg-purple-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-black hover:bg-slate-100 rounded-t-lg'
          }`}
        >
          Expense Categories
        </button>
      </div>

      {/* Tab 1: Daily Expenses */}
      {activeTab === 'daily' && (
        <DataTable
          columns={expenseColumns}
          data={expenses}
          total={expTotal}
          page={expPage}
          pageSize={15}
          onPageChange={(p) => setExpPage(p)}
          searchValue={expSearch}
          onSearchChange={(val) => {
            setExpSearch(val);
            setExpPage(1);
          }}
          onRefresh={loadExpenses}
          loading={expLoading}
          searchPlaceholder="Search expense by title or reference..."
          emptyMessage="No daily expenses recorded."
        />
      )}

      {/* Tab 2: Monthly Salaries */}
      {activeTab === 'salaries' && (
        <DataTable
          columns={salaryColumns}
          data={salaries}
          total={salTotal}
          page={salPage}
          pageSize={15}
          onPageChange={(p) => setSalPage(p)}
          onRefresh={loadSalaries}
          loading={salLoading}
          searchPlaceholder="Monthly salary records..."
          emptyMessage="No salary records found."
        />
      )}

      {/* Tab 3: Categories */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex items-center justify-between"
            >
              <div>
                <span className="font-bold text-sm text-black block">{c.name}</span>
                <span className="text-xs text-slate-500">{c.description || 'General expense category'}</span>
              </div>
              <Badge size="xs" variant={c.is_active ? 'success' : 'neutral'}>
                {c.is_active ? 'Active' : 'Archived'}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal
        isOpen={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        title="Record Daily Institute Expense"
        subtitle="Quick entry for electricity, stationery, tea, maintenance & bills"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-3">
          <Input
            label="Expense Title / Description"
            value={expForm.title}
            onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
            placeholder="e.g. Tea & Refreshments for Faculty"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-black mb-1">Category</label>
              <select
                value={expForm.category_id}
                onChange={(e) => setExpForm({ ...expForm, category_id: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-black focus:outline-none focus:border-odoo-600"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Amount (₹)"
              type="number"
              step="0.01"
              min="0.01"
              value={expForm.amount}
              onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
              placeholder="e.g. 150.00"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Expense Date"
              type="date"
              value={expForm.expense_date}
              onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
              required
            />

            <Select
              label="Payment Mode"
              value={expForm.payment_mode}
              onChange={(e) => setExpForm({ ...expForm, payment_mode: e.target.value })}
              options={[
                { value: 'CASH', label: 'Cash' },
                { value: 'UPI', label: 'UPI' },
                { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                { value: 'CARD', label: 'Card' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          </div>

          <Input
            label="Transaction Reference (Optional)"
            value={expForm.transaction_reference}
            onChange={(e) => setExpForm({ ...expForm, transaction_reference: e.target.value })}
            placeholder="e.g. UPI Ref / Bill No"
          />

          <Input
            label="Internal Notes (Optional)"
            value={expForm.notes}
            onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
            placeholder="e.g. Paid to canteen vendor"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setExpModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Record Expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Salary Entry Modal */}
      <Modal
        isOpen={salModalOpen}
        onClose={() => setSalModalOpen(false)}
        title="Create Monthly Salary Entry"
        subtitle="Record monthly teacher or staff payroll payable"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateSalary} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Select Faculty / Staff
            </label>
            <div className="space-y-2">
              <select
                value={salForm.employee_name_snapshot}
                onChange={(e) =>
                  setSalForm({ ...salForm, employee_name_snapshot: e.target.value })
                }
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-black focus:outline-none focus:border-odoo-600"
              >
                <option value="">Select registered faculty...</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.specialization})
                  </option>
                ))}
              </select>

              <Input
                label="Or Enter Custom Employee Name"
                value={salForm.employee_name_snapshot}
                onChange={(e) =>
                  setSalForm({ ...salForm, employee_name_snapshot: e.target.value })
                }
                placeholder="e.g. Office Attendant / Sweeper"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Staff Role"
              value={salForm.employee_type}
              onChange={(e) => setSalForm({ ...salForm, employee_type: e.target.value })}
              options={[
                { value: 'TEACHER', label: 'Faculty / Teacher' },
                { value: 'STAFF', label: 'Administrative / Support Staff' },
              ]}
            />

            <Input
              label="Salary Month (YYYY-MM)"
              value={salForm.month_year}
              onChange={(e) => setSalForm({ ...salForm, month_year: e.target.value })}
              placeholder="e.g. 2026-11"
              required
            />
          </div>

          {salForm.employee_type === 'TEACHER' && salTeacherAbsentCount !== null && (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">Teacher Attendance ({salForm.month_year})</span>
                  <p className="text-[11px] text-amber-800">
                    Recorded holidays / absent days for this month
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                  salTeacherAbsentCount > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {salTeacherAbsentCount} {salTeacherAbsentCount === 1 ? 'day' : 'days'} absent
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Salary Amount (₹)"
              type="number"
              step="0.01"
              value={salForm.salary_amount}
              onChange={(e) => setSalForm({ ...salForm, salary_amount: e.target.value })}
              required
            />

            <Input
              label="Due Date"
              type="date"
              value={salForm.due_date}
              onChange={(e) => setSalForm({ ...salForm, due_date: e.target.value })}
              required
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setSalModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Create Salary Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* Pay Salary Modal */}
      <Modal
        isOpen={paySalaryModalOpen}
        onClose={() => setPaySalaryModalOpen(false)}
        title="Disburse Salary Payment"
        subtitle={`Record payout for ${selectedSalRecord?.employee_name_snapshot} (${selectedSalRecord?.month_year})`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePaySalarySubmit} className="space-y-3">
          {selectedSalRecord?.employee_type === 'TEACHER' && paySalTeacherAbsentCount !== null && (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">
                    Teacher Attendance ({selectedSalRecord.month_year})
                  </span>
                  <p className="text-[11px] text-amber-800">
                    Recorded holidays before issuing salary
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                  paySalTeacherAbsentCount > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {paySalTeacherAbsentCount} {paySalTeacherAbsentCount === 1 ? 'day' : 'days'} absent
              </span>
            </div>
          )}

          <Input
            label="Payout Amount (₹)"
            type="number"
            step="0.01"
            value={paySalForm.paid_amount}
            onChange={(e) => setPaySalForm({ ...paySalForm, paid_amount: e.target.value })}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Payment Mode"
              value={paySalForm.payment_mode}
              onChange={(e) => setPaySalForm({ ...paySalForm, payment_mode: e.target.value })}
              options={[
                { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
                { value: 'UPI', label: 'UPI' },
                { value: 'CASH', label: 'Cash' },
                { value: 'OTHER', label: 'Cheque / Other' },
              ]}
            />

            <Input
              label="Payment Date"
              type="date"
              value={paySalForm.payment_date}
              onChange={(e) => setPaySalForm({ ...paySalForm, payment_date: e.target.value })}
              required
            />
          </div>

          <Input
            label="Payment Reference / Notes"
            value={paySalForm.notes}
            onChange={(e) => setPaySalForm({ ...paySalForm, notes: e.target.value })}
            placeholder="e.g. UTR ref or Cash voucher no"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => setPaySalaryModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={submitting}>
              Confirm Salary Payout
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Category Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="Add Expense Category"
        subtitle="Define new dynamic category for operational expenses"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleCreateCategory} className="space-y-3">
          <Input
            label="Category Name"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            placeholder="e.g. Electricity & Water"
            required
            autoFocus
          />

          <Input
            label="Description (Optional)"
            value={catForm.description}
            onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
            placeholder="e.g. Utility bills"
          />

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Save Category
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
