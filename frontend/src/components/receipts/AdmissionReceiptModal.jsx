import React from 'react';
import { Printer, CheckCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function AdmissionReceiptModal({ isOpen, onClose, admission }) {
  if (!admission) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Course Purchase Invoice / Enrollment Slip"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
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
              STUDENT COURSE PURCHASE & ENROLLMENT INVOICE
            </div>
          </div>

          {admission.status === 'REVOKED' && (
            <div className="p-2 bg-rose-50 border border-rose-300 rounded text-center text-xs text-rose-800 font-bold uppercase tracking-wider">
              [REVOKED BATCH PURCHASE - COURSE DROPPED]
              {admission.revocation_reason && (
                <span className="block normal-case font-normal text-rose-700 mt-0.5">
                  Reason: {admission.revocation_reason}
                </span>
              )}
            </div>
          )}

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-xs border-b border-slate-200 pb-3">
            <div>
              <p className="text-slate-500">Purchase Transaction ID:</p>
              <p className="font-bold font-mono text-black text-sm">
                {admission.purchase_transaction_id || admission.admission_number}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Purchase Date:</p>
              <p className="font-semibold text-black">{admission.admission_date}</p>
            </div>
            <div>
              <p className="text-slate-500">Student Name:</p>
              <p className="font-bold text-black text-sm">{admission.student_name_snapshot}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Payment Status:</p>
              <Badge
                variant={
                  admission.status === 'REVOKED'
                    ? 'danger'
                    : admission.payment_status === 'PAID'
                    ? 'success'
                    : admission.payment_status === 'PARTIALLY_PAID'
                    ? 'warning'
                    : 'danger'
                }
              >
                {admission.status === 'REVOKED' ? 'REVOKED' : admission.payment_status}
              </Badge>
            </div>
          </div>

          {/* Purchased Items Table */}
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Enrolled Batches & Subjects
            </p>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-1.5">Item Description</th>
                  <th className="p-1.5 text-right">Fee (₹)</th>
                  <th className="p-1.5 text-right">Indiv Disc</th>
                  <th className="p-1.5 text-right">Overall Share</th>
                  <th className="p-1.5 text-right">Net Price (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(admission.items || []).map((itm, i) => (
                  <tr key={i}>
                    <td className="p-1.5 text-black">
                      <span className="font-bold text-black block">{itm.item_name_snapshot}</span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-700 mt-0.5">
                        {itm.teacher_name_snapshot && (
                          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded text-black font-medium">
                            Faculty: <strong className="text-indigo-900">{itm.teacher_name_snapshot}</strong>
                          </span>
                        )}
                        {itm.hall_number_snapshot && (
                          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded text-black font-medium">
                            Classroom: <strong className="text-black">{itm.hall_number_snapshot}</strong>
                          </span>
                        )}
                        <span className="text-slate-400">({itm.item_type})</span>
                      </div>
                    </td>
                    <td className="p-1.5 text-right font-mono text-black">
                      ₹{Number(itm.original_price).toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono text-slate-600">
                      -₹{Number(itm.discount_amount).toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono text-slate-600">
                      -₹{Number(itm.overall_discount_share).toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono font-bold text-black">
                      ₹{Number(itm.net_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing & GST Breakdown */}
          <div className="border border-slate-300 rounded p-3 space-y-1 text-xs bg-slate-50/70">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-mono text-black">₹{Number(admission.subtotal).toFixed(2)}</span>
            </div>
            {Number(admission.total_discount) > 0 && (
              <div className="flex justify-between text-emerald-800">
                <span>Total Discount Applied:</span>
                <span className="font-mono">-₹{Number(admission.total_discount).toFixed(2)}</span>
              </div>
            )}
            {admission.gst_enabled && (
              <>
                <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1">
                  <span>Taxable Base Value:</span>
                  <span className="font-mono text-black">
                    ₹{Number(admission.taxable_base).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Inclusive GST ({admission.gst_rate}%):</span>
                  <span className="font-mono text-black">
                    ₹{Number(admission.gst_amount).toFixed(2)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold text-black">
              <span>Final Total Payable:</span>
              <span className="font-mono text-base font-black text-indigo-900">
                ₹{Number(admission.total_payable).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-emerald-800 font-semibold">Total Paid So Far:</span>
              <span className="font-mono text-emerald-800 font-bold">
                ₹{Number(admission.amount_paid).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-rose-700 font-bold">Balance Due:</span>
              <span className="font-mono text-rose-700 font-black">
                ₹{Number(admission.balance_due).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-6 flex items-end justify-between text-[11px] text-slate-600 border-t border-slate-200">
            <div>
              <p>Purchase verified & generated on {admission.admission_date}</p>
            </div>
            <div className="text-center">
              <div className="w-32 border-b border-black mb-1"></div>
              <p className="font-semibold text-black">Authorized Signatory</p>
              <p className="text-[10px] text-slate-500">Thakurdwara Institute</p>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="flex justify-end gap-2 no-print">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint}>
            Print Slip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
