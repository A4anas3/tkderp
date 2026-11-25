import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Calculator,
  Sparkles,
  Filter,
  RotateCcw,
  Printer,
} from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import SalarySlipModal from '../../components/receipts/SalarySlipModal';
import { expenseApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { parseMonthYear } from '../../utils/calendarUtils';

const getMonthStrings = () => {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const currentMonth = `${cy}-${String(cm).padStart(2, '0')}`;
  const prevDate = new Date(cy, cm - 2, 1);
  const lastMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  return { currentMonth, lastMonth };
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatMonthLabel = (monthYearStr) => {
  const { yearNum, monthNum } = parseMonthYear(monthYearStr);
  const mName = MONTH_NAMES[monthNum - 1] || '';
  return mName ? `${mName} ${yearNum} (${monthYearStr})` : monthYearStr;
};

const formatINR = (amount) =>
  Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function ExpensesPage() {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'salaries' | 'categories'

  const { currentMonth: curMonthStr, lastMonth: prevMonthStr } = useMemo(() => getMonthStrings(), []);

  // Categories
  const [categories, setCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '', is_active: true });

  // Daily Expenses
  const [expenses, setExpenses] = useState([]);
  const [expTotal, setExpTotal] = useState(0);
  const [expTotalAmount, setExpTotalAmount] = useState(0);
  const [expPage, setExpPage] = useState(1);
  const [expSearch, setExpSearch] = useState('');
  const [expFromDate, setExpFromDate] = useState('');
  const [expToDate, setExpToDate] = useState('');
  const [expCategoryFilter, setExpCategoryFilter] = useState('ALL');
  const [expPaymentModeFilter, setExpPaymentModeFilter] = useState('ALL');
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
  const [salTotalPaidAmount, setSalTotalPaidAmount] = useState(0);
  const [salTotalSalaryAmount, setSalTotalSalaryAmount] = useState(0);
  const [salPage, setSalPage] = useState(1);
  const [salLoading, setSalLoading] = useState(true);
  const [salModalOpen, setSalModalOpen] = useState(false);
  const [salMonthFilter, setSalMonthFilter] = useState('ALL'); // 'ALL' | 'YYYY-MM'
  const [salStaffFilter, setSalStaffFilter] = useState('ALL'); // 'ALL' | 'id:<uuid>' | 'name:<name>'
  const [salStatusFilter, setSalStatusFilter] = useState('ALL'); // 'ALL' | 'PAID' | 'PENDING' | 'PARTIALLY_PAID'
  const [salSearch, setSalSearch] = useState('');
  const [salStaffOptions, setSalStaffOptions] = useState([]);
  const [salMonthOptions, setSalMonthOptions] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [salForm, setSalForm] = useState({
    employee_id: '',
    employee_name_snapshot: '',
    employee_type: 'TEACHER',
    month_year: curMonthStr,
    base_salary: '25000.00',
    holidays_count: '0',
    salary_amount: '25000.00',
    paid_amount: '25000.00',
    payment_mode: 'UPI',
    payment_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [paidSalariesForMonth, setPaidSalariesForMonth] = useState([]);

  // Pay Salary Modal
  const [paySalaryModalOpen, setPaySalaryModalOpen] = useState(false);
  const [selectedSalRecord, setSelectedSalRecord] = useState(null);
  const [salTeacherAbsentCount, setSalTeacherAbsentCount] = useState(null);
  const [paySalTeacherAbsentCount, setPaySalTeacherAbsentCount] = useState(null);
  const [paySalForm, setPaySalForm] = useState({
    paid_amount: '',
    payment_mode: 'UPI',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [salarySlipToShow, setSalarySlipToShow] = useState(null);

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

  // Load Salary Filter Options (staff & months)
  const loadSalaryFilterOptions = useCallback(async () => {
    try {
      const res = await expenseApi.getSalaryFilterOptions();
      setSalStaffOptions(res?.staff || []);
      setSalMonthOptions(res?.months || []);
    } catch (err) {
      console.error('Failed to load salary filter options:', err);
    }
  }, []);

  // Load Expenses
  const loadExpenses = useCallback(async () => {
    setExpLoading(true);
    try {
      const params = {
        page: expPage,
        page_size: 15,
      };
      if (expSearch && expSearch.trim()) {
        params.search = expSearch.trim();
      }
      if (expFromDate) {
        params.from_date = expFromDate;
      }
      if (expToDate) {
        params.to_date = expToDate;
      }
      if (expCategoryFilter && expCategoryFilter !== 'ALL') {
        params.category_id = expCategoryFilter;
      }
      if (expPaymentModeFilter && expPaymentModeFilter !== 'ALL') {
        params.payment_mode = expPaymentModeFilter;
      }
      const res = await expenseApi.listExpenses(params);
      setExpenses(res.items || []);
      setExpTotal(res.total || 0);
      setExpTotalAmount(Number(res.total_amount ?? 0));
    } catch (err) {
      error(err.message || 'Failed to load expenses');
    } finally {
      setExpLoading(false);
    }
  }, [expPage, expSearch, expFromDate, expToDate, expCategoryFilter, expPaymentModeFilter]);

  // Load Salaries (covers current month, last month, and all months)
  const loadSalaries = useCallback(async () => {
    setSalLoading(true);
    try {
      const params = {
        page: salPage,
        page_size: 15,
      };
      if (salMonthFilter && salMonthFilter !== 'ALL') {
        params.month_year = salMonthFilter;
      }
      if (salStatusFilter && salStatusFilter !== 'ALL') {
        params.status_filter = salStatusFilter;
      }
      if (salStaffFilter && salStaffFilter !== 'ALL') {
        if (salStaffFilter.startsWith('id:')) {
          params.employee_id = salStaffFilter.slice(3);
        } else if (salStaffFilter.startsWith('name:')) {
          params.employee_name = salStaffFilter.slice(5);
        }
      }
      if (salSearch && salSearch.trim()) {
        params.search = salSearch.trim();
      }
      const res = await expenseApi.listSalaries(params);
      setSalaries(res.items || []);
      setSalTotal(res.total || 0);
      setSalTotalPaidAmount(Number(res.total_paid_amount ?? res.total_amount ?? 0));
      setSalTotalSalaryAmount(Number(res.total_salary_amount ?? 0));
    } catch (err) {
      error(err.message || 'Failed to load salary records');
    } finally {
      setSalLoading(false);
    }
  }, [salPage, salMonthFilter, salStatusFilter, salStaffFilter, salSearch]);

  useEffect(() => {
    loadCategories();
    loadSalaryFilterOptions();
    teacherApi.list({ page: 1, page_size: 100 }).then((res) => {
      setTeachers(res.items || []);
    });
  }, [loadSalaryFilterOptions]);

  const mergedSalaryMonths = useMemo(() => {
    const set = new Set([curMonthStr, prevMonthStr, ...salMonthOptions]);
    return Array.from(set).filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [curMonthStr, prevMonthStr, salMonthOptions]);

  const mergedStaffOptions = useMemo(() => {
    if (salStaffOptions.length > 0) return salStaffOptions;
    return teachers.map((t) => ({
      key: `id:${t.id}`,
      label: `${t.name} (Faculty)`,
      employee_id: t.id,
      employee_name: t.name,
      employee_type: 'TEACHER',
    }));
  }, [salStaffOptions, teachers]);

  const hasActiveExpFilters = Boolean(
    expFromDate ||
      expToDate ||
      expCategoryFilter !== 'ALL' ||
      expPaymentModeFilter !== 'ALL' ||
      expSearch.trim()
  );

  const handleResetExpFilters = () => {
    setExpFromDate('');
    setExpToDate('');
    setExpCategoryFilter('ALL');
    setExpPaymentModeFilter('ALL');
    setExpSearch('');
    setExpPage(1);
  };

  const hasActiveSalFilters = Boolean(
    salStaffFilter !== 'ALL' ||
      salMonthFilter !== 'ALL' ||
      salStatusFilter !== 'ALL' ||
      salSearch.trim()
  );

  const handleResetSalFilters = () => {
    setSalStaffFilter('ALL');
    setSalMonthFilter('ALL');
    setSalStatusFilter('ALL');
    setSalSearch('');
    setSalPage(1);
  };

  useEffect(() => {
    if (activeTab === 'daily') loadExpenses();
    if (activeTab === 'salaries') loadSalaries();
  }, [activeTab, loadExpenses, loadSalaries]);

  // Helper formula: Payable = monthly salary - (per-day rate x absent days)
  // per-day rate = monthly salary / real days in that month (31/30/28/29)
  // Holidays are paid days, never deducted as absent.
  const calculatePayableSalary = useCallback((baseSalaryVal, monthYearVal, absentCountVal, holidaysCountVal = 0) => {
    const base = parseFloat(baseSalaryVal) || 0;
    const { daysInMonth } = parseMonthYear(monthYearVal);
    const perDayRate = daysInMonth > 0 ? base / daysInMonth : 0;
    const absDays = Math.max(0, parseInt(absentCountVal, 10) || 0);
    const deduction = perDayRate * absDays;
    const payable = Math.max(0, base - deduction);
    return {
      daysInMonth,
      perDayRate,
      absentDays: absDays,
      holidays: parseInt(holidaysCountVal, 10) || 0,
      deduction,
      payable: Math.round(payable * 100) / 100,
    };
  }, []);

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
        const absCnt = res.absent_days_count ?? 0;
        setSalTeacherAbsentCount(absCnt);
        // Auto-calculate payable when attendance is loaded
        const calc = calculatePayableSalary(salForm.base_salary, salForm.month_year, absCnt, salForm.holidays_count);
        setSalForm((prev) => ({
          ...prev,
          employee_id: matched.id,
          salary_amount: calc.payable.toFixed(2),
          paid_amount: calc.payable.toFixed(2),
        }));
      })
      .catch(() => {
        setSalTeacherAbsentCount(0);
      });
  }, [salForm.employee_name_snapshot, salForm.month_year, salForm.employee_type, teachers, calculatePayableSalary]);

  // Load paid salary records for the selected month to show informational 'Already paid' note
  useEffect(() => {
    if (!salModalOpen || !salForm.month_year) return;
    let isCurrent = true;
    expenseApi
      .listSalaries({
        month_year: salForm.month_year.trim(),
        status_filter: 'PAID',
        page_size: 100,
      })
      .then((res) => {
        if (isCurrent) {
          setPaidSalariesForMonth(res?.items || []);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch paid salaries for month:', err);
      });
    return () => {
      isCurrent = false;
    };
  }, [salModalOpen, salForm.month_year]);

  // Informational check: has this employee already received paid salary for the selected month?
  const isAlreadyPaid = useMemo(() => {
    const rawName = salForm.employee_name_snapshot?.trim();
    if (!rawName) return false;
    const normName = rawName.toLowerCase();
    const empId = salForm.employee_id;
    const curMonth = salForm.month_year?.trim();

    // Check all candidates across paidSalariesForMonth and loaded salaries
    const candidateList = [...paidSalariesForMonth, ...salaries];
    return candidateList.some((r) => {
      if (r.month_year !== curMonth) return false;
      const isPaid =
        r.status === 'PAID' ||
        (Number(r.paid_amount || 0) > 0 &&
          Number(r.paid_amount || 0) >= Number(r.salary_amount || 0));
      if (!isPaid) return false;

      if (empId && r.employee_id && String(r.employee_id) === String(empId)) {
        return true;
      }
      const rName = r.employee_name_snapshot?.trim()?.toLowerCase();
      return rName && rName === normName;
    });
  }, [salForm.employee_name_snapshot, salForm.employee_id, salForm.month_year, paidSalariesForMonth, salaries]);

  // Explicit auto-calculate action triggered by user button
  const handleAutoCalculate = () => {
    const calc = calculatePayableSalary(
      salForm.base_salary,
      salForm.month_year,
      salTeacherAbsentCount ?? 0,
      salForm.holidays_count
    );
    setSalForm((prev) => ({
      ...prev,
      salary_amount: calc.payable.toFixed(2),
      paid_amount: calc.payable.toFixed(2),
    }));
    success(
      `Payable auto-calculated: ₹${calc.payable.toFixed(2)} (${calc.absentDays} absent days deducted at ₹${calc.perDayRate.toFixed(2)}/day, ${calc.holidays} holidays fully paid)`
    );
  };

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

  // Create Salary Record & Disburse Payment in One Click
  const handleCreateSalary = async (e) => {
    e.preventDefault();
    if (!salForm.employee_name_snapshot.trim() || !salForm.salary_amount) {
      error('Employee name and salary amount are required');
      return;
    }

    const paidAmt = parseFloat(salForm.paid_amount);
    if (!salForm.paid_amount || isNaN(paidAmt) || paidAmt <= 0) {
      error('Paid amount must be greater than 0');
      return;
    }

    setSubmitting(true);
    let createdRecord = null;
    try {
      createdRecord = await expenseApi.createSalary({
        employee_id: salForm.employee_id || undefined,
        employee_name_snapshot: salForm.employee_name_snapshot.trim(),
        employee_type: salForm.employee_type,
        month_year: salForm.month_year,
        salary_amount: parseFloat(salForm.salary_amount),
        due_date: salForm.due_date,
        base_salary: salForm.base_salary ? parseFloat(salForm.base_salary) : undefined,
        holidays_count: parseInt(salForm.holidays_count, 10) || 0,
        notes: salForm.notes.trim() || null,
      });
    } catch (err) {
      error(err.message || 'Failed to create salary record');
      setSubmitting(false);
      return;
    }

    try {
      const mode = salForm.payment_mode || 'UPI';
      const payDate = salForm.payment_date || new Date().toISOString().split('T')[0];
      await expenseApi.paySalary(createdRecord.id, {
        paid_amount: paidAmt,
        payment_mode: mode,
        payment_date: payDate,
        notes: salForm.notes.trim() || null,
      });
      success(`Salary payment recorded via ${mode} for ${salForm.employee_name_snapshot}`);
      setSalModalOpen(false);
      setSalForm({
        employee_id: '',
        employee_name_snapshot: '',
        employee_type: 'TEACHER',
        month_year: curMonthStr,
        base_salary: '25000.00',
        holidays_count: '0',
        salary_amount: '25000.00',
        paid_amount: '25000.00',
        payment_mode: 'UPI',
        payment_date: new Date().toISOString().split('T')[0],
        due_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      loadSalaries();
      loadSalaryFilterOptions();
    } catch (payErr) {
      error(`Salary record created, but payment failed: ${payErr.message || 'Payment recording failed'}. Record remains PENDING.`);
      setSalModalOpen(false);
      loadSalaries();
      loadSalaryFilterOptions();
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
      payment_mode: 'UPI',
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
      success(`Salary payment recorded via ${paySalForm.payment_mode} for ${selectedSalRecord.employee_name_snapshot}`);
      setPaySalaryModalOpen(false);
      loadSalaries();
    } catch (err) {
      error(err.message || 'Failed to record salary payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenSalarySlip = async (record) => {
    try {
      const slipData = await expenseApi.getSalarySlip(record.id);
      setSalarySlipToShow(slipData);
    } catch (err) {
      error(err.message || 'Failed to load salary slip');
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
      header: 'Payable Salary',
      className: 'text-right font-mono font-bold text-black w-32',
      render: (s) => `₹${Number(s.salary_amount).toFixed(2)}`,
    },
    {
      header: 'Paid Amount',
      className: 'text-right font-mono font-bold text-emerald-800 w-32',
      render: (s) => `₹${Number(s.paid_amount).toFixed(2)}`,
    },
    {
      header: 'Payment Mode',
      className: 'text-center w-28',
      render: (s) =>
        s.payment_mode ? (
          <Badge
            size="xs"
            variant={s.payment_mode === 'UPI' ? 'info' : s.payment_mode === 'CASH' ? 'warning' : 'neutral'}
          >
            {s.payment_mode}
          </Badge>
        ) : (
          <span className="text-slate-400 text-xs font-mono">—</span>
        ),
    },
    {
      header: 'Absent Days',
      className: 'text-center w-32',
      render: (s) => {
        if (s.employee_type !== 'TEACHER') {
          return <span className="text-slate-400 text-xs">—</span>;
        }
        const cal = parseMonthYear(s.month_year);
        const absCnt = s.absent_days_count ?? 0;
        const holCnt = s.holidays_count ?? 0;
        const presCnt = Math.max(0, cal.daysInMonth - absCnt);
        return (
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                absCnt > 0
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
              title={`${absCnt} absent days in ${s.month_year} (${presCnt} / ${cal.daysInMonth} present). Holidays are paid days.`}
            >
              {absCnt} {absCnt === 1 ? 'day' : 'days'}
            </span>
            {holCnt > 0 && (
              <span className="text-[10px] text-slate-500 font-medium">
                {holCnt} {holCnt === 1 ? 'holiday' : 'holidays'} (paid)
              </span>
            )}
          </div>
        );
      },
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
      className: 'text-right w-40 whitespace-nowrap',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="indigo"
            icon={Printer}
            onClick={() => handleOpenSalarySlip(s)}
            title="View, Print & Share Salary Slip"
          >
            Slip
          </Button>
          {s.status !== 'PAID' ? (
            <Button size="xs" variant="success-soft" onClick={() => handleOpenPaySalary(s)}>
              Pay Salary
            </Button>
          ) : (
            <Badge size="xs" variant="success">
              Paid
            </Badge>
          )}
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
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Filter className="w-3.5 h-3.5 text-odoo-600" />
                <span>Filter Daily Expenses</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {expenses.length} of {expTotal} expenses
                </span>
                {hasActiveExpFilters && (
                  <button
                    type="button"
                    onClick={handleResetExpFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  aria-label="From Date"
                  value={expFromDate}
                  onChange={(e) => {
                    setExpFromDate(e.target.value);
                    setExpPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  aria-label="To Date"
                  value={expToDate}
                  onChange={(e) => {
                    setExpToDate(e.target.value);
                    setExpPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Expense Category
                </label>
                <select
                  aria-label="Expense Category"
                  value={expCategoryFilter}
                  onChange={(e) => {
                    setExpCategoryFilter(e.target.value);
                    setExpPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  aria-label="Payment Mode"
                  value={expPaymentModeFilter}
                  onChange={(e) => {
                    setExpPaymentModeFilter(e.target.value);
                    setExpPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                >
                  <option value="ALL">All Modes</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4 text-rose-700" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Total Expenses</span>
                <span className="text-[11px] text-slate-500">
                  {expFromDate && expToDate
                    ? `${expFromDate} to ${expToDate}`
                    : expFromDate
                      ? `From ${expFromDate}`
                      : expToDate
                        ? `Up to ${expToDate}`
                        : 'All dates'}{' '}
                  • {expTotal} {expTotal === 1 ? 'expense' : 'expenses'}
                </span>
              </div>
            </div>
            <div className={`text-right transition-opacity ${expLoading ? 'opacity-60' : ''}`}>
              <span className="text-lg font-mono font-bold text-rose-800">
                ₹{formatINR(expTotalAmount)}
              </span>
            </div>
          </div>

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
            emptyMessage={
              hasActiveExpFilters
                ? 'No daily expenses match the selected filters.'
                : 'No daily expenses recorded.'
            }
          />
        </div>
      )}

      {/* Tab 2: Monthly Salaries (Covers Last Month, Current Month, and All Months) */}
      {activeTab === 'salaries' && (
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-700 mr-1">Period Quick Filter:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSalMonthFilter('ALL');
                    setSalPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                    salMonthFilter === 'ALL'
                      ? 'bg-odoo-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Months
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSalMonthFilter(curMonthStr);
                    setSalPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                    salMonthFilter === curMonthStr
                      ? 'bg-odoo-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Current Month ({curMonthStr})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSalMonthFilter(prevMonthStr);
                    setSalPage(1);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                    salMonthFilter === prevMonthStr
                      ? 'bg-odoo-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Last Month ({prevMonthStr})
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {salaries.length} of {salTotal} payroll entries
                </span>
                {hasActiveSalFilters && (
                  <button
                    type="button"
                    onClick={handleResetSalFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Staff Member
                </label>
                <select
                  aria-label="Staff Member"
                  value={salStaffFilter}
                  onChange={(e) => {
                    setSalStaffFilter(e.target.value);
                    setSalPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                >
                  <option value="ALL">All Staff & Faculty</option>
                  {mergedStaffOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Month
                </label>
                <select
                  aria-label="Month"
                  value={salMonthFilter}
                  onChange={(e) => {
                    setSalMonthFilter(e.target.value);
                    setSalPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                >
                  <option value="ALL">All Months</option>
                  {mergedSalaryMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Payment Status
                </label>
                <select
                  aria-label="Payment Status"
                  value={salStatusFilter}
                  onChange={(e) => {
                    setSalStatusFilter(e.target.value);
                    setSalPage(1);
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-black focus:outline-none focus:border-odoo-600 focus:ring-1 focus:ring-odoo-600 shadow-2xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-indigo-700" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Total Payroll</span>
                <span className="text-[11px] text-slate-500">
                  {salMonthFilter !== 'ALL' ? formatMonthLabel(salMonthFilter) : 'All months'} •{' '}
                  {salTotal} {salTotal === 1 ? 'entry' : 'entries'}
                </span>
              </div>
            </div>
            <div className={`text-right transition-opacity ${salLoading ? 'opacity-60' : ''}`}>
              <span className="text-lg font-mono font-bold text-indigo-900 block leading-tight">
                ₹{formatINR(salTotalPaidAmount)}
              </span>
              <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                Payable: ₹{formatINR(salTotalSalaryAmount)}
              </span>
            </div>
          </div>

          <DataTable
            columns={salaryColumns}
            data={salaries}
            total={salTotal}
            page={salPage}
            pageSize={15}
            onPageChange={(p) => setSalPage(p)}
            searchValue={salSearch}
            onSearchChange={(val) => {
              setSalSearch(val);
              setSalPage(1);
            }}
            onRefresh={loadSalaries}
            loading={salLoading}
            searchPlaceholder="Search payroll by employee name..."
            emptyMessage={
              hasActiveSalFilters
                ? 'No salary records match the selected filters.'
                : 'No salary records found for this period.'
            }
          />
        </div>
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
        subtitle="Auto-calculate teacher or staff payroll payable from real calendar attendance"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateSalary} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Select Faculty / Staff Member
            </label>
            <div className="space-y-2">
              <select
                value={salForm.employee_name_snapshot}
                onChange={(e) => {
                  const val = e.target.value;
                  const matched = teachers.find((t) => t.name === val);
                  setSalForm((prev) => ({
                    ...prev,
                    employee_name_snapshot: val,
                    employee_id: matched ? matched.id : '',
                    employee_type: 'TEACHER',
                  }));
                }}
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
                onChange={(e) => {
                  const val = e.target.value;
                  const matched = teachers.find(
                    (t) => t.name.toLowerCase() === val.trim().toLowerCase()
                  );
                  setSalForm((prev) => ({
                    ...prev,
                    employee_name_snapshot: val,
                    employee_id: matched ? matched.id : '',
                  }));
                }}
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-black">Salary Month</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSalForm((prev) => ({ ...prev, month_year: curMonthStr }))}
                    className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold transition cursor-pointer ${
                      salForm.month_year === curMonthStr
                        ? 'bg-odoo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Current ({curMonthStr})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalForm((prev) => ({ ...prev, month_year: prevMonthStr }))}
                    className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold transition cursor-pointer ${
                      salForm.month_year === prevMonthStr
                        ? 'bg-odoo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Last ({prevMonthStr})
                  </button>
                </div>
              </div>
              <Input
                value={salForm.month_year}
                onChange={(e) => setSalForm({ ...salForm, month_year: e.target.value })}
                placeholder="YYYY-MM (e.g. 2026-11)"
                required
              />
              {isAlreadyPaid && (
                <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                  Already paid
                </span>
              )}
            </div>
          </div>

          {/* Base Monthly Salary and Holidays Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Input
                label="Base Monthly Salary (₹)"
                type="number"
                step="0.01"
                min="0.01"
                value={salForm.base_salary}
                onChange={(e) => {
                  const bVal = e.target.value;
                  const calc = calculatePayableSalary(
                    bVal,
                    salForm.month_year,
                    salTeacherAbsentCount ?? 0,
                    salForm.holidays_count
                  );
                  setSalForm((prev) => ({
                    ...prev,
                    base_salary: bVal,
                    salary_amount: calc.payable.toFixed(2),
                    paid_amount: calc.payable.toFixed(2),
                  }));
                }}
                placeholder="e.g. 25000.00"
                required
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Full-month contractual salary
              </span>
            </div>

            <div>
              <Input
                label="Holidays in Month (Paid Days)"
                type="number"
                min="0"
                max="31"
                value={salForm.holidays_count}
                onChange={(e) => {
                  const hVal = e.target.value;
                  const calc = calculatePayableSalary(
                    salForm.base_salary,
                    salForm.month_year,
                    salTeacherAbsentCount ?? 0,
                    hVal
                  );
                  setSalForm((prev) => ({
                    ...prev,
                    holidays_count: hVal,
                    salary_amount: calc.payable.toFixed(2),
                    paid_amount: calc.payable.toFixed(2),
                  }));
                }}
                placeholder="e.g. 4"
              />
              <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                Holidays are paid days, never deducted as absent
              </span>
            </div>
          </div>

          {/* Teacher Attendance & Salary Auto-calculation Breakdown Card */}
          {salForm.employee_type === 'TEACHER' && (() => {
            const absCnt = salTeacherAbsentCount ?? 0;
            const calc = calculatePayableSalary(
              salForm.base_salary,
              salForm.month_year,
              absCnt,
              salForm.holidays_count
            );
            return (
              <div className="p-3 bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-bold text-slate-900">
                      Attendance & Payroll Engine ({salForm.month_year})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        absCnt > 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {absCnt} {absCnt === 1 ? 'day' : 'days'} absent
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="primary"
                      icon={Calculator}
                      onClick={handleAutoCalculate}
                      title="Auto-calculate payable using real calendar per-day rate formula"
                    >
                      Auto-calculate
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-indigo-100">
                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 block text-[10px]">Real Calendar</span>
                    <span className="font-mono font-bold text-slate-900">
                      {calc.daysInMonth} days
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 block text-[10px]">Per-Day Rate</span>
                    <span className="font-mono font-bold text-slate-900">
                      ₹{calc.perDayRate.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 block text-[10px]">Absent Deduction</span>
                    <span className="font-mono font-bold text-rose-700">
                      -₹{calc.deduction.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-indigo-100">
                    <span className="text-slate-500 block text-[10px]">Holidays (Paid)</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {calc.holidays} days (₹0)
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 bg-white/60 p-2 rounded-lg border border-indigo-100/60 flex items-center justify-between">
                  <span>
                    Formula: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">₹{Number(salForm.base_salary || 0).toFixed(0)} - (₹{calc.perDayRate.toFixed(2)} × {calc.absentDays} days)</code>
                  </span>
                  <span className="font-bold text-indigo-900 font-mono">
                    = ₹{calc.payable.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Input
                label="Payable Salary Amount (₹)"
                type="number"
                step="0.01"
                min="0.01"
                value={salForm.salary_amount}
                onChange={(e) => {
                  const val = e.target.value;
                  setSalForm((prev) => ({
                    ...prev,
                    salary_amount: val,
                    paid_amount: val,
                  }));
                }}
                required
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Auto-calculated payable amount (attendance deductions applied)
              </span>
            </div>

            <div>
              <Input
                label="Paid Amount (₹)"
                type="number"
                step="0.01"
                value={salForm.paid_amount}
                onChange={(e) => setSalForm({ ...salForm, paid_amount: e.target.value })}
                placeholder="e.g. 25000.00"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Actual disbursed amount (editable for partial payment)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Payment Mode"
              value={salForm.payment_mode}
              onChange={(e) => setSalForm({ ...salForm, payment_mode: e.target.value })}
              options={[
                { value: 'UPI', label: 'UPI' },
                { value: 'CASH', label: 'Cash' },
              ]}
            />

            <Input
              label="Payment Date"
              type="date"
              value={salForm.payment_date}
              onChange={(e) => setSalForm({ ...salForm, payment_date: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Due Date"
              type="date"
              value={salForm.due_date}
              onChange={(e) => setSalForm({ ...salForm, due_date: e.target.value })}
              required
            />

            <Input
              label="Internal Notes (Optional)"
              value={salForm.notes}
              onChange={(e) => setSalForm({ ...salForm, notes: e.target.value })}
              placeholder="e.g. Month-end faculty payout"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setSalModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Pay Salary
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
          {selectedSalRecord?.employee_type === 'TEACHER' && paySalTeacherAbsentCount !== null && (() => {
            const cal = parseMonthYear(selectedSalRecord.month_year);
            const pres = Math.max(0, cal.daysInMonth - paySalTeacherAbsentCount);
            return (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">
                      Teacher Attendance ({selectedSalRecord.month_year})
                    </span>
                    <p className="text-[11px] text-amber-800">
                      {pres} of {cal.daysInMonth} days present ({cal.daysInMonth} calendar days)
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
            );
          })()}

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
                { value: 'UPI', label: 'UPI' },
                { value: 'CASH', label: 'Cash' },
                { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
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
            placeholder="e.g. UPI Ref / Cash voucher no"
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

      {/* Printable Salary Slip Modal */}
      <SalarySlipModal
        isOpen={!!salarySlipToShow}
        onClose={() => setSalarySlipToShow(null)}
        slip={salarySlipToShow}
      />
    </div>
  );
}
