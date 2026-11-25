import React, { useState } from 'react';
import { Printer, Calendar } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ReceiptHeader from './ReceiptHeader';
import ReceiptFooter, { sanitizeCollectorName } from './ReceiptFooter';
import { useInstitute } from '../../context/InstituteContext';
import {
  WhatsAppIcon,
  buildWhatsAppLink,
  buildSalarySlipWhatsAppMessage,
} from '../../utils/whatsappHelpers';

const formatCurrency = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(val);
  }
};

export default function SalarySlipModal({ isOpen, onClose, slip, salary }) {
  const { institute } = useInstitute();
  const [copyMode, setCopyMode] = useState('EMPLOYEE'); // 'EMPLOYEE' | 'OFFICE' | 'BOTH'

  const data = slip || salary;
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  const slipNumber =
    data.slip_number ||
    `SAL-${String(data.month_year || '').replace('-', '')}-${String(data.id || '').slice(0, 8).toUpperCase()}`;
  const employeeName = data.employee_name || data.employee_name_snapshot || '—';
  const employeeRole =
    data.employee_type === 'TEACHER' ? 'Faculty / Teacher' : 'Administrative / Support Staff';
  const monthLabel = data.month_label || data.month_year || '—';
  const dueDateFormatted = formatDate(data.due_date);
  const paymentDateFormatted = data.payment_date ? formatDate(data.payment_date) : 'Pending';

  const payableSalary = Number(data.salary_amount || 0);
  const paidAmount = Number(data.paid_amount || 0);
  const balanceDue = Number(
    data.balance_due !== undefined ? data.balance_due : Math.max(0, payableSalary - paidAmount)
  );
  const baseSalary = data.base_salary !== null && data.base_salary !== undefined ? Number(data.base_salary) : null;
  const deductionAmount =
    baseSalary !== null && baseSalary > payableSalary ? Math.round((baseSalary - payableSalary) * 100) / 100 : 0;

  const showAbsentRow =
    data.employee_type === 'TEACHER' ||
    (data.absent_days_count !== null && data.absent_days_count !== undefined);
  const absentDays = Number(data.absent_days_count ?? 0);
  const holidaysCount = Number(data.holidays_count ?? 0);
  const calendarDays = Number(data.calendar_days || 30);

  const employeeMobile = data.employee_mobile || '';
  const whatsAppMessage = buildSalarySlipWhatsAppMessage(
    data,
    institute?.institute_name,
    institute?.address
  );
  const whatsAppUrl = employeeMobile
    ? buildWhatsAppLink(employeeMobile, whatsAppMessage)
    : `https://wa.me/?text=${encodeURIComponent(whatsAppMessage)}`;

  const handleWhatsAppShare = () => {
    if (whatsAppUrl) {
      window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const statusBadgeVariant =
    data.status === 'PAID' ? 'success' : data.status === 'PARTIALLY_PAID' ? 'warning' : 'danger';

  const renderSingleSlip = (copyType) => {
    return (
      <div className="border-2 border-black rounded-lg p-4 sm:p-5 bg-white text-black shadow-xs space-y-4 font-sans text-xs sm:text-sm slip-box">
        {/* Institute Header with Emblem & Document Ribbon */}
        <ReceiptHeader
          documentTitle="OFFICIAL SALARY / PAYROLL SLIP"
          copyType={copyType}
          documentSubtitle={`Slip No: ${slipNumber}`}
        />

        {/* Employee & Payroll Voucher Details: 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/70">
          {/* Left Column: Staff / Faculty Details */}
          <div className="space-y-1 sm:border-r print:border-r border-slate-300 sm:pr-3 print:pr-3">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Staff / Faculty Name:
              </span>
              <span className="font-black text-black text-sm block">{employeeName}</span>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Designation / Role:
              </span>
              <span className="font-bold text-black text-xs">
                {employeeRole}
                {data.employee_specialization ? ` (${data.employee_specialization})` : ''}
              </span>
            </div>
            {data.employee_code && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Employee Code:
                </span>
                <span className="font-mono font-bold text-black text-xs">{data.employee_code}</span>
              </div>
            )}
            {employeeMobile && (
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Mobile Contact:
                </span>
                <span className="font-mono font-semibold text-black">{employeeMobile}</span>
              </div>
            )}
          </div>

          {/* Right Column: Payroll Voucher Details */}
          <div className="space-y-1 sm:pl-1 print:pl-1 border-t sm:border-t-0 print:border-t-0 pt-2 sm:pt-0 print:pt-0 border-slate-200">
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Salary Slip No:
              </span>
              <span className="font-mono font-black text-black text-sm">{slipNumber}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Salary Month:
                </span>
                <span className="font-bold text-black">{monthLabel}</span>
              </div>
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Payroll Status:
                </span>
                <span className="font-black text-black uppercase">{data.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Due Date:
                </span>
                <span className="font-mono font-bold text-black">{dueDateFormatted}</span>
              </div>
              <div>
                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                  Payment Date:
                </span>
                <span className="font-mono font-bold text-black">{paymentDateFormatted}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider block">
                Payment Mode:
              </span>
              <span className="font-bold text-black uppercase">{data.payment_mode || '—'}</span>
            </div>
          </div>
        </div>

        {/* Pay Period & Attendance Summary Banner */}
        <div className="bg-purple-50/80 border border-odoo-300 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row print:flex-row sm:items-center print:items-center justify-between gap-1.5">
          <span className="text-odoo-950 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-odoo-700 shrink-0" />
            Pay Period &amp; Attendance Summary:
          </span>
          <span className="font-mono font-black text-odoo-950 text-xs sm:text-sm bg-white/80 px-2 py-0.5 rounded border border-odoo-200">
            {monthLabel} ({data.month_year})
            {showAbsentRow && (
              <>
                {' '}
                • {absentDays} {absentDays === 1 ? 'Absent Day' : 'Absent Days'}
                {holidaysCount > 0 ? ` • ${holidaysCount} Paid Holiday${holidaysCount === 1 ? '' : 's'}` : ''}
              </>
            )}
          </span>
        </div>

        {/* Payroll Ledger & Disbursement Summary Table */}
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-between">
            <span>Payroll Earnings &amp; Disbursement Summary</span>
            <span className="text-[9px] text-slate-500 font-normal">Amounts in INR (₹)</span>
          </div>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-black font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Salary Particulars</th>
                  <th className="p-2 text-right w-40 sm:w-48">Amount / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {baseSalary !== null && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-900 font-medium">
                      Base Monthly Contractual Salary
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-black">
                      {formatCurrency(baseSalary)}
                    </td>
                  </tr>
                )}

                {showAbsentRow && (
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      Absent Days Recorded ({calendarDays}-day calendar month)
                      {holidaysCount > 0 ? ` • ${holidaysCount} Paid Holiday${holidaysCount === 1 ? '' : 's'}` : ''}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-black">
                      {absentDays} {absentDays === 1 ? 'day' : 'days'}
                    </td>
                  </tr>
                )}

                {deductionAmount > 0 && (
                  <tr className="bg-rose-50/40">
                    <td className="p-2 border-r border-slate-200 text-rose-900 font-semibold">
                      Less: Attendance Deduction
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-rose-800">
                      -{formatCurrency(deductionAmount)}
                    </td>
                  </tr>
                )}

                <tr className="bg-slate-50">
                  <td className="p-2 border-r border-slate-200 text-black font-bold">
                    Payable Salary ({monthLabel})
                  </td>
                  <td className="p-2 text-right font-mono font-black text-black">
                    {formatCurrency(payableSalary)}
                  </td>
                </tr>

                {/* Paid Amount — Bold Highlight */}
                <tr className="bg-emerald-50 border-y-2 border-emerald-400">
                  <td className="p-2 border-r border-emerald-200 font-black text-emerald-950 uppercase text-xs">
                    Paid / Disbursed Amount ({data.payment_mode || 'PENDING'})
                  </td>
                  <td className="p-2 text-right font-mono font-black text-sm sm:text-base text-emerald-900">
                    {formatCurrency(paidAmount)}
                  </td>
                </tr>

                {/* Remaining Balance / Status Row */}
                <tr
                  className={
                    balanceDue > 0
                      ? 'bg-rose-50 border-t-2 border-rose-300'
                      : 'bg-emerald-50/50 border-t border-emerald-200'
                  }
                >
                  <td className="p-2 border-r border-slate-200 font-black uppercase text-xs text-black">
                    Remaining Payable Balance
                  </td>
                  <td
                    className={`p-2 text-right font-mono font-black text-sm sm:text-base ${
                      balanceDue > 0 ? 'text-rose-700' : 'text-emerald-800'
                    }`}
                  >
                    {balanceDue > 0 ? formatCurrency(balanceDue) : '₹0.00 (NIL / PAID)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Enterprise Footer with Amount in Words, Stamp & Signatures */}
        <ReceiptFooter
          amount={paidAmount > 0 ? paidAmount : payableSalary}
          issuedDate={data.payment_date || data.due_date}
          collectedBy={sanitizeCollectorName(data.disbursed_by)}
          collectorName="Accounts Desk"
          leftSignatureLabel="Employee / Recipient"
          collectedByPrefix="Disbursed by:"
          customNote={data.notes || null}
          terms={[
            'This computer-generated salary slip reflects payroll disbursement as recorded in institute accounts.',
            'Paid holidays are treated as full working days with zero attendance deduction.',
            'Any discrepancy in attendance or payout must be reported to the Accounts Desk within 7 days.',
          ]}
        />
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Salary Slip — ${slipNumber}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Top Control Bar: Copy Mode Switcher, WhatsApp Forward & Print Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200 no-print text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-600 font-bold mr-1">Print Copy:</span>
            <button
              onClick={() => setCopyMode('EMPLOYEE')}
              className={`min-h-[32px] px-3 py-1 rounded text-xs font-bold transition-colors ${
                copyMode === 'EMPLOYEE'
                  ? 'bg-odoo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              Employee Copy
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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleWhatsAppShare}
              title={
                employeeMobile
                  ? `Share salary slip with ${employeeMobile} on WhatsApp`
                  : 'Forward salary slip via WhatsApp'
              }
              className="min-h-[32px] px-3 py-1 rounded text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Slip</span>
            </button>
            <Button variant="primary" size="xs" icon={Printer} onClick={handlePrint} className="w-full sm:w-auto">
              Print Slip
            </Button>
          </div>
        </div>

        {/* Printable Salary Slip Container */}
        <div id="printable-receipt" className="printable-slip-document space-y-6">
          {copyMode === 'BOTH' ? (
            <>
              {renderSingleSlip('EMPLOYEE COPY')}
              <div className="relative my-4 text-center select-none no-print-cut">
                <div className="border-t-2 border-dashed border-slate-400 w-full absolute top-1/2"></div>
                <span className="relative bg-white px-3 text-[10px] font-mono text-slate-600 font-bold uppercase">
                  ✂ Cut Along Dotted Line for Office Record ✂
                </span>
              </div>
              {renderSingleSlip('OFFICE / AUDIT COPY')}
            </>
          ) : (
            renderSingleSlip(copyMode === 'EMPLOYEE' ? 'EMPLOYEE COPY' : 'OFFICE / AUDIT COPY')
          )}
        </div>

        {/* Bottom Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200 no-print">
          <div className="flex items-center gap-1.5">
            <Badge variant={statusBadgeVariant}>
              {data.status === 'PAID'
                ? 'Salary Paid & Settled'
                : data.status === 'PARTIALLY_PAID'
                  ? 'Partially Paid'
                  : 'Payment Pending'}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleWhatsAppShare}
              title={
                employeeMobile
                  ? `Share salary slip with ${employeeMobile} on WhatsApp`
                  : 'Forward salary slip via WhatsApp'
              }
              className="min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
              <span>WhatsApp Slip</span>
            </button>
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial">
              Close
            </Button>
            <Button variant="primary" icon={Printer} onClick={handlePrint} className="flex-1 sm:flex-initial">
              Print Slip
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
