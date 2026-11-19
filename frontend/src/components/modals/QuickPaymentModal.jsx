import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  History,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  CreditCard,
  User,
  BookOpen,
} from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { admissionApi, paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';

export default function QuickPaymentModal({
  isOpen,
  onClose,
  initialAdmissionId,
  onPaymentSuccess,
}) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [admissions, setAdmissions] = useState([]);
  const [selectedAdmissionId, setSelectedAdmissionId] = useState(initialAdmissionId || '');
  const [searchFilter, setSearchFilter] = useState('');

  // Payment inputs
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');

  // Date to Date Coverage / Month selection
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [feePeriod, setFeePeriod] = useState('');

  // Previous payments history
  const [pastPayments, setPastPayments] = useState([]);
  const [loadingPastPayments, setLoadingPastPayments] = useState(false);
  const [showPastPayments, setShowPastPayments] = useState(false);

  // Month date helper
  const getCurrentMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
      label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  };

  const getNextMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
      label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  };

  const applyMonthPreset = (preset) => {
    if (preset === 'CURRENT') {
      const cur = getCurrentMonthDates();
      setValidFrom(cur.from);
      setValidTo(cur.to);
      setFeePeriod(cur.label);
    } else if (preset === 'NEXT') {
      const nxt = getNextMonthDates();
      setValidFrom(nxt.from);
      setValidTo(nxt.to);
      setFeePeriod(nxt.label);
    }
  };

  // Fetch pending / active admissions
  useEffect(() => {
    if (isOpen) {
      const fetchDueAdmissions = async () => {
        setLoading(true);
        try {
          const res = await admissionApi.list({ page: 1, page_size: 100 });
          const dues = (res.items || []).filter(
            (a) => Number(a.balance_due) > 0 && a.status === 'ACTIVE'
          );
          setAdmissions(dues);

          if (initialAdmissionId) {
            setSelectedAdmissionId(initialAdmissionId);
            const found = dues.find((a) => a.id === initialAdmissionId);
            if (found) {
              setAmount(Number(found.balance_due).toFixed(2));
              initPeriodFromAdmission(found);
            }
          } else if (dues.length > 0) {
            setSelectedAdmissionId(dues[0].id);
            setAmount(Number(dues[0].balance_due).toFixed(2));
            initPeriodFromAdmission(dues[0]);
          }
        } catch (err) {
          error(err.message || 'Failed to load unpaid admissions');
        } finally {
          setLoading(false);
        }
      };
      fetchDueAdmissions();
    }
  }, [isOpen, initialAdmissionId]);

  const initPeriodFromAdmission = (adm) => {
    if (adm.valid_from && adm.valid_to) {
      setValidFrom(adm.valid_from);
      setValidTo(adm.valid_to);
      setFeePeriod(`${adm.valid_from} to ${adm.valid_to}`);
    } else {
      const cur = getCurrentMonthDates();
      setValidFrom(cur.from);
      setValidTo(cur.to);
      setFeePeriod(cur.label);
    }
  };

  // When selected admission changes, load its past payments
  useEffect(() => {
    if (selectedAdmissionId) {
      const fetchPastPayments = async () => {
        setLoadingPastPayments(true);
        try {
          const res = await paymentApi.list({
            admission_id: selectedAdmissionId,
            page_size: 20,
          });
          setPastPayments(res.items || []);
        } catch {
          setPastPayments([]);
        } finally {
          setLoadingPastPayments(false);
        }
      };
      fetchPastPayments();
    } else {
      setPastPayments([]);
    }
  }, [selectedAdmissionId]);

  const handleAdmissionChange = (id) => {
    setSelectedAdmissionId(id);
    const found = admissions.find((a) => a.id === id);
    if (found) {
      setAmount(Number(found.balance_due).toFixed(2));
      initPeriodFromAdmission(found);
    }
  };

  const selectedAdmission = admissions.find((a) => a.id === selectedAdmissionId);

  // Filter admissions for search
  const filteredAdmissions = admissions.filter((a) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    const nameMatch = (a.student_name_snapshot || '').toLowerCase().includes(term);
    const admMatch = (a.purchase_transaction_id || a.admission_number || '').toLowerCase().includes(term);
    return nameMatch || admMatch;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdmissionId) {
      error('Please select a course purchase record');
      return;
    }
    const payAmt = parseFloat(amount);
    if (isNaN(payAmt) || payAmt <= 0) {
      error('Please enter a valid payment amount greater than zero');
      return;
    }
    if (selectedAdmission && payAmt > Number(selectedAdmission.balance_due) + 0.01) {
      error(`Amount cannot exceed remaining balance of ₹${Number(selectedAdmission.balance_due).toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        admission_id: selectedAdmissionId,
        amount: payAmt,
        payment_mode: paymentMode,
        transaction_reference: transactionRef.trim() || null,
        notes: notes.trim() || null,
        valid_from: validFrom || null,
        valid_to: validTo || null,
        fee_period: feePeriod.trim() || (validFrom && validTo ? `${validFrom} to ${validTo}` : null),
      };

      const res = await paymentApi.create(payload);
      success(`Payment recorded successfully! Receipt: ${res.payment_number}`);

      // Fetch official printable receipt
      const receipt = await paymentApi.getReceipt(res.id);

      if (onPaymentSuccess) {
        onPaymentSuccess(receipt);
      }
      onClose();
    } catch (err) {
      error(err.message || 'Failed to process payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Collect Fee Payment"
      subtitle="Record installment or monthly fee collection with complete payment history and coverage period"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500 animate-pulse">
            Loading student fee records...
          </div>
        ) : admissions.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> All Fees Clear!
            </span>
            <p className="text-slate-600">
              There are currently no active course purchases with pending dues.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Student / Course Purchase Search & Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-black">
                  Select Student & Course Purchase (Txn ID) <span className="text-rose-600">*</span>
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  {filteredAdmissions.length} record{filteredAdmissions.length !== 1 ? 's' : ''} found
                </span>
              </div>

              {/* Search filter input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Type student name or Txn ID to filter..."
                  className="w-full pl-8 pr-3 py-1 text-xs rounded border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>

              {/* Dropdown */}
              <select
                value={selectedAdmissionId}
                onChange={(e) => handleAdmissionChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-black font-medium focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs"
              >
                {filteredAdmissions.length === 0 ? (
                  <option disabled value="">No matching student found</option>
                ) : (
                  filteredAdmissions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.purchase_transaction_id || a.admission_number} — {a.student_name_snapshot} (Due: ₹
                      {Number(a.balance_due).toFixed(2)} | Paid: ₹
                      {Number(a.amount_paid).toFixed(2)})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. Comprehensive Financial Breakdown Box (Shows Previously Paid Fees!) */}
            {selectedAdmission && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5 text-xs shadow-2xs">
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-700" />
                    <div>
                      <span className="font-bold text-black text-sm block">
                        {selectedAdmission.student_name_snapshot}
                      </span>
                      <span className="font-mono text-[10px] text-indigo-800 font-bold bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded">
                        Txn: {selectedAdmission.purchase_transaction_id || selectedAdmission.admission_number}
                      </span>
                    </div>
                  </div>
                  <Badge
                    size="xs"
                    variant={
                      selectedAdmission.payment_status === 'PARTIALLY_PAID'
                        ? 'warning'
                        : selectedAdmission.payment_status === 'PAID'
                        ? 'success'
                        : 'danger'
                    }
                  >
                    {selectedAdmission.payment_status}
                  </Badge>
                </div>

                {/* The 3 Pillars of Fee: Billed, Previously Paid, and Remaining Due */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white border border-slate-200 rounded p-2 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                      Total Billed Fee
                    </span>
                    <span className="font-mono font-bold text-black text-sm block mt-0.5">
                      ₹{Number(selectedAdmission.total_payable).toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded p-2 shadow-2xs">
                    <span className="text-[10px] text-emerald-800 font-semibold uppercase block">
                      Previously Paid
                    </span>
                    <span className="font-mono font-bold text-emerald-700 text-sm block mt-0.5">
                      ₹{Number(selectedAdmission.amount_paid).toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-rose-50 border border-rose-200 rounded p-2 shadow-2xs">
                    <span className="text-[10px] text-rose-800 font-semibold uppercase block">
                      Current Due
                    </span>
                    <span className="font-mono font-bold text-rose-700 text-sm block mt-0.5">
                      ₹{Number(selectedAdmission.balance_due).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Enrolled Courses / Batches Snapshot */}
                {selectedAdmission.items && selectedAdmission.items.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-200">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                      <BookOpen className="w-3 h-3 text-slate-500" />
                      <span>Enrolled Subjects & Faculty Snapshot:</span>
                    </div>
                    <div className="space-y-1">
                      {selectedAdmission.items.map((itm, i) => (
                        <div
                          key={i}
                          className="bg-white border border-slate-200 px-2 py-1 rounded text-[11px] flex justify-between items-center"
                        >
                          <div>
                            <span className="font-semibold text-black">{itm.item_name_snapshot}</span>
                            {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                              <span className="text-[10px] text-slate-500 ml-1.5">
                                {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                                {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                                {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-slate-600 text-[10px]">
                            Due: ₹{Number(itm.balance_due).toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Collapsible Past Payments History */}
                <div className="pt-1 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowPastPayments(!showPastPayments)}
                    className="w-full flex items-center justify-between text-indigo-700 hover:text-indigo-900 font-semibold text-[11px] py-0.5 transition"
                  >
                    <span className="flex items-center gap-1">
                      <History className="w-3.5 h-3.5" />
                      Previous Payment Receipts ({pastPayments.length} recorded)
                    </span>
                    {showPastPayments ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showPastPayments && (
                    <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto bg-white border border-slate-200 rounded p-2">
                      {loadingPastPayments ? (
                        <div className="text-slate-400 text-[10px] text-center py-1">Loading history...</div>
                      ) : pastPayments.length === 0 ? (
                        <div className="text-slate-500 text-[10px] italic text-center py-1">
                          No previous payments on this course purchase yet.
                        </div>
                      ) : (
                        pastPayments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0"
                          >
                            <div>
                              <span className="font-mono font-bold text-black">{p.payment_number}</span>
                              <span className="text-slate-500 text-[10px] ml-2">
                                {new Date(p.payment_date).toLocaleDateString('en-IN')}
                              </span>
                              <span className="text-slate-400 text-[10px] ml-1 font-sans">
                                • {p.payment_mode}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-emerald-800">
                              +₹{Number(p.amount).toFixed(2)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. Fee Month & Date-to-Date Coverage ("When to When") */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                <label className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />
                  Fee Coverage Period (Date to Date / When to When)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyMonthPreset('CURRENT')}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
                  >
                    Current Month
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMonthPreset('NEXT')}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
                  >
                    Next Month
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  label="Coverage From (Start Date)"
                  type="date"
                  value={validFrom}
                  onChange={(e) => {
                    setValidFrom(e.target.value);
                    setFeePeriod(`${e.target.value} to ${validTo}`);
                  }}
                  required
                />
                <Input
                  label="Coverage To (End Date)"
                  type="date"
                  value={validTo}
                  onChange={(e) => {
                    setValidTo(e.target.value);
                    setFeePeriod(`${validFrom} to ${e.target.value}`);
                  }}
                  required
                />
              </div>

              {feePeriod && (
                <div className="text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded font-mono">
                  Fee Period Tag: <strong className="text-indigo-900">{feePeriod}</strong>
                </div>
              )}
            </div>

            {/* 4. Payment Collection Amount with Quick Preset Chips */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-black">
                  Amount to Collect (₹) <span className="text-rose-600">*</span>
                </label>
                {selectedAdmission && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAmount(Number(selectedAdmission.balance_due).toFixed(2))}
                      className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-100 transition"
                    >
                      Full Due (₹{Number(selectedAdmission.balance_due).toFixed(0)})
                    </button>
                    {Number(selectedAdmission.balance_due) > 500 && (
                      <button
                        type="button"
                        onClick={() => setAmount((Number(selectedAdmission.balance_due) / 2).toFixed(2))}
                        className="text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-200 transition"
                      >
                        Half (₹{(Number(selectedAdmission.balance_due) / 2).toFixed(0)})
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount to collect"
                />

                <Select
                  label="Payment Mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'UPI', label: 'UPI / QR' },
                    { value: 'BANK_TRANSFER', label: 'Bank Transfer (NEFT/IMPS)' },
                    { value: 'CARD', label: 'Debit / Credit Card' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </div>
            </div>

            {/* Reference & Notes */}
            {paymentMode !== 'CASH' && (
              <Input
                label="Transaction / Reference Ref (Optional)"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. UPI Ref / UTR / Cheque No"
              />
            )}

            <Input
              label="Payment Notes / Remarks (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Installment 1 / Paid by guardian / November monthly fee"
            />

            {/* Bottom Actions */}
            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="success" loading={submitting}>
                Record Payment & Print Receipt
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
