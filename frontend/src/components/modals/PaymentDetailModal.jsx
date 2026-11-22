import React from 'react';
import {
  Printer,
  ReceiptIndianRupee,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  CreditCard,
  User,
  RotateCcw,
  Edit2
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { formatIndianDate, formatCycleLabel } from '../../utils/dateCycleUtils';

export default function PaymentDetailModal({
  isOpen,
  onClose,
  payment,
  onPrintReceipt,
  onIssueRefund,
  onEditPayment,
  isAdmin = false,
}) {
  if (!payment) return null;

  const isRefunded = payment.is_refunded || payment.status === 'REFUNDED';
  const isActive = !isRefunded && payment.status !== 'CANCELLED';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Receipt & Financial Transaction Details"
      subtitle={`Receipt No: ${payment.receipt_number || payment.id}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Prominent Active vs Not Active Status Banner */}
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between ${
            isActive
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isActive ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Financial Status: {isActive ? 'ACTIVE PAYMENT RECORD' : 'NOT ACTIVE (REFUNDED / VOID)'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isActive
                  ? 'Realized cash/digital fee collection successfully recorded in ledger'
                  : 'This transaction was refunded or voided'}
              </div>
            </div>
          </div>
          <Badge
            variant={isActive ? 'success' : 'danger'}
            size="md"
            className="uppercase font-bold tracking-wide"
          >
            {isActive ? 'ACTIVE' : 'REFUNDED'}
          </Badge>
        </div>

        {/* Transaction Summary Grid */}
        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">Receipt Number</span>
            <span className="font-mono font-bold text-odoo-700">
              {payment.receipt_number || 'REC-DIRECT'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Payment Mode</span>
            <span className="font-bold text-black flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-500" />
              {payment.payment_mode}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Payment Date</span>
            <span className="font-mono text-black font-semibold">
              {formatIndianDate(payment.payment_date)}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Student Name</span>
            <span className="font-bold text-black">
              {payment.student_name || 'Student'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Purchase Transaction ID</span>
            <span className="font-mono text-slate-700 font-semibold">
              {payment.admission_number || 'Direct'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Cashier / Staff</span>
            <span className="font-medium text-slate-800">
              {payment.created_by_name || 'Staff User'}
            </span>
          </div>
        </div>

        {/* Rolling Cycle Window Covered */}
        {(payment.valid_from || payment.valid_to) && (
          <div className="bg-purple-50/60 p-3 rounded-lg border border-odoo-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-odoo-700" />
              <span className="font-bold text-odoo-900">Rolling Fee Cycle Covered:</span>
              <span className="font-mono font-bold text-black">
                {formatCycleLabel(payment.valid_from, payment.valid_to)}
              </span>
            </div>
            <span className="text-[11px] text-odoo-800 bg-white px-2 py-0.5 rounded border border-odoo-200 font-semibold">
              Day {payment.valid_from ? parseInt(payment.valid_from.split('-')[2], 10) : '—'} cycle
            </span>
          </div>
        )}

        {/* Collected Amount Banner */}
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-900 block">Total Amount Collected</span>
            <span className="text-xs text-emerald-700 font-medium">Receipt finalized in accounts ledger</span>
          </div>
          <span className="text-xl font-mono font-bold text-emerald-800">
            ₹{Number(payment.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Transaction Reference / Notes */}
        {(payment.transaction_reference || payment.notes) && (
          <div className="bg-white p-3 rounded border border-slate-200 text-xs space-y-1">
            {payment.transaction_reference && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="font-bold text-black">Reference ID:</span>
                <span className="font-mono">{payment.transaction_reference}</span>
              </div>
            )}
            {payment.notes && (
              <div className="text-slate-600">
                <span className="font-bold text-black">Notes:</span> {payment.notes}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-200">
          <Button size="sm" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>

          {isAdmin && isActive && onIssueRefund && (
            <Button
              size="sm"
              variant="orange"
              icon={RotateCcw}
              className="w-full sm:w-auto"
              onClick={() => {
                onClose();
                onIssueRefund(payment);
              }}
            >
              Issue Refund
            </Button>
          )}

          {isAdmin && isActive && onEditPayment && (
            <Button
              size="sm"
              variant="amber"
              icon={Edit2}
              className="w-full sm:w-auto"
              onClick={() => {
                onClose();
                onEditPayment(payment);
              }}
            >
              Edit
            </Button>
          )}

          {onPrintReceipt && (
            <Button
              size="sm"
              variant="indigo"
              icon={Printer}
              className="w-full sm:w-auto"
              onClick={() => {
                onClose();
                onPrintReceipt(payment);
              }}
            >
              Print Receipt
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
