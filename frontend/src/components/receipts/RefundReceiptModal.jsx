import React, { useState } from 'react';
import { Printer, Calendar, RotateCcw } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
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

export default function RefundReceiptModal({ isOpen, onClose, refund, refundData }) {
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'

  const data = refund || refundData;
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const refundNumber = data.refund_number || '—';
  const refundDateFormatted = formatDate(data.refund_date, true);

  const refundedAmount = Number(data.amount || 0);
  const requestedAmount = Number(data.refund_amount_requested || refundedAmount);
  const deductionAmount = Number(data.deduction_amount || 0);
  const totalBilledFee = Number(data.admission_total_payable || 0);
  const netPaidAfterRefund = Number(data.net_amount_paid_after_refund || 0);
  const remainingDue = Number(data.remaining_balance_due || 0);

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border-2 border-black rounded-lg p-4 sm:p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Institute Header with Emblem & Document Ribbon */}
        <ReceiptHeader
          documentTitle="OFFICIAL FEE REFUND VOUCHER / DEBIT NOTE"
          copyType={copyType}
          documentSubtitle={`Voucher No: ${refundNumber}`}
        />

        {/* Student & Refund Details: 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
          {/* Left Column: Student Details */}
          <div className="space-y-1 sm:border-r border-slate-300 sm:pr-3">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Student Full Name:
              </span>
              <span className="font-black text-black text-sm block">
                {data.student_name || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Registration / Roll No:
              </span>
              <span className="font-mono font-bold text-black text-xs">
                {data.student_reg_no || '—'}
              </span>
            </div>
            {data.student_father_name && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Father / Guardian Name:
                </span>
                <span className="font-semibold text-black">
                  {data.student_father_name}
                </span>
              </div>
            )}
            {data.student_mobile && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Contact Mobile:
                </span>
                <span className="font-mono font-semibold text-black">
                  {data.student_mobile}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Refund Voucher Details */}
          <div className="space-y-1 sm:pl-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Refund Voucher No:
              </span>
              <span className="font-mono font-black text-black text-sm">
                {refundNumber}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Disbursement Date & Time:
              </span>
              <span className="font-bold text-black">
                {refundDateFormatted}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Admission / Enrollment No:
              </span>
              <span className="font-mono font-bold text-black">
                {data.purchase_transaction_id || data.admission_number || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Refund Disbursement Mode:
              </span>
              <span className="font-bold text-black uppercase">
                {data.refund_mode}
              </span>
            </div>
          </div>
        </div>

        {/* Course Reference & Fee Period Banner */}
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <span className="text-amber-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-amber-700 shrink-0" />
            Enrolled Course & Subject Reference:
          </span>
          <span className="font-semibold text-black text-xs sm:text-sm bg-white/80 px-2 py-0.5 rounded border border-amber-200">
            {data.course_name || 'Academic Course Enrollment'}
          </span>
        </div>

        {/* Clear Amounts Bill Table (fee, discount/deduction, GST, amount paid, balance due) */}
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
            <span>Refund Ledger & Adjusted Balance Statement</span>
            <span className="text-[9px] text-slate-500 font-normal">Amounts in INR (₹)</span>
          </div>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Refund Particulars</th>
                  <th className="p-2 text-right w-36 sm:w-44">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {totalBilledFee > 0 && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-800 font-medium">
                      Original Course Fee Billed (Gross)
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-black">
                      {formatCurrency(totalBilledFee)}
                    </td>
                  </tr>
                )}

                <tr>
                  <td className="p-2 border-r border-slate-200 text-slate-800">
                    Gross Refund Amount Claimed / Requested
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-black">
                    {formatCurrency(requestedAmount)}
                  </td>
                </tr>

                {deductionAmount > 0 && (
                  <tr className="bg-rose-50/40">
                    <td className="p-2 border-r border-slate-200 text-rose-900 font-semibold">
                      Less: Cancellation / Administrative Deduction
                      {data.deduction_reason && (
                        <span className="block text-[10px] font-normal text-rose-700">
                          ({data.deduction_reason})
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-rose-700">
                      -{formatCurrency(deductionAmount)}
                    </td>
                  </tr>
                )}

                {/* Net Amount Disbursed — Bold Highlight */}
                <tr className="bg-amber-50 border-y-2 border-amber-400">
                  <td className="p-2 border-r border-amber-300 font-black text-amber-950 uppercase text-xs">
                    Net Amount Refunded / Disbursed ({data.refund_mode})
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-amber-950">
                    {formatCurrency(refundedAmount)}
                  </td>
                </tr>

                {/* Post-Refund Account Balance */}
                {totalBilledFee > 0 && (
                  <>
                    <tr className="bg-slate-50">
                      <td className="p-2 border-r border-slate-200 text-slate-800 font-semibold">
                        Net Course Fee Retained After Refund
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-black">
                        {formatCurrency(netPaidAfterRefund)}
                      </td>
                    </tr>
                    <tr className={remainingDue > 0 ? 'bg-rose-50 border-t-2 border-rose-300' : 'bg-emerald-50/50 border-t border-emerald-200'}>
                      <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                        Adjusted Outstanding Balance Due
                      </td>
                      <td className={`p-2 text-right font-mono font-black text-sm sm:text-base ${remainingDue > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                        {remainingDue > 0 ? formatCurrency(remainingDue) : '₹0.00 (NIL / FULLY SETTLED)'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reason Section */}
        <div className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs">
          <span className="font-bold text-black block text-[10px] uppercase tracking-wider mb-0.5">
            Official Reason & Approval Justification:
          </span>
          <p className="text-black font-semibold italic">
            {data.reason || 'Batch dropped / academic schedule conflict'}
          </p>
          {data.notes && (
            <p className="text-[11px] text-slate-700 mt-1">
              <strong>Additional Remarks:</strong> {data.notes}
            </p>
          )}
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={refundedAmount}
          issuedDate={data.refund_date}
          collectorName={data.processor_name || 'Disbursement Officer'}
          terms={[
            'Fee refund has been settled in full accordance with institute policy & approval.',
            'The student / payee acknowledges receipt of the refunded sum shown above.',
            'Batch seat allocation corresponding to this refunded voucher stands revoked/adjusted.',
          ]}
        />
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Refund Voucher — ${refundNumber}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200 no-print text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-600 font-bold mr-1">Print Copy:</span>
            <button
              onClick={() => setCopyMode('STUDENT')}
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                copyMode === 'STUDENT'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              Student Copy
            </button>
            <button
              onClick={() => setCopyMode('OFFICE')}
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                copyMode === 'OFFICE'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              Office Copy
            </button>
            <button
              onClick={() => setCopyMode('BOTH')}
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                copyMode === 'BOTH'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              Both (Dual Slip)
            </button>
          </div>

          <Button variant="primary" size="xs" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
            Print Voucher
          </Button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div id="printable-refund-voucher" className="printable-slip-document space-y-6">
          {copyMode === 'BOTH' ? (
            <>
              {renderSingleSlip('STUDENT COPY')}
              <div className="relative my-4 text-center select-none no-print-cut">
                <div className="border-t-2 border-dashed border-slate-400 w-full absolute top-1/2"></div>
                <span className="relative bg-white px-3 text-[10px] font-mono text-slate-600 font-bold uppercase">
                  ✂ Cut Along Dotted Line for Office Record ✂
                </span>
              </div>
              {renderSingleSlip('OFFICE / AUDIT COPY')}
            </>
          ) : (
            renderSingleSlip(copyMode === 'STUDENT' ? 'STUDENT COPY' : 'OFFICE / AUDIT COPY')
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-200 no-print">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
            Print Refund Voucher
          </Button>
        </div>
      </div>
    </Modal>
  );
}
