import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Printer,
  CreditCard,
  User,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  BookOpen,
  Award,
  Sparkles
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { useAuth } from '../../context/AuthContext';
import { formatIndianDate, formatCycleLabel, evaluateCycleStatus, getCleanCancelReason } from '../../utils/dateCycleUtils';

export default function AdmissionDetailModal({
  isOpen,
  onClose,
  admission,
  onPrintSlip,
  onCollectFee,
  onWaiveDue,
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  if (!admission) return null;

  const isActive = admission.status === 'ACTIVE';
  const isRevoked = admission.status === 'REVOKED';
  const isCancelled = admission.status === 'CANCELLED';

  const validFrom = admission.valid_from || admission.admission_date;
  const validTo = admission.valid_to;
  const isInactive = isRevoked || isCancelled || admission.status === 'DISCONTINUED';
  const cycleInfo = evaluateCycleStatus(validTo, admission.balance_due, isInactive, validFrom);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Course Purchase & Subject Enrollment Details"
      subtitle={`Transaction ID: ${admission.purchase_transaction_id || admission.admission_number}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Prominent Active vs Not Active Status Banner */}
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between ${
            isActive
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : isRevoked
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-slate-100 border-slate-300 text-slate-800'
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
                Enrollment Status: {isActive ? 'ACTIVE COURSE PURCHASE' : isRevoked ? 'NOT ACTIVE (REVOKED)' : 'NOT ACTIVE (CANCELLED)'}
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                {isActive
                  ? 'Student has active subject enrollment and class access'
                  : getCleanCancelReason(admission.revocation_reason)
                  ? `Revoked: ${getCleanCancelReason(admission.revocation_reason)}`
                  : 'Enrollment has been deactivated / cancelled'}
              </div>
            </div>
          </div>
          <Badge
            variant={isActive ? 'success' : 'danger'}
            size="md"
            className="uppercase font-bold tracking-wide"
          >
            {admission.status}
          </Badge>
        </div>

        {/* Student Quick Bio Card */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-odoo-700 font-bold flex items-center justify-center text-sm border border-odoo-200">
              {admission.student_name_snapshot ? admission.student_name_snapshot.slice(0, 2).toUpperCase() : 'ST'}
            </div>
            <div>
              <h3 className="font-bold text-black text-sm">{admission.student_name_snapshot}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span>Adm No: {admission.admission_number}</span>
                <span>•</span>
                <span>Enrolled: {formatIndianDate(admission.admission_date)}</span>
              </div>
            </div>
          </div>

          {admission.student_id && (
            <button
              onClick={() => {
                onClose();
                navigate(`/students/${admission.student_id}`);
              }}
              className="px-2.5 py-1 text-xs font-semibold bg-white text-odoo-700 hover:bg-purple-50 border border-odoo-300 rounded shadow-2xs flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Profile</span>
            </button>
          )}
        </div>

        {/* Rolling Date-to-Date Fee Cycle Card */}
        <div className="bg-purple-50/60 p-3.5 rounded-lg border border-odoo-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-odoo-900 uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-odoo-700" />
              <span>Rolling Date-to-Date Fee Cycle</span>
            </div>
            <Badge variant={cycleInfo.variant} size="xs">
              {cycleInfo.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
            <div className="bg-white p-2 rounded border border-purple-100">
              <span className="text-[11px] text-slate-500 block">Cycle Period</span>
              <span className="font-mono font-bold text-black">
                {formatCycleLabel(validFrom, validTo)}
              </span>
            </div>
            <div className="bg-white p-2 rounded border border-purple-100">
              <span className="text-[11px] text-slate-500 block">Billing Anchor Day</span>
              <span className="font-semibold text-odoo-900">
                Day {validFrom ? parseInt(validFrom.split('-')[2], 10) : '—'} of month
              </span>
            </div>
            <div className="bg-white p-2 rounded border border-purple-100">
              <span className="text-[11px] text-slate-500 block">Cycle Renewal Status</span>
              <span className="font-medium text-slate-800">
                {cycleInfo.subtext}
              </span>
            </div>
          </div>
        </div>

        {/* Itemized Purchased Courses / Subjects */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-600" />
            <span>Purchased Items & Faculty Allocations</span>
          </h4>

          <div className="overflow-x-auto rounded border border-slate-200 -webkit-overflow-scrolling-touch">
            <table className="w-full text-left text-xs min-w-[550px]">
              <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Item Name</th>
                  <th className="p-2">Faculty & Hall</th>
                  <th className="p-2 text-right">Fee</th>
                  <th className="p-2 text-right">Disc</th>
                  <th className="p-2 text-right">Net Price</th>
                  <th className="p-2 text-right text-emerald-800">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(admission.items || []).map((itm, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2 font-medium text-black">
                      <div className="flex items-center gap-1">
                        {itm.item_type === 'GREEN_CARD' && <Award className="w-3.5 h-3.5 text-purple-600" />}
                        <span>{itm.item_name_snapshot}</span>
                      </div>
                      {itm.source_demo_number && (
                        <span className="inline-block text-[10px] font-mono font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded mt-0.5">
                          Demo {itm.source_demo_number}
                        </span>
                      )}
                      {itm.valid_from && itm.valid_to && (
                        <span className="text-[10px] text-slate-500 font-mono block">
                          Cycle: {formatCycleLabel(itm.valid_from, itm.valid_to)}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-slate-700">
                      <div>{itm.teacher_name_snapshot || 'Faculty'}</div>
                      <div className="text-[10px] text-slate-500">{itm.hall_number_snapshot ? `Hall: ${itm.hall_number_snapshot}` : 'Main'}</div>
                    </td>
                    <td className="p-2 text-right font-mono text-slate-700">₹{Number(itm.original_price || 0).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-rose-600">-₹{Number((itm.discount_amount || 0) + (itm.overall_discount_share || 0)).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono font-bold text-black">₹{Number(itm.net_price || 0).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-800">₹{Number(itm.amount_collected || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary */}
        <div className={`bg-slate-50 p-3.5 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-${Number(admission.written_off_amount || 0) > 0 ? '5' : '4'} gap-2 text-xs`}>
          <div>
            <span className="text-slate-500 block text-[11px]">Total Payable</span>
            <span className="font-mono font-bold text-black text-sm">
              ₹{Number(admission.total_payable || 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Amount Paid</span>
            <span className="font-mono font-bold text-emerald-800 text-sm">
              ₹{Number(admission.amount_paid || 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Balance Due</span>
            <span className="font-mono font-bold text-rose-700 text-sm">
              ₹{Number(admission.balance_due || 0).toFixed(2)}
            </span>
          </div>
          {Number(admission.written_off_amount || 0) > 0 && (
            <div>
              <span className="text-amber-800 block text-[11px] font-bold">Fee Waived</span>
              <span className="font-mono font-bold text-amber-900 text-sm">
                ₹{Number(admission.written_off_amount).toFixed(2)}
              </span>
            </div>
          )}
          <div>
            <span className="text-slate-500 block text-[11px]">Payment Status</span>
            <Badge
              size="xs"
              variant={
                admission.payment_status === 'PAID'
                  ? 'success'
                  : admission.payment_status === 'PARTIALLY_PAID'
                  ? 'warning'
                  : 'danger'
              }
            >
              {admission.payment_status}
            </Badge>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <Button
            size="sm"
            variant="secondary"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Close
          </Button>

          {onPrintSlip && (
            <Button
              size="sm"
              variant="indigo"
              icon={Printer}
              onClick={() => {
                onClose();
                onPrintSlip(admission);
              }}
              className="w-full sm:w-auto"
            >
              Print Receipt Slip
            </Button>
          )}

          {Number(admission.balance_due) > 0 && isActive && onCollectFee && (
            <Button
              size="sm"
              variant="success"
              icon={CreditCard}
              onClick={() => {
                onClose();
                onCollectFee(admission.id);
              }}
              className="w-full sm:w-auto"
            >
              Collect Remaining Fee
            </Button>
          )}

          {isAdmin && Number(admission.balance_due) > 0 && !isInactive && onWaiveDue && (
            <Button
              size="sm"
              variant="amber"
              icon={Sparkles}
              onClick={() => {
                onClose();
                onWaiveDue(admission);
              }}
              className="w-full sm:w-auto"
            >
              Waive Due
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
