import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Award,
  BookOpen,
  Calculator,
  CreditCard,
  UserPlus,
  CheckCircle2,
  Percent,
} from 'lucide-react';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StudentSearchSelect from '../../components/common/StudentSearchSelect';
import {
  studentApi,
  batchApi,
  greenCardApi,
  admissionApi,
  enquiryApi,
} from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import QuickStudentModal from '../../components/modals/QuickStudentModal';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';

export default function NewAdmissionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  // Query Params
  const paramStudentId = searchParams.get('student_id');
  const paramEnquiryId = searchParams.get('enquiry_id');
  const paramName = searchParams.get('name');
  const paramMobile = searchParams.get('mobile');
  const paramItemType = searchParams.get('item_type');

  // Form State
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [greenCards, setGreenCards] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [studentId, setStudentId] = useState(paramStudentId || '');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Selected items: array of { tempId, item_type, batch_id, subject_id, green_card_id, item_name_snapshot, original_price, discount_type, discount_value }
  const [items, setItems] = useState([]);

  // Discounts & GST
  const [overallDiscountType, setOverallDiscountType] = useState('NONE');
  const [overallDiscountValue, setOverallDiscountValue] = useState('0');
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState('18.00');

  // Initial Payment
  const [recordInitialPayment, setRecordInitialPayment] = useState(true);
  const [initialPayAmount, setInitialPayAmount] = useState('');
  const [initialPayMode, setInitialPayMode] = useState('CASH');
  const [initialPayRef, setInitialPayRef] = useState('');
  const [initialPayNotes, setInitialPayNotes] = useState('');

  // Live Preview Result from backend
  const [calculation, setCalculation] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [isQuickStudentOpen, setIsQuickStudentOpen] = useState(false);
  const [completedAdmission, setCompletedAdmission] = useState(null);

  // Load References (students, batches, green cards)
  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [stuRes, bRes, gcRes] = await Promise.all([
        studentApi.list({ page: 1, page_size: 100 }),
        batchApi.getAll(),
        greenCardApi.list(),
      ]);

      const loadedStudents = stuRes.items || [];
      setStudents(loadedStudents);
      setBatches(bRes || []);
      setGreenCards(gcRes || []);

      // If came from enquiry and student is not yet registered
      if (paramEnquiryId && !paramStudentId && paramName) {
        const found = loadedStudents.find(
          (s) =>
            s.name.toLowerCase() === paramName.toLowerCase() ||
            (paramMobile && s.mobile === paramMobile)
        );
        if (found) {
          setStudentId(found.id);
        }
      }

      // If Green Card requested in query param
      if (paramItemType === 'GREEN_CARD' && gcRes.length > 0) {
        const gc = gcRes.find((c) => c.is_active) || gcRes[0];
        setItems([
          {
            tempId: 'gc-initial',
            item_type: 'GREEN_CARD',
            green_card_id: gc.id,
            item_name_snapshot: gc.name,
            original_price: Number(gc.price),
            discount_type: 'NONE',
            discount_value: 0,
          },
        ]);
      } else if (items.length === 0 && bRes.length > 0 && bRes[0].subjects?.length > 0) {
        // Pre-add the first subject of first batch for user convenience
        const firstBatch = bRes[0];
        const firstSub = firstBatch.subjects[0];
        setItems([
          {
            tempId: 'item-1',
            item_type: 'BATCH_SUBJECT',
            batch_id: firstBatch.id,
            subject_id: firstSub.subject_id,
            item_name_snapshot: `${firstBatch.name} — ${firstSub.subject_name}`,
            original_price: Number(firstSub.fee),
            discount_type: 'NONE',
            discount_value: 0,
          },
        ]);
      }
    } catch (err) {
      error(err.message || 'Failed to load admission dependencies');
    } finally {
      setLoadingRefs(false);
    }
  }, [paramStudentId, paramEnquiryId, paramName, paramMobile, paramItemType]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // Recalculate Live Preview whenever items, discounts, or GST change
  useEffect(() => {
    if (items.length === 0) {
      setCalculation(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const payload = {
          items: items.map((itm) => ({
            item_type: itm.item_type,
            item_name_snapshot: itm.item_name_snapshot,
            original_price: parseFloat(itm.original_price) || 0,
            discount_type: itm.discount_type,
            discount_value: parseFloat(itm.discount_value) || 0,
          })),
          overall_discount_type: overallDiscountType,
          overall_discount_value: parseFloat(overallDiscountValue) || 0,
          gst_enabled: gstEnabled,
          gst_rate: parseFloat(gstRate) || 0,
        };

        const res = await admissionApi.preview(payload);
        setCalculation(res);

        // Auto-fill initial payment with total payable if payment enabled and initialPayAmount is empty
        if (recordInitialPayment && !initialPayAmount) {
          setInitialPayAmount(res.total_payable.toFixed(2));
        }
      } catch (err) {
        console.error('Calculation preview failed:', err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [items, overallDiscountType, overallDiscountValue, gstEnabled, gstRate]);

  // Add Item Helpers
  const handleAddBatchSubject = () => {
    if (batches.length === 0 || !batches[0].subjects || batches[0].subjects.length === 0) {
      error('No batches with assigned subjects found.');
      return;
    }
    const b = batches[0];
    const s = b.subjects[0];
    const newItem = {
      tempId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      item_type: 'BATCH_SUBJECT',
      batch_id: b.id,
      subject_id: s.subject_id,
      item_name_snapshot: `${b.name} — ${s.subject_name}`,
      original_price: Number(s.fee),
      discount_type: 'NONE',
      discount_value: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleAddGreenCard = () => {
    if (greenCards.length === 0) {
      error('No Green Card product configured.');
      return;
    }
    const gc = greenCards.find((c) => c.is_active) || greenCards[0];
    const newItem = {
      tempId: `gc-${Date.now()}`,
      item_type: 'GREEN_CARD',
      green_card_id: gc.id,
      item_name_snapshot: gc.name,
      original_price: Number(gc.price),
      discount_type: 'NONE',
      discount_value: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (tempId) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleBatchChangeForItem = (tempId, newBatchId) => {
    const b = batches.find((x) => x.id === newBatchId);
    if (!b || !b.subjects || b.subjects.length === 0) return;
    const s = b.subjects[0];

    setItems((prev) =>
      prev.map((itm) =>
        itm.tempId === tempId
          ? {
              ...itm,
              batch_id: b.id,
              subject_id: s.subject_id,
              item_name_snapshot: `${b.name} — ${s.subject_name}`,
              original_price: Number(s.fee),
            }
          : itm
      )
    );
  };

  const handleSubjectChangeForItem = (tempId, newSubjId) => {
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          const b = batches.find((x) => x.id === itm.batch_id);
          const s = b?.subjects?.find((sub) => sub.subject_id === newSubjId);
          return {
            ...itm,
            subject_id: newSubjId,
            item_name_snapshot: `${b?.name || 'Batch'} — ${s?.subject_name || 'Subject'}`,
            original_price: s ? Number(s.fee) : itm.original_price,
          };
        }
        return itm;
      })
    );
  };

  const handleItemDiscountTypeChange = (tempId, type) => {
    setItems((prev) =>
      prev.map((itm) => (itm.tempId === tempId ? { ...itm, discount_type: type } : itm))
    );
  };

  const handleItemDiscountValueChange = (tempId, val) => {
    setItems((prev) =>
      prev.map((itm) =>
        itm.tempId === tempId ? { ...itm, discount_value: parseFloat(val) || 0 } : itm
      )
    );
  };

  const handleSubmitAdmission = async (e) => {
    e.preventDefault();
    if (!studentId) {
      error('Please select or register a student first');
      return;
    }
    if (items.length === 0) {
      error('Please add at least one batch or subject to the admission');
      return;
    }

    setSubmitting(true);
    try {
      const itemsPayload = items.map((itm) => ({
        item_type: itm.item_type,
        batch_id: itm.batch_id || null,
        subject_id: itm.subject_id || null,
        green_card_id: itm.green_card_id || null,
        item_name_snapshot: itm.item_name_snapshot,
        original_price: parseFloat(itm.original_price) || 0,
        discount_type: itm.discount_type,
        discount_value: parseFloat(itm.discount_value) || 0,
      }));

      let initialPaymentPayload = null;
      if (recordInitialPayment && parseFloat(initialPayAmount) > 0) {
        initialPaymentPayload = {
          amount: parseFloat(initialPayAmount),
          payment_mode: initialPayMode,
          transaction_reference: initialPayRef.trim() || null,
          notes: initialPayNotes.trim() || null,
        };
      }

      const payload = {
        student_id: studentId,
        admission_date: admissionDate,
        items: itemsPayload,
        overall_discount_type: overallDiscountType,
        overall_discount_value: parseFloat(overallDiscountValue) || 0,
        gst_enabled: gstEnabled,
        gst_rate: parseFloat(gstRate) || 18,
        notes: notes.trim() || null,
        initial_payment: initialPaymentPayload,
      };

      const res = await admissionApi.create(payload);
      success(`Admission confirmed: ${res.admission_number}`);

      // If enquiry was associated, convert it
      if (paramEnquiryId) {
        try {
          await enquiryApi.convert(paramEnquiryId);
        } catch {
          // ignore if already converted
        }
      }

      setCompletedAdmission(res);
    } catch (err) {
      error(err.message || 'Failed to complete admission');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admissions')}
            className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-black tracking-tight">New Student Admission</h1>
            <p className="text-xs text-slate-500">
              Multiple batch & subject enrollment under a single admission invoice
            </p>
          </div>
        </div>

        {paramEnquiryId && (
          <Badge variant="warning">Converting from Enquiry / Demo</Badge>
        )}
      </div>

      <form onSubmit={handleSubmitAdmission} className="space-y-4">
        {/* Step 1: Student & Date Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-slate-100 pb-2">
            1. Select Student & Admission Date
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-black mb-1">
                Registered Student <span className="text-rose-600">*</span>
              </label>
              <StudentSearchSelect
                value={studentId}
                onChange={(id) => setStudentId(id)}
                onOpenQuickRegister={() => setIsQuickStudentOpen(true)}
                required
              />
            </div>

            <Input
              label="Admission Date"
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Step 2: Enrolled Batches, Subjects & Individual Discounts */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                2. Enrolled Batches, Subjects & Individual Discounts
              </h2>
              <p className="text-[11px] text-slate-500">
                A student can purchase multiple batches and subjects in one admission
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                onClick={handleAddBatchSubject}
              >
                Add Batch Subject
              </Button>
              <Button
                size="xs"
                variant="purple"
                icon={Award}
                onClick={handleAddGreenCard}
              >
                Add Green Card Pass
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-lg text-center space-y-2">
              <p className="text-xs text-slate-500">No batches or subjects selected yet.</p>
              <Button size="xs" variant="primary" onClick={handleAddBatchSubject}>
                Add First Subject
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((itm, index) => {
                const currentBatch = batches.find((b) => b.id === itm.batch_id);
                return (
                  <div
                    key={itm.tempId}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-black flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        {itm.item_type === 'GREEN_CARD' ? (
                          <Badge variant="purple">Green Card All-Access Pass</Badge>
                        ) : (
                          <span>Batch Subject Course</span>
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(itm.tempId)}
                        className="text-slate-400 hover:text-rose-600 transition p-1"
                        title="Remove Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {itm.item_type === 'BATCH_SUBJECT' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Batch
                          </label>
                          <select
                            value={itm.batch_id || ''}
                            onChange={(e) => handleBatchChangeForItem(itm.tempId, e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:border-indigo-600"
                          >
                            {batches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.teacher_name_snapshot || 'Faculty'})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Subject
                          </label>
                          <select
                            value={itm.subject_id || ''}
                            onChange={(e) => handleSubjectChangeForItem(itm.tempId, e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:border-indigo-600"
                          >
                            {(currentBatch?.subjects || []).map((s) => (
                              <option key={s.subject_id} value={s.subject_id}>
                                {s.subject_name} (₹{Number(s.fee).toFixed(0)})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Price (₹)
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={itm.original_price}
                            className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-3">
                          <span className="font-bold text-black text-sm">{itm.item_name_snapshot}</span>
                          <span className="text-[11px] text-slate-500 block">
                            Includes all current and upcoming eligible active batches for 365 days
                          </span>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Price (₹)
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={itm.original_price}
                            className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* Individual Discount Row for this item */}
                    <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                      <div className="text-[11px] text-slate-600 font-medium">
                        Individual Item Discount:
                      </div>
                      <div>
                        <select
                          value={itm.discount_type}
                          onChange={(e) => handleItemDiscountTypeChange(itm.tempId, e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black focus:outline-none"
                        >
                          <option value="NONE">No Discount</option>
                          <option value="FIXED">Fixed Amount (₹)</option>
                          <option value="PERCENTAGE">Percentage (%)</option>
                        </select>
                      </div>
                      {itm.discount_type !== 'NONE' && (
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={itm.discount_type === 'PERCENTAGE' ? 'Discount %' : 'Discount ₹'}
                            value={itm.discount_value}
                            onChange={(e) =>
                              handleItemDiscountValueChange(itm.tempId, e.target.value)
                            }
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-mono focus:outline-none focus:border-indigo-600"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Overall Admission Discount & GST Settings */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-slate-100 pb-2">
            3. Overall Admission Discount & Inclusive GST
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Overall Discount */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <label className="block text-xs font-semibold text-black">
                Overall Admission Discount
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={overallDiscountType}
                  onChange={(e) => setOverallDiscountType(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:border-indigo-600"
                >
                  <option value="NONE">No Overall Discount</option>
                  <option value="FIXED">Fixed Amount (₹)</option>
                  <option value="PERCENTAGE">Percentage (%)</option>
                </select>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={overallDiscountType === 'NONE'}
                  value={overallDiscountValue}
                  onChange={(e) => setOverallDiscountValue(e.target.value)}
                  placeholder="Discount value"
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-black font-mono focus:outline-none focus:border-indigo-600 disabled:bg-slate-100"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Applied after individual discounts across eligible items
              </p>
            </div>

            {/* GST (Inclusive Pricing) */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black">
                <input
                  type="checkbox"
                  checked={gstEnabled}
                  onChange={(e) => setGstEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Apply GST (Inclusive Pricing)</span>
              </label>

              {gstEnabled && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-600">GST Rate (%):</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-mono font-bold focus:outline-none focus:border-indigo-600"
                  />
                  <span className="text-[11px] text-slate-500 font-medium">
                    (Formula: Base = Amount / (1 + Rate%))
                  </span>
                </div>
              )}
              <p className="text-[10px] text-slate-500 leading-tight">
                Tax is included within the entered price; total fee payable does NOT increase.
              </p>
            </div>
          </div>
        </div>

        {/* Step 4: Transparent Financial Breakdown */}
        {calculation && (
          <div className="bg-slate-100 border border-slate-300 rounded-lg p-4 shadow-xs space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-indigo-600" />
              Itemized Financial Breakdown & Net Pricing
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-white rounded border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-right">Fee (₹)</th>
                    <th className="p-2 text-right">Indiv Disc</th>
                    <th className="p-2 text-right">Overall Share</th>
                    <th className="p-2 text-right">Net Price (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calculation.items.map((ci, idx) => (
                    <tr key={idx}>
                      <td className="p-2 text-black font-medium">{ci.item_name_snapshot}</td>
                      <td className="p-2 text-right font-mono text-black">
                        ₹{ci.original_price.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600">
                        -₹{ci.individual_discount.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600">
                        -₹{ci.overall_discount_share.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-black">
                        ₹{ci.net_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-mono text-black">₹{calculation.subtotal.toFixed(2)}</span>
              </div>
              {calculation.total_discount > 0 && (
                <div className="flex justify-between text-emerald-800 font-medium">
                  <span>Total Discount Applied:</span>
                  <span className="font-mono">-₹{calculation.total_discount.toFixed(2)}</span>
                </div>
              )}
              {calculation.gst_enabled && (
                <>
                  <div className="flex justify-between text-slate-600 border-t border-slate-100 pt-1">
                    <span>Taxable Base Value:</span>
                    <span className="font-mono text-black">
                      ₹{calculation.taxable_base.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Inclusive GST ({calculation.gst_rate}%):</span>
                    <span className="font-mono text-black">
                      ₹{calculation.gst_amount.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-bold text-black">
                <span className="text-black">Final Total Payable:</span>
                <span className="font-mono text-base font-black text-indigo-700">
                  ₹{calculation.total_payable.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Initial Payment Collection */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold uppercase tracking-wider text-black">
              <input
                type="checkbox"
                checked={recordInitialPayment}
                onChange={(e) => setRecordInitialPayment(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Collect Initial Payment At Admission</span>
            </label>
            <Badge size="xs" variant={recordInitialPayment ? 'success' : 'neutral'}>
              {recordInitialPayment ? 'Manual Collection' : 'Unpaid Entry'}
            </Badge>
          </div>

          {recordInitialPayment && calculation && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Amount Received (₹)"
                  type="number"
                  step="0.01"
                  min="0"
                  max={calculation.total_payable}
                  value={initialPayAmount}
                  onChange={(e) => setInitialPayAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  required={recordInitialPayment}
                />

                <Select
                  label="Payment Mode"
                  value={initialPayMode}
                  onChange={(e) => setInitialPayMode(e.target.value)}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'UPI', label: 'UPI / QR' },
                    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                    { value: 'CARD', label: 'Card' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </div>

              {initialPayMode !== 'CASH' && (
                <Input
                  label="Transaction / Reference Ref (Optional)"
                  value={initialPayRef}
                  onChange={(e) => setInitialPayRef(e.target.value)}
                  placeholder="e.g. UTR / UPI Ref"
                />
              )}

              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700">Remaining Balance Due After This Payment:</span>
                <span className="font-mono text-rose-700 text-sm">
                  ₹{Math.max(0, calculation.total_payable - (parseFloat(initialPayAmount) || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Additional Notes */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
          <Input
            label="Internal Admission Notes (Optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Batch starts next Monday / Guardian attended"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/admissions')}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            icon={CheckCircle2}
          >
            Confirm & Complete Admission
          </Button>
        </div>
      </form>

      {/* Quick Student Modal */}
      <QuickStudentModal
        isOpen={isQuickStudentOpen}
        onClose={() => setIsQuickStudentOpen(false)}
        onSuccess={(newStu) => {
          setStudents((prev) => [newStu, ...prev]);
          setStudentId(newStu.id);
        }}
      />

      {/* Admission Slip Modal on Success */}
      <AdmissionReceiptModal
        isOpen={!!completedAdmission}
        onClose={() => {
          setCompletedAdmission(null);
          navigate('/admissions');
        }}
        admission={completedAdmission}
      />
    </div>
  );
}
