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
    return <div className="p-8 text-center text-xs text-slate-500 animate-pulse">Loading Cashier Dashboard...</div>;
  }

  const m = data?.metrics || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">
            Cashier Front Desk & Fee Portal
          </h1>
          <p className="text-xs text-slate-500">
            Admissions, manual fee collection, receipt generation, and demo follow-ups
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            onClick={() => setSelectedAdmissionForPay('any')}
          >
            Collect Fee
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          color="indigo"
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
      <div className="bg-white border border-amber-300 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-sm font-bold text-black">Upcoming Demo Trial Deadlines</h2>
              <p className="text-[11px] text-slate-600">Students with demos ending soon or expired</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/enquiries')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            All Enquiries <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 divide-y divide-slate-100">
          {(data?.upcoming_demos || []).length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No demo deadlines in the next 5 days.
            </p>
          ) : (
            data.upcoming_demos.map((d) => (
              <div key={d.id} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-black">{d.student_name}</span>
                  <div className="text-[11px] text-slate-500">
                    Subject: <strong className="text-slate-700">{d.interested_subject || 'General'}</strong>
                    {d.mobile && ` • Mob: ${d.mobile}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    size="xs"
                    variant={d.remaining_days < 0 ? 'danger' : d.remaining_days <= 1 ? 'warning' : 'primary'}
                  >
                    {d.remaining_days < 0
                      ? 'Expired'
                      : d.remaining_days === 0
                      ? 'Expires Today'
                      : `${d.remaining_days} days left`}
                  </Badge>

                  <Button
                    size="xs"
                    variant="primary"
                    onClick={() =>
                      navigate(
                        `/admissions/new?enquiry_id=${d.id}&name=${encodeURIComponent(
                          d.student_name
                        )}&mobile=${encodeURIComponent(d.mobile || '')}`
                      )
                    }
                  >
                    Complete Admission
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Due / Outstanding Admissions Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-black">Admissions with Outstanding Fee Balances</h2>
            <p className="text-[11px] text-slate-500">Follow up with students and record partial or full fee collections</p>
          </div>
          <button
            onClick={() => navigate('/admissions')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            All Admissions <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2">Admission No</th>
                <th className="p-2">Student Name</th>
                <th className="p-2 text-right">Total Fee</th>
                <th className="p-2 text-right">Paid</th>
                <th className="p-2 text-right text-rose-700">Due Balance</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.due_admissions || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No pending fee admissions!
                  </td>
                </tr>
              ) : (
                data.due_admissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono font-bold text-black">{adm.admission_number}</td>
                    <td className="p-2 font-semibold text-black">{adm.student_name}</td>
                    <td className="p-2 text-right font-mono text-black">
                      ₹{adm.total_payable.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono text-emerald-800 font-semibold">
                      ₹{adm.amount_paid.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono text-rose-700 font-bold">
                      ₹{adm.balance_due.toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      <Badge size="xs" variant={adm.payment_status === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                        {adm.payment_status}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        size="xs"
                        variant="success"
                        onClick={() => setSelectedAdmissionForPay(adm.id)}
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
