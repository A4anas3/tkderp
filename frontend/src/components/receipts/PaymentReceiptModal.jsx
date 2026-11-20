import React, { useState } from 'react';
import { Printer, CheckCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter from './ReceiptFooter';

export default function PaymentReceiptModal({ isOpen, onClose, receipt }) {
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'

  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = receipt.payment_date
    ? new Date(receipt.payment_date).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Header with Emblem */}
        <ReceiptHeader
          documentTitle="OFFICIAL FEE PAYMENT RECEIPT"
          copyType={copyType}
          documentSubtitle={`Receipt No: ${receipt.payment_number}`}
        />

        {/* 2-Column High-Contrast Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs border border-slate-300 rounded p-3 bg-slate-50/50">
          {/* Left Column: Student Credentials */}
          <div className="space-y-1 border-r border-slate-200 pr-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Student Name:</span>
              <span className="font-bold text-black text-sm block">
                {receipt.student_name || receipt.student?.name || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Registration / Roll No:</span>
              <span className="font-mono font-bold text-black">
                {receipt.student_reg_no || receipt.student_code || receipt.student?.student_code || receipt.student?.registration_no || '—'}
              </span>
            </div>
            {(receipt.student_father_name || receipt.student?.father_name) && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Father / Guardian:</span>
                <span className="font-semibold text-slate-800">
                  {receipt.student_father_name || receipt.student?.father_name}
                </span>
              </div>
            )}
            {(receipt.student_mobile || receipt.student?.mobile) && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Mobile Contact:</span>
                <span className="font-mono font-medium text-slate-800">
                  {receipt.student_mobile || receipt.student?.mobile}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Receipt & Transaction Details */}
          <div className="space-y-1 pl-1">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Receipt Voucher No:</span>
              <span className="font-mono font-bold text-black text-sm">{receipt.payment_number}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Date & Time of Payment:</span>
              <span className="font-semibold text-black">{formattedDate}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Purchase Transaction ID:</span>
              <span className="font-mono font-bold text-black">
                {receipt.purchase_transaction_id || receipt.admission_number || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Payment Mode & Ref:</span>
              <span className="font-bold text-black uppercase">
                {receipt.payment_mode}
                {receipt.transaction_reference && (
                  <span className="text-slate-600 font-normal lowercase ml-1 font-mono">
                    ({receipt.transaction_reference})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Fee Validity / Cycle Period */}
        {(receipt.fee_period || (receipt.valid_from && receipt.valid_to)) && (
          <div className="bg-indigo-50/70 border border-indigo-200 rounded p-2 text-xs flex justify-between items-center">
            <span className="text-indigo-900 font-semibold text-[11px]">
              Fee Coverage & Validity Period:
            </span>
            <span className="font-mono font-bold text-indigo-950 text-xs">
              {receipt.fee_period || `${receipt.valid_from} to ${receipt.valid_to}`}
            </span>
          </div>
        )}

        {/* Allocation Breakdown Table if available */}
        {receipt.allocations && receipt.allocations.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider block">
              Fee Allocation by Subject / Module
            </span>
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                  <th className="p-1.5 border-r border-slate-300">Enrolled Subject / Course Module</th>
                  <th className="p-1.5 text-right w-32">Allocated Share (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {receipt.allocations.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-1.5 text-center font-mono border-r border-slate-200 text-slate-600">
                      {i + 1}
                    </td>
                    <td className="p-1.5 text-black border-r border-slate-200 font-medium">
                      {a.item_name}
                    </td>
                    <td className="p-1.5 text-right font-mono font-bold text-black">
                      ₹{Number(a.allocated_amount || a.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Ledger & Payment Realization Box */}
        <div className="border border-slate-300 rounded p-3 text-xs bg-slate-50/70 space-y-1.5">
          <div className="flex justify-between text-slate-600">
            <span>Total Enrolled Course Fee:</span>
            <span className="font-mono text-black font-semibold">
              ₹{Number(receipt.total_admission_payable).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-emerald-900 bg-emerald-50/60 p-1.5 rounded border border-emerald-200">
            <span className="uppercase text-xs font-black">Fee Received in this Receipt:</span>
            <span className="font-mono text-base font-black text-emerald-800">
              ₹{Number(receipt.amount).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-700">
            <span>Total Realized Paid Till Date:</span>
            <span className="font-mono text-black font-semibold">
              ₹{Number(receipt.total_amount_paid_so_far).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
            <span className="text-rose-700">Outstanding Balance Due:</span>
            <span className="font-mono text-rose-700 font-black">
              ₹{Number(receipt.remaining_balance_due).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={receipt.amount}
          issuedDate={receipt.payment_date}
          collectorName={receipt.collector_name || 'Accounts Desk'}
          terms={[
            'Fees once paid are non-refundable and non-transferable under any circumstances.',
            'Please preserve this computer-generated receipt for future verification and ID card issuance.',
            'Digital & UPI payments are subject to realization and bank settlement confirmation.',
          ]}
        />
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Payment Receipt — ${receipt.payment_number}`}
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
            Print Receipt
          </Button>
        </div>

        {/* Printable Paper */}
        <div id="printable-receipt" className="printable-slip-document space-y-6">
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

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 no-print">
          <Badge variant="success">Payment Verified & Recorded</Badge>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" icon={Printer} onClick={handlePrint}>
              Print Receipt
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
