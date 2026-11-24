import React, { useState, useEffect } from 'react';
import { Printer, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter from './ReceiptFooter';
import { admissionApi, settingsApi } from '../../services/allApis';
import { useInstitute } from '../../context/InstituteContext';
import {
  WhatsAppIcon,
  buildWhatsAppLink,
  buildPaymentReceiptWhatsAppMessage,
} from '../../utils/whatsappHelpers';

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

const formatFeePeriod = (validFrom, validTo, feePeriod) => {
  if (feePeriod) return feePeriod;
  if (validFrom && validTo) {
    return `${formatDate(validFrom)} to ${formatDate(validTo)}`;
  }
  if (validFrom) return `From ${formatDate(validFrom)}`;
  if (validTo) return `Valid Until ${formatDate(validTo)}`;
  return 'Standard Academic Session Cycle';
};

export default function PaymentReceiptModal({ isOpen, onClose, receipt, payment }) {
  const { institute } = useInstitute();
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'
  const [includeGst, setIncludeGst] = useState(false);
  const [gstRate, setGstRate] = useState(18.0);
  const [gstNumber, setGstNumber] = useState('09AAACT1234F1Z5');

  const data = receipt || payment;

  useEffect(() => {
    if (!data) return;
    setIncludeGst(Boolean(data.gst_enabled));
    if (data.gst_rate !== undefined && Number(data.gst_rate) > 0) {
      setGstRate(Number(data.gst_rate));
    }
    if (data.gst_number) {
      setGstNumber(data.gst_number);
    }

    const cached = localStorage.getItem('institute_gst_settings');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (!data.gst_number && parsed.gstin) {
          setGstNumber(parsed.gstin);
        }
        if ((!data.gst_rate || Number(data.gst_rate) === 0) && parsed.gst_rate !== undefined) {
          setGstRate(Number(parsed.gst_rate));
        }
      } catch {
        // ignore
      }
    } else {
      settingsApi.getInstitute().then((res) => {
        if (res) {
          if (!data.gst_number && res.gstin) {
            setGstNumber(res.gstin);
          }
          if ((!data.gst_rate || Number(data.gst_rate) === 0) && res.gst_rate !== undefined) {
            setGstRate(Number(res.gst_rate));
          }
        }
      }).catch(() => {});
    }
  }, [data?.id, data?.payment_number, data?.gst_enabled, data?.gst_rate, data?.gst_number]);

  if (!isOpen || !data) return null;

  const handleToggleGst = async () => {
    const nextState = !includeGst;
    setIncludeGst(nextState);

    let activeRate = gstRate;
    let activeGstin = gstNumber;

    if (nextState && (!activeRate || activeRate <= 0)) {
      const cached = localStorage.getItem('institute_gst_settings');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.gst_rate) {
            activeRate = Number(parsed.gst_rate);
            setGstRate(activeRate);
          }
          if (parsed.gstin) {
            activeGstin = parsed.gstin;
            setGstNumber(activeGstin);
          }
        } catch {}
      }
    }

    const admId = data.admission_id || data.admission?.id;
    if (admId) {
      try {
        await admissionApi.updateGst(admId, {
          gst_enabled: nextState,
          gst_rate: activeRate,
          gst_number: activeGstin,
        });
      } catch (err) {
        console.warn('Could not persist GST toggle to server:', err);
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const paymentNumber = data.payment_number || '—';
  const paymentDateFormatted = formatDate(data.payment_date, true);
  const feeCoverage = formatFeePeriod(data.valid_from, data.valid_to, data.fee_period);

  const totalCourseFee = Number(data.total_admission_payable || data.amount || 0);
  const calculatedGstAmount = includeGst
    ? Math.round((totalCourseFee * (gstRate / 100)) * 100) / 100
    : 0;
  const effectiveCourseFee = includeGst ? totalCourseFee + calculatedGstAmount : totalCourseFee;

  const currentPaid = Number(data.amount || 0);
  const totalPaidToDate = Number(data.total_amount_paid_so_far !== undefined ? data.total_amount_paid_so_far : currentPaid);
  const priorPaid = Math.max(0, totalPaidToDate - currentPaid);
  const writtenOffAmount = Number(data.written_off_amount || 0);
  const effectiveBalanceDue = includeGst
    ? Math.max(0, effectiveCourseFee - totalPaidToDate - writtenOffAmount)
    : Number(data.remaining_balance_due !== undefined ? data.remaining_balance_due : 0);

  const studentMobile = data.student_mobile || data.student?.mobile || '';
  const whatsAppUrl = buildWhatsAppLink(
    studentMobile,
    buildPaymentReceiptWhatsAppMessage(data, institute?.institute_name, institute?.address)
  );

  const handleWhatsAppShare = () => {
    if (whatsAppUrl) {
      window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border-2 border-black rounded-lg p-4 sm:p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Institute Header with Emblem & Document Ribbon */}
        <ReceiptHeader
          documentTitle="OFFICIAL FEE PAYMENT RECEIPT"
          copyType={copyType}
          documentSubtitle={`Receipt Voucher No: ${paymentNumber}`}
          gstNumber={includeGst ? gstNumber : null}
        />

        {/* Student & Bill Details: 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
          {/* Left Column: Student Details */}
          <div className="space-y-1 sm:border-r print:border-r border-slate-300 sm:pr-3 print:pr-3">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Student Full Name:
              </span>
              <span className="font-black text-black text-sm block">
                {data.student_name || data.student?.name || '—'}
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
                  Mobile Contact:
                </span>
                <span className="font-mono font-semibold text-black">
                  {data.student_mobile || data.student?.mobile}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Billing / Receipt Voucher Details */}
          <div className="space-y-1 sm:pl-1 print:pl-1 border-t sm:border-t-0 print:border-t-0 pt-2 sm:pt-0 print:pt-0 border-slate-200">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Receipt Voucher No:
              </span>
              <span className="font-mono font-black text-black text-sm">
                {paymentNumber}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Payment Date & Time:
              </span>
              <span className="font-bold text-black">
                {paymentDateFormatted}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Admission / Enrollment No:
              </span>
              <span className="font-mono font-bold text-black">
                {data.admission_number || data.purchase_transaction_id || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Payment Mode & Ref:
              </span>
              <span className="font-bold text-black uppercase">
                {data.payment_mode}
                {data.transaction_reference && (
                  <span className="text-slate-700 font-mono font-normal normal-case ml-1">
                    (Ref: {data.transaction_reference})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Date Range The Fee Covers (valid_from to valid_to) Banner */}
        <div className="bg-purple-50/80 border border-odoo-300 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row print:flex-row sm:items-center print:items-center justify-between gap-1.5">
          <span className="text-odoo-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-odoo-700 shrink-0" />
            Fee Coverage & Validity Period:
          </span>
          <span className="font-mono font-black text-odoo-950 text-xs sm:text-sm bg-white/80 px-2 py-0.5 rounded border border-odoo-200">
            {feeCoverage}
          </span>
        </div>

        {/* Allocations Table if available */}
        {data.allocations && data.allocations.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-black text-black uppercase tracking-wider block">
              Enrolled Subject / Course Module Allocations
            </span>
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                    <th className="p-1.5 border-r border-slate-300">Academic Subject Module</th>
                    <th className="p-1.5 text-right w-32">Allocated Fee (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.allocations.map((a, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-1.5 text-center font-mono border-r border-slate-200 text-slate-700">
                        {i + 1}
                      </td>
                      <td className="p-1.5 text-black border-r border-slate-200 font-semibold">
                        <span>{a.item_name || 'Enrolled Course Module'}</span>
                        {(a.schedule || a.timing) && (
                          <div className="text-[10px] text-slate-700 font-normal mt-0.5">
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Timing: <strong className="text-black">{a.schedule || a.timing}</strong>
                            </span>
                          </div>
                        )}
                        {(a.hall_number || a.teacher_name) && (
                          <div className="text-[10px] text-slate-700 font-normal mt-0.5 flex flex-wrap gap-x-2">
                            {a.hall_number && (
                              <span>
                                Hall: <strong className="text-black">{a.hall_number}</strong>
                              </span>
                            )}
                            {a.teacher_name && (
                              <span>
                                Teacher: <strong className="text-black">{a.teacher_name}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 text-right font-mono font-bold text-black">
                        {formatCurrency(a.allocated_amount || a.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Clear Amounts Bill Table (fee, discount, GST, amount paid, balance due) */}
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
            <span>Billing Ledger & Realization Summary</span>
            <span className="text-[9px] text-slate-500 font-normal">Amounts in INR (₹)</span>
          </div>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Account Particulars</th>
                  <th className="p-2 text-right w-36 sm:w-44">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 border-r border-slate-200 text-slate-900 font-medium">
                    Total Enrolled Course Fee (Gross Billed)
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-black">
                    {formatCurrency(effectiveCourseFee)}
                  </td>
                </tr>

                {includeGst && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      Included GST ({gstRate}%)
                    </td>
                    <td className="p-2 text-right font-mono text-black font-semibold">
                      {formatCurrency(calculatedGstAmount)}
                    </td>
                  </tr>
                )}

                {priorPaid > 0 && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      Previous Realized Payments (Prior Receipts)
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-slate-800">
                      {formatCurrency(priorPaid)}
                    </td>
                  </tr>
                )}

                {/* Amount Paid in this Receipt — Bold Highlight */}
                <tr className="bg-emerald-50 border-y-2 border-emerald-400">
                  <td className="p-2 border-r border-emerald-200 font-black text-emerald-950 uppercase text-xs">
                    Fee Received in this Receipt ({data.payment_mode})
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-emerald-900">
                    {formatCurrency(currentPaid)}
                  </td>
                </tr>

                <tr className="bg-slate-50">
                  <td className="p-2 border-r border-slate-200 text-slate-800 font-semibold">
                    Total Realized Paid Till Date
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-black">
                    {formatCurrency(totalPaidToDate)}
                  </td>
                </tr>

                {/* Waived / Written Off Amount */}
                {writtenOffAmount > 0 && (
                  <tr className="bg-amber-50">
                    <td className="p-2 border-r border-slate-200 text-amber-950 font-semibold">
                      Fee Waived / Forgiven (Admin Waiver)
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-amber-900">
                      {formatCurrency(writtenOffAmount)}
                    </td>
                  </tr>
                )}

                {/* Balance Due Row */}
                <tr className={effectiveBalanceDue > 0 ? 'bg-rose-50 border-t-2 border-rose-300' : 'bg-emerald-50/50 border-t border-emerald-200'}>
                  <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                    Outstanding Balance Due
                  </td>
                  <td className={`p-2 text-right font-mono font-black text-sm sm:text-base ${effectiveBalanceDue > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                    {effectiveBalanceDue > 0 ? formatCurrency(effectiveBalanceDue) : '₹0.00 (NIL / FULLY PAID)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={currentPaid}
          issuedDate={data.payment_date}
          collectorName={data.collector_name || data.collector_name_snapshot || 'Accounts Desk'}
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
      title={`Payment Receipt — ${paymentNumber}`}
      maxWidth="max-w-2xl"
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
            <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />
            <button
              type="button"
              onClick={handleToggleGst}
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                includeGst
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
              title={includeGst ? 'GST included. Click to turn off.' : 'Click to include GST'}
            >
              <span className={`w-2 h-2 rounded-full ${includeGst ? 'bg-emerald-300' : 'bg-slate-400'}`}></span>
              <span>GST: {includeGst ? `ON (${gstRate}%)` : 'OFF'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleWhatsAppShare}
              disabled={!studentMobile}
              title={
                studentMobile
                  ? `Share receipt with ${studentMobile} on WhatsApp`
                  : 'Student has no mobile number recorded'
              }
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs w-full sm:w-auto ${
                studentMobile
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Slip</span>
            </button>
            <Button variant="primary" size="xs" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
              Print Receipt
            </Button>
          </div>
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

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200 no-print">
          <div className="flex items-center gap-1.5">
            <Badge variant={effectiveBalanceDue > 0 ? 'warning' : 'success'}>
              {effectiveBalanceDue > 0 ? 'Partially Paid' : 'Payment Cleared & Fully Settled'}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleWhatsAppShare}
              disabled={!studentMobile}
              title={
                studentMobile
                  ? `Share receipt with ${studentMobile} on WhatsApp`
                  : 'Student has no mobile number recorded'
              }
              className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs ${
                studentMobile
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Slip</span>
            </button>
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial">
              Close
            </Button>
            <Button variant="primary" icon={Printer} onClick={handlePrint} className="flex-1 sm:flex-initial">
              Print Receipt
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
