import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  ReceiptIndianRupee,
  Wallet,
  TrendingUp,
  Plus,
  CreditCard,
  UserPlus,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { dashboardApi } from '../../services/allApis';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await dashboardApi.getAdmin();
        setData(res);
      } catch (err) {
        console.error('Failed to load admin dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  const m = data?.metrics || {};

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Odoo Control Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight">
            Institute Admin Overview
          </h1>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Real-time operations, financial health, and admission analytics
          </p>
        </div>

        {/* Quick Shortcut Buttons - easy tap on mobile */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/admissions/new')}
            className="min-h-[42px] sm:min-h-[34px] px-3.5 py-2 text-xs font-semibold rounded-lg shadow-2xs active:scale-[0.98] transition-all justify-center"
            title="Purchase & Pay for Courses"
          >
            Course Paid
          </Button>
          <Button
            size="sm"
            variant="success"
            icon={CreditCard}
            onClick={() => navigate('/payments')}
            className="min-h-[42px] sm:min-h-[34px] px-3.5 py-2 text-xs font-semibold rounded-lg shadow-2xs active:scale-[0.98] transition-all justify-center"
          >
            Collect Fee
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={UserPlus}
            onClick={() => navigate('/students')}
            className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-[34px] px-3.5 py-2 text-xs font-semibold rounded-lg shadow-2xs active:scale-[0.98] transition-all justify-center"
            title="Admit / Register New Student"
          >
            New Admission
          </Button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Students"
          value={m.total_students ?? 0}
          subtext="Registered in institute"
          icon={GraduationCap}
          color="odoo"
          onClick={() => navigate('/students')}
        />
        <StatCard
          title="Active Teachers"
          value={m.total_teachers ?? 0}
          subtext="Teaching faculty"
          icon={Users}
          color="blue"
          onClick={() => navigate('/teachers')}
        />
        <StatCard
          title="Active Subjects"
          value={m.active_subjects ?? 0}
          subtext="Running subjects"
          icon={BookOpen}
          color="purple"
          onClick={() => navigate('/subjects')}
        />
        <StatCard
          title="Pending Enquiries"
          value={m.pending_enquiries ?? 0}
          subtext={`${m.urgent_demo_deadlines ?? 0} urgent demo deadlines`}
          icon={ClipboardList}
          color={m.urgent_demo_deadlines > 0 ? 'amber' : 'odoo'}
          onClick={() => navigate('/enquiries')}
        />
      </div>

      {/* Financial Health Row - Odoo clean white cards */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-3.5 mb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-50 text-odoo-600 border border-purple-200">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black">
                Institute Cash Movement & Financial Position
              </h2>
              <p className="text-[11px] text-slate-700 font-medium">
                Live summary of gross billings, realized collections, expenditures, and retained operating cash
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>Real-time Ledger</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
          {/* Total Billed Fees */}
          <div className="bg-slate-50/70 rounded-xl p-3.5 sm:p-4 border border-slate-200 border-l-4 border-l-slate-400 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Total Billed Fees
                </span>
                <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                  Billed
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-black mt-1.5 break-words tracking-tight">
                ₹{(m.total_revenue_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[11px] text-slate-600 font-medium mt-2 leading-tight">
              Gross receivables from admissions
            </span>
          </div>

          {/* Actual Collections */}
          <div className="bg-emerald-50/40 rounded-xl p-3.5 sm:p-4 border border-emerald-200 border-l-4 border-l-emerald-600 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                  Actual Collections
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-1.5 py-0.5 rounded">
                  In Hand
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-900 mt-1.5 break-words tracking-tight">
                ₹{(m.total_cash_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[11px] text-emerald-800 font-semibold mt-2 leading-tight">
              Realized cash in bank & hand
            </span>
          </div>

          {/* Total Expenses & Salaries */}
          <div className="bg-rose-50/40 rounded-xl p-3.5 sm:p-4 border border-rose-200 border-l-4 border-l-rose-500 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                  Total Expenses & Salaries
                </span>
                <span className="text-[10px] font-bold text-rose-800 bg-rose-100/80 border border-rose-300 px-1.5 py-0.5 rounded">
                  Outflows
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-rose-900 mt-1.5 break-words tracking-tight">
                ₹{(m.total_expenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[11px] text-rose-800 font-semibold mt-2 leading-tight">
              Staff salaries + daily expenses
            </span>
          </div>

          {/* Net Operating Cash */}
          <div className="bg-purple-50/50 rounded-xl p-3.5 sm:p-4 border border-purple-200 border-l-4 border-l-odoo-600 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-odoo-900 uppercase tracking-wider">
                  Net Operating Cash
                </span>
                <span className="text-[10px] font-bold text-odoo-800 bg-purple-100/80 border border-purple-300 px-1.5 py-0.5 rounded">
                  Net Cash
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-odoo-900 mt-1.5 break-words tracking-tight">
                ₹{(m.net_operating_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[11px] text-odoo-800 font-semibold mt-2 leading-tight">
              Net cash retained
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Section: Admission Analytics (Recent Admissions) & Recent Fee Collections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Recent Admissions (Admission Analytics) */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-50 text-odoo-600 border border-purple-200">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-black">Recent Admissions</h2>
                <p className="text-[11px] text-slate-700 font-medium">Latest enrolled students & fee validity</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admissions')}
              className="text-xs font-bold text-odoo-700 hover:text-odoo-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md transition-colors shrink-0"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto flex-1 mt-1">
            {(data?.recent_admissions || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-700 font-semibold">No admissions recorded yet.</p>
            ) : (
              data.recent_admissions.map((adm) => (
                <div
                  key={adm.id}
                  onClick={() => navigate(`/admissions/${adm.id}`)}
                  className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/90 px-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-black text-xs sm:text-sm truncate block hover:text-odoo-700 transition-colors">
                      {adm.student_name}
                    </span>
                    <div className="text-[11px] text-slate-600 font-mono truncate mt-0.5">
                      {adm.admission_number} • {adm.admission_date}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-black text-xs sm:text-sm block">
                      ₹{adm.total_payable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      {adm.payment_status !== 'PAID' && adm.balance_due > 0 && (
                        <span className="text-[10px] font-mono text-rose-700 font-semibold hidden sm:inline">
                          Due: ₹{adm.balance_due.toFixed(0)}{adm.status === 'EXPIRED' ? ' (Expired)' : ''}
                        </span>
                      )}
                      <Badge
                        size="xs"
                        variant={
                          adm.payment_status === 'PAID'
                            ? 'success'
                            : adm.payment_status === 'PARTIALLY_PAID'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {adm.payment_status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Fee Collections */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ReceiptIndianRupee className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-black">Recent Fee Collections</h2>
                <p className="text-[11px] text-slate-700 font-medium">Realized payments & ledger entries</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs font-bold text-odoo-700 hover:text-odoo-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md transition-colors shrink-0"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto flex-1 mt-1">
            {(data?.recent_payments || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-700 font-semibold">No payments recorded yet.</p>
            ) : (
              data.recent_payments.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/payments/${p.id}`)}
                  className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/90 px-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-black text-xs sm:text-sm truncate block hover:text-emerald-700 transition-colors">
                      {p.student_name}
                    </span>
                    <div className="text-[11px] text-slate-700 font-mono truncate mt-0.5 font-medium">
                      {p.payment_number} • <span className="uppercase font-bold text-slate-900">{p.payment_mode}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-black text-emerald-800 text-xs sm:text-sm block">
                      +₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-600 font-semibold mt-0.5 block">{p.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
