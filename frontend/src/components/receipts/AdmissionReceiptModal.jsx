import React, { useState } from 'react';
import { Printer, Calendar, AlertTriangle } from 'lucide-react';
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

const formatFeePeriod = (validFrom, validTo) => {
  if (validFrom && validTo) {
    return `${formatDate(validFrom)} to ${formatDate(validTo)}`;
  }
  if (validFrom) return `From ${formatDate(validFrom)}`;
  if (validTo) return `Valid Until ${formatDate(validTo)}`;
  return 'Standard Academic Session Cycle';
};

export default function AdmissionReceiptModal({ isOpen, onClose, admission, admissionData }) {
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'

  const data = admission || admissionData;
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoiceNumber = data.purchase_transaction_id || data.admission_number || '—';
  const invoiceDateFormatted = formatDate(data.admission_date);
  const feeCoverage = formatFeePeriod(data.valid_from, data.valid_to);

  const subtotal = Number(data.subtotal || data.total_payable || 0);
  const totalDiscount = Number(data.total_discount || 0);
  const totalPayable = Number(data.total_payable || 0);
  const amountPaid = Number(data.amount_paid || 0);
  const balanceDue = Number(data.balance_due !== undefined ? data.balance_due : totalPayable - amountPaid);
  const isRevoked = data.status === 'REVOKED' || data.status === 'CANCELLED';

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border-2 border-black rounded-lg p-4 sm:p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Institute Header with Emblem & Document Ribbon */}
        <ReceiptHeader
          documentTitle="COURSE ENROLLMENT & ACADEMIC INVOICE"
          copyType={copyType}
          documentSubtitle={`Invoice Voucher: ${invoiceNumber}`}
        />

        {/* Revocation Warning Banner if revoked or cancelled */}
        {isRevoked && (
          <div className="p-2.5 bg-rose-50 border-2 border-rose-500 rounded-lg text-center text-xs text-rose-900 font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span>[ENROLLMENT CANCELLED / REVOKED]</span>
              {data.revocation_reason && (
                <span className="block normal-case font-normal text-rose-800 text-[11px] mt-0.5">
                  Reason: {data.revocation_reason}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Student & Invoice Details: 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
          {/* Left Column: Student Details */}
          <div className="space-y-1 sm:border-r border-slate-300 sm:pr-3">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Student Full Name:
              </span>
              <span className="font-black text-black text-sm block">
                {data.student_name_snapshot || data.student?.name || data.student_name || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Registration / Roll No:
              </span>
              <span className="font-mono font-bold text-black text-xs">
                {data.student_reg_no || data.student_code || data.student?.student_code || data.student?.registration_no || '—'}
              </span>
            </div>
            {(data.student_father_name || data.student?.father_name) && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Father / Guardian Name:
                </span>
                <span className="font-semibold text-black">
                  {data.student_father_name || data.student?.father_name}
                </span>
              </div>
            )}
            {(data.student_mobile || data.student?.mobile) && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Contact Number:
                </span>
                <span className="font-mono font-semibold text-black">
                  {data.student_mobile || data.student?.mobile}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Billing / Invoice Details */}
          <div className="space-y-1 sm:pl-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Purchase Invoice No:
              </span>
              <span className="font-mono font-black text-black text-sm">
                {invoiceNumber}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Invoice Date:
              </span>
              <span className="font-bold text-black">
                {invoiceDateFormatted}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Payment Status:
              </span>
              <span className="inline-block mt-0.5">
                <Badge
                  size="xs"
                  variant={
                    isRevoked
                      ? 'danger'
                      : data.payment_status === 'PAID'
                      ? 'success'
                      : data.payment_status === 'PARTIALLY_PAID'
                      ? 'warning'
                      : 'danger'
                  }
                >
                  {isRevoked ? 'CANCELLED' : data.payment_status || 'RECORDED'}
                </Badge>
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Admission Reference:
              </span>
              <span className="font-mono font-bold text-black">
                {data.admission_number || '—'}
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

        {/* Itemized Courses & Batches Table */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-black uppercase tracking-wider block">
            Enrolled Academic Courses & Subject Modules
          </span>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                  <th className="p-1.5 border-r border-slate-300">Batch / Module Description</th>
                  <th className="p-1.5 text-right border-r border-slate-300 w-24">Gross (₹)</th>
                  <th className="p-1.5 text-right border-r border-slate-300 w-24">Discount (₹)</th>
                  <th className="p-1.5 text-right w-24">Net Fee (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(data.items || []).map((itm, i) => {
                  const totalItemDisc =
                    (Number(itm.discount_amount) || 0) +
                    (Number(itm.overall_discount_share) || 0);

                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-1.5 text-center font-mono border-r border-slate-200 text-slate-700">
                        {i + 1}
                      </td>
                      <td className="p-1.5 border-r border-slate-200">
                        <span className="font-bold text-black block">
                          {itm.item_name_snapshot || itm.item_name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-700 mt-0.5">
                          {itm.teacher_name_snapshot && (
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Faculty: <strong className="text-black">{itm.teacher_name_snapshot}</strong>
                            </span>
                          )}
                          {itm.hall_number_snapshot && (
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Hall: <strong className="text-black">{itm.hall_number_snapshot}</strong>
                            </span>
                          )}
                          {itm.valid_from && itm.valid_to && (
                            <span className="bg-purple-50 border border-odoo-200 px-1 py-0.2 rounded text-odoo-950 font-mono text-[9px] font-semibold">
                              Period: {formatDate(itm.valid_from)} &rarr; {formatDate(itm.valid_to)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-1.5 text-right font-mono border-r border-slate-200 text-slate-800">
                        {formatCurrency(itm.original_price)}
                      </td>
                      <td className="p-1.5 text-right font-mono border-r border-slate-200 text-slate-700 font-semibold">
                        {totalItemDisc > 0 ? `-${formatCurrency(totalItemDisc)}` : '—'}
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

        {/* Clear Amounts Bill Table (fee, discount, GST, amount paid, balance due) */}
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
            <span>Billing Particulars & Tax Ledger</span>
            <span className="text-[9px] text-slate-500 font-normal">Amounts in INR (₹)</span>
          </div>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Billing Item Description</th>
                  <th className="p-2 text-right w-36 sm:w-44">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 border-r border-slate-200 text-slate-900 font-medium">
                    Course Fee Subtotal (Gross Value)
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-black">
                    {formatCurrency(subtotal)}
                  </td>
                </tr>

                {totalDiscount > 0 && (
                  <tr className="bg-emerald-50/40">
                    <td className="p-2 border-r border-slate-200 text-emerald-900 font-semibold">
                      Less: Total Concession / Scholarship Applied
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-800">
                      -{formatCurrency(totalDiscount)}
                    </td>
                  </tr>
                )}

                {data.gst_enabled ? (
                  <>
                    <tr>
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        Taxable Base Value
                      </td>
                      <td className="p-2 text-right font-mono text-black font-semibold">
                        {formatCurrency(data.taxable_base)}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        Inclusive GST ({data.gst_rate}%)
                      </td>
                      <td className="p-2 text-right font-mono text-black font-semibold">
                        {formatCurrency(data.gst_amount)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      GST / Government Levies
                    </td>
                    <td className="p-2 text-right font-mono text-slate-700">
                      Exempt / Included (0%)
                    </td>
                  </tr>
                )}

                {/* Total Net Course Fee (Invoice Value) */}
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black">
                  <td className="p-2 border-r border-slate-300 text-black uppercase text-xs">
                    Total Net Course Fee (Invoice Value)
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-black">
                    {formatCurrency(totalPayable)}
                  </td>
                </tr>

                {/* Total Realized Amount Paid */}
                <tr className="bg-emerald-50 border-t border-emerald-300">
                  <td className="p-2 border-r border-emerald-200 font-black text-emerald-950 uppercase text-xs">
                    Total Amount Paid / Realized So Far
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-emerald-900">
                    {formatCurrency(amountPaid)}
                  </td>
                </tr>

                {/* Remaining Balance Due */}
                <tr className={balanceDue > 0 ? 'bg-rose-50 border-t-2 border-rose-300' : 'bg-emerald-50/50 border-t border-emerald-200'}>
                  <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                    Remaining Balance Due
                  </td>
                  <td className={`p-2 text-right font-mono font-black text-sm sm:text-base ${balanceDue > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                    {balanceDue > 0 ? formatCurrency(balanceDue) : '₹0.00 (NIL / FULLY PAID)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={amountPaid > 0 ? amountPaid : totalPayable}
          issuedDate={data.admission_date}
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
      title={`Course Enrollment Slip — ${invoiceNumber}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar: Copy Mode Switcher & Print Action */}
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

        {/* Footer controls */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-200 no-print">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
            Print Enrollment Slip
          </Button>
        </div>
      </div>
    </Modal>
  );
}
