import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { RefreshCw, CalendarDays, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { admissionApi, teacherApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { computeRollingCycle, formatIndianDate } from '../../utils/dateCycleUtils';

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

  // Payment settlement state: 'FULL', 'PARTIAL', 'DUE'
  const [paymentOption, setPaymentOption] = useState('FULL');
  const [customPaidAmount, setCustomPaidAmount] = useState('');
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
      const res = await teacherApi.list({ status: 'ACTIVE', status_filter: 'ACTIVE', page_size: 100 });
      setTeachers((res.items || []).filter((t) => t.status === 'ACTIVE'));
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
      currentPayOption,
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

        const opt = currentPayOption !== undefined ? currentPayOption : paymentOption;
        const net = Number(res.net_payable);
        if (opt === 'FULL') {
          setCustomPaidAmount(String(net));
        } else if (opt === 'DUE') {
          setCustomPaidAmount('0');
        }
      } catch (err) {
        console.error('Failed to calculate renewal payable from backend:', err);
      } finally {
        setCalcLoading(false);
      }
    },
    [item, student, validFrom, validTo, fee, discountType, discountValue, priceOverrideReason, paymentOption]
  );

  useEffect(() => {
    if (isOpen && item) {
      setTeacherId(item.teacher_id || '');
      setDurationMode('months');
      setCustomMonths(1);
      setDiscountType('NONE');
      setDiscountValue('0');
      setPaymentOption('FULL');
      setPaymentMode('CASH');
      setTransactionRef('');
      setNotes('');
      setPriceOverrideReason('');

      // Continuous start date: day after previous valid_to, or today if none
      let startStr = new Date().toISOString().split('T')[0];
      if (item.valid_to) {
        const parts = item.valid_to.split('T')[0].split('-');
        if (parts.length === 3) {
          const prevEnd = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          prevEnd.setDate(prevEnd.getDate() + 1);
          const pad = (n) => String(n).padStart(2, '0');
          startStr = `${prevEnd.getFullYear()}-${pad(prevEnd.getMonth() + 1)}-${pad(prevEnd.getDate())}`;
        }
      }
      setValidFrom(startStr);

      // Rolling month cycle end date
      const rolling = computeRollingCycle(startStr, 1);
      const endStr = rolling ? rolling.endDate : startStr;
      setValidTo(endStr);

      fetchBackendCalculation({
        newFrom: startStr,
        newTo: endStr,
        newFee: null,
        newDiscountType: 'NONE',
        newDiscountValue: '0',
        updateFeeState: true,
        currentPayOption: 'FULL',
      });
    }
  }, [isOpen, item]);

  const handleMonthsChange = (mVal) => {
    const m = Math.min(3, Math.max(1, parseInt(mVal, 10) || 1));
    setCustomMonths(m);
    setDurationMode('months');
    if (!validFrom) return;

    const rolling = computeRollingCycle(validFrom, m);
    const endStr = rolling ? rolling.endDate : validTo;
    setValidTo(endStr);

    fetchBackendCalculation({
      newFrom: validFrom,
      newTo: endStr,
      newFee: null,
      updateFeeState: true,
      currentPayOption: paymentOption,
    });
  };

  const handleValidFromChange = (e) => {
    const newFrom = e.target.value;
    setValidFrom(newFrom);
    if (newFrom && durationMode === 'months') {
      const rolling = computeRollingCycle(newFrom, customMonths);
      const endStr = rolling ? rolling.endDate : validTo;
      setValidTo(endStr);
      fetchBackendCalculation({
        newFrom,
        newTo: endStr,
        newFee: null,
        updateFeeState: true,
        currentPayOption: paymentOption,
      });
    } else if (newFrom && validTo) {
      fetchBackendCalculation({
        newFrom,
        newTo: validTo,
        updateFeeState: true,
        currentPayOption: paymentOption,
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
        currentPayOption: paymentOption,
      });
    }
  };

  const handleDiscountTypeChange = (newType) => {
    setDiscountType(newType);
    fetchBackendCalculation({
      newDiscountType: newType,
      updateFeeState: false,
      currentPayOption: paymentOption,
    });
  };

  const handleDiscountValueChange = (newVal) => {
    setDiscountValue(newVal);
    fetchBackendCalculation({
      newDiscountValue: newVal,
      updateFeeState: false,
      currentPayOption: paymentOption,
    });
  };

  const handleFeeChange = (newFee) => {
    setFee(newFee);
    fetchBackendCalculation({
      newFee,
      updateFeeState: false,
      currentPayOption: paymentOption,
    });
  };

  const currentNetPayable = calculation ? Number(calculation.net_payable) : (parseFloat(fee) || 0);
  const actualPaidAmount = paymentOption === 'FULL'
    ? currentNetPayable
    : paymentOption === 'DUE'
    ? 0
    : Math.min(Math.max(0, parseFloat(customPaidAmount) || 0), currentNetPayable);
  const balanceDueAmount = Math.max(0, currentNetPayable - actualPaidAmount);

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

    const authoritativeNet = calculation ? Number(calculation.net_payable) : feeNum;
    const isPriceOverridden = calculation && feeNum !== Number(calculation.computed_standard_fee);
    if (isPriceOverridden && !priceOverrideReason.trim()) {
      error(`Price override reason is required when fee (₹${feeNum}) differs from standard fee (₹${calculation.computed_standard_fee})`);
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
        months: durationMode === 'months' ? customMonths : 1,
        fee: feeNum,
        price_override_reason: isPriceOverridden ? priceOverrideReason.trim() : undefined,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        notes: notes.trim() || `Renewal for ${item.subject_name}`,
      };

      if (paymentOption !== 'DUE' && actualPaidAmount > 0) {
        payload.initial_payment = {
          amount: actualPaidAmount,
          payment_mode: paymentMode,
          transaction_reference: transactionRef.trim() || undefined,
          notes: `Renewal fee collection for ${item.subject_name}`,
        };
      }

      const res = await admissionApi.renewSubject(payload);
      success(`Successfully renewed ${item.subject_name}! New invoice & receipt slip generated.`);
      onSuccess?.(res);
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
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-emerald-900">Subject: {item.subject_name}</span>
            <span className="font-mono text-emerald-800 font-bold bg-white px-2 py-0.5 rounded border border-emerald-300">
              {student?.name} ({student?.student_code})
            </span>
          </div>
          {item.valid_to && (
            <p className="text-slate-600 text-[11px] pt-0.5">
              Previous Cycle Ended: <strong className="text-black font-mono">{formatIndianDate(item.valid_to)}</strong>
              {' '}• Suggested renewal starts next day (<strong className="text-emerald-800 font-mono">{formatIndianDate(validFrom)}</strong>)
            </p>
          )}
        </div>

        {/* Teacher Assignment */}
        <div className="text-xs">
          <label className="block text-slate-700 font-bold mb-1">
            Assigned Teacher / Faculty
          </label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-black focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
          >
            <option value="">Select Faculty / Keep Existing</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.teacher_code}) {t.specialization ? `— ${t.specialization}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Renewal Duration Presets (1m, 2m, 3m, Custom) */}
        <div className="space-y-1.5">
          <label className="block text-slate-700 font-bold text-xs">
            Billing Duration (Whole Months Cycle)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { m: 1, label: '1 Month (30d)' },
              { m: 2, label: '2 Months (60d)' },
              { m: 3, label: '3 Months (90d)' },
            ].map((preset) => (
              <button
                key={preset.m}
                type="button"
                onClick={() => handleMonthsChange(preset.m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  durationMode === 'months' && customMonths === preset.m
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setDurationMode('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                durationMode === 'custom'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Custom Dates
            </button>
          </div>
        </div>

        {/* Date Pickers */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Valid From (Start) <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={validFrom}
              onChange={handleValidFromChange}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-mono"
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
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white font-mono"
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
                  fetchBackendCalculation({ overrideReason: e.target.value, updateFeeState: false });
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

        {/* Payment Settlement Mode (Full vs Partial vs Pay Later) */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-3 text-xs bg-white">
          <label className="block text-xs font-bold text-slate-800">
            Payment Settlement Mode <span className="text-rose-600">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setPaymentOption('FULL');
                setCustomPaidAmount(String(currentNetPayable));
              }}
              className={`p-2 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                paymentOption === 'FULL'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <span>Paid in Full</span>
              <span className="text-[10px] font-mono">₹{currentNetPayable.toFixed(2)}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentOption('PARTIAL');
                if (customPaidAmount === '' || Number(customPaidAmount) === currentNetPayable || Number(customPaidAmount) === 0) {
                  setCustomPaidAmount(String(Math.round(currentNetPayable / 2)));
                }
              }}
              className={`p-2 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                paymentOption === 'PARTIAL'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <span>Partial Payment</span>
              <span className="text-[10px] font-mono">Pay part now</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentOption('DUE');
                setCustomPaidAmount('0');
              }}
              className={`p-2 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                paymentOption === 'DUE'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <span>Pay Later (Due)</span>
              <span className="text-[10px] font-mono">Collect ₹0 now</span>
            </button>
          </div>

          {paymentOption === 'PARTIAL' && (
            <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-amber-950 mb-0.5">
                    Amount Paid Now (₹) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={currentNetPayable}
                    step="0.01"
                    value={customPaidAmount}
                    onChange={(e) => setCustomPaidAmount(e.target.value)}
                    placeholder="Enter amount collected..."
                    className="w-full rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-black focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div className="bg-white border border-amber-200 rounded p-1.5 text-[11px] space-y-0.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Course Fee:</span>
                    <span className="font-mono font-bold text-black">₹{currentNetPayable.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span>Paid Now:</span>
                    <span className="font-mono">₹{actualPaidAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-0.5 font-bold text-amber-900">
                    <span>Balance Due:</span>
                    <span className="font-mono text-amber-700">₹{balanceDueAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment Mode (when collecting payment) */}
          {paymentOption !== 'DUE' && actualPaidAmount > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
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
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Transaction / UPI Ref No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI Ref / UTR / Cheque No."
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-black bg-white"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Internal Notes */}
        <div>
          <label className="block text-slate-700 font-medium mb-1 text-xs">
            Internal Notes <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Renewed cycle, fee collected at desk"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black bg-white"
          />
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
