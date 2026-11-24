import React from 'react';

/**
 * Standard WhatsApp SVG icon
 */
export function WhatsAppIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Normalizes phone numbers and formats clean WhatsApp click-to-chat URL:
 * https://wa.me/{phone}?text={encoded}
 */
export function buildWhatsAppLink(phone, message) {
  if (!phone) return '';
  const cleanDigits = String(phone).replace(/\D/g, '');
  if (!cleanDigits) return '';
  // If standard 10 digit Indian number, prepend 91
  const fullPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message || '')}`;
}

/**
 * Formats currency in INR format.
 */
export function formatINR(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats a date string safely.
 */
export function formatSlipDate(val) {
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
}

/**
 * Builds pre-filled WhatsApp receipt message for Payment Receipt.
 */
export function buildPaymentReceiptWhatsAppMessage(data, instituteName = 'THAKURDWARA COACHING INSTITUTE', instituteAddress = '') {
  const studentName = data.student_name || data.student?.name || 'Student';
  const receiptNo = data.payment_number || '—';
  const paymentDate = formatSlipDate(data.payment_date);
  const amountPaid = formatINR(data.amount || 0);
  const balanceDue = Number(data.remaining_balance_due !== undefined ? data.remaining_balance_due : 0);
  const paymentMode = data.payment_mode || 'CASH';

  let msg = `🎓 *${instituteName}*\n`;
  msg += `*Official Fee Payment Receipt*\n\n`;
  msg += `Dear *${studentName}*,\n`;
  msg += `We have successfully acknowledged your fee payment with the following details:\n\n`;
  msg += `🧾 *Receipt Voucher:* ${receiptNo}\n`;
  msg += `📅 *Date of Payment:* ${paymentDate}\n`;
  msg += `💰 *Amount Paid:* ${amountPaid}\n`;
  msg += `💳 *Payment Mode:* ${paymentMode}\n`;

  if (balanceDue > 0) {
    msg += `⚠️ *Remaining Balance Due:* ${formatINR(balanceDue)}\n\n`;
  } else {
    msg += `✅ *Fee Status:* Cleared & Fully Settled\n\n`;
  }

  msg += `_Thank you for learning with us. Please preserve this receipt for your records._\n`;
  msg += `_${instituteName}${instituteAddress ? ` • ${instituteAddress}` : ''}_`;

  return msg;
}

/**
 * Builds pre-filled WhatsApp admission / enrollment voucher message.
 */
export function buildAdmissionReceiptWhatsAppMessage(data, instituteName = 'THAKURDWARA COACHING INSTITUTE') {
  const studentName = data.student_name_snapshot || data.student?.name || data.student_name || 'Student';
  const voucherNo = data.purchase_transaction_id || data.admission_number || '—';
  const admissionDate = formatSlipDate(data.admission_date);
  const totalPayable = formatINR(data.total_payable || 0);
  const amountPaid = formatINR(data.amount_paid || 0);
  const balanceDue = Number(data.balance_due !== undefined ? data.balance_due : 0);

  let courses = 'Course Enrollment';
  if (Array.isArray(data.items) && data.items.length > 0) {
    courses = data.items.map((i) => i.item_name_snapshot).join(', ');
  }

  let msg = `🎓 *${instituteName}*\n`;
  msg += `*Course Enrollment & Academic Invoice*\n\n`;
  msg += `Dear *${studentName}*,\n`;
  msg += `Welcome to ${instituteName}! Your enrollment has been confirmed:\n\n`;
  msg += `📋 *Invoice Voucher:* ${voucherNo}\n`;
  msg += `📅 *Admission Date:* ${admissionDate}\n`;
  msg += `📚 *Enrolled Course(s):* ${courses}\n`;
  msg += `💵 *Total Course Fee:* ${totalPayable}\n`;
  msg += `💰 *Amount Paid:* ${amountPaid}\n`;

  if (balanceDue > 0) {
    msg += `⚠️ *Outstanding Balance Due:* ${formatINR(balanceDue)}\n\n`;
  } else {
    msg += `✅ *Payment Status:* Fully Paid\n\n`;
  }

  msg += `_Thank you for choosing ${instituteName}._\n`;
  msg += `_Keep this enrollment confirmation for campus access & attendance._`;

  return msg;
}
