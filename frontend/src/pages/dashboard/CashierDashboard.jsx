import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ReceiptIndianRupee,
  Clock,
  AlertTriangle,
  ArrowRight,
  Plus,
  UserPlus,
  CheckCircle,
  Phone,
  Calendar,
} from 'lucide-react';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { dashboardApi } from '../../services/allApis';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';

export default function CashierDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAdmissionForPay, setSelectedAdmissionForPay] = useState(null);
  const [receiptToShow, setReceiptToShow] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await dashboardApi.getCashier();
      setData(res);
    } catch (err) {
      console.error('Failed to load cashier dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
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
            Cashier Front Desk & Fee Portal
          </h1>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Admissions, manual fee collection, receipt generation, and demo follow-ups
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
            title="Purchase & Pay for Course Batches"
          >
            Course Paid
          </Button>
          <Button
            size="sm"
            variant="success"
            icon={CreditCard}
            onClick={() => setSelectedAdmissionForPay('any')}
            className="min-h-[42px] sm:min-h-[34px] px-3.5 py-2 text-xs font-semibold rounded-lg shadow-2xs active:scale-[0.98] transition-all justify-center"
          >
            Collect Fee
          </Button>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Today's Collections"
          value={`₹${(m.today_collections || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Total collected today"
          icon={ReceiptIndianRupee}
          color="emerald"
        />
        <StatCard
          title="Today's Admissions"
          value={m.today_admissions_count ?? 0}
          subtext="Enrolled today"
          icon={CheckCircle}
          color="odoo"
        />
        <StatCard
          title="Today's Expenses"
          value={`₹${(m.today_expenses || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Daily expenses recorded"
          icon={CreditCard}
          color="rose"
        />
        <StatCard
          title="Total Receivables Due"
          value={`₹${(m.total_receivables_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtext="Pending student fees"
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Upcoming Demo Deadlines Alert Card */}
      <div className="bg-white border border-amber-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center justify-between pb-3.5 border-b border-amber-100 gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-black">Upcoming Demo Trial Deadlines</h2>
              <p className="text-[11px] text-slate-700 font-medium">Students with demos ending soon or expired</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/enquiries')}
            className="text-xs font-bold text-odoo-700 hover:text-odoo-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md transition-colors shrink-0"
          >
            All Enquiries <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-1 divide-y divide-slate-100">
          {(data?.upcoming_demos || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-700 font-semibold">
              No demo deadlines in the next 5 days.
            </p>
          ) : (
            data.upcoming_demos.map((d) => (
              <div
                key={d.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-black text-xs sm:text-sm truncate block">
                    {d.student_name}
                  </span>
                  <div className="text-[11px] text-slate-700 truncate mt-0.5 font-medium">
                    Subject: <strong className="text-black font-semibold">{d.interested_subject || 'General'}</strong>
                    {d.mobile && (
                      <span className="ml-2 font-mono text-slate-700 font-semibold">
                        • Mob: {d.mobile}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                  <Badge
                    size="xs"
                    variant={
                      d.status === 'INTERESTED'
                        ? 'success'
                        : d.remaining_days < 0
                        ? 'danger'
                        : d.remaining_days <= 1
                        ? 'warning'
                        : 'primary'
                    }
                  >
                    {d.status === 'INTERESTED'
                      ? '👍 Interested'
                      : d.remaining_days < 0
                      ? 'Expired'
                      : d.remaining_days === 0
                      ? 'Expires Today'
                      : `${d.remaining_days} days left`}
                  </Badge>

                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      navigate(
                        `/admissions/new?enquiry_id=${d.id}&name=${encodeURIComponent(
                          d.student_name
                        )}&mobile=${encodeURIComponent(d.mobile || '')}`
                      )
                    }
                    className="min-h-[36px] sm:min-h-[30px] px-3 py-1.5 text-xs font-semibold rounded-md shadow-2xs"
                  >
                    Complete Admission
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Due / Outstanding Purchases Table */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-black">Purchases with Outstanding Fee Balances</h2>
            <p className="text-[11px] text-slate-700 font-medium">Follow up with students and record partial or full fee collections</p>
          </div>
          <button
            onClick={() => navigate('/admissions')}
            className="text-xs font-bold text-odoo-700 hover:text-odoo-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md transition-colors self-start sm:self-auto"
          >
            All Purchases <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3.5 overflow-x-auto -webkit-overflow-scrolling-touch rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead className="bg-slate-100 text-slate-900 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="p-3">Purchase Txn ID</th>
                <th className="p-3">Student Name</th>
                <th className="p-3 text-right">Total Fee</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right text-rose-700">Due Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {(data?.due_admissions || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-700 font-semibold">
                    No pending fee purchases!
                  </td>
                </tr>
              ) : (
                data.due_admissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-purple-50/20 transition-colors">
                    <td className="p-3 font-mono font-bold text-black">
                      {adm.purchase_transaction_id || adm.admission_number}
                    </td>
                    <td className="p-3 font-semibold text-black">{adm.student_name}</td>
                    <td className="p-3 text-right font-mono text-black">
                      ₹{adm.total_payable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-800 font-semibold">
                      ₹{adm.amount_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right font-mono">
                      <div className="flex flex-col items-end">
                        <span className="text-rose-700 font-black">
                          ₹{adm.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        {(adm.is_expired || adm.status === 'EXPIRED') && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 mt-0.5">
                            Expired
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge size="xs" variant={adm.payment_status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                          {adm.payment_status}
                        </Badge>
                        {(adm.is_expired || adm.status === 'EXPIRED') && (
                          <Badge size="xs" variant="danger">
                            OVERDUE
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="xs"
                        variant="success-soft"
                        onClick={() => setSelectedAdmissionForPay(adm.id)}
                        className="min-h-[30px] px-3 text-xs font-semibold shadow-2xs"
                      >
                        Collect Fee
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Fee Modal */}
      <QuickPaymentModal
        isOpen={!!selectedAdmissionForPay}
        onClose={() => setSelectedAdmissionForPay(null)}
        initialAdmissionId={selectedAdmissionForPay === 'any' ? null : selectedAdmissionForPay}
        onPaymentSuccess={(receipt) => {
          setReceiptToShow(receipt);
          fetchStats();
        }}
      />

      {/* Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!receiptToShow}
        onClose={() => setReceiptToShow(null)}
        receipt={receiptToShow}
      />
    </div>
  );
}
