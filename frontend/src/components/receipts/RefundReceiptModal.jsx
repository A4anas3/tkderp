import React from 'react';
import { Printer, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function RefundReceiptModal({ isOpen, onClose, refund }) {
  if (!refund) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fee Refund Voucher / Debit Receipt"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div
          id="printable-refund-voucher"
          className="border-2 border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm"
        >
          {/* Header */}
          <div className="border-b-2 border-amber-600 pb-3 text-center">
            <h2 className="text-lg sm:text-xl font-black text-black tracking-tight uppercase">
              THAKURDWARA COACHING INSTITUTE
            </h2>
            <p className="text-[11px] text-slate-600 font-medium">
              Civil Lines Road, Thakurdwara • Contact: +91-98765-43210
            </p>
            <div className="mt-2 inline-block bg-amber-50 border border-amber-300 px-3 py-0.5 rounded text-[11px] font-bold text-amber-900 uppercase tracking-widest">
              OFFICIAL FEE REFUND VOUCHER
            </div>
          </div>

          {/* Refund Details */}
          <div className="grid grid-cols-2 gap-2 text-xs border-b border-slate-200 pb-3">
            <div>
              <p className="text-slate-500">Refund Voucher No:</p>
              <p className="font-bold font-mono text-amber-900 text-sm">{refund.refund_number}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Date & Time:</p>
              <p className="font-semibold text-black">
                {refund.refund_date
                  ? new Date(refund.refund_date).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Student Name:</p>
              <p className="font-bold text-black text-sm">{refund.student_name}</p>
              <p className="font-mono text-[11px] text-slate-600">{refund.student_reg_no}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Admission Reference:</p>
              <p className="font-mono font-bold text-black">{refund.admission_number}</p>
            </div>
          </div>

          {/* Refund Amount Box */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 text-center space-y-1">
            <span className="text-xs uppercase font-bold text-amber-900 tracking-wider">
              Total Amount Refunded
            </span>
            <div className="text-2xl font-black font-mono text-amber-950">
              ₹{Number(refund.amount).toFixed(2)}
            </div>
            <div className="text-xs text-slate-600 flex items-center justify-center gap-2">
              <span>Mode: <strong className="text-black">{refund.refund_mode}</strong></span>
              <span>•</span>
              <span>Disbursed By: <strong className="text-black">{refund.processor_name || refund.processor_name_snapshot}</strong></span>
            </div>
          </div>

          {/* Reason Section */}
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs">
            <span className="font-bold text-slate-700 block mb-0.5">Reason for Refund:</span>
            <p className="text-slate-900 italic font-medium">{refund.reason}</p>
          </div>

          {/* Updated Ledger Summary */}
          {(refund.admission_total_payable !== undefined || refund.remaining_balance_due !== undefined) && (
            <div className="border border-slate-200 rounded p-2.5 text-xs space-y-1">
              <span className="font-bold text-black block uppercase text-[10px] tracking-wider mb-1">
                Post-Refund Admission Balance Summary
              </span>
              <div className="flex justify-between text-slate-600">
                <span>Admission Total Billed:</span>
                <span className="font-mono font-semibold text-black">
                  ₹{Number(refund.admission_total_payable || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span>Net Amount Paid (Retained):</span>
                <span className="font-mono">
                  ₹{Number(refund.net_amount_paid_after_refund || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                <span>Outstanding Balance Due:</span>
                <span className="font-mono">
                  ₹{Number(refund.remaining_balance_due || 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-center text-[11px] text-slate-500">
            <div>
              <div className="h-9"></div>
              <p className="border-t border-dashed border-slate-400 pt-1 font-semibold text-black">
                Authorized Cashier / Officer
              </p>
            </div>
            <div>
              <div className="h-9"></div>
              <p className="border-t border-dashed border-slate-400 pt-1 font-semibold text-black">
                Student / Parent Receiver
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
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
