import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Printer, Eye, Ban, ExternalLink, Search, RefreshCw, Loader2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import DataTable from '../../components/common/DataTable';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { admissionApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import AdmissionDetailModal from '../../components/modals/AdmissionDetailModal';
import WaiveDueModal from '../../components/modals/WaiveDueModal';
import { formatCycleLabel, evaluateCycleStatus } from '../../utils/dateCycleUtils';

export default function AdmissionsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin } = useAuth();
  const [admissions, setAdmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [slipToShow, setSlipToShow] = useState(null);
  const [payAdmissionId, setPayAdmissionId] = useState(null);
  const [paymentReceiptToShow, setPaymentReceiptToShow] = useState(null);
  const [detailModalAdmission, setDetailModalAdmission] = useState(null);
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [selectedAdmissionForWaive, setSelectedAdmissionForWaive] = useState(null);

  const loadAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await admissionApi.list({
        page,
        page_size: 15,
        search: search.trim() || undefined,
        payment_status: paymentStatusFilter || undefined,
      });
      setAdmissions(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      error(err.message || 'Failed to load admissions');
    } finally {
      setLoading(false);
    }
  }, [page, search, paymentStatusFilter]);

  useEffect(() => {
    loadAdmissions();
  }, [loadAdmissions]);

  const handleCancelAdmission = async (adm) => {
    if (!window.confirm(`Are you sure you want to cancel admission ${adm.admission_number}?`)) {
      return;
    }
    try {
      await admissionApi.cancel(adm.id);
      success(`Admission ${adm.admission_number} has been cancelled.`);
      loadAdmissions();
    } catch (err) {
      error(err.message || 'Failed to cancel admission');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 15));

  const columns = [
    {
      header: 'Purchase Transaction ID',
      className: 'font-mono font-bold text-odoo-700 w-36',
      render: (a) => (
        <div>
          <span>{a.purchase_transaction_id || a.admission_number}</span>
          {(a.status === 'REVOKED' || a.status === 'CANCELLED') && (
            <span className="block text-[10px] text-rose-600 font-sans font-normal">(Cancelled)</span>
          )}
        </div>
      ),
    },
    {
      header: 'Student Name',
      render: (a) => (
        <div>
          <span className="font-bold text-black block">{a.student_name_snapshot}</span>
          <span className="text-[11px] text-slate-700 font-mono font-medium">Date: {a.admission_date}</span>
        </div>
      ),
    },
    {
      header: 'Purchased Subjects',
      render: (a) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {(a.items || []).map((itm, i) => (
            <span
              key={i}
              className="inline-block bg-slate-100 border border-slate-200 text-black px-1.5 py-0.5 rounded text-[11px]"
            >
              {itm.item_name_snapshot}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Rolling Fee Cycle',
      render: (a) => {
        const vFrom = a.valid_from || a.admission_date;
        const vTo = a.valid_to;
        const isCancelled = a.status === 'REVOKED' || a.status === 'CANCELLED';
        const cycle = evaluateCycleStatus(vTo, a.balance_due, isCancelled);
        return (
          <div className="text-xs">
            <span className="font-mono font-bold text-black block">
              {formatCycleLabel(vFrom, vTo)}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-odoo-700 font-semibold bg-purple-50 border border-odoo-200 px-1 py-0.2 rounded">
                Day {vFrom ? parseInt(vFrom.split('-')[2], 10) : '—'}
              </span>
              <Badge size="xs" variant={cycle.variant}>
                {cycle.label}
              </Badge>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Total Payable',
      className: 'text-right font-mono font-bold text-black w-28',
      render: (a) => `₹${Number(a.total_payable).toFixed(2)}`,
    },
    {
      header: 'Paid',
      className: 'text-right font-mono text-emerald-800 font-semibold w-24',
      render: (a) => `₹${Number(a.amount_paid).toFixed(2)}`,
    },
    {
      header: 'Due Balance',
      className: 'text-right font-mono font-bold text-rose-700 w-28',
      render: (a) => (a.status === 'REVOKED' || a.status === 'CANCELLED') ? (
        <span className="text-slate-400 line-through">₹0.00</span>
      ) : (
        <div className="flex flex-col items-end">
          <span>₹{Number(a.balance_due).toFixed(2)}</span>
          {Number(a.balance_due) > 0 && (a.status === 'EXPIRED' || (a.valid_to && new Date(a.valid_to) < new Date())) && (
            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 mt-0.5">
              Expired
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Payment Status',
      className: 'text-center w-28',
      render: (a) => {
        if (a.status === 'REVOKED' || a.status === 'CANCELLED') {
          return <Badge size="xs" variant="danger">CANCELLED</Badge>;
        }
        const variants = {
          PAID: 'success',
          PARTIALLY_PAID: 'warning',
          UNPAID: 'danger',
        };
        return (
          <Badge size="xs" variant={variants[a.payment_status] || 'neutral'}>
            {a.payment_status}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      className: 'text-center w-20',
      render: (a) => (
        <Badge size="xs" variant={a.status === 'ACTIVE' ? 'neutral' : 'danger'}>
          {a.status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right w-64 whitespace-nowrap',
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="xs"
            variant="info"
            icon={ExternalLink}
            onClick={() => navigate(`/admissions/${a.id}`)}
            title="Open Full Course Purchase Page"
          >
            Detail
          </Button>

          <Button
            size="xs"
            variant="indigo"
            icon={Printer}
            onClick={() => setSlipToShow(a)}
            title="View & Print Purchase Slip"
          >
            Slip
          </Button>

          {Number(a.balance_due) > 0 && a.status !== 'REVOKED' && a.status !== 'CANCELLED' && (
            <Button
              size="xs"
              variant="success-soft"
              onClick={() => setPayAdmissionId(a.id)}
              title="Collect Remaining Fee"
            >
              Pay
            </Button>
          )}

          {isAdmin && Number(a.balance_due) > 0 && a.status !== 'REVOKED' && a.status !== 'CANCELLED' && (
            <Button
              size="xs"
              variant="amber"
              icon={Sparkles}
              onClick={() => {
                setSelectedAdmissionForWaive(a);
                setWaiveModalOpen(true);
              }}
              title="Admin only: Waive / forgive pending fee due"
            >
              Waive
            </Button>
          )}

          {isAdmin && a.can_cancel && (
            <Button
              size="xs"
              variant="danger-soft"
              icon={Ban}
              onClick={() => handleCancelAdmission(a)}
              title="Cancel Purchase"
            >
              Cancel
            </Button>
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
          <h1 className="text-xl font-bold text-black tracking-tight">Course Purchases & Invoices</h1>
          <p className="text-xs text-slate-700 mt-0.5 font-medium">
            Multi-subject course purchases, itemized discounts, inclusive GST, and fee settlement
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {[
          { label: 'All Purchases', value: '' },
          { label: 'Unpaid Fees', value: 'UNPAID' },
          { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
          { label: 'Fully Paid', value: 'PAID' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setPaymentStatusFilter(tab.value);
              setPage(1);
            }}
            className={`min-h-[34px] px-3.5 py-1.5 text-xs rounded-full border transition font-bold ${
              paymentStatusFilter === tab.value
                ? 'bg-odoo-600 text-white border-odoo-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile Card View (Optimized for cashier phones) */}
      <div className="sm:hidden space-y-3">
        {/* Mobile Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search student or ID..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-black placeholder:text-slate-400 focus:outline-none focus:border-odoo-600 min-h-[40px]"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center bg-white rounded-lg border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin text-odoo-600 mx-auto" />
            <span className="text-xs text-slate-500 mt-2 block">Loading admissions...</span>
          </div>
        ) : admissions.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-lg border border-slate-200 text-xs text-slate-500">
            No course purchases found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {admissions.map((a) => {
              const vFrom = a.valid_from || a.admission_date;
              const vTo = a.valid_to;
              const isCancelled = a.status === 'REVOKED' || a.status === 'CANCELLED';
              const cycle = evaluateCycleStatus(vTo, a.balance_due, isCancelled);

              return (
                <div
                  key={a.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs"
                >
                  {/* Card Header: ID + Status */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-odoo-700">
                      {a.purchase_transaction_id || a.admission_number}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCancelled ? (
                        <Badge size="xs" variant="danger">CANCELLED</Badge>
                      ) : (
                        <Badge
                          size="xs"
                          variant={
                            a.payment_status === 'PAID'
                              ? 'success'
                              : a.payment_status === 'PARTIALLY_PAID'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {a.payment_status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Student Info */}
                  <div>
                    <div className="font-bold text-sm text-black">{a.student_name_snapshot}</div>
                    <div className="text-[11px] text-slate-700 font-mono flex items-center justify-between mt-0.5 font-medium">
                      <span>Date: {a.admission_date}</span>
                      <span className="text-odoo-800 font-semibold">{formatCycleLabel(vFrom, vTo)}</span>
                    </div>
                  </div>

                  {/* Purchased Items */}
                  <div className="flex flex-wrap gap-1">
                    {(a.items || []).map((itm, i) => (
                      <span
                        key={i}
                        className="bg-slate-100 border border-slate-200 text-black px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      >
                        {itm.item_name_snapshot}
                      </span>
                    ))}
                  </div>

                  {/* Financials Strip */}
                  <div className="bg-slate-50 rounded-md p-2 flex items-center justify-between text-xs border border-slate-200/80">
                    <div>
                      <span className="text-[10px] text-slate-700 block uppercase font-bold">Total</span>
                      <span className="font-mono font-bold text-black">₹{Number(a.total_payable).toFixed(0)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-700 block uppercase font-bold">Paid</span>
                      <span className="font-mono font-bold text-emerald-800">₹{Number(a.amount_paid).toFixed(0)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-700 block uppercase font-bold">Balance Due</span>
                      <span className={`font-mono font-bold ${Number(a.balance_due) > 0 && !isCancelled ? 'text-rose-700' : 'text-slate-500'}`}>
                        {isCancelled ? '₹0' : `₹${Number(a.balance_due).toFixed(0)}`}
                      </span>
                      {Number(a.balance_due) > 0 && !isCancelled && (a.status === 'EXPIRED' || (a.valid_to && new Date(a.valid_to) < new Date())) && (
                        <span className="block text-[9px] font-bold uppercase text-rose-800 bg-rose-100 border border-rose-300 px-1 rounded mt-0.5">
                          Expired
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button
                      size="xs"
                      variant="indigo"
                      icon={Printer}
                      onClick={() => setSlipToShow(a)}
                      className="flex-1 justify-center text-xs font-semibold"
                    >
                      Slip
                    </Button>

                    {Number(a.balance_due) > 0 && !isCancelled && (
                      <Button
                        size="xs"
                        variant="success-soft"
                        onClick={() => setPayAdmissionId(a.id)}
                        className="flex-1 justify-center text-xs font-bold"
                      >
                        Pay Due
                      </Button>
                    )}

                    {isAdmin && Number(a.balance_due) > 0 && !isCancelled && (
                      <Button
                        size="xs"
                        variant="amber"
                        icon={Sparkles}
                        onClick={() => {
                          setSelectedAdmissionForWaive(a);
                          setWaiveModalOpen(true);
                        }}
                        className="flex-1 justify-center text-xs font-bold"
                        title="Admin only: Waive / forgive pending fee due"
                      >
                        Waive
                      </Button>
                    )}

                    <Button
                      size="xs"
                      variant="info"
                      icon={ExternalLink}
                      onClick={() => navigate(`/admissions/${a.id}`)}
                      className="flex-1 justify-center text-xs font-semibold"
                    >
                      Detail
                    </Button>

                    {isAdmin && a.can_cancel && (
                      <Button
                        size="xs"
                        variant="danger-soft"
                        icon={Ban}
                        onClick={() => handleCancelAdmission(a)}
                        title="Cancel Purchase"
                        className="justify-center text-xs font-semibold"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Mobile Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5 text-xs">
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[34px]"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                </Button>
                <span className="font-semibold text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[34px]"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={admissions}
          total={total}
          page={page}
          pageSize={15}
          onPageChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          onRefresh={loadAdmissions}
          loading={loading}
          onRowClick={(row) => navigate(`/admissions/${row.id}`)}
          searchPlaceholder="Search by purchase transaction ID or student name..."
          emptyMessage="No course purchases found."
        />
      </div>

      {/* Admission Detail Modal */}
      <AdmissionDetailModal
        isOpen={!!detailModalAdmission}
        onClose={() => setDetailModalAdmission(null)}
        admission={detailModalAdmission}
        onPrintSlip={(adm) => setSlipToShow(adm)}
        onCollectFee={(admId) => setPayAdmissionId(admId)}
        onWaiveDue={(adm) => {
          setSelectedAdmissionForWaive(adm);
          setWaiveModalOpen(true);
        }}
      />

      {/* Waive Due Modal */}
      <WaiveDueModal
        isOpen={waiveModalOpen}
        onClose={() => {
          setWaiveModalOpen(false);
          setSelectedAdmissionForWaive(null);
        }}
        admission={selectedAdmissionForWaive}
        onSuccess={() => {
          loadAdmissions();
        }}
      />

      {/* Admission Slip Modal */}
      <AdmissionReceiptModal
        isOpen={!!slipToShow}
        onClose={() => setSlipToShow(null)}
        admission={slipToShow}
      />

      {/* Collect Fee Modal */}
      <QuickPaymentModal
        isOpen={!!payAdmissionId}
        onClose={() => setPayAdmissionId(null)}
        initialAdmissionId={payAdmissionId}
        onPaymentSuccess={(receipt) => {
          setPaymentReceiptToShow(receipt);
          loadAdmissions();
        }}
      />

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!paymentReceiptToShow}
        onClose={() => setPaymentReceiptToShow(null)}
        receipt={paymentReceiptToShow}
      />
    </div>
  );
}
