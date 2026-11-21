import React, { useState, useEffect } from 'react';
import {
  FileText,
  CreditCard,
  RotateCcw,
  Printer,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { admissionApi } from '../../services/allApis';
import AdmissionReceiptModal from './AdmissionReceiptModal';
import PaymentReceiptModal from './PaymentReceiptModal';
import RefundReceiptModal from './RefundReceiptModal';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter from './ReceiptFooter';

const formatCurrency = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (val, includeTime = false) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    if (includeTime) {
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(val);
  }
};

const formatFeePeriod = (validFrom, validTo) => {
  if (validFrom && validTo) {
    return `${formatDate(validFrom)} to ${formatDate(validTo)}`;
  }
  if (validFrom) return `From ${formatDate(validFrom)}`;
  if (validTo) return `Valid Until ${formatDate(validTo)}`;
  return 'Standard Academic Session Cycle';
};

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
  const totalBilled = Number(data?.total_payable || 0);
  const totalPaid = Number(data?.amount_paid || 0);
  const balanceDue = Number(data?.balance_due || 0);
  const feeCoverage = formatFeePeriod(data?.valid_from, data?.valid_to);

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
                <span className="text-xs text-slate-800 font-bold">
                  Unified Account Ledger & Multi-Slip Statement
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
                    Print Statement
                  </Button>
                </div>
              </div>

              <div
                id="printable-combined-statement"
                className="printable-slip-document border-2 border-black rounded-lg p-4 sm:p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box"
              >
                {/* Header with Emblem */}
                <ReceiptHeader
                  documentTitle="STUDENT ADMISSION & COMPLETE ACCOUNT LEDGER"
                  copyType="OFFICE & AUDIT LEDGER"
                  documentSubtitle={`Account Ledger: ${data?.admission_number}`}
                />

                {/* 2-Column Student & Admission Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
                  <div className="space-y-1 sm:border-r border-slate-300 sm:pr-3">
                    <div>
                      <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                        Student Full Name:
                      </span>
                      <span className="font-black text-black text-sm block">
                        {data?.student_name}
                      </span>
                    </div>
                    {data?.student_reg_no && (
                      <div>
                        <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                          Registration / Roll No:
                        </span>
                        <span className="font-mono font-bold text-black text-xs">
                          {data?.student_reg_no}
                        </span>
                      </div>
                    )}
                    {data?.student_father_name && (
                      <div>
                        <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                          Father / Guardian Name:
                        </span>
                        <span className="font-semibold text-black">
                          {data?.student_father_name}
                        </span>
                      </div>
                    )}
                    {data?.student_mobile && (
                      <div>
                        <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                          Mobile Contact:
                        </span>
                        <span className="font-mono font-semibold text-black">
                          {data?.student_mobile}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 sm:pl-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                    <div>
                      <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                        Admission / Purchase ID:
                      </span>
                      <span className="font-mono font-black text-black text-sm">
                        {data?.admission_number}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                        Admission Date:
                      </span>
                      <span className="font-bold text-black">
                        {formatDate(data?.admission_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                        Account Status:
                      </span>
                      <span className="inline-block mt-0.5">
                        <Badge
                          size="xs"
                          variant={
                            (data?.status === 'REVOKED' || data?.status === 'CANCELLED')
                              ? 'danger'
                              : data?.payment_status === 'PAID'
                              ? 'success'
                              : data?.payment_status === 'PARTIALLY_PAID'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {(data?.status === 'REVOKED' || data?.status === 'CANCELLED')
                            ? 'CANCELLED'
                            : data?.payment_status || 'ACTIVE'}
                        </Badge>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Date Range The Fee Covers (valid_from to valid_to) Banner */}
                <div className="bg-purple-50/80 border border-odoo-300 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <span className="text-odoo-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-odoo-700 shrink-0" />
                    Fee Coverage & Validity Period:
                  </span>
                  <span className="font-mono font-black text-odoo-950 text-xs sm:text-sm bg-white/80 px-2 py-0.5 rounded border border-odoo-200">
                    {feeCoverage}
                  </span>
                </div>

                {/* Enrolled Courses / Batches */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-black uppercase tracking-wider block">
                    Enrolled Courses & Academic Batches
                  </span>
                  <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                    <table className="w-full text-left text-xs border border-slate-300">
                      <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                        <tr>
                          <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                          <th className="p-1.5 border-r border-slate-300">Item Description</th>
                          <th className="p-1.5 text-right border-r border-slate-300 w-24">Gross (₹)</th>
                          <th className="p-1.5 text-right border-r border-slate-300 w-24">Discount (₹)</th>
                          <th className="p-1.5 text-right w-24">Net Fee (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(data?.items || []).map((itm, i) => {
                          const disc =
                            (Number(itm.discount_amount) || 0) +
                            (Number(itm.overall_discount_share) || 0);

                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-1.5 text-center font-mono border-r border-slate-200 text-slate-700">
                                {i + 1}
                              </td>
                              <td className="p-1.5 border-r border-slate-200">
                                <span className="font-bold text-black block">
                                  {itm.item_name_snapshot}
                                </span>
                                {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                                  <span className="text-[10px] text-slate-700 block mt-0.5">
                                    {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                                    {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                                    {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                                  </span>
                                )}
                              </td>
                              <td className="p-1.5 text-right font-mono border-r border-slate-200 text-slate-800">
                                {formatCurrency(itm.original_price)}
                              </td>
                              <td className="p-1.5 text-right font-mono text-slate-700 border-r border-slate-200 font-semibold">
                                {disc > 0 ? `-${formatCurrency(disc)}` : '—'}
                              </td>
                              <td className="p-1.5 text-right font-mono font-bold text-black">
                                {formatCurrency(itm.net_price)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Complete Financial Slips History Ledger */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-black uppercase tracking-wider block">
                    All Financial Slips & Receipts History
                  </span>
                  <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                    <table className="w-full text-left text-xs border border-slate-300">
                      <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                        <tr>
                          <th className="p-1.5 border-r border-slate-300">Voucher #</th>
                          <th className="p-1.5 border-r border-slate-300">Date</th>
                          <th className="p-1.5 border-r border-slate-300">Classification</th>
                          <th className="p-1.5 border-r border-slate-300">Mode</th>
                          <th className="p-1.5 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {slips.map((s, idx) => (
                          <tr
                            key={idx}
                            className={s.slip_type === 'REFUND_VOUCHER' ? 'bg-rose-50/40' : 'hover:bg-slate-50'}
                          >
                            <td className="p-1.5 font-mono font-bold text-black border-r border-slate-200">
                              {s.slip_number}
                            </td>
                            <td className="p-1.5 text-slate-700 border-r border-slate-200">
                              {formatDate(s.date)}
                            </td>
                            <td className="p-1.5 font-semibold text-black border-r border-slate-200">
                              {s.title}
                              {s.notes && (
                                <span className="block text-[10px] text-slate-600 font-normal italic">
                                  {s.notes}
                                </span>
                              )}
                            </td>
                            <td className="p-1.5 text-slate-800 uppercase font-semibold text-[10px] border-r border-slate-200">
                              {s.mode || '—'}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold">
                              {s.slip_type === 'ADMISSION_INVOICE' ? (
                                <span className="text-black">{formatCurrency(s.amount)}</span>
                              ) : s.slip_type === 'REFUND_VOUCHER' ? (
                                <span className="text-rose-700">-{formatCurrency(s.amount)}</span>
                              ) : (
                                <span className="text-emerald-800">+{formatCurrency(s.amount)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Clear Amounts Bill Table (fee, discount, GST, amount paid, balance due) */}
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
                    <span>Consolidated Account Ledger Balances</span>
                    <span className="text-[9px] text-slate-500 font-normal">Amounts in INR (₹)</span>
                  </div>
                  <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
                    <table className="w-full text-left text-xs border border-slate-300">
                      <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                        <tr>
                          <th className="p-2 border-r border-slate-300">Ledger Classification</th>
                          <th className="p-2 text-right w-36 sm:w-44">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="p-2 border-r border-slate-200 text-slate-900 font-medium">
                            Total Billed Course Fee (Gross)
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-black">
                            {formatCurrency(totalBilled)}
                          </td>
                        </tr>
                        <tr className="bg-emerald-50 border-t border-emerald-300">
                          <td className="p-2 border-r border-emerald-200 font-black text-emerald-950 uppercase text-xs">
                            Total Realized Amount Paid Till Date
                          </td>
                          <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-emerald-900">
                            {formatCurrency(totalPaid)}
                          </td>
                        </tr>
                        <tr className={balanceDue > 0 ? 'bg-rose-50 border-t-2 border-rose-300' : 'bg-emerald-50/50 border-t border-emerald-200'}>
                          <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                            Current Outstanding Balance Due
                          </td>
                          <td className={`p-2 text-right font-mono font-black text-sm sm:text-base ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                            {balanceDue > 0 ? formatCurrency(balanceDue) : '₹0.00 (NIL / FULLY SETTLED)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer with Seal & Signatures */}
                <ReceiptFooter
                  amount={totalPaid}
                  issuedDate={data?.admission_date}
                  collectorName="Accounts Section"
                  terms={[
                    'This statement reflects complete financial transactions (fees billed, receipts realized & refunds).',
                    'All receipts listed are reconciled in real-time with the institute accounting ledger.',
                    'For any discrepancy, present individual computer-generated receipts to the accounts office.',
                  ]}
                />
              </div>
            </div>
          ) : (
            /* Normal Interactive Slips List View */
            <>
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p>Loading all receipts and slips...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Financial Summary Strip */}
                  <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">
                        Total Billed
                      </span>
                      <span className="text-black font-mono font-bold text-sm">
                        {formatCurrency(totalBilled)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">
                        Paid So Far
                      </span>
                      <span className="text-emerald-700 font-mono font-bold text-sm">
                        {formatCurrency(totalPaid)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">
                        Balance Due
                      </span>
                      <span className={`font-mono font-bold text-sm ${balanceDue > 0 ? 'text-rose-700' : 'text-black'}`}>
                        {formatCurrency(balanceDue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 block text-[10px] uppercase font-bold tracking-wider">
                        Status
                      </span>
                      <span className="inline-block mt-0.5">
                        <Badge
                          size="xs"
                          variant={
                            (data?.status === 'REVOKED' || data?.status === 'CANCELLED')
                              ? 'danger'
                              : data?.payment_status === 'PAID'
                              ? 'success'
                              : data?.payment_status === 'PARTIALLY_PAID'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {(data?.status === 'REVOKED' || data?.status === 'CANCELLED')
                            ? 'CANCELLED'
                            : data?.payment_status || 'ACTIVE'}
                        </Badge>
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar & Filter Tabs */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setActiveTab('ALL')}
                        className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                          activeTab === 'ALL'
                            ? 'bg-odoo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        All Slips ({slips.length})
                      </button>
                      <button
                        onClick={() => setActiveTab('INVOICE')}
                        className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                          activeTab === 'INVOICE'
                            ? 'bg-odoo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        Enrollment Slip
                      </button>
                      <button
                        onClick={() => setActiveTab('PAYMENT')}
                        className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                          activeTab === 'PAYMENT'
                            ? 'bg-odoo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        Payments ({slips.filter((s) => s.slip_type === 'PAYMENT_RECEIPT').length})
                      </button>
                      {slips.some((s) => s.slip_type === 'REFUND_VOUCHER') && (
                        <button
                          onClick={() => setActiveTab('REFUND')}
                          className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                            activeTab === 'REFUND'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
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
                      Print Statement
                    </Button>
                  </div>

                  {/* List of Slips */}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredSlips.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-500 font-medium">
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
                                ? 'bg-rose-50/40 border-rose-300'
                                : isPayment
                                ? 'bg-emerald-50/30 border-emerald-300'
                                : 'bg-white border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  isRefund
                                    ? 'bg-rose-100 text-rose-800'
                                    : isPayment
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-purple-100 text-odoo-800'
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
                                <h4 className="text-xs font-bold text-black">
                                  {slip.title}
                                </h4>
                                <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 font-medium">
                                  <span>Date: {formatDate(slip.date)}</span>
                                  {slip.mode && (
                                    <>
                                      <span>•</span>
                                      <span className="uppercase text-black font-semibold">
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
                                  <p className="text-[10px] text-slate-700 italic">
                                    {slip.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
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
                                  {isRefund ? '-' : isPayment ? '+' : ''}{formatCurrency(slip.amount)}
                                </div>
                                <span className="text-[10px] text-slate-600 block uppercase font-bold tracking-wider">
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
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 no-print">
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
