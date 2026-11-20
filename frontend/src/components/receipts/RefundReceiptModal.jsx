import React, { useState } from 'react';
import { Printer, RotateCcw } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter from './ReceiptFooter';

export default function RefundReceiptModal({ isOpen, onClose, refund }) {
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'

  if (!refund) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = refund.refund_date
    ? new Date(refund.refund_date).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Header with Emblem */}
        <ReceiptHeader
          documentTitle="OFFICIAL FEE REFUND VOUCHER / DEBIT RECEIPT"
          copyType={copyType}
          documentSubtitle={`Voucher No: ${refund.refund_number}`}
        />

        {/* 2-Column High-Contrast Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs border border-slate-300 rounded p-3 bg-slate-50/50">
          {/* Left Column: Student Credentials */}
          <div className="space-y-1 border-r border-slate-200 pr-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Student Name:</span>
              <span className="font-bold text-black text-sm block">{refund.student_name}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Registration / Roll No:</span>
              <span className="font-mono font-bold text-black">{refund.student_reg_no || '—'}</span>
            </div>
            {refund.student_father_name && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Father / Guardian:</span>
                <span className="font-semibold text-slate-800">{refund.student_father_name}</span>
              </div>
            )}
            {refund.student_mobile && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Mobile Contact:</span>
                <span className="font-mono font-medium text-slate-800">{refund.student_mobile}</span>
              </div>
            )}
          </div>

          {/* Right Column: Refund Details */}
          <div className="space-y-1 pl-1">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Refund Voucher No:</span>
              <span className="font-mono font-bold text-black text-sm">{refund.refund_number}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Disbursement Date & Time:</span>
              <span className="font-semibold text-black">{formattedDate}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Purchase Transaction / Course:</span>
              <span className="font-mono font-bold text-black">
                {refund.purchase_transaction_id || refund.admission_number || '—'}
              </span>
              {refund.course_name && (
                <span className="block text-[11px] text-indigo-900 font-medium">
                  {refund.course_name}
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Refund Mode:</span>
              <span className="font-bold text-black uppercase">{refund.refund_mode}</span>
            </div>
          </div>
        </div>

        {/* Refund Disbursement Box */}
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-3 text-center space-y-1">
          <span className="text-[10px] uppercase font-black text-amber-900 tracking-widest block">
            Net Amount Refunded / Disbursed
          </span>
          <div className="text-2xl font-black font-mono text-black">
            ₹{Number(refund.amount).toFixed(2)}
          </div>
          <div className="text-xs text-slate-700 flex items-center justify-center gap-2">
            <span>Payment Mode: <strong className="text-black uppercase">{refund.refund_mode}</strong></span>
            <span>•</span>
            <span>Disbursed By: <strong className="text-black">{refund.processor_name || 'Accounts Officer'}</strong></span>
          </div>
        </div>

        {/* Reason Section */}
        <div className="bg-slate-50 border border-slate-300 rounded p-2.5 text-xs">
          <span className="font-bold text-slate-800 block text-[10px] uppercase tracking-wider mb-0.5">
            Official Reason / Justification for Refund:
          </span>
          <p className="text-slate-900 font-medium italic">{refund.reason || 'Batch dropped / fee adjustment'}</p>
          {refund.notes && (
            <p className="text-[11px] text-slate-600 mt-1">
              <strong>Additional Remarks:</strong> {refund.notes}
            </p>
          )}
        </div>

        {/* Post-Refund Balance Summary */}
        {(refund.admission_total_payable !== undefined || refund.remaining_balance_due !== undefined) && (
          <div className="border border-slate-300 rounded p-2.5 text-xs space-y-1 bg-slate-50/60">
            <span className="font-bold text-black block uppercase text-[10px] tracking-wider mb-1">
              Post-Refund Adjusted Account Ledger
            </span>
            <div className="flex justify-between text-slate-600">
              <span>Original Course Fee Billed:</span>
              <span className="font-mono font-semibold text-black">
                ₹{Number(refund.admission_total_payable || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-emerald-800 font-semibold">
              <span>Net Fee Retained After Refund:</span>
              <span className="font-mono">
                ₹{Number(refund.net_amount_paid_after_refund || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
              <span>Outstanding Balance Due:</span>
              <span className="font-mono font-black">
                ₹{Number(refund.remaining_balance_due || 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={refund.amount}
          issuedDate={refund.refund_date}
          collectorName={refund.processor_name || 'Disbursement Officer'}
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
      title={`Refund Voucher — ${refund.refund_number}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 no-print text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-medium mr-1">Print Copy:</span>
            <button
              onClick={() => setCopyMode('STUDENT')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                copyMode === 'STUDENT'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Student Copy
            </button>
            <button
              onClick={() => setCopyMode('OFFICE')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                copyMode === 'OFFICE'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Office Copy
            </button>
            <button
              onClick={() => setCopyMode('BOTH')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                copyMode === 'BOTH'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Both (Dual Slip)
            </button>
          </div>

          <Button variant="primary" size="xs" icon={Printer} onClick={handlePrint}>
            Print Voucher
          </Button>
        </div>

        {/* Printable Paper */}
        <div
          id="printable-refund-voucher"
          className="printable-slip-document space-y-6"
        >
          {copyMode === 'BOTH' ? (
            <>
              {renderSingleSlip('STUDENT COPY')}
              <div className="relative my-4 text-center select-none no-print-cut">
                <div className="border-t-2 border-dashed border-slate-400 w-full absolute top-1/2"></div>
                <span className="relative bg-white px-3 text-[10px] font-mono text-slate-500 font-bold uppercase">
                  ✂ Cut Along Dotted Line for Office Record ✂
                </span>
              </div>
              {renderSingleSlip('OFFICE / AUDIT COPY')}
            </>
          ) : (
            renderSingleSlip(copyMode === 'STUDENT' ? 'STUDENT COPY' : 'OFFICE / AUDIT COPY')
          )}
        </div>

        {/* Footer controls */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 no-print">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint}>
            Print Refund Voucher
          </Button>
        </div>
      </div>
    </Modal>
  );
}
