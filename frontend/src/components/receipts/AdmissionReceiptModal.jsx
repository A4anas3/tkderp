import React, { useState } from 'react';
import { Printer, Copy, CheckCircle, FileText } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter from './ReceiptFooter';

export default function AdmissionReceiptModal({ isOpen, onClose, admission }) {
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'

  if (!admission) return null;

  const handlePrint = () => {
    window.print();
  };

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border border-slate-300 rounded-lg p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Header with Emblem */}
        <ReceiptHeader
          documentTitle="COURSE PURCHASE & ENROLLMENT INVOICE"
          copyType={copyType}
          documentSubtitle={`Transaction ID: ${admission.purchase_transaction_id || admission.admission_number}`}
        />

        {/* Revocation Banner if revoked */}
        {admission.status === 'REVOKED' && (
          <div className="p-2 bg-rose-50 border border-rose-300 rounded text-center text-xs text-rose-800 font-bold uppercase tracking-wider">
            [REVOKED BATCH PURCHASE — ENROLLMENT TERMINATED]
            {admission.revocation_reason && (
              <span className="block normal-case font-normal text-rose-700 mt-0.5">
                Revocation Reason: {admission.revocation_reason}
              </span>
            )}
          </div>
        )}

        {/* 2-Column High-Contrast Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs border border-slate-300 rounded p-3 bg-slate-50/50">
          {/* Left Column: Student Credentials */}
          <div className="space-y-1 border-r border-slate-200 pr-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Student Name:</span>
              <span className="font-bold text-black text-sm block">{admission.student_name_snapshot}</span>
            </div>
            {admission.student_reg_no && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Registration / Roll No:</span>
                <span className="font-mono font-bold text-black">{admission.student_reg_no}</span>
              </div>
            )}
            {admission.student_father_name && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Father / Guardian:</span>
                <span className="font-semibold text-slate-800">{admission.student_father_name}</span>
              </div>
            )}
            {admission.student_mobile && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Contact Number:</span>
                <span className="font-mono font-medium text-slate-800">{admission.student_mobile}</span>
              </div>
            )}
          </div>

          {/* Right Column: Invoice & Billing Info */}
          <div className="space-y-1 pl-1">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Purchase Invoice No:</span>
              <span className="font-mono font-bold text-black text-sm">
                {admission.purchase_transaction_id || admission.admission_number}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Invoice Date:</span>
              <span className="font-semibold text-black">
                {admission.admission_date
                  ? new Date(admission.admission_date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-semibold block">Payment Status:</span>
              <span className="inline-block mt-0.5">
                <Badge
                  size="xs"
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
              </span>
            </div>
            {admission.valid_from && admission.valid_to && (
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold block">Course Fee Validity:</span>
                <span className="font-mono font-semibold text-indigo-900 text-[11px]">
                  {admission.valid_from} &rarr; {admission.valid_to}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Itemized Courses Table */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider block">
            Enrolled Batches & Academic Subject Modules
          </span>
          <table className="w-full text-left text-xs border border-slate-300">
            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <tr>
                <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                <th className="p-1.5 border-r border-slate-300">Batch / Module Description</th>
                <th className="p-1.5 text-right border-r border-slate-300 w-24">Gross (₹)</th>
                <th className="p-1.5 text-right border-r border-slate-300 w-24">Discount (₹)</th>
                <th className="p-1.5 text-right w-24">Net Fee (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(admission.items || []).map((itm, i) => {
                const totalItemDisc =
                  (Number(itm.discount_amount) || 0) +
                  (Number(itm.overall_discount_share) || 0);

                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-1.5 text-center font-mono border-r border-slate-200 text-slate-600">
                      {i + 1}
                    </td>
                    <td className="p-1.5 border-r border-slate-200">
                      <span className="font-bold text-black block">{itm.item_name_snapshot}</span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600 mt-0.5">
                        {itm.teacher_name_snapshot && (
                          <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-slate-800">
                            Faculty: <strong className="text-black">{itm.teacher_name_snapshot}</strong>
                          </span>
                        )}
                        {itm.hall_number_snapshot && (
                          <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-slate-800">
                            Hall: <strong className="text-black">{itm.hall_number_snapshot}</strong>
                          </span>
                        )}
                        <span className="text-slate-400">({itm.item_type})</span>
                      </div>
                    </td>
                    <td className="p-1.5 text-right font-mono border-r border-slate-200 text-slate-700">
                      ₹{Number(itm.original_price).toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono border-r border-slate-200 text-slate-600">
                      {totalItemDisc > 0 ? `-₹${totalItemDisc.toFixed(2)}` : '—'}
                    </td>
                    <td className="p-1.5 text-right font-mono font-bold text-black">
                      ₹{Number(itm.net_price).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pricing, Tax & Accounting Summary */}
        <div className="border border-slate-300 rounded p-3 text-xs bg-slate-50/70 space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Course Fee Subtotal:</span>
            <span className="font-mono text-black font-semibold">
              ₹{Number(admission.subtotal).toFixed(2)}
            </span>
          </div>
          {Number(admission.total_discount) > 0 && (
            <div className="flex justify-between text-emerald-800 font-medium">
              <span>Total Special Discount Applied:</span>
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
          <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-bold text-black">
            <span>Total Net Course Fee:</span>
            <span className="font-mono text-base font-black text-black">
              ₹{Number(admission.total_payable).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1">
            <span className="text-emerald-800 font-semibold">Total Paid / Cleared So Far:</span>
            <span className="font-mono text-emerald-800 font-bold">
              ₹{Number(admission.amount_paid).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
            <span className="text-rose-700">Remaining Balance Due:</span>
            <span className="font-mono text-rose-700 font-black">
              ₹{Number(admission.balance_due).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={admission.total_payable}
          issuedDate={admission.admission_date}
          collectorName="Accounts Section"
          terms={[
            'Course admission is strictly subject to institute rules and disciplinary regulations.',
            'Fees once paid are non-refundable & non-transferable under any circumstances.',
            'Preserve this slip for identity verification and continuous batch hall attendance.',
          ]}
        />
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Course Enrollment Slip — ${admission.purchase_transaction_id || admission.admission_number}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar: Copy Mode Switcher & Print Action */}
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
            Print Invoice
          </Button>
        </div>

        {/* Printable Receipt Paper Container */}
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

        {/* Footer controls */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 no-print">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint}>
            Print Enrollment Slip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
