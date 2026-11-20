import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { RefreshCw, Calendar, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { admissionApi, teacherApi, subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function RenewSubjectModal({
  isOpen,
  onClose,
  student,
  item, // active or historical item being renewed
  onSuccess,
}) {
  const { success, error } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [durationPreset, setDurationPreset] = useState('1m'); // '15d', '1m', '2m', '3m', 'custom'
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [fee, setFee] = useState('');
  const [discountType, setDiscountType] = useState('NONE');
  const [discountValue, setDiscountValue] = useState('0');
  
  // Payment toggle
  const [collectPayment, setCollectPayment] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTeachers();
    }
  }, [isOpen]);

  const loadTeachers = async () => {
    try {
      const res = await teacherApi.list({ status: 'ACTIVE', page_size: 100 });
      setTeachers(res.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      setTeacherId(item.teacher_id || '');
      setFee(String(item.original_price || item.net_price || '1500'));
      setPaymentAmount(String(item.net_price || item.original_price || '1500'));
      
      // Calculate suggested start date: if item has valid_to, start day after valid_to, else today
      let start = new Date();
      if (item.valid_to) {
        const prevEnd = new Date(item.valid_to);
        if (!isNaN(prevEnd.getTime())) {
          start = new Date(prevEnd);
          start.setDate(start.getDate() + 1);
        }
      }
      const startStr = start.toISOString().split('T')[0];
      setValidFrom(startStr);

      // Default 1 month (30 days)
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      setValidTo(end.toISOString().split('T')[0]);
      setDurationPreset('1m');
      setDiscountType('NONE');
      setDiscountValue('0');
      setCollectPayment(true);
      setPaymentMode('CASH');
      setTransactionRef('');
      setNotes('');
    }
  }, [isOpen, item]);

  const handlePresetChange = (preset) => {
    setDurationPreset(preset);
    if (!validFrom || preset === 'custom') return;

    const start = new Date(validFrom);
    const end = new Date(start);
    if (preset === '15d') {
      end.setDate(end.getDate() + 15);
    } else if (preset === '1m') {
      end.setDate(end.getDate() + 30);
    } else if (preset === '2m') {
      end.setDate(end.getDate() + 60);
    } else if (preset === '3m') {
      end.setDate(end.getDate() + 90);
    }
    setValidTo(end.toISOString().split('T')[0]);
  };

  const handleValidFromChange = (e) => {
    const newFrom = e.target.value;
    setValidFrom(newFrom);
    if (newFrom && durationPreset !== 'custom') {
      const start = new Date(newFrom);
      const end = new Date(start);
      if (durationPreset === '15d') end.setDate(end.getDate() + 15);
      else if (durationPreset === '1m') end.setDate(end.getDate() + 30);
      else if (durationPreset === '2m') end.setDate(end.getDate() + 60);
      else if (durationPreset === '3m') end.setDate(end.getDate() + 90);
      setValidTo(end.toISOString().split('T')[0]);
    }
  };

  const calculatedNet = () => {
    const f = parseFloat(fee) || 0;
    const dVal = parseFloat(discountValue) || 0;
    if (discountType === 'PERCENTAGE') {
      return Math.max(0, f - (f * dVal) / 100);
    } else if (discountType === 'FIXED') {
      return Math.max(0, f - dVal);
    }
    return f;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validFrom || !validTo) {
      error('Please specify valid start and end dates');
      return;
    }
    if (validTo < validFrom) {
      error('End date cannot be earlier than start date');
      return;
    }
    const feeNum = parseFloat(fee);
    if (isNaN(feeNum) || feeNum <= 0) {
      error('Please enter a valid course fee');
      return;
    }

    setSubmitting(true);
    try {
      const netPayable = calculatedNet();
      const payload = {
        student_id: student.id,
        subject_id: item.subject_id,
        teacher_id: teacherId || undefined,
        valid_from: validFrom,
        valid_to: validTo,
        fee: feeNum,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        notes: notes.trim() || `Renewal for ${item.subject_name}`,
      };

      if (collectPayment && parseFloat(paymentAmount) > 0) {
        payload.initial_payment = {
          amount: Math.min(parseFloat(paymentAmount), netPayable),
          payment_mode: paymentMode,
          transaction_reference: transactionRef.trim() || undefined,
          notes: `Renewal fee collection for ${item.subject_name}`,
        };
      }

      await admissionApi.renewSubject(payload);
      success(`Successfully renewed ${item.subject_name}! New invoice & validity created.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'Failed to renew subject');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Renew Subject: ${item.subject_name}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold">Subject: {item.subject_name}</span>
            <span className="font-mono text-emerald-700 font-semibold">
              Student: {student?.name} ({student?.student_code})
            </span>
          </div>
          {item.valid_to && (
            <p className="text-slate-600 text-[11px]">
              Previous Cycle Ended: <strong className="text-black font-mono">{item.valid_to}</strong>
            </p>
          )}
        </div>

        {/* Teacher Assignment */}
        <div className="text-xs">
          <label className="block text-slate-700 font-bold mb-1">
            Assigned Teacher <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Teacher / Keep Existing</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.teacher_code}) {t.specialization ? `— ${t.specialization}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Duration Presets */}
        <div className="space-y-1">
          <label className="block text-slate-700 font-bold text-xs">
            Renewal Period / Duration
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: '15d', label: '15 Days' },
              { id: '1m', label: '1 Month (30d)' },
              { id: '2m', label: '2 Months (60d)' },
              { id: '3m', label: '3 Months (90d)' },
              { id: 'custom', label: 'Custom Dates' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
                  durationPreset === p.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Pickers */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Valid From (Start) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={validFrom}
              onChange={handleValidFromChange}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Valid To (End) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={validTo}
              onChange={(e) => {
                setValidTo(e.target.value);
                setDurationPreset('custom');
              }}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
          </div>
        </div>

        {/* Pricing & Discount */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Fee (₹)</label>
              <input
                type="number"
                min="0"
                step="50"
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                  setPaymentAmount(e.target.value);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Discount</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black"
              >
                <option value="NONE">None</option>
                <option value="FIXED">Fixed (₹)</option>
                <option value="PERCENTAGE">Percent (%)</option>
              </select>
            </div>

            {discountType !== 'NONE' && (
              <div>
                <label className="block text-slate-700 font-bold mb-1">Discount Value</label>
                <input
                  type="number"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold"
                />
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold">
            <span className="text-slate-600">Net Payable for Renewal:</span>
            <span className="text-emerald-700 text-sm font-mono">₹{calculatedNet().toFixed(2)}</span>
          </div>
        </div>

        {/* Collect Initial Payment Toggle */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-slate-800">
            <input
              type="checkbox"
              checked={collectPayment}
              onChange={(e) => setCollectPayment(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Collect Payment at Renewal (Generate Receipt)</span>
          </label>

          {collectPayment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={calculatedNet()}
                  step="50"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold"
                  required={collectPayment}
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {paymentMode !== 'CASH' && (
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 font-medium mb-1">
                    Transaction / UPI Ref No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., UPI Ref / UTR / Cheque No."
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            size="sm"
            icon={RefreshCw}
            loading={submitting}
          >
            Confirm Renewal
          </Button>
        </div>
      </form>
    </Modal>
  );
}
