import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { RefreshCw, Calendar, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { admissionApi, teacherApi } from '../../services/allApis';
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
  const [durationMode, setDurationMode] = useState('months'); // 'months', 'custom'
  const [customMonths, setCustomMonths] = useState(1);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [fee, setFee] = useState('');
  const [discountType, setDiscountType] = useState('NONE');
  const [discountValue, setDiscountValue] = useState('0');
  const [priceOverrideReason, setPriceOverrideReason] = useState('');

  // Authoritative Backend Calculation State
  const [calculation, setCalculation] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

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

  const fetchBackendCalculation = useCallback(
    async ({
      newFrom,
      newTo,
      newFee,
      newDiscountType,
      newDiscountValue,
      overrideReason,
      updateFeeState = true,
      updatePaymentState = true,
    } = {}) => {
      const targetFrom = newFrom !== undefined ? newFrom : validFrom;
      const targetTo = newTo !== undefined ? newTo : validTo;
      if (!item?.subject_id || !targetFrom || !targetTo) return;

      try {
        setCalcLoading(true);
        const reqPayload = {
          subject_id: item.subject_id,
          student_id: student?.id,
          valid_from: targetFrom,
          valid_to: targetTo,
          discount_type: newDiscountType !== undefined ? newDiscountType : discountType,
          discount_value: parseFloat(newDiscountValue !== undefined ? newDiscountValue : discountValue) || 0,
        };

        const targetFee = newFee !== undefined ? newFee : fee;
        if (targetFee !== null && targetFee !== undefined && String(targetFee).trim() !== '') {
          reqPayload.fee = parseFloat(targetFee);
          const reason = overrideReason !== undefined ? overrideReason : priceOverrideReason;
          if (reason) {
            reqPayload.price_override_reason = reason;
          }
        }

        const res = await admissionApi.calculateRenewal(reqPayload);
        setCalculation(res);

        if (updateFeeState) {
          setFee(String(res.fee));
        }
        if (updatePaymentState) {
          setPaymentAmount(String(res.net_payable));
        }
      } catch (err) {
        console.error('Failed to calculate renewal payable from backend:', err);
      } finally {
        setCalcLoading(false);
      }
    },
    [item, student, validFrom, validTo, fee, discountType, discountValue, priceOverrideReason]
  );

  useEffect(() => {
    if (isOpen && item) {
      setTeacherId(item.teacher_id || '');
      setDurationMode('months');
      setCustomMonths(1);
      setDiscountType('NONE');
      setDiscountValue('0');
      setCollectPayment(true);
      setPaymentMode('CASH');
      setTransactionRef('');
      setNotes('');
      setPriceOverrideReason('');

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
      const endStr = end.toISOString().split('T')[0];
      setValidTo(endStr);

      // Fetch authoritative backend calculation on open
      fetchBackendCalculation({
        newFrom: startStr,
        newTo: endStr,
        newFee: null, // let backend calculate standard fee based on subject rate and duration
        newDiscountType: 'NONE',
        newDiscountValue: '0',
        updateFeeState: true,
        updatePaymentState: true,
      });
    }
  }, [isOpen, item]);

  const handleMonthsChange = (mVal) => {
    const m = Math.min(3, Math.max(1, parseInt(mVal, 10) || 1));
    setCustomMonths(m);
    setDurationMode('months');
    if (!validFrom) return;

    const start = new Date(validFrom);
    const end = new Date(start);
    end.setDate(end.getDate() + m * 30);
    const endStr = end.toISOString().split('T')[0];
    setValidTo(endStr);

    fetchBackendCalculation({
      newFrom: validFrom,
      newTo: endStr,
      newFee: null, // recompute fee for new duration
      updateFeeState: true,
      updatePaymentState: true,
    });
  };

  const handleValidFromChange = (e) => {
    const newFrom = e.target.value;
    setValidFrom(newFrom);
    if (newFrom && durationMode === 'months') {
      const start = new Date(newFrom);
      const end = new Date(start);
      end.setDate(end.getDate() + customMonths * 30);
      const endStr = end.toISOString().split('T')[0];
      setValidTo(endStr);
      fetchBackendCalculation({
        newFrom,
        newTo: endStr,
        newFee: null,
        updateFeeState: true,
        updatePaymentState: true,
      });
    } else if (newFrom && validTo) {
      fetchBackendCalculation({
        newFrom,
        newTo: validTo,
        updateFeeState: true,
        updatePaymentState: true,
      });
    }
  };

  const handleValidToChange = (e) => {
    const newTo = e.target.value;
    setValidTo(newTo);
    setDurationMode('custom');
    if (validFrom && newTo && newTo >= validFrom) {
      fetchBackendCalculation({
        newFrom: validFrom,
        newTo,
        updateFeeState: true,
        updatePaymentState: true,
      });
    }
  };

  const handleDiscountTypeChange = (newType) => {
    setDiscountType(newType);
    fetchBackendCalculation({
      newDiscountType: newType,
      updateFeeState: false,
      updatePaymentState: true,
    });
  };

  const handleDiscountValueChange = (newVal) => {
    setDiscountValue(newVal);
    fetchBackendCalculation({
      newDiscountValue: newVal,
      updateFeeState: false,
      updatePaymentState: true,
    });
  };

  const handleFeeChange = (newFee) => {
    setFee(newFee);
    fetchBackendCalculation({
      newFee,
      updateFeeState: false,
      updatePaymentState: true,
    });
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

    // Authoritative net payable computed by backend
    const authoritativeNet = calculation ? Number(calculation.net_payable) : feeNum;
    const isPriceOverridden = calculation && feeNum !== Number(calculation.computed_standard_fee);
    if (isPriceOverridden && !priceOverrideReason.trim()) {
      error(`Price override reason is required when fee (₹${feeNum}) differs from standard fee (₹${calculation.computed_standard_fee})`);
      return;
    }

    if (collectPayment && parseFloat(paymentAmount) > authoritativeNet) {
      error(`Amount paid cannot exceed the net payable of ₹${authoritativeNet.toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        student_id: student.id,
        subject_id: item.subject_id,
        teacher_id: teacherId || undefined,
        valid_from: validFrom,
        valid_to: validTo,
        fee: feeNum,
        price_override_reason: isPriceOverridden ? priceOverrideReason.trim() : undefined,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        notes: notes.trim() || `Renewal for ${item.subject_name}`,
      };

      if (collectPayment && parseFloat(paymentAmount) > 0) {
        payload.initial_payment = {
          amount: Math.min(parseFloat(paymentAmount), authoritativeNet),
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

  const currentNetPayable = calculation ? Number(calculation.net_payable) : (parseFloat(fee) || 0);

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
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
          >
            <option value="">Select Teacher / Keep Existing</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.teacher_code}) {t.specialization ? `— ${t.specialization}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Renewal Period / Duration */}
        <div className="space-y-1.5">
          <label className="block text-slate-700 font-bold text-xs">
            Renewal Period / Duration
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 p-1 px-2.5 rounded border ${durationMode === 'months' ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <span className="text-xs font-semibold">Custom Month:</span>
              <input
                type="number"
                min="1"
                max="3"
                step="1"
                value={customMonths}
                onChange={(e) => handleMonthsChange(e.target.value)}
                className="w-14 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-center font-bold text-black font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs font-medium">mo ({customMonths * 30}d)</span>
            </div>

            <button
              type="button"
              onClick={() => setDurationMode('custom')}
              className={`px-3 py-1.5 rounded text-xs font-semibold border transition ${
                durationMode === 'custom'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Custom Dates
            </button>
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
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
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
              onChange={handleValidToChange}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
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
                step="any"
                value={fee}
                onChange={(e) => handleFeeChange(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Discount</label>
              <select
                value={discountType}
                onChange={(e) => handleDiscountTypeChange(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black bg-white"
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
                  step="any"
                  value={discountValue}
                  onChange={(e) => handleDiscountValueChange(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold bg-white"
                />
              </div>
            )}
          </div>

          {/* Price Override Reason if changed */}
          {calculation && parseFloat(fee) !== Number(calculation.computed_standard_fee) && (
            <div className="pt-1">
              <label className="block text-amber-800 font-bold mb-1 text-[11px]">
                Price Override Reason <span className="text-rose-600">*</span>
                <span className="font-normal text-slate-500 ml-1">
                  (Standard fee: ₹{Number(calculation.computed_standard_fee).toFixed(2)})
                </span>
              </label>
              <input
                type="text"
                placeholder="Reason for changing standard fee..."
                value={priceOverrideReason}
                onChange={(e) => {
                  setPriceOverrideReason(e.target.value);
                  fetchBackendCalculation({ overrideReason: e.target.value, updateFeeState: false, updatePaymentState: true });
                }}
                className="w-full border border-amber-300 rounded px-2 py-1 text-xs text-black bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>
          )}

          <div className="flex justify-between items-center pt-1 border-t border-slate-200 font-bold">
            <span className="text-slate-600">Net Payable for Renewal:</span>
            <span className="text-emerald-700 text-sm font-mono">
              ₹{currentNetPayable.toFixed(2)}
              {calcLoading && <span className="text-[10px] text-slate-400 ml-1 font-normal font-sans">(calculating...)</span>}
            </span>
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
                  min="0"
                  max={currentNetPayable}
                  step="any"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black font-semibold bg-white"
                  required={collectPayment}
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black bg-white"
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
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black bg-white"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            size="sm"
            icon={RefreshCw}
            loading={submitting || calcLoading}
            className="w-full sm:w-auto"
          >
            Confirm Renewal
          </Button>
        </div>
      </form>
    </Modal>
  );
}
