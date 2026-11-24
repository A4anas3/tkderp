import React, { useState, useEffect } from 'react';
import { Printer, Calendar, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter, { sanitizeCollectorName } from './ReceiptFooter';
import { admissionApi, settingsApi } from '../../services/allApis';
import { useInstitute } from '../../context/InstituteContext';
import {
  WhatsAppIcon,
  buildWhatsAppLink,
  buildAdmissionReceiptWhatsAppMessage,
} from '../../utils/whatsappHelpers';
import { getCleanCancelReason } from '../../utils/dateCycleUtils';

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
  const { institute } = useInstitute();
  const [copyMode, setCopyMode] = useState('STUDENT'); // 'STUDENT' | 'OFFICE' | 'BOTH'
  const [includeGst, setIncludeGst] = useState(false);
  const [gstRate, setGstRate] = useState(18.0);
  const [gstNumber, setGstNumber] = useState('09AAACT1234F1Z5');
  const [resolvedCollector, setResolvedCollector] = useState(null);

  const data = admission || admissionData;

  useEffect(() => {
    if (!isOpen || !data) {
      setResolvedCollector(null);
      return;
    }
    const directCollector =
      sanitizeCollectorName(data.collector_name) ||
      sanitizeCollectorName(data.collector_name_snapshot);
    if (directCollector) {
      setResolvedCollector(directCollector);
      return;
    }
    setResolvedCollector(null);
    const admId = data.id || data.admission_id;
    if (Number(data.amount_paid || 0) > 0 && admId) {
      let cancelled = false;
      admissionApi.getSlips(admId).then((res) => {
        if (cancelled || !res) return;
        const fromSlips =
          sanitizeCollectorName(res.collector_name) ||
          (res.slips || [])
            .filter((s) => s.slip_type === 'PAYMENT_RECEIPT')
            .map((s) => sanitizeCollectorName(s.data?.collector_name) || sanitizeCollectorName(s.collector_or_processor))
            .filter(Boolean)
            .pop() ||
          null;
        if (fromSlips) {
          setResolvedCollector(fromSlips);
        }
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, data?.id, data?.admission_id, data?.collector_name, data?.collector_name_snapshot, data?.amount_paid]);

  useEffect(() => {
    if (!data) return;
    setIncludeGst(Boolean(data.gst_enabled));
    if (data.gst_rate !== undefined && Number(data.gst_rate) > 0) {
      setGstRate(Number(data.gst_rate));
    }
    if (data.gst_number) {
      setGstNumber(data.gst_number);
    }

    // Load saved institute GST settings from cache or backend
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
  }, [data?.id, data?.admission_number, data?.gst_enabled, data?.gst_rate, data?.gst_number]);

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

    // Save with invoice/slip if admission id exists
    const admId = data.id || data.admission_id;
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

  const invoiceNumber = data.purchase_transaction_id || data.admission_number || '—';
  const invoiceDateFormatted = formatDate(data.admission_date);
  const feeCoverage = formatFeePeriod(data.valid_from, data.valid_to);

  const subtotal = Number(data.subtotal || data.total_payable || 0);
  const totalDiscount = Number(data.total_discount || 0);
  const baseCharges = Math.max(0, subtotal - totalDiscount);
  
  // Fee calculation: base fee stays the same as right now; GST is added on top when enabled
  const calculatedGstAmount = includeGst
    ? Math.round((baseCharges * (gstRate / 100)) * 100) / 100
    : 0;
  const effectiveTotal = includeGst ? baseCharges + calculatedGstAmount : baseCharges;
  const amountPaid = Number(data.amount_paid || 0);
  const writtenOffAmount = Number(data.written_off_amount || 0);
  const effectiveBalanceDue = Math.max(0, effectiveTotal - amountPaid - writtenOffAmount);
  const isRevoked = data.status === 'REVOKED' || data.status === 'CANCELLED';

  const studentMobile = data.student_mobile || data.student?.mobile || '';
  const whatsAppUrl = buildWhatsAppLink(
    studentMobile,
    buildAdmissionReceiptWhatsAppMessage(data, institute?.institute_name)
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
          documentTitle="COURSE ENROLLMENT & ACADEMIC INVOICE"
          copyType={copyType}
          documentSubtitle={`Invoice Voucher: ${invoiceNumber}`}
          gstNumber={includeGst ? gstNumber : null}
        />

        {/* Revocation Warning Banner if revoked or cancelled */}
        {isRevoked && (
          <div className="p-2.5 bg-rose-50 border-2 border-rose-500 rounded-lg text-center text-xs text-rose-900 font-bold uppercase tracking-wider flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <span>[ENROLLMENT CANCELLED / REVOKED]</span>
              {getCleanCancelReason(data.revocation_reason) && (
                <span className="block normal-case font-normal text-rose-800 text-[11px] mt-0.5">
                  Reason: {getCleanCancelReason(data.revocation_reason)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Student & Invoice Details: 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
          {/* Left Column: Student Details */}
          <div className="space-y-1 sm:border-r print:border-r border-slate-300 sm:pr-3 print:pr-3">
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
          <div className="space-y-1 sm:pl-1 print:pl-1 border-t sm:border-t-0 print:border-t-0 pt-2 sm:pt-0 print:pt-0 border-slate-200">
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
        <div className="bg-purple-50/80 border border-odoo-300 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row print:flex-row sm:items-center print:items-center justify-between gap-1.5">
          <span className="text-odoo-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-odoo-700 shrink-0" />
            Fee Coverage & Validity Period:
          </span>
          <span className="font-mono font-black text-odoo-950 text-xs sm:text-sm bg-white/80 px-2 py-0.5 rounded border border-odoo-200">
            {feeCoverage}
          </span>
        </div>

        {/* Itemized Courses & Subjects Table */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-black uppercase tracking-wider block">
            Enrolled Academic Courses & Subject Modules
          </span>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-1.5 w-8 text-center border-r border-slate-300">#</th>
                  <th className="p-1.5 border-r border-slate-300">Course / Module Description</th>
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
                          {(itm.hall_number || itm.hall_number_snapshot) && (
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Hall: <strong className="text-black">{itm.hall_number || itm.hall_number_snapshot}</strong>
                            </span>
                          )}
                          {(itm.teacher_name || itm.teacher_name_snapshot) && (
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Teacher: <strong className="text-black">{itm.teacher_name || itm.teacher_name_snapshot}</strong>
                            </span>
                          )}
                          {(itm.schedule || itm.timing) && (
                            <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">
                              Timing: <strong className="text-black">{itm.schedule || itm.timing}</strong>
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
                        <span>{a.item_name || a.subject_name || 'Enrolled Course Module'}</span>
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

                {includeGst && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      GST ({gstRate}%)
                    </td>
                    <td className="p-2 text-right font-mono text-black font-semibold">
                      {formatCurrency(calculatedGstAmount)}
                    </td>
                  </tr>
                )}

                {/* Total Net Course Fee (Invoice Value) */}
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black">
                  <td className="p-2 border-r border-slate-300 text-black uppercase text-xs">
                    Total Net Course Fee (Invoice Value)
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-black">
                    {formatCurrency(effectiveTotal)}
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

                {/* Waived / Written Off Amount */}
                {writtenOffAmount > 0 && (
                  <tr className="bg-amber-50 border-t border-amber-300">
                    <td className="p-2 border-r border-amber-200 font-black text-amber-950 uppercase text-xs">
                      Fee Waived / Forgiven (Admin Waiver)
                    </td>
                    <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-amber-900">
                      {formatCurrency(writtenOffAmount)}
                    </td>
                  </tr>
                )}

                {/* Remaining Balance Due */}
                <tr className={effectiveBalanceDue > 0 ? 'bg-rose-50 border-t-2 border-rose-300' : 'bg-emerald-50/50 border-t border-emerald-200'}>
                  <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                    Remaining Balance Due
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
          amount={amountPaid > 0 ? amountPaid : effectiveTotal}
          issuedDate={data.admission_date}
          collectedBy={resolvedCollector}
          collectorName="Accounts Section"
          terms={[
            'Course admission is strictly subject to institute rules and disciplinary regulations.',
            'Fees once paid are non-refundable & non-transferable under any circumstances.',
            'Preserve this slip for identity verification and continuous class attendance.',
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
                  ? `Share enrollment invoice with ${studentMobile} on WhatsApp`
                  : 'Student has no mobile number recorded'
              }
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs w-full sm:w-auto ${
                studentMobile
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Invoice</span>
            </button>
            <Button variant="primary" size="xs" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
              Print Invoice
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

        {/* Footer controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200 no-print">
          <div>
            <Badge variant={effectiveBalanceDue > 0 ? 'warning' : 'success'}>
              {effectiveBalanceDue > 0 ? 'Admission with Balance Due' : 'Admission Fully Paid'}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleWhatsAppShare}
              disabled={!studentMobile}
              title={
                studentMobile
                  ? `Share enrollment invoice with ${studentMobile} on WhatsApp`
                  : 'Student has no mobile number recorded'
              }
              className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs ${
                studentMobile
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Invoice</span>
            </button>
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial">
              Close
            </Button>
            <Button variant="primary" icon={Printer} onClick={handlePrint} className="flex-1 sm:flex-initial">
              Print Enrollment Slip
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
