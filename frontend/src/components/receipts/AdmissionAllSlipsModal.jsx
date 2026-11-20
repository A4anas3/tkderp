import React, { useState, useEffect } from 'react';
import {
  FileText,
  CreditCard,
  RotateCcw,
  Printer,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { admissionApi } from '../../services/allApis';
import AdmissionReceiptModal from './AdmissionReceiptModal';
import PaymentReceiptModal from './PaymentReceiptModal';
import RefundReceiptModal from './RefundReceiptModal';

export default function AdmissionAllSlipsModal({
  isOpen,
  onClose,
  admissionId,
  admissionData,
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('ALL');
  const [printMode, setPrintMode] = useState(false);

  // Sub-modal states for individual slip preview
  const [viewingAdmission, setViewingAdmission] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [viewingRefund, setViewingRefund] = useState(null);

  useEffect(() => {
    if (isOpen && admissionId) {
      loadSlips();
    } else {
      setData(null);
      setPrintMode(false);
    }
  }, [isOpen, admissionId]);

  const loadSlips = async () => {
    setLoading(true);
    try {
      const res = await admissionApi.getSlips(admissionId);
      setData(res);
    } catch (err) {
      console.error('Failed to load admission slips', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const slips = data?.slips || [];
  const filteredSlips = slips.filter((s) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'INVOICE') return s.slip_type === 'ADMISSION_INVOICE';
    if (activeTab === 'PAYMENT') return s.slip_type === 'PAYMENT_RECEIPT';
    if (activeTab === 'REFUND') return s.slip_type === 'REFUND_VOUCHER';
    return true;
  });

  const handlePrintCombined = () => {
    window.print();
  };

  const handleOpenSlip = (slip) => {
    if (slip.slip_type === 'ADMISSION_INVOICE') {
      setViewingAdmission(slip.data);
    } else if (slip.slip_type === 'PAYMENT_RECEIPT') {
      setViewingReceipt(slip.data);
    } else if (slip.slip_type === 'REFUND_VOUCHER') {
      setViewingRefund(slip.data);
    }
  };

  const admNo = data?.admission_number || admissionData?.admission_number || 'Admission';

  return (
    <>
      <Modal
        isOpen={isOpen && !viewingAdmission && !viewingReceipt && !viewingRefund}
        onClose={onClose}
        title={`All Slips & Receipts — ${admNo}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Printable Combined Statement Document (shown when printMode is active) */}
          {printMode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 no-print">
                <span className="text-xs text-slate-600 font-medium">
                  Showing Unified Multi-Slip Statement of Account
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => setPrintMode(false)}
                  >
                    Back to Slips List
                  </Button>
                  <Button
                    size="xs"
                    variant="primary"
                    icon={Printer}
                    onClick={handlePrintCombined}
                  >
                    Print Statement Now
                  </Button>
                </div>
              </div>

              <div
                id="printable-combined-statement"
                className="border-2 border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm"
              >
                {/* Header */}
                <div className="border-b-2 border-indigo-600 pb-3 text-center">
                  <h2 className="text-lg sm:text-xl font-black text-black tracking-tight uppercase">
                    THAKURDWARA COACHING INSTITUTE
                  </h2>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Civil Lines Road, Thakurdwara • Contact: +91-98765-43210
                  </p>
                  <div className="mt-2 inline-block bg-indigo-50 border border-indigo-300 px-3 py-0.5 rounded text-[11px] font-bold text-indigo-900 uppercase tracking-widest">
                    OFFICIAL STUDENT ADMISSION & COMPLETE PAYMENT STATEMENT
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-slate-500 block">Admission / Purchase ID:</span>
                    <span className="font-mono font-bold text-black text-sm">
                      {data?.admission_number}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block">Admission Date:</span>
                    <span className="font-semibold text-black">
                      {data?.admission_date}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Student Full Name:</span>
                    <span className="font-bold text-black text-sm">
                      {data?.student_name}
                    </span>
                    {data?.student_reg_no && (
                      <span className="font-mono text-[11px] text-slate-600 block">
                        Reg ID: {data?.student_reg_no}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block">Cycle / Validity Period:</span>
                    <span className="font-mono font-semibold text-indigo-900">
                      {data?.valid_from && data?.valid_to
                        ? `${data.valid_from} to ${data.valid_to}`
                        : 'Standard Cycle'}
                    </span>
                  </div>
                </div>

                {/* Enrolled Items */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Enrolled Courses & Batches
                  </h4>
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-1.5">Item Description</th>
                        <th className="p-1.5 text-right">Fee (₹)</th>
                        <th className="p-1.5 text-right">Disc (₹)</th>
                        <th className="p-1.5 text-right">Net Price (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.items || []).map((itm, i) => (
                        <tr key={i}>
                          <td className="p-1.5">
                            <span className="font-semibold text-black block">{itm.item_name_snapshot}</span>
                            {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                              <span className="text-[10px] text-slate-600 block">
                                {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                                {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                                {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                              </span>
                            )}
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            ₹{Number(itm.original_price).toFixed(2)}
                          </td>
                          <td className="p-1.5 text-right font-mono text-slate-600">
                            -₹{(Number(itm.discount_amount || 0) + Number(itm.overall_discount_share || 0)).toFixed(2)}
                          </td>
                          <td className="p-1.5 text-right font-mono font-bold text-black">
                            ₹{Number(itm.net_price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Slips Ledger History (Payments + Refunds) */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    All Financial Slips & Receipts History
                  </h4>
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-1.5">Slip # / Document</th>
                        <th className="p-1.5">Date</th>
                        <th className="p-1.5">Type & Description</th>
                        <th className="p-1.5">Mode</th>
                        <th className="p-1.5 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {slips.map((s, idx) => (
                        <tr key={idx} className={s.slip_type === 'REFUND_VOUCHER' ? 'bg-rose-50/40' : ''}>
                          <td className="p-1.5 font-mono font-bold text-black">
                            {s.slip_number}
                          </td>
                          <td className="p-1.5 text-slate-600">
                            {new Date(s.date).toLocaleDateString('en-IN')}
                          </td>
                          <td className="p-1.5 font-medium text-black">
                            {s.title}
                            {s.notes && (
                              <span className="block text-[10px] text-slate-500 italic">
                                {s.notes}
                              </span>
                            )}
                          </td>
                          <td className="p-1.5 text-slate-700 uppercase font-semibold text-[10px]">
                            {s.mode || '—'}
                          </td>
                          <td className="p-1.5 text-right font-mono font-bold">
                            {s.slip_type === 'ADMISSION_INVOICE' ? (
                              <span className="text-black">₹{Number(s.amount).toFixed(2)}</span>
                            ) : s.slip_type === 'REFUND_VOUCHER' ? (
                              <span className="text-rose-700">-₹{Number(s.amount).toFixed(2)}</span>
                            ) : (
                              <span className="text-emerald-700">+₹{Number(s.amount).toFixed(2)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Account Balances Summary Box */}
                <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-700">
                    <span>Total Billed Course Fee:</span>
                    <span className="font-mono font-bold text-black">
                      ₹{Number(data?.total_payable || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span>Total Amount Paid:</span>
                    <span className="font-mono">
                      ₹{Number(data?.amount_paid || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                    <span>Current Outstanding Due:</span>
                    <span className="font-mono font-black text-sm">
                      ₹{Number(data?.balance_due || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="pt-6 flex items-end justify-between text-[11px] text-slate-600 border-t border-slate-200">
                  <div>
                    <p>Verified Statement generated on {new Date().toLocaleDateString('en-IN')}</p>
                  </div>
                  <div className="text-center">
                    <div className="w-32 border-b border-black mb-1"></div>
                    <p className="font-semibold text-black">Authorized Signatory</p>
                    <p className="text-[10px] text-slate-500">Thakurdwara Institute</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Normal Interactive Slips List View */
            <>
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p>Loading all receipts and slips...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Financial Summary Strip */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Billed</span>
                      <span className="text-black font-mono font-bold text-sm">
                        ₹{Number(data?.total_payable || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Paid So Far</span>
                      <span className="text-emerald-700 font-mono font-bold text-sm">
                        ₹{Number(data?.amount_paid || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Balance Due</span>
                      <span className={`font-mono font-bold text-sm ${Number(data?.balance_due) > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                        ₹{Number(data?.balance_due || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Status</span>
                      <Badge
                        size="xs"
                        variant={
                          data?.status === 'REVOKED'
                            ? 'danger'
                            : data?.payment_status === 'PAID'
                            ? 'success'
                            : data?.payment_status === 'PARTIALLY_PAID'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {data?.status === 'REVOKED' ? 'REVOKED' : data?.payment_status}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions Bar & Filter Tabs */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          activeTab === 'ALL'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        All Slips ({slips.length})
                      </button>
                      <button
                        onClick={() => setActiveTab('INVOICE')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          activeTab === 'INVOICE'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Admission Invoice
                      </button>
                      <button
                        onClick={() => setActiveTab('PAYMENT')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                          activeTab === 'PAYMENT'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Payments ({slips.filter((s) => s.slip_type === 'PAYMENT_RECEIPT').length})
                      </button>
                      {slips.some((s) => s.slip_type === 'REFUND_VOUCHER') && (
                        <button
                          onClick={() => setActiveTab('REFUND')}
                          className={`px-2.5 py-1 rounded text-xs font-semibold ${
                            activeTab === 'REFUND'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Refunds ({slips.filter((s) => s.slip_type === 'REFUND_VOUCHER').length})
                        </button>
                      )}
                    </div>

                    <Button
                      size="xs"
                      variant="primary"
                      icon={Printer}
                      onClick={() => setPrintMode(true)}
                    >
                      Print All Slips / Statement
                    </Button>
                  </div>

                  {/* List of Slips */}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredSlips.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400">
                        No slips found for this category.
                      </p>
                    ) : (
                      filteredSlips.map((slip, i) => {
                        const isInvoice = slip.slip_type === 'ADMISSION_INVOICE';
                        const isPayment = slip.slip_type === 'PAYMENT_RECEIPT';
                        const isRefund = slip.slip_type === 'REFUND_VOUCHER';

                        return (
                          <div
                            key={i}
                            className={`border rounded-lg p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isRefund
                                ? 'bg-rose-50/40 border-rose-200'
                                : isPayment
                                ? 'bg-emerald-50/20 border-emerald-200'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isRefund
                                    ? 'bg-rose-100 text-rose-700'
                                    : isPayment
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-indigo-100 text-indigo-700'
                                }`}
                              >
                                {isRefund ? (
                                  <RotateCcw className="w-4 h-4" />
                                ) : isPayment ? (
                                  <CreditCard className="w-4 h-4" />
                                ) : (
                                  <FileText className="w-4 h-4" />
                                )}
                              </div>

                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-black text-xs">
                                    {slip.slip_number}
                                  </span>
                                  <Badge
                                    size="xs"
                                    variant={
                                      isRefund
                                        ? 'danger'
                                        : isPayment
                                        ? 'success'
                                        : 'info'
                                    }
                                  >
                                    {isInvoice
                                      ? 'Enrollment Slip'
                                      : isPayment
                                      ? 'Payment Receipt'
                                      : 'Refund Voucher'}
                                  </Badge>
                                </div>
                                <h4 className="text-xs font-semibold text-black">
                                  {slip.title}
                                </h4>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                                  <span>
                                    Date: {new Date(slip.date).toLocaleDateString('en-IN')}
                                  </span>
                                  {slip.mode && (
                                    <>
                                      <span>•</span>
                                      <span className="uppercase font-medium text-slate-700">
                                        Mode: {slip.mode}
                                      </span>
                                    </>
                                  )}
                                  {slip.collector_or_processor && (
                                    <>
                                      <span>•</span>
                                      <span>By: {slip.collector_or_processor}</span>
                                    </>
                                  )}
                                </div>
                                {slip.notes && (
                                  <p className="text-[10px] text-slate-600 italic">
                                    {slip.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                              <div className="text-right">
                                <div
                                  className={`text-sm font-black font-mono ${
                                    isRefund
                                      ? 'text-rose-700'
                                      : isPayment
                                      ? 'text-emerald-700'
                                      : 'text-black'
                                  }`}
                                >
                                  {isRefund ? '-' : isPayment ? '+' : ''}₹{Number(slip.amount).toFixed(2)}
                                </div>
                                <span className="text-[10px] text-slate-500 block uppercase">
                                  {isInvoice ? 'Total Billed' : isPayment ? 'Paid' : 'Refunded'}
                                </span>
                              </div>

                              <Button
                                size="xs"
                                variant="secondary"
                                icon={Printer}
                                onClick={() => handleOpenSlip(slip)}
                              >
                                View / Print Slip
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer Controls */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 no-print">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {!printMode && (
              <Button
                variant="primary"
                icon={Printer}
                onClick={() => setPrintMode(true)}
              >
                Print Statement
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Individual Slip Preview Modals */}
      <AdmissionReceiptModal
        isOpen={!!viewingAdmission}
        onClose={() => setViewingAdmission(null)}
        admission={viewingAdmission}
      />

      <PaymentReceiptModal
        isOpen={!!viewingReceipt}
        onClose={() => setViewingReceipt(null)}
        receipt={viewingReceipt}
      />

      <RefundReceiptModal
        isOpen={!!viewingRefund}
        onClose={() => setViewingRefund(null)}
        refund={viewingRefund}
      />
    </>
  );
}
