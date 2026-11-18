import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  ReceiptIndianRupee,
  Wallet,
  TrendingUp,
  Plus,
  CreditCard,
  UserPlus,
  ArrowRight,
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
    <div className="space-y-5">
      {/* Title & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
            Institute Admin Overview
          </h1>
          <p className="text-xs text-slate-500">
            Real-time operations, financial health, and admission analytics
          </p>
        </div>

        {/* Quick Shortcut Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/admissions/new')}
          >
            New Admission
          </Button>
          <Button
            size="xs"
            variant="success"
            icon={CreditCard}
            onClick={() => navigate('/payments')}
          >
            Collect Fee
          </Button>
          <Button
            size="xs"
            variant="secondary"
            icon={UserPlus}
            onClick={() => navigate('/students')}
          >
            Register Student
          </Button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Students"
          value={m.total_students ?? 0}
          subtext="Registered in institute"
          icon={GraduationCap}
          color="indigo"
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
          title="Active Batches"
          value={m.active_batches ?? 0}
          subtext="Running classes"
          icon={CalendarDays}
          color="purple"
          onClick={() => navigate('/batches')}
        />
        <StatCard
          title="Pending Enquiries"
          value={m.pending_enquiries ?? 0}
          subtext={`${m.urgent_demo_deadlines ?? 0} urgent demo deadlines`}
          icon={ClipboardList}
          color={m.urgent_demo_deadlines > 0 ? 'amber' : 'indigo'}
          onClick={() => navigate('/enquiries')}
        />
      </div>

      {/* Financial Health Row */}
      <div className="bg-slate-100/70 border border-slate-200 rounded-lg p-3 sm:p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-black mb-3">
          Institute Cash Movement & Financial Position
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Total Billed Fees
            </span>
            <div className="text-lg font-bold text-black mt-0.5">
              ₹{(m.total_revenue_booked || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-500">Gross receivables from admissions</span>
          </div>

          <div className="bg-white rounded-lg p-3 border border-emerald-200 border-l-4 border-l-emerald-600 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase">
              Actual Collections
            </span>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">
              ₹{(m.total_cash_collected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-700">Realized cash in bank & hand</span>
          </div>

          <div className="bg-white rounded-lg p-3 border border-rose-200 border-l-4 border-l-rose-500 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-800 uppercase">
              Total Expenses & Salaries
            </span>
            <div className="text-lg font-bold text-rose-800 mt-0.5">
              ₹{(m.total_expenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-rose-700">Staff salaries + daily expenses</span>
          </div>

          <div className="bg-white rounded-lg p-3 border border-indigo-200 border-l-4 border-l-indigo-600 shadow-xs">
            <span className="text-[11px] font-semibold text-indigo-900 uppercase">
              Net Operating Cash
            </span>
            <div className="text-lg font-bold text-indigo-900 mt-0.5">
              ₹{(m.net_operating_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-indigo-700">Net cash retained</span>
          </div>
        </div>
      </div>

      {/* Two Column Section: Recent Admissions & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Admissions */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-black">Recent Admissions</h2>
            <button
              onClick={() => navigate('/admissions')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto flex-1">
            {(data?.recent_admissions || []).length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No admissions recorded yet.</p>
            ) : (
              data.recent_admissions.map((adm) => (
                <div key={adm.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-black">{adm.student_name}</span>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {adm.admission_number} • {adm.admission_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-black block">
                      ₹{adm.total_payable.toFixed(2)}
                    </span>
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
              ))
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-black">Recent Fee Collections</h2>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto flex-1">
            {(data?.recent_payments || []).length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No payments recorded yet.</p>
            ) : (
              data.recent_payments.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-black">{p.student_name}</span>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {p.payment_number} • <span className="uppercase">{p.payment_mode}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-800 text-sm block">
                      +₹{p.amount.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500">{p.date}</span>
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
