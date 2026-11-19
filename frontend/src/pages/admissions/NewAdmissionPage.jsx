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
  CalendarDays,
} from 'lucide-react';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StudentSearchSelect from '../../components/common/StudentSearchSelect';
import {
  studentApi,
  subjectApi,
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
  const [subjects, setSubjects] = useState([]);
  const [greenCards, setGreenCards] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [studentId, setStudentId] = useState(paramStudentId || '');
  const [existingAdmissions, setExistingAdmissions] = useState([]);
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [billingMonths, setBillingMonths] = useState(1);
  const [lastBatchPeriodInfo, setLastBatchPeriodInfo] = useState(null);
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

  const calculateEndDateFromMonths = (startDateStr, monthsCount) => {
    if (!startDateStr) return '';
    const d = new Date(startDateStr);
    const totalDays = Math.max(1, parseInt(monthsCount, 10) || 1) * 30;
    d.setDate(d.getDate() + totalDays);
    return d.toISOString().split('T')[0];
  };

  const handleBillingMonthsChange = (newMonths) => {
    const m = Math.max(1, parseInt(newMonths, 10) || 1);
    setBillingMonths(m);

    const hasGc = items.some((i) => i.item_type === 'GREEN_CARD');
    if (hasGc) {
      const d = new Date(validFrom);
      d.setDate(d.getDate() + 365);
      setValidTo(d.toISOString().split('T')[0]);
    } else {
      setValidTo(calculateEndDateFromMonths(validFrom, m));
    }

    setItems((prev) =>
      prev.map((itm) => {
        if (itm.item_type === 'SUBJECT') {
          const baseFee = itm.base_monthly_fee !== undefined ? itm.base_monthly_fee : Number(itm.original_price);
          return {
            ...itm,
            base_monthly_fee: baseFee,
            months: m,
            original_price: baseFee * m,
          };
        }
        return itm;
      })
    );
  };

  const handleItemMonthsChange = (tempId, newMonths) => {
    const m = Math.max(1, parseInt(newMonths, 10) || 1);
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId && itm.item_type === 'SUBJECT') {
          const baseFee = itm.base_monthly_fee !== undefined ? itm.base_monthly_fee : Number(itm.original_price);
          return {
            ...itm,
            base_monthly_fee: baseFee,
            months: m,
            original_price: baseFee * m,
          };
        }
        return itm;
      })
    );
  };

  // Load References (students, subjects, green cards)
  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [stuRes, subRes, gcRes] = await Promise.all([
        studentApi.list({ page: 1, page_size: 100 }),
        subjectApi.getAll(),
        greenCardApi.list(),
      ]);

      const loadedStudents = stuRes.items || [];
      const loadedSubjects = subRes || [];
      setStudents(loadedStudents);
      setSubjects(loadedSubjects);
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
      } else if (items.length === 0 && loadedSubjects.length > 0) {
        // Pre-add the first active subject for user convenience
        const firstSub = loadedSubjects[0];
        const defaultDisc = firstSub.default_discount_percentage !== undefined && firstSub.default_discount_percentage !== null
          ? Number(firstSub.default_discount_percentage)
          : 10;
        const initialMonths = 1;
        const baseFee = Number(firstSub.default_fee);
        setItems([
          {
            tempId: 'item-1',
            item_type: 'SUBJECT',
            batch_id: null,
            subject_id: firstSub.id,
            item_name_snapshot: firstSub.name,
            base_monthly_fee: baseFee,
            months: initialMonths,
            original_price: baseFee * initialMonths,
            teacher_id: firstSub.teacher_id || null,
            teacher_name_snapshot: firstSub.teacher_name_snapshot || null,
            hall_number_snapshot: firstSub.hall_number || 'Main Hall',
            discount_type: defaultDisc > 0 ? 'PERCENTAGE' : 'NONE',
            discount_value: defaultDisc > 0 ? String(defaultDisc) : '10',
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

  // Fetch existing admissions & last batch coverage period for student
  useEffect(() => {
    if (!studentId) {
      setExistingAdmissions([]);
      setLastBatchPeriodInfo(null);
      return;
    }
    const fetchStudentHistory = async () => {
      try {
        const [admRes, periodRes] = await Promise.all([
          admissionApi.list({ student_id: studentId, page_size: 20 }),
          studentApi.getLastBatchPeriod(studentId),
        ]);
        setExistingAdmissions(admRes.items || []);

        // Smart next batch period: defaults to next date after last batch end
        if (periodRes && periodRes.has_previous) {
          setLastBatchPeriodInfo(periodRes);
          setValidFrom(periodRes.suggested_start_date);
          setValidTo(calculateEndDateFromMonths(periodRes.suggested_start_date, billingMonths));
        } else {
          setLastBatchPeriodInfo(null);
          setValidFrom(admissionDate);
          setValidTo(calculateEndDateFromMonths(admissionDate, billingMonths));
        }
      } catch (e) {
        console.error('Failed to load student existing admissions or period info:', e);
      }
    };
    fetchStudentHistory();
  }, [studentId, admissionDate]);

  const handleValidFromChange = (newFrom) => {
    setValidFrom(newFrom);
    if (newFrom) {
      const hasGc = items.some((i) => i.item_type === 'GREEN_CARD');
      if (hasGc) {
        const d = new Date(newFrom);
        d.setDate(d.getDate() + 365);
        setValidTo(d.toISOString().split('T')[0]);
      } else {
        setValidTo(calculateEndDateFromMonths(newFrom, billingMonths));
      }
    }
  };

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
  const handleAddSubject = () => {
    if (subjects.length === 0) {
      error('No active subjects found.');
      return;
    }
    const s = subjects[0];
    const defaultDisc = s.default_discount_percentage !== undefined && s.default_discount_percentage !== null
      ? Number(s.default_discount_percentage)
      : 10;
    const baseFee = Number(s.default_fee);
    const m = billingMonths || 1;
    const newItem = {
      tempId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      item_type: 'SUBJECT',
      batch_id: null,
      subject_id: s.id,
      item_name_snapshot: s.name,
      base_monthly_fee: baseFee,
      months: m,
      original_price: baseFee * m,
      teacher_id: s.teacher_id || null,
      teacher_name_snapshot: s.teacher_name_snapshot || null,
      hall_number_snapshot: s.hall_number || 'Main Hall',
      discount_type: defaultDisc > 0 ? 'PERCENTAGE' : 'NONE',
      discount_value: defaultDisc > 0 ? String(defaultDisc) : '10',
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleAddGreenCard = () => {
    if (greenCards.length === 0) {
      error('No Green Card product configured.');
      return;
    }
    const gc = greenCards.find((c) => c.is_active) || greenCards[0];
    const validityDays = gc.validity_days || 365;

    // Calculate 1 full year (365 days) from validFrom
    const fromDate = validFrom ? new Date(validFrom) : new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + validityDays);
    const toStr = toDate.toISOString().split('T')[0];

    // Automatically expand the overall coverage to 1 full year for Annual Pass!
    setValidTo(toStr);

    const newItem = {
      tempId: `gc-${Date.now()}`,
      item_type: 'GREEN_CARD',
      green_card_id: gc.id,
      item_name_snapshot: gc.name,
      original_price: Number(gc.price),
      teacher_id: null,
      teacher_name_snapshot: null,
      hall_number_snapshot: null,
      discount_type: 'NONE',
      discount_value: '0',
      valid_from: validFrom,
      valid_to: toStr,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (tempId) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleSubjectChangeForItem = (tempId, newSubjId) => {
    const s = subjects.find((x) => x.id === newSubjId);
    if (!s) return;

    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          const defaultDisc = s.default_discount_percentage !== undefined && s.default_discount_percentage !== null
            ? Number(s.default_discount_percentage)
            : 10;
          const baseFee = Number(s.default_fee);
          const m = itm.months || billingMonths || 1;
          return {
            ...itm,
            subject_id: s.id,
            item_name_snapshot: s.name,
            base_monthly_fee: baseFee,
            months: m,
            original_price: baseFee * m,
            teacher_id: s.teacher_id || null,
            teacher_name_snapshot: s.teacher_name_snapshot || null,
            hall_number_snapshot: s.hall_number || 'Main Hall',
            discount_type: itm.discount_type === 'NONE' && defaultDisc > 0 ? 'PERCENTAGE' : itm.discount_type,
            discount_value: itm.discount_type === 'PERCENTAGE' && (!itm.discount_value || itm.discount_value === '0' || itm.discount_value === 0)
              ? String(defaultDisc)
              : itm.discount_value,
          };
        }
        return itm;
      })
    );
  };

  const handleOverallDiscountTypeChange = (type) => {
    setOverallDiscountType(type);
    if (type === 'PERCENTAGE') {
      setOverallDiscountValue(overallDiscountValue === '0' || !overallDiscountValue ? '10' : overallDiscountValue);
    } else if (type === 'FIXED') {
      setOverallDiscountValue(overallDiscountValue === '0' || !overallDiscountValue ? '200' : overallDiscountValue);
    } else {
      setOverallDiscountValue('0');
    }
  };

  const handleItemDiscountTypeChange = (tempId, type) => {
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          let val = itm.discount_value;
          if (type === 'PERCENTAGE') {
            const subj = subjects.find((s) => s.id === itm.subject_id);
            const defaultDisc = subj?.default_discount_percentage !== undefined && subj?.default_discount_percentage !== null
              ? Number(subj.default_discount_percentage)
              : 10;
            val = defaultDisc > 0 ? String(defaultDisc) : '10';
          } else if (type === 'FIXED') {
            val = (!val || val === '0' || val === 0 || val === '10') ? '100' : String(val);
          } else {
            val = '0';
          }
          return { ...itm, discount_type: type, discount_value: val };
        }
        return itm;
      })
    );
  };

  const handleItemDiscountValueChange = (tempId, val) => {
    setItems((prev) =>
      prev.map((itm) =>
        itm.tempId === tempId ? { ...itm, discount_value: val } : itm
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
      error('Please add at least one subject to the purchase');
      return;
    }

    setSubmitting(true);
    try {
      const hasGc = items.some((i) => i.item_type === 'GREEN_CARD');
      let overallValidTo = validTo;
      if (hasGc) {
        const d = new Date(validFrom);
        d.setDate(d.getDate() + 365);
        overallValidTo = d.toISOString().split('T')[0];
      }

      const itemsPayload = items.map((itm) => {
        const itmMonths = itm.months || billingMonths || 1;
        let itmFrom = itm.valid_from || validFrom;
        let itmTo = itm.valid_to || overallValidTo;
        if (itm.item_type === 'GREEN_CARD') {
          const d = new Date(itmFrom);
          d.setDate(d.getDate() + 365);
          itmTo = d.toISOString().split('T')[0];
        } else {
          itmTo = calculateEndDateFromMonths(itmFrom, itmMonths);
        }

        const baseFee = itm.base_monthly_fee !== undefined
          ? itm.base_monthly_fee
          : (parseFloat(itm.original_price) / itmMonths);

        const cleanSubjectName = (itm.item_name_snapshot || '').split(' (')[0].trim();
        const formattedSnapshotName = itm.item_type === 'SUBJECT'
          ? `${cleanSubjectName} (${itmMonths} Mo @ ₹${baseFee.toFixed(0)}/mo)`
          : itm.item_name_snapshot;

        return {
          item_type: itm.item_type,
          batch_id: itm.batch_id || null,
          subject_id: itm.subject_id || null,
          green_card_id: itm.green_card_id || null,
          teacher_id: itm.teacher_id || null,
          teacher_name_snapshot: itm.teacher_name_snapshot || null,
          hall_number_snapshot: itm.hall_number_snapshot || null,
          item_name_snapshot: formattedSnapshotName,
          original_price: parseFloat(itm.original_price) || 0,
          discount_type: itm.discount_type,
          discount_value: parseFloat(itm.discount_value) || 0,
          valid_from: itmFrom,
          valid_to: itmTo,
        };
      });

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
        valid_from: validFrom,
        valid_to: overallValidTo,
        items: itemsPayload,
        overall_discount_type: overallDiscountType,
        overall_discount_value: parseFloat(overallDiscountValue) || 0,
        gst_enabled: gstEnabled,
        gst_rate: parseFloat(gstRate) || 18,
        notes: notes.trim() || null,
        initial_payment: initialPaymentPayload,
      };

      const res = await admissionApi.create(payload);
      success(`Purchase confirmed: ${res.purchase_transaction_id || res.admission_number}`);

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
      error(err.message || 'Failed to complete purchase');
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
            <h1 className="text-xl font-bold text-black tracking-tight">New Course Purchase</h1>
            <p className="text-xs text-slate-500">
              Combine multiple subjects under a unified purchase invoice with customized discounts & payments
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
            1. Select Student & Purchase Date
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
              label="Purchase Date"
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              required
            />
          </div>

          {/* Fee Period & Billing Duration (Whole Months — No Partial Month) */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <label className="text-xs font-bold text-black flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />
                  Fee Period & Billing Duration (Strictly Whole Months — No Partial Month)
                </label>
                <p className="text-[11px] text-slate-500">
                  Coaching fee standard: Subject catalog fees are per 30 days. Bill in whole integer months (1, 2, 3, 6, 12).
                </p>
              </div>

              {lastBatchPeriodInfo?.has_previous && (
                <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded font-medium">
                  Last batch ended on: <strong className="font-mono">{lastBatchPeriodInfo.last_end_date}</strong>
                </span>
              )}
            </div>

            {lastBatchPeriodInfo?.has_previous && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-md p-2 text-xs text-amber-900 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Previous batch ended on <strong>{lastBatchPeriodInfo.last_end_date}</strong>. Next fee cycle starts on <strong>{lastBatchPeriodInfo.suggested_start_date}</strong>.
                </span>
              </div>
            )}

            {/* Quick Month Preset Buttons */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700">
                  Select Subscription Duration:
                </span>
                <span className="text-[11px] text-indigo-700 font-bold">
                  {billingMonths} Month{billingMonths > 1 ? 's' : ''} ({billingMonths * 30} Days Coverage)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { m: 1, label: '1 Month', days: '30d' },
                  { m: 2, label: '2 Months', days: '60d' },
                  { m: 3, label: '3 Months (Quarter)', days: '90d' },
                  { m: 6, label: '6 Months (Half-Yr)', days: '180d' },
                  { m: 12, label: '12 Months (Full Yr)', days: '360d' },
                ].map((preset) => {
                  const isSelected = billingMonths === preset.m;
                  return (
                    <button
                      key={preset.m}
                      type="button"
                      onClick={() => handleBillingMonthsChange(preset.m)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span
                        className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                          isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {preset.days}
                      </span>
                    </button>
                  );
                })}

                {/* Custom Month Stepper */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-slate-600 font-medium">Custom:</span>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    step="1"
                    value={billingMonths}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        handleBillingMonthsChange(val);
                      }
                    }}
                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-center font-bold text-black font-mono focus:outline-none focus:border-indigo-600"
                  />
                  <span className="text-xs text-slate-500">months</span>
                </div>
              </div>
            </div>

            {/* Date Range Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Input
                label="Coverage Start Date (From Date)"
                type="date"
                value={validFrom}
                onChange={(e) => handleValidFromChange(e.target.value)}
                required
              />
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Coverage End Date (Auto-calculated: +{billingMonths * 30} days)
                </label>
                <div className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-3 py-2 text-xs flex items-center justify-between">
                  <span>{validTo}</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-sans font-semibold">
                    {billingMonths} mo • {billingMonths * 30}d
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Enrollments Alert for Multi-Course Purchase */}
          {existingAdmissions.length > 0 && (
            <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-bold text-indigo-950">
                <span>Active Student Enrollments (Adding Another Course / Batch)</span>
                <span className="bg-white border border-indigo-200 px-2 py-0.5 rounded text-[11px] text-indigo-700">
                  {existingAdmissions.length} Existing Purchases
                </span>
              </div>
              <div className="divide-y divide-indigo-100 max-h-36 overflow-y-auto">
                {existingAdmissions.map((adm) => (
                  <div key={adm.id} className="py-1 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-mono font-bold text-black">{adm.purchase_transaction_id || adm.admission_number}</span>
                      <span className="text-slate-600 ml-2">({adm.admission_date})</span>
                      <span className="text-slate-500 ml-2">
                        {(adm.items || []).map((i) => i.item_name_snapshot).join(', ')}
                      </span>
                    </div>
                    <div className="font-mono text-slate-700">
                      Paid: <strong className="text-emerald-700">₹{Number(adm.amount_paid).toFixed(0)}</strong> · 
                      Due: <strong className="text-rose-700">₹{Number(adm.balance_due).toFixed(0)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Enrolled Subjects & Individual Discounts */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                2. Select Subjects & Combine at Purchase
              </h2>
              <p className="text-[11px] text-slate-500">
                Select and combine multiple subjects under one unified admission & payment transaction
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                onClick={handleAddSubject}
              >
                Add Subject
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
              <p className="text-xs text-slate-500">No subjects selected yet.</p>
              <Button size="xs" variant="primary" onClick={handleAddSubject}>
                Add First Subject
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((itm, index) => {
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
                          <span>Subject Course</span>
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

                    {itm.item_type !== 'GREEN_CARD' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        {/* Select Subject */}
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Select Subject
                          </label>
                          <select
                            value={itm.subject_id || ''}
                            onChange={(e) => handleSubjectChangeForItem(itm.tempId, e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:border-indigo-600 font-medium"
                          >
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} — ₹{Number(s.default_fee).toFixed(0)}/mo {s.teacher_name_snapshot ? `(${s.teacher_name_snapshot})` : ''} {s.schedule ? `• [${s.schedule}]` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Whole Months Duration for this item */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Duration (Whole Months)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="36"
                              step="1"
                              value={itm.months || billingMonths || 1}
                              onChange={(e) => handleItemMonthsChange(itm.tempId, e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-center font-bold text-black font-mono focus:outline-none focus:border-indigo-600"
                            />
                            <span className="text-[11px] text-slate-600 font-medium">mo</span>
                          </div>
                        </div>

                        {/* Calculated Price */}
                        <div className="sm:col-span-3">
                          <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                              Calculated Fee (₹)
                            </label>
                            <span className="text-[10px] text-indigo-700 font-mono">
                              ₹{(itm.base_monthly_fee !== undefined ? itm.base_monthly_fee : (Number(itm.original_price) / (itm.months || 1))).toFixed(0)}/mo
                            </span>
                          </div>
                          <input
                            type="number"
                            readOnly
                            value={itm.original_price}
                            className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1.5 text-xs text-right"
                          />
                        </div>

                        {/* Snapshot badge preview & dates */}
                        <div className="sm:col-span-12 flex flex-wrap items-center gap-2 text-[11px] text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1 font-medium">
                          <span>Faculty: <strong className="text-indigo-900">{itm.teacher_name_snapshot || 'General Faculty'}</strong></span>
                          <span>•</span>
                          <span>Classroom: <strong className="text-black">{itm.hall_number_snapshot || 'Main Hall'}</strong></span>
                          {(() => {
                            const matched = subjects.find((s) => s.id === itm.subject_id);
                            return matched?.schedule ? (
                              <>
                                <span>•</span>
                                <span>Schedule: <strong className="text-indigo-700">{matched.schedule}</strong></span>
                              </>
                            ) : null;
                          })()}
                          <span className="ml-auto font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Valid: {validFrom} &rarr; {calculateEndDateFromMonths(validFrom, itm.months || billingMonths || 1)} ({(itm.months || billingMonths || 1) * 30} days)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                        <div className="sm:col-span-3">
                          <span className="font-bold text-black text-sm">{itm.item_name_snapshot}</span>
                          <span className="text-[11px] text-slate-500 block">
                            Includes all current and upcoming eligible active classes & subjects for 1 full year (365 days)
                          </span>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Annual Fee (₹)
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={itm.original_price}
                            className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1.5 text-xs text-right"
                          />
                        </div>

                        {/* Snapshot badge preview */}
                        <div className="sm:col-span-4 flex flex-wrap items-center justify-between text-[11px] text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1 font-medium">
                          <span>Access: <strong className="text-purple-900">All Subjects & Faculty</strong></span>
                          <span className="font-mono text-purple-800 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                            Valid: {validFrom} &rarr; {validTo} (365 days / 1 Year)
                          </span>
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
                            placeholder={itm.discount_type === 'PERCENTAGE' ? 'Discount % (e.g. 10)' : 'Discount ₹'}
                            value={itm.discount_value === 0 || itm.discount_value === '0' ? '' : itm.discount_value}
                            onChange={(e) =>
                              handleItemDiscountValueChange(itm.tempId, e.target.value)
                            }
                            onFocus={(e) => {
                              if (e.target.value === '0') {
                                handleItemDiscountValueChange(itm.tempId, '');
                              }
                            }}
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
                  onChange={(e) => handleOverallDiscountTypeChange(e.target.value)}
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
                  value={overallDiscountValue === '0' || overallDiscountValue === 0 ? '' : overallDiscountValue}
                  onChange={(e) => setOverallDiscountValue(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === '0') {
                      setOverallDiscountValue('');
                    }
                  }}
                  placeholder={overallDiscountType === 'PERCENTAGE' ? 'Discount % (e.g. 10)' : 'Discount ₹'}
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
              <span>Collect Initial Payment At Purchase</span>
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
            label="Internal Purchase Notes (Optional)"
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
            Confirm & Complete Purchase
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
