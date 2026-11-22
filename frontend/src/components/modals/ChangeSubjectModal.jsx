import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { ArrowLeftRight, Calendar, CreditCard, ArrowRight, BookOpen, AlertCircle } from 'lucide-react';
import { admissionApi, teacherApi, subjectApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function ChangeSubjectModal({
  isOpen,
  onClose,
  student,
  item, // active subject item being changed
  onSuccess,
}) {
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState('');

  const [durationPreset, setDurationPreset] = useState('1m'); // '15d', '1m', '2m', '3m', 'custom'
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  const [fee, setFee] = useState('');
  const [discountType, setDiscountType] = useState('NONE');
  const [discountValue, setDiscountValue] = useState('0');

  // Payment collection on the spot
  const [collectPayment, setCollectPayment] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    try {
      const [allSubs, teacherRes] = await Promise.all([
        subjectApi.getAll(),
        teacherApi.list({ status: 'ACTIVE', page_size: 100 }),
      ]);
      const availableSubs = allSubs || [];
      setSubjects(availableSubs);
      setTeachers(teacherRes.items || []);

      // Filter to find a new subject that is different from current subject
      if (item) {
        const otherSub = availableSubs.find((s) => s.id !== item.subject_id) || availableSubs[0];
        if (otherSub) {
          setSelectedSubjectId(otherSub.id);
          setTeacherId(otherSub.teacher_id || '');
          const initialFee = String(otherSub.default_fee || '1500');
          setFee(initialFee);
          setPaymentAmount(initialFee);
        }
      }
    } catch (e) {
      console.error('Failed to load change subject dependencies:', e);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      // Default new validity: starts today or day after item valid_from
      const todayStr = new Date().toISOString().split('T')[0];
      setValidFrom(todayStr);

      const end = new Date();
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

  const handleSubjectChange = (newSubId) => {
    setSelectedSubjectId(newSubId);
    const sub = subjects.find((s) => s.id === newSubId);
    if (sub) {
      if (sub.teacher_id) {
        setTeacherId(sub.teacher_id);
      }
      const newFee = String(sub.default_fee || '1500');
      setFee(newFee);
      setPaymentAmount(newFee);
    }
  };

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
    if (!selectedSubjectId) {
      error('Please select a new subject');
      return;
    }
    if (selectedSubjectId === item?.subject_id) {
      error('The new subject must be different from the current subject. Use Renew to continue the same subject.');
      return;
    }
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
      const newSub = subjects.find((s) => s.id === selectedSubjectId);

      const payload = {
        student_id: student.id,
        old_item_id: item.id,
        old_subject_id: item.subject_id,
        new_subject_id: selectedSubjectId,
        teacher_id: teacherId || undefined,
        valid_from: validFrom,
        valid_to: validTo,
        fee: feeNum,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        notes: notes.trim() || `Subject changed from ${item.subject_name} to ${newSub?.name || 'new subject'}`,
      };

      if (collectPayment && parseFloat(paymentAmount) > 0) {
        payload.initial_payment = {
          amount: Math.min(parseFloat(paymentAmount), netPayable),
          payment_mode: paymentMode,
          transaction_reference: transactionRef.trim() || undefined,
          notes: `Payment for subject change to ${newSub?.name || 'new subject'}`,
        };
      }

      await admissionApi.changeSubject(payload);
      success(`Successfully changed subject from ${item.subject_name} to ${newSub?.name}! Old record archived in history.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      error(err.message || 'Failed to change subject');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  const currentNewSub = subjects.find((s) => s.id === selectedSubjectId);
  const netDue = calculatedNet();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Change Subject: ${item.subject_name}`}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Banner on Current Subject */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-950 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5 text-odoo-900">
              <BookOpen className="w-4 h-4 text-odoo-700" />
              Current Subject: {item.subject_name}
            </span>
            <span className="font-mono text-odoo-800 font-semibold bg-white px-2 py-0.5 rounded border border-purple-200">
              {student?.name} ({student?.student_code})
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-700">
            <span>Faculty: <strong className="text-black">{item.teacher_name || 'General / Unassigned'}</strong></span>
            {item.valid_to && (
              <span>Current Cycle: <strong className="text-black font-mono">{item.valid_from} → {item.valid_to}</strong></span>
            )}
          </div>
          <p className="text-[11px] text-purple-900 border-t border-purple-200/70 pt-1">
            Changing this subject archives <strong>{item.subject_name}</strong> to enrollment history and activates the new course line on the spot.
          </p>
        </div>

        {/* Pick New Subject */}
        <div className="text-xs space-y-1">
          <label className="block text-black font-bold">
            New Subject to Enroll <span className="text-rose-600">*</span>
          </label>
          <select
            value={selectedSubjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-2 text-xs text-black font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500 min-h-[38px]"
            required
          >
            <option value="">Select a new subject...</option>
            {subjects
              .filter((s) => s.id !== item.subject_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — Standard Fee: ₹{Number(s.default_fee).toFixed(0)}/mo {s.teacher_name_snapshot ? `(${s.teacher_name_snapshot})` : ''}
                </option>
              ))}
          </select>
        </div>

        {/* Assigned Faculty */}
        <div className="text-xs space-y-1">
          <label className="block text-slate-700 font-bold">
            Assigned Teacher / Faculty <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-odoo-500 min-h-[36px]"
          >
            <option value="">Default Faculty for Subject</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.teacher_code}) {t.specialization ? `— ${t.specialization}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Section with Presets */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <label className="block text-black font-bold">
              New Course Validity Period
            </label>
            <span className="text-[11px] text-slate-600 font-mono font-bold">
              {validFrom && validTo ? `${Math.max(1, Math.round((new Date(validTo) - new Date(validFrom)) / (1000 * 60 * 60 * 24)))} days` : ''}
            </span>
          </div>

          {/* Duration Presets */}
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
                    ? 'bg-odoo-600 text-white border-odoo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Valid From (Start) <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={handleValidFromChange}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-mono font-bold bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Valid To (End) <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => {
                  setValidTo(e.target.value);
                  setDurationPreset('custom');
                }}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-mono font-bold bg-white focus:outline-none focus:ring-1 focus:ring-odoo-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Pricing & Discount */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 text-xs shadow-2xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-black font-bold mb-1">Course Fee (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                  setPaymentAmount(e.target.value);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-black font-bold font-mono min-h-[36px]"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Discount Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-black min-h-[36px]"
              >
                <option value="NONE">No Discount</option>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Discount Value</label>
              <input
                type="number"
                min="0"
                disabled={discountType === 'NONE'}
                value={discountType === 'NONE' ? '' : discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENTAGE' ? '%' : '₹'}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-black font-mono font-bold disabled:bg-slate-100 min-h-[36px]"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-xs">
            <span className="text-slate-700">Net Payable for New Subject:</span>
            <span className="text-odoo-800 text-sm font-mono font-black">₹{netDue.toFixed(2)}</span>
          </div>
        </div>

        {/* Collect Initial Payment Toggle */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-2 text-xs bg-slate-50/50">
          <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-black">
            <input
              type="checkbox"
              checked={collectPayment}
              onChange={(e) => setCollectPayment(e.target.checked)}
              className="rounded text-odoo-600 focus:ring-odoo-500 w-4 h-4"
            />
            <span>Collect Payment Now on the Spot (Record Receipt)</span>
          </label>

          {collectPayment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  min="0"
                  max={netDue}
                  step="any"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-bold font-mono bg-white"
                  required={collectPayment}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black bg-white"
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
                  <label className="block text-slate-700 font-medium mb-1">
                    Transaction / UPI Ref No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., UPI Ref / UTR / Cheque No."
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black bg-white"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Change Reason / Notes */}
        <div className="text-xs">
          <label className="block text-slate-700 font-medium mb-1">
            Subject Change Note / Reason (Optional)
          </label>
          <input
            type="text"
            placeholder={`e.g., Changed subject to ${currentNewSub?.name || 'new course'}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black"
          />
        </div>

        {/* Link to Full Enrolment Flow if preferred */}
        <div className="text-right">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(
                `/admissions/new?student_id=${student?.id}&change_from_item_id=${item?.id}&change_from_subject=${item?.subject_id}`
              );
            }}
            className="text-[11px] text-odoo-700 hover:text-odoo-900 font-semibold inline-flex items-center gap-1 hover:underline"
          >
            <span>Or open in Full On-the-spot Enrolment Flow</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={ArrowLeftRight}
            loading={submitting}
            className="w-full sm:w-auto font-bold bg-odoo-600 hover:bg-odoo-700 text-white"
          >
            Confirm Subject Change
          </Button>
        </div>
      </form>
    </Modal>
  );
}
