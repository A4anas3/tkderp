import React from 'react';
import { Printer, CheckCircle, ShieldCheck } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function PaymentReceiptModal({ isOpen, onClose, receipt }) {
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Payment Receipt"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Printable Receipt Paper */}
        <div
          id="printable-receipt"
          className="border border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm"
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
              OFFICIAL FEE PAYMENT RECEIPT
            </div>
          </div>

          {/* Receipt Info Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs border-b border-slate-200 pb-3">
            <div>
              <p className="text-slate-500">Receipt No:</p>
              <p className="font-bold font-mono text-black text-sm">{receipt.payment_number}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Payment Date & Time:</p>
              <p className="font-semibold text-black">{formattedDate}</p>
            </div>
            <div>
              <p className="text-slate-500">Student Name:</p>
              <p className="font-bold text-black text-sm">{receipt.student_name}</p>
              <p className="text-[11px] font-mono text-slate-600">ID: {receipt.student_reg_no}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Purchase Transaction ID:</p>
              <p className="font-bold font-mono text-black">{receipt.purchase_transaction_id || receipt.admission_number}</p>
              {receipt.student_mobile && (
                <p className="text-[11px] text-slate-600">Mob: {receipt.student_mobile}</p>
              )}
            </div>
          </div>

          {/* Payment Method & Transaction */}
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500">Payment Mode: </span>
              <strong className="text-black uppercase">{receipt.payment_mode}</strong>
              {receipt.transaction_reference && (
                <span className="text-slate-600 ml-2">
                  (Ref: <code className="text-black">{receipt.transaction_reference}</code>)
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Collected By: </span>
              <strong className="text-black">{receipt.collector_name}</strong>
            </div>
          </div>

          {/* Allocation Breakdown Table if exists */}
          {receipt.allocations && receipt.allocations.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Subject-Wise Allocation Breakdown
              </p>
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-1.5">Enrolled Subject / Item</th>
                    <th className="p-1.5 text-right">Allocated Share (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipt.allocations.map((a, i) => (
                    <tr key={i}>
                      <td className="p-1.5 text-black">{a.item_name}</td>
                      <td className="p-1.5 text-right font-mono font-semibold text-black">
                        ₹{Number(a.allocated_amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Financial Summary */}
          <div className="border border-slate-300 rounded p-3 space-y-1.5 text-xs bg-slate-50/70">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Admission Fee:</span>
              <span className="font-mono text-black font-semibold">
                ₹{Number(receipt.total_admission_payable).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold text-emerald-800">
              <span>Amount Paid In This Receipt:</span>
              <span className="font-mono text-base font-black">
                ₹{Number(receipt.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-600">Total Paid Till Date:</span>
              <span className="font-mono text-black font-semibold">
                ₹{Number(receipt.total_amount_paid_so_far).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
              <span className="text-rose-700">Remaining Balance Due:</span>
              <span className="font-mono text-rose-700 font-black">
                ₹{Number(receipt.remaining_balance_due).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Footer & Signatures */}
          <div className="pt-6 flex items-end justify-between text-[11px] text-slate-600 border-t border-slate-200">
            <div>
              <p className="font-semibold text-black">Terms & Conditions:</p>
              <p>• Fees once paid are non-refundable.</p>
              <p>• Please retain this receipt for future reference.</p>
            </div>
            <div className="text-center">
              <div className="w-32 border-b border-black mb-1"></div>
              <p className="font-semibold text-black">Authorized Signatory</p>
              <p className="text-[10px] text-slate-500">Thakurdwara Institute</p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 no-print">
          <Badge variant="success">Payment Recorded & Allocated</Badge>
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
