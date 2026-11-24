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
  CalendarDays,
  Check,
  ChevronRight,
  ChevronLeft,
  User,
  Phone,
  Sparkles,
  AlertCircle,
  Tag,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StudentSearchSelect from '../../components/common/StudentSearchSelect';
import {
  studentApi,
  subjectApi,
  greenCardApi,
  admissionApi,
  enquiryApi,
  teacherApi,
  settingsApi,
} from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import QuickStudentModal from '../../components/modals/QuickStudentModal';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import { computeRollingCycle, formatValidityDuration } from '../../utils/dateCycleUtils';
import { cleanMobileInput } from '../../utils/phoneUtils';

export default function NewAdmissionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error } = useToast();

  // Wizard Step State (1: Student, 2: Subjects & Dates, 3: Discounts, 4: Confirm & Pay)
  const [currentStep, setCurrentStep] = useState(1);

  // Query Params
  const paramStudentId = searchParams.get('student_id');
  const paramEnquiryId = searchParams.get('enquiry_id');
  const paramName = searchParams.get('name');
  const paramMobile = searchParams.get('mobile');
  const paramItemType = searchParams.get('item_type');
  const paramSubject = searchParams.get('subject');
  const paramPurpose = searchParams.get('purpose');
  const paramFather = searchParams.get('father_name');
  const paramChangeFromItemId = searchParams.get('change_from_item_id');
  const paramChangeFromSubject = searchParams.get('change_from_subject');

  // Reference Data
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [greenCards, setGreenCards] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Step 1: Student & Dates
  const [studentId, setStudentId] = useState(paramStudentId || '');
  const [selectedStudentObj, setSelectedStudentObj] = useState(null);
  const [existingAdmissions, setExistingAdmissions] = useState([]);
  const [activeEnrollment, setActiveEnrollment] = useState(null);
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [billingMonths, setBillingMonths] = useState(1);
  const [lastFeePeriodInfo, setLastFeePeriodInfo] = useState(null);

  // Step 2: Selected Items
  const [items, setItems] = useState([]);

  // Step 3: Discounts & GST
  const [overallDiscountType, setOverallDiscountType] = useState('NONE');
  const [overallDiscountValue, setOverallDiscountValue] = useState('0');
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState('18.00');
  const [gstNumber, setGstNumber] = useState('09AAACT1234F1Z5');

  // Load saved institute GST settings on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('institute_gst_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.gstin) setGstNumber(parsed.gstin);
        if (parsed.gst_rate) setGstRate(String(parsed.gst_rate));
      }
    } catch {
      // ignore
    }
    settingsApi.getInstitute().then((res) => {
      if (res) {
        if (res.gstin) setGstNumber(res.gstin);
        if (res.gst_rate) setGstRate(String(res.gst_rate));
      }
    }).catch(() => {});
  }, []);

  // Step 4: Payment Settlement & Notes
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentOption, setPaymentOption] = useState('FULL'); // 'FULL' or 'PARTIAL'
  const [customPaidAmount, setCustomPaidAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [notes, setNotes] = useState('');

  // Live Backend Calculation Preview
  const [calculation, setCalculation] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [isQuickStudentOpen, setIsQuickStudentOpen] = useState(false);
  const [quickStudentInitialData, setQuickStudentInitialData] = useState(null);
  const [completedAdmission, setCompletedAdmission] = useState(null);

  // Helper to auto-resolve teacher from subject definition
  const resolveSubjectTeacher = (subj, teacherList) => {
    if (!subj) return { teacherId: null, teacherName: null };
    const activeList = (teacherList || []).filter((t) => t.status === 'ACTIVE');
    let tid = subj.teacher_id || null;
    let tname = subj.teacher_name_snapshot || null;

    if (tid && activeList.length > 0) {
      const match = activeList.find((t) => t.id === tid);
      if (!match) {
        // Teacher is inactive, fall back to first active faculty
        tid = activeList[0].id;
        tname = activeList[0].name;
      } else {
        tname = match.name;
      }
    } else if (!tid && tname && activeList.length > 0) {
      const match = activeList.find(
        (t) => t.name.toLowerCase() === tname.toLowerCase()
      );
      if (match) {
        tid = match.id;
        tname = match.name;
      } else {
        tid = activeList[0].id;
        tname = activeList[0].name;
      }
    } else if (!tid && activeList.length > 0) {
      tid = activeList[0].id;
      tname = activeList[0].name;
    }
    return { teacherId: tid, teacherName: tname };
  };

  // Date calculation helper
  const calculateEndDateFromMonths = (startDateStr, monthsCount) => {
    if (!startDateStr) return '';
    const rolling = computeRollingCycle(startDateStr, monthsCount);
    return rolling ? rolling.endDate : '';
  };

  const handleItemMonthsChange = (tempId, newMonths) => {
    const m = Math.min(3, Math.max(1, parseInt(newMonths, 10) || 1));
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId && itm.item_type === 'SUBJECT') {
          const baseFee = itm.base_monthly_fee !== undefined ? itm.base_monthly_fee : (Number(itm.original_price) / (itm.months || 1));
          const itmFrom = itm.valid_from || validFrom;
          return {
            ...itm,
            base_monthly_fee: baseFee,
            months: m,
            original_price: baseFee * m,
            valid_to: calculateEndDateFromMonths(itmFrom, m),
          };
        }
        return itm;
      })
    );
  };

  // Load References
  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [stuRes, subRes, gcRes, teachRes] = await Promise.all([
        studentApi.list({ page: 1, page_size: 100 }),
        subjectApi.getAll(),
        greenCardApi.list(),
        teacherApi.list({ status: 'ACTIVE', status_filter: 'ACTIVE', page_size: 100 }),
      ]);

      const loadedStudents = stuRes.items || [];
      const loadedSubjects = subRes || [];
      const loadedTeachers = (teachRes.items || []).filter((t) => t.status === 'ACTIVE');
      setStudents(loadedStudents);
      setSubjects(loadedSubjects);
      setGreenCards(gcRes || []);
      setTeachers(loadedTeachers);

      // If came from enquiry and student is not yet registered
      if (paramEnquiryId && !paramStudentId) {
        let matchedStudent = null;

        // Check if enquiry itself already has a linked student
        try {
          const enqData = await enquiryApi.get(paramEnquiryId);
          if (enqData?.converted_student_id) {
            matchedStudent = loadedStudents.find((s) => s.id === enqData.converted_student_id);
            if (!matchedStudent) {
              const sObj = await studentApi.get(enqData.converted_student_id);
              if (sObj) {
                matchedStudent = sObj;
                setStudents((prev) => [sObj, ...prev]);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to check enquiry converted student:', err);
        }

        // Duplicate check on normalised mobile number (last 10 digits) ONLY
        if (!matchedStudent && paramMobile) {
          const cleanParamMob = cleanMobileInput(paramMobile);
          const last10 = cleanParamMob && cleanParamMob.length >= 10 ? cleanParamMob.slice(-10) : cleanParamMob;
          if (last10 && last10.length === 10) {
            try {
              const checkRes = await studentApi.checkMobile(last10);
              if (checkRes?.exists && checkRes?.student) {
                matchedStudent = checkRes.student;
              }
            } catch (err) {
              console.warn('Failed to verify mobile:', err);
            }
          }
        }

        if (matchedStudent) {
          setStudentId(matchedStudent.id);
          success(`Found registered profile for ${matchedStudent.name} (${matchedStudent.student_code}). Auto-selected!`);
        } else if (paramName) {
          const cleanParamMob = cleanMobileInput(paramMobile);
          setQuickStudentInitialData({
            name: paramName,
            mobile: cleanParamMob || '',
            father_name: paramFather || '',
            notes: `Admitted from Enquiry #${paramEnquiryId} (${paramPurpose || 'Student Admission'})`,
          });
          setIsQuickStudentOpen(true);
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
            valid_from: validFrom,
            valid_to: calculateEndDateFromMonths(validFrom, 12),
          },
        ]);
      } else if (items.length === 0 && loadedSubjects.length > 0) {
        let matchedSub = null;
        if (paramSubject) {
          const sSearch = paramSubject.toLowerCase();
          matchedSub = loadedSubjects.find(
            (sub) =>
              sub.name.toLowerCase().includes(sSearch) ||
              sSearch.includes(sub.name.toLowerCase()) ||
              (sub.subject_code && sSearch.includes(sub.subject_code.toLowerCase()))
          );
        }
        const firstSub = matchedSub || loadedSubjects[0];
        const defaultDisc = firstSub.default_discount_percentage !== undefined && firstSub.default_discount_percentage !== null
          ? Number(firstSub.default_discount_percentage)
          : 10;
        const initialMonths = 1;
        const baseFee = Number(firstSub.default_fee);
        const { teacherId: initTid, teacherName: initTname } = resolveSubjectTeacher(firstSub, loadedTeachers);
        setItems([
          {
            tempId: 'item-1',
            item_type: 'SUBJECT',
            subject_id: firstSub.id,
            item_name_snapshot: firstSub.name,
            base_monthly_fee: baseFee,
            months: initialMonths,
            original_price: baseFee * initialMonths,
            teacher_id: initTid,
            teacher_name_snapshot: initTname,
            hall_number_snapshot: firstSub.hall_number || 'Main Hall',
            schedule: firstSub.schedule || firstSub.timing || null,
            discount_type: defaultDisc > 0 ? 'PERCENTAGE' : 'NONE',
            discount_value: defaultDisc > 0 ? String(defaultDisc) : '10',
            valid_from: validFrom,
            valid_to: calculateEndDateFromMonths(validFrom, initialMonths),
            is_subject_change: !!paramChangeFromItemId,
            change_from_item_id: paramChangeFromItemId || null,
            replaced_subject_name: paramSubject || null,
          },
        ]);
      }
    } catch (err) {
      error(err.message || 'Failed to load admission dependencies');
    } finally {
      setLoadingRefs(false);
    }
  }, [paramStudentId, paramEnquiryId, paramName, paramMobile, paramItemType, paramSubject, paramFather, paramPurpose, paramChangeFromItemId, paramChangeFromSubject]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // Fetch student history & active enrollment
  useEffect(() => {
    if (!studentId) {
      setExistingAdmissions([]);
      setLastFeePeriodInfo(null);
      setActiveEnrollment(null);
      setSelectedStudentObj(null);
      return;
    }

    studentApi.get(studentId).then(setSelectedStudentObj).catch(console.warn);

    const fetchStudentHistory = async () => {
      try {
        const [admRes, periodRes, activeRes] = await Promise.all([
          admissionApi.list({ student_id: studentId, page_size: 20 }),
          studentApi.getLastFeePeriod(studentId),
          studentApi.getActiveEnrollment(studentId).catch(() => null),
        ]);
        setExistingAdmissions(admRes.items || []);
        setActiveEnrollment(activeRes || null);

        if (periodRes && periodRes.has_previous) {
          setLastFeePeriodInfo(periodRes);
          setValidFrom(periodRes.suggested_start_date);
          setValidTo(calculateEndDateFromMonths(periodRes.suggested_start_date, billingMonths));
        } else {
          setLastFeePeriodInfo(null);
          setValidFrom(admissionDate);
          setValidTo(calculateEndDateFromMonths(admissionDate, billingMonths));
        }
      } catch (e) {
        console.error('Failed to load student history:', e);
      }
    };
    fetchStudentHistory();
  }, [studentId, admissionDate]);

  // Sync active renewal dates for subjects
  useEffect(() => {
    if (activeEnrollment?.active_subjects && items.length > 0) {
      setItems((prev) =>
        prev.map((itm) => {
          if (itm.item_type === 'SUBJECT' && itm.subject_id) {
            const activeMatch = activeEnrollment.active_subjects.find(
              (as) => as.subject_id === itm.subject_id
            );
            if (activeMatch && activeMatch.valid_to) {
              const nextStart = new Date(activeMatch.valid_to);
              nextStart.setDate(nextStart.getDate() + 1);
              const nextStartStr = nextStart.toISOString().split('T')[0];
              const m = itm.months || billingMonths || 1;
              return {
                ...itm,
                is_renewal: true,
                prev_valid_to: activeMatch.valid_to,
                valid_from: itm.is_renewal ? (itm.valid_from || nextStartStr) : nextStartStr,
                valid_to: calculateEndDateFromMonths(itm.is_renewal ? (itm.valid_from || nextStartStr) : nextStartStr, m),
              };
            }
          }
          return itm;
        })
      );
    }
  }, [activeEnrollment]);

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

  // Live Backend Preview
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
            subject_id: itm.subject_id || undefined,
            green_card_id: itm.green_card_id || undefined,
            item_name_snapshot: itm.item_name_snapshot,
            original_price: parseFloat(itm.original_price) || 0,
            months: itm.months || billingMonths || 1,
            valid_from: itm.valid_from,
            valid_to: itm.valid_to,
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
      } catch (err) {
        console.error('Calculation preview failed:', err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [items, overallDiscountType, overallDiscountValue, gstEnabled, gstRate]);

  // Add Item Handlers
  const handleAddSubject = () => {
    if (subjects.length === 0) {
      error('No active subjects found.');
      return;
    }
    const alreadySelectedSubjectIds = items.filter((i) => i.item_type === 'SUBJECT').map((i) => i.subject_id);
    const s = subjects.find((sub) => !alreadySelectedSubjectIds.includes(sub.id)) || subjects[0];
    const defaultDisc = s.default_discount_percentage !== undefined && s.default_discount_percentage !== null
      ? Number(s.default_discount_percentage)
      : 10;
    const baseFee = Number(s.default_fee);
    const m = 1;
    const { teacherId: assignedTeacherId, teacherName: assignedTeacherName } = resolveSubjectTeacher(s, teachers);

    const activeMatch = activeEnrollment?.active_subjects?.find((as) => as.subject_id === s.id);
    let itemFrom = validFrom;
    let isRenewal = false;
    let prevValidTo = null;

    if (activeMatch && activeMatch.valid_to) {
      isRenewal = true;
      prevValidTo = activeMatch.valid_to;
      const nextStart = new Date(activeMatch.valid_to);
      nextStart.setDate(nextStart.getDate() + 1);
      itemFrom = nextStart.toISOString().split('T')[0];
    }
    const itemTo = calculateEndDateFromMonths(itemFrom, m);

    const newItem = {
      tempId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      item_type: 'SUBJECT',
      subject_id: s.id,
      item_name_snapshot: s.name,
      base_monthly_fee: baseFee,
      months: m,
      original_price: baseFee * m,
      teacher_id: assignedTeacherId,
      teacher_name_snapshot: assignedTeacherName,
      hall_number_snapshot: s.hall_number || 'Main Hall',
      schedule: s.schedule || s.timing || null,
      discount_type: defaultDisc > 0 ? 'PERCENTAGE' : 'NONE',
      discount_value: defaultDisc > 0 ? String(defaultDisc) : '10',
      valid_from: itemFrom,
      valid_to: itemTo,
      is_renewal: isRenewal,
      prev_valid_to: prevValidTo,
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

    const fromDate = validFrom ? new Date(validFrom) : new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + validityDays);
    const toStr = toDate.toISOString().split('T')[0];

    if (!validTo || toStr > validTo) {
      setValidTo(toStr);
    }

    const newItem = {
      tempId: `gc-${Date.now()}`,
      item_type: 'GREEN_CARD',
      green_card_id: gc.id,
      item_name_snapshot: gc.name,
      original_price: Number(gc.price),
      validity_days: validityDays,
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
          const m = itm.months || 1;
          const { teacherId: assignedTeacherId, teacherName: assignedTeacherName } = resolveSubjectTeacher(s, teachers);

          const activeMatch = activeEnrollment?.active_subjects?.find((as) => as.subject_id === s.id);
          let itemFrom = validFrom;
          let isRenewal = false;
          let prevValidTo = null;

          if (activeMatch && activeMatch.valid_to) {
            isRenewal = true;
            prevValidTo = activeMatch.valid_to;
            const nextStart = new Date(activeMatch.valid_to);
            nextStart.setDate(nextStart.getDate() + 1);
            itemFrom = nextStart.toISOString().split('T')[0];
          }
          const itemTo = calculateEndDateFromMonths(itemFrom, m);

          return {
            ...itm,
            subject_id: s.id,
            item_name_snapshot: s.name,
            base_monthly_fee: baseFee,
            months: m,
            original_price: baseFee * m,
            teacher_id: assignedTeacherId,
            teacher_name_snapshot: assignedTeacherName,
            hall_number_snapshot: s.hall_number || 'Main Hall',
            schedule: s.schedule || s.timing || null,
            valid_from: itemFrom,
            valid_to: itemTo,
            is_renewal: isRenewal,
            prev_valid_to: prevValidTo,
            discount_type: itm.discount_type === 'NONE' && defaultDisc > 0 ? 'PERCENTAGE' : itm.discount_type,
            discount_value: itm.discount_type === 'PERCENTAGE' && (!itm.discount_value || itm.discount_value === '0')
              ? String(defaultDisc)
              : itm.discount_value,
          };
        }
        return itm;
      })
    );
  };

  const handleGreenCardChangeForItem = (tempId, newGcId) => {
    const gc = greenCards.find((c) => c.id === newGcId);
    if (!gc) return;
    const validityDays = gc.validity_days || 365;

    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          const fromDate = itm.valid_from ? new Date(itm.valid_from) : (validFrom ? new Date(validFrom) : new Date());
          const toDate = new Date(fromDate);
          toDate.setDate(toDate.getDate() + validityDays);
          const toStr = toDate.toISOString().split('T')[0];

          return {
            ...itm,
            green_card_id: gc.id,
            item_name_snapshot: gc.name,
            original_price: Number(gc.price),
            validity_days: validityDays,
            valid_to: toStr,
          };
        }
        return itm;
      })
    );
  };

  const handleItemValidFromChange = (tempId, newFrom) => {
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          const m = itm.months || billingMonths || 1;
          return {
            ...itm,
            valid_from: newFrom,
            valid_to: calculateEndDateFromMonths(newFrom, m),
          };
        }
        return itm;
      })
    );
  };

  const handleItemValidToChange = (tempId, newTo) => {
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          return {
            ...itm,
            valid_to: newTo,
          };
        }
        return itm;
      })
    );
  };

  const handleItemTeacherChange = (tempId, newTeacherId) => {
    const t = teachers.find((tch) => tch.id === newTeacherId);
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          return {
            ...itm,
            teacher_id: newTeacherId || null,
            teacher_name_snapshot: t ? t.name : null,
          };
        }
        return itm;
      })
    );
  };

  const handleItemChangeFromItemChange = (tempId, changeFromId) => {
    const activeSub = activeEnrollment?.active_subjects?.find((as) => as.id === changeFromId);
    setItems((prev) =>
      prev.map((itm) => {
        if (itm.tempId === tempId) {
          return {
            ...itm,
            change_from_item_id: changeFromId || null,
            is_subject_change: !!changeFromId,
            replaced_subject_name: activeSub ? activeSub.subject_name : null,
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

  // Step Validation & Navigation
  const validateStep = (stepNumber) => {
    if (stepNumber === 1) {
      if (!studentId) {
        error('Please select or register a student first');
        return false;
      }
      return true;
    }
    if (stepNumber === 2) {
      if (items.length === 0) {
        error('Please select at least one subject to proceed');
        return false;
      }
      return true;
    }
    return true;
  };

  const handleGoToNextStep = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 4) {
        setCurrentStep((prev) => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleGoToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToStep = (targetStep) => {
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Check if prerequisite steps are valid
    if (targetStep >= 2 && !studentId) {
      error('Please select a student first');
      return;
    }
    if (targetStep >= 3 && items.length === 0) {
      error('Please add at least one subject first');
      return;
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submit
  const handleFinalExecutePurchase = async () => {
    if (!studentId) {
      error('Please select or register a student');
      setCurrentStep(1);
      return;
    }
    if (items.length === 0) {
      error('Please add at least one subject');
      setCurrentStep(2);
      return;
    }
    if (!calculation) {
      error('Please wait for fee calculations to finish');
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
        let itmTo = itm.valid_to;
        if (!itmTo) {
          if (itm.item_type === 'GREEN_CARD') {
            const d = new Date(itmFrom);
            d.setDate(d.getDate() + 365);
            itmTo = d.toISOString().split('T')[0];
          } else {
            itmTo = calculateEndDateFromMonths(itmFrom, itmMonths);
          }
        }

        const baseFee = itm.base_monthly_fee !== undefined
          ? itm.base_monthly_fee
          : (parseFloat(itm.original_price) / itmMonths);

        const cleanSubjectName = (itm.item_name_snapshot || '').split(' (')[0].replace(/^\[Renewal\]\s*/, '').trim();
        const formattedSnapshotName = itm.item_type === 'SUBJECT'
          ? `${cleanSubjectName} (${itmMonths} Mo @ ₹${baseFee.toFixed(0)}/mo)`
          : itm.item_name_snapshot;

        return {
          item_type: itm.item_type,
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
          months: itmMonths,
          change_from_item_id: itm.change_from_item_id || null,
        };
      });

      const allItemFroms = itemsPayload.map((i) => i.valid_from).filter(Boolean);
      const allItemTos = itemsPayload.map((i) => i.valid_to).filter(Boolean);
      const finalOverallFrom = allItemFroms.length > 0 ? allItemFroms.reduce((a, b) => (a < b ? a : b)) : validFrom;
      const finalOverallTo = allItemTos.length > 0 ? allItemTos.reduce((a, b) => (a > b ? a : b)) : overallValidTo;

      const totalPayableAmount = calculation ? Number(calculation.total_payable) : itemsSubtotal;
      const actualPaidAmount = paymentOption === 'FULL'
        ? totalPayableAmount
        : (customPaidAmount !== '' ? Math.min(totalPayableAmount, Math.max(0, parseFloat(customPaidAmount) || 0)) : 0);
      const balanceDueAmount = Math.max(0, totalPayableAmount - actualPaidAmount);

      const initialPaymentPayload = actualPaidAmount > 0 ? {
        amount: actualPaidAmount,
        payment_mode: paymentMode,
        transaction_reference: paymentRef.trim() || null,
        notes: paymentNotes.trim() || (balanceDueAmount > 0
          ? `Partial payment of ₹${actualPaidAmount.toFixed(2)} at admission (Remaining Due: ₹${balanceDueAmount.toFixed(2)})`
          : 'Full course fee payment at admission'),
      } : null;

      const payload = {
        student_id: studentId,
        enquiry_id: paramEnquiryId || null,
        admission_date: admissionDate,
        valid_from: finalOverallFrom,
        valid_to: finalOverallTo,
        items: itemsPayload,
        overall_discount_type: overallDiscountType,
        overall_discount_value: parseFloat(overallDiscountValue) || 0,
        gst_enabled: gstEnabled,
        gst_rate: parseFloat(gstRate) || 18,
        gst_number: gstNumber,
        notes: notes.trim() || null,
        initial_payment: initialPaymentPayload,
      };

      const res = await admissionApi.create(payload);
      success(`Admission confirmed: ${res.purchase_transaction_id || res.admission_number}`);

      if (paramEnquiryId) {
        try {
          await enquiryApi.convert(paramEnquiryId, { admission_id: res.id });
        } catch {
          // ignore if already converted
        }
      }

      setCompletedAdmission({
        ...res,
        gst_enabled: gstEnabled,
        gst_rate: parseFloat(gstRate) || 18,
        gst_number: gstNumber,
      });
    } catch (err) {
      error(err.message || 'Failed to complete admission');
    } finally {
      setSubmitting(false);
    }
  };

  // Dynamic calculations for display
  const itemsSubtotal = items.reduce((sum, itm) => sum + (parseFloat(itm.original_price) || 0), 0);
  const currentPayable = calculation ? calculation.total_payable : itemsSubtotal;
  const currentDiscounts = calculation ? calculation.total_discount : 0;
  const totalPayableAmount = calculation ? Number(calculation.total_payable) : itemsSubtotal;
  const actualPaidAmount = paymentOption === 'FULL'
    ? totalPayableAmount
    : (customPaidAmount !== '' ? Math.min(totalPayableAmount, Math.max(0, parseFloat(customPaidAmount) || 0)) : 0);
  const balanceDueAmount = Math.max(0, totalPayableAmount - actualPaidAmount);

  const stepsMeta = [
    { num: 1, title: 'Student', subtitle: 'Select student' },
    { num: 2, title: 'Subjects', subtitle: 'Pick courses & dates' },
    { num: 3, title: 'Discounts', subtitle: 'Apply fee reductions' },
    { num: 4, title: 'Confirm', subtitle: 'Payment & Slip' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-36">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/admissions')}
            className="p-2 rounded-md border border-slate-300 text-slate-700 hover:text-black hover:bg-slate-100 transition min-w-[38px] min-h-[38px] flex items-center justify-center"
            title="Back to Admissions"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-black tracking-tight flex items-center gap-2">
              <span>New Admission / Enrolment</span>
              <span className="text-[11px] font-mono font-bold bg-odoo-100 text-odoo-800 px-2 py-0.5 rounded-full">
                Step {currentStep} of 4
              </span>
            </h1>
            <p className="text-xs text-slate-600">
              Cashier Enrolment: Student → Subjects → Discounts → Payment Confirmation
            </p>
          </div>
        </div>

        {paramEnquiryId && (
          <Badge variant="warning" size="xs">Enquiry Demo</Badge>
        )}
      </div>

      {/* Enquiry Conversion Banner */}
      {paramEnquiryId && (
        <div className="p-3 bg-purple-50 border border-odoo-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-purple-100 text-odoo-700 shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-odoo-900 uppercase tracking-wider">
                Converting Enquiry for: <span className="text-black font-black">{paramName || 'Enquiry Student'}</span>
              </div>
              <div className="text-[11px] text-odoo-800 font-medium">
                {paramMobile ? `📞 ${paramMobile} • ` : ''}
                {paramSubject ? `Interested in: ${paramSubject} • ` : ''}
                {studentId ? 'Registered student profile linked' : 'Student not registered yet'}
              </div>
            </div>
          </div>
          {!studentId && (
            <Button
              size="xs"
              variant="primary"
              icon={UserPlus}
              onClick={() => {
                setQuickStudentInitialData({
                  name: paramName || '',
                  mobile: cleanMobileInput(paramMobile) || '',
                  father_name: paramFather || '',
                  notes: `Admitted from Enquiry #${paramEnquiryId} (${paramPurpose || 'Student Admission'})`,
                });
                setIsQuickStudentOpen(true);
              }}
            >
              Quick Register
            </Button>
          )}
        </div>
      )}

      {/* Modern 4-Step Progress Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:p-3 shadow-xs">
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {stepsMeta.map((s) => {
            const isCompleted = currentStep > s.num;
            const isCurrent = currentStep === s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => handleJumpToStep(s.num)}
                className={`flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-2.5 p-1.5 sm:p-2 rounded-md transition text-left ${
                  isCurrent
                    ? 'bg-odoo-50 border border-odoo-300 text-odoo-900 font-bold'
                    : isCompleted
                    ? 'bg-emerald-50/60 border border-emerald-200 text-emerald-900 hover:bg-emerald-50'
                    : 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <div
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-odoo-600 text-white shadow-xs'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <span className="block text-[11px] sm:text-xs font-bold truncate">
                    {s.title}
                  </span>
                  <span className="hidden sm:block text-[10px] font-normal text-slate-500 truncate">
                    {s.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: PICK STUDENT & ADMISSION DATE */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-sm font-bold text-black flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-odoo-600 text-white flex items-center justify-center text-xs">
                    1
                  </span>
                  <span>Pick Registered Student</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Search by student name, 10-digit mobile, or registration code
                </p>
              </div>

              <Button
                size="xs"
                variant="secondary"
                icon={UserPlus}
                onClick={() => {
                  setQuickStudentInitialData(null);
                  setIsQuickStudentOpen(true);
                }}
              >
                + Register New
              </Button>
            </div>

            {/* Student Search & Select Component */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Registered Student <span className="text-rose-600">*</span>
                </label>
                <StudentSearchSelect
                  value={studentId}
                  onChange={(id) => setStudentId(id)}
                  onOpenQuickRegister={() => {
                    setQuickStudentInitialData(null);
                    setIsQuickStudentOpen(true);
                  }}
                  required
                />
              </div>

              {/* Selected Student Card */}
              {selectedStudentObj && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-odoo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                        {selectedStudentObj.name ? selectedStudentObj.name.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div>
                        <div className="font-bold text-black text-sm">{selectedStudentObj.name}</div>
                        <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-odoo-800 bg-odoo-100 px-1.5 py-0.2 rounded">
                            {selectedStudentObj.student_code}
                          </span>
                          {selectedStudentObj.mobile && (
                            <span className="font-mono text-black">📞 {selectedStudentObj.mobile}</span>
                          )}
                          {selectedStudentObj.father_name && (
                            <span className="text-slate-600">S/D of {selectedStudentObj.father_name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStudentId('')}
                      className="text-xs text-odoo-700 hover:text-odoo-900 font-semibold px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 transition"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {/* Purchase Date */}
              <div className="pt-2 border-t border-slate-100">
                <div className="max-w-xs">
                  <Input
                    label="Admission / Purchase Date"
                    type="date"
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Active Enrollment Info (if any) */}
            {activeEnrollment && (
              <div className="bg-purple-50/60 border border-odoo-200 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-bold text-odoo-900">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-odoo-600" />
                    Student Active Course Coverage
                  </span>
                  <span className="bg-white border border-odoo-200 px-2 py-0.5 rounded text-[11px] font-mono text-odoo-700 font-bold">
                    {activeEnrollment.enrollment_number}
                  </span>
                </div>

                {activeEnrollment.active_green_card && (
                  <div className="p-2 bg-purple-100/70 border border-purple-200 rounded text-purple-950 flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-purple-700" />
                      Active Green Card All-Access Pass
                    </span>
                    <span className="font-mono font-bold">
                      Valid till: {activeEnrollment.active_green_card.valid_to}
                    </span>
                  </div>
                )}

                {activeEnrollment.active_subjects?.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-700 font-semibold">
                      Currently Enrolled Courses (Renewals seamlessly continue from last end date):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {activeEnrollment.active_subjects.map((sub) => (
                        <div key={sub.id} className="p-2 bg-white border border-purple-100 rounded-md flex items-center justify-between text-[11px]">
                          <div>
                            <div className="font-bold text-black">{sub.subject_name}</div>
                            <span className="text-[10px] text-slate-500">Faculty: {sub.teacher_name || 'General'}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-odoo-900 font-bold block">{sub.valid_to}</span>
                            <span className={`text-[10px] font-semibold ${sub.days_remaining <= 7 ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {sub.days_remaining}d left
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    No active courses currently. This admission will begin a fresh course cycle.
                  </p>
                )}
              </div>
            )}

            {/* Last Enrollment Coverage Info (if any) */}
            {lastFeePeriodInfo?.has_previous && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-amber-950 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Previous cycle ended on <strong>{lastFeePeriodInfo.last_end_date}</strong>. Suggested new cycle starts on <strong>{lastFeePeriodInfo.suggested_start_date}</strong>.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: PICK SUBJECTS & DATE RANGE */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-sm font-bold text-black flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-odoo-600 text-white flex items-center justify-center text-xs">
                    2
                  </span>
                  <span>Pick Subject(s) & Duration</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Select coaching subjects, billing duration (whole months), and validity dates
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
                  Add Green Card
                </Button>
              </div>
            </div>

            {/* Items List */}
            {items.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-lg text-center space-y-2">
                <p className="text-xs text-slate-600 font-medium">No subjects selected yet.</p>
                <Button size="xs" variant="primary" icon={Plus} onClick={handleAddSubject}>
                  Add First Subject
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((itm, index) => (
                  <div
                    key={itm.tempId}
                    className="p-3 bg-white border border-slate-300 rounded-lg text-xs space-y-2.5 shadow-xs"
                  >
                    {/* Item Card Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-odoo-600 text-white flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        <span className="font-bold text-black text-xs">
                          {itm.item_type === 'GREEN_CARD' ? 'Green Card All-Access Pass' : 'Coaching Subject'}
                        </span>
                        {itm.is_renewal && (
                          <Badge variant="success" size="xs">NEXT CYCLE RENEWAL</Badge>
                        )}
                        {itm.is_subject_change && (
                          <Badge variant="purple" size="xs">SUBJECT CHANGE</Badge>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(itm.tempId)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                        title="Remove Subject"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {itm.item_type !== 'GREEN_CARD' ? (
                      <div className="space-y-3">
                        {/* Subject Select & Duration */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                              Subject & Monthly Fee
                            </label>
                            <select
                              value={itm.subject_id || ''}
                              onChange={(e) => handleSubjectChangeForItem(itm.tempId, e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:border-odoo-600 font-semibold min-h-[36px]"
                            >
                              {subjects.map((s) => {
                                const activeMatch = activeEnrollment?.active_subjects?.find((as) => as.subject_id === s.id);
                                const timing = s.timing || s.schedule || '';
                                const teacher = (typeof s.teacher === 'string' ? s.teacher : s.teacher?.name) || s.teacher_name || s.teacher_name_snapshot || resolveSubjectTeacher(s, teachers)?.teacherName || '';
                                const code = s.code || s.subject_code || '';
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({code}){timing ? ` • ${timing}` : ''}{teacher ? ` • ${teacher}` : ''} — ₹{Number(s.default_fee).toFixed(0)}/mo{activeMatch ? ` • [Active till ${activeMatch.valid_to} — Renews Next Cycle]` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                              Duration (Months)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max="3"
                                step="1"
                                value={itm.months || 1}
                                onChange={(e) => handleItemMonthsChange(itm.tempId, e.target.value)}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-center font-bold text-black font-mono focus:outline-none focus:border-odoo-600 min-h-[36px]"
                              />
                              <span className="text-[11px] text-slate-600 font-medium">mo</span>
                            </div>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                              Calculated Fee (₹)
                            </label>
                            <input
                              type="number"
                              readOnly
                              value={itm.original_price}
                              className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1.5 text-xs text-right min-h-[36px]"
                            />
                          </div>
                        </div>

                        {/* Subject Change / Replacement Options (if student has active subjects) */}
                        {activeEnrollment?.active_subjects?.length > 0 && (
                          <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-md text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-odoo-900 text-xs">
                                <input
                                  type="checkbox"
                                  checked={!!itm.is_subject_change}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const firstActive = activeEnrollment.active_subjects.find((as) => as.subject_id !== itm.subject_id) || activeEnrollment.active_subjects[0];
                                    setItems((prev) =>
                                      prev.map((i) =>
                                        i.tempId === itm.tempId
                                          ? {
                                              ...i,
                                              is_subject_change: checked,
                                              change_from_item_id: checked ? (firstActive ? firstActive.id : null) : null,
                                              replaced_subject_name: checked ? (firstActive ? firstActive.subject_name : null) : null,
                                            }
                                          : i
                                      )
                                    );
                                  }}
                                  className="rounded text-odoo-600 focus:ring-odoo-500 w-4 h-4"
                                />
                                <span>Change / Replace an Active Enrolled Subject</span>
                              </label>
                              {itm.is_subject_change && (
                                <span className="text-[10px] text-purple-700 bg-purple-100 font-mono font-bold px-1.5 py-0.2 rounded border border-purple-200">
                                  Archives Old Line to History
                                </span>
                              )}
                            </div>

                            {itm.is_subject_change && (
                              <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-1.5">
                                <span className="text-[11px] text-slate-700 font-semibold shrink-0">
                                  Active Subject Being Replaced:
                                </span>
                                <select
                                  value={itm.change_from_item_id || ''}
                                  onChange={(e) => handleItemChangeFromItemChange(itm.tempId, e.target.value)}
                                  className="w-full rounded border border-purple-300 bg-white px-2 py-1 text-xs text-black font-semibold min-h-[32px]"
                                >
                                  {activeEnrollment.active_subjects.map((as) => (
                                    <option key={as.id} value={as.id}>
                                      {as.subject_name} (Valid: {as.valid_from} → {as.valid_to} • Invoice #{as.admission_number})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Combined Date Range & Faculty Section */}
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                            <span className="font-bold text-black text-[11px] flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-odoo-600" />
                              Course Validity Period:
                            </span>
                            <div className="flex items-center gap-1">
                              {[
                                { m: 1, label: '1m (30d)' },
                                { m: 2, label: '2m (60d)' },
                                { m: 3, label: '3m (90d)' },
                              ].map((pr) => (
                                <button
                                  key={pr.m}
                                  type="button"
                                  onClick={() => handleItemMonthsChange(itm.tempId, pr.m)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                    (itm.months || 1) === pr.m
                                      ? 'bg-odoo-600 text-white border-odoo-700 shadow-2xs'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  {pr.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                                Valid From (Start Date) <span className="text-rose-600">*</span>
                              </label>
                              <input
                                type="date"
                                value={itm.valid_from || validFrom}
                                onChange={(e) => handleItemValidFromChange(itm.tempId, e.target.value)}
                                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-mono font-bold bg-white focus:outline-none focus:border-odoo-600 min-h-[34px]"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                                Valid To (End Date) <span className="text-rose-600">*</span>
                              </label>
                              <input
                                type="date"
                                value={itm.valid_to || calculateEndDateFromMonths(itm.valid_from || validFrom, itm.months || 1)}
                                onChange={(e) => handleItemValidToChange(itm.tempId, e.target.value)}
                                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-black font-mono font-bold bg-white focus:outline-none focus:border-odoo-600 min-h-[34px]"
                                required
                              />
                            </div>
                          </div>

                          {/* Faculty & Hall Strip */}
                          <div className="pt-1.5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-600">Assigned Faculty:</span>
                              <select
                                value={itm.teacher_id || ''}
                                onChange={(e) => handleItemTeacherChange(itm.tempId, e.target.value)}
                                className="border border-slate-300 rounded px-2 py-0.5 text-[11px] text-black bg-white font-medium"
                              >
                                {!itm.teacher_id && <option value="">Select Faculty</option>}
                                {teachers
                                  .filter((t) => t.status === 'ACTIVE')
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div>
                              <span className="text-slate-600">Hall: </span>
                              <strong className="text-black font-mono">{itm.hall_number_snapshot || 'Main Hall'}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Green Card Pass View */
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-8">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Green Card Tier
                          </label>
                          <select
                            value={itm.green_card_id || ''}
                            onChange={(e) => handleGreenCardChangeForItem(itm.tempId, e.target.value)}
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-black focus:outline-none focus:border-odoo-600 font-medium min-h-[36px]"
                          >
                            {greenCards.map((gc) => (
                              <option key={gc.id} value={gc.id}>
                                {gc.name} — ₹{Number(gc.price).toFixed(0)} ({formatValidityDuration(gc.validity_days)})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                            Pass Fee (₹)
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={itm.original_price}
                            className="w-full rounded border border-slate-300 bg-slate-100 font-mono font-bold text-black px-2 py-1.5 text-xs text-right min-h-[36px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: APPLY DISCOUNTS & GST */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3.5">
            <div className="border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-bold text-black flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-odoo-600 text-white flex items-center justify-center text-xs">
                  3
                </span>
                <span>Apply Discounts & Inclusive GST</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Set individual subject discounts, overall admission discount, or inclusive tax
              </p>
            </div>

            {/* Individual Item Discounts */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-black uppercase tracking-wider block">
                A. Individual Subject Discounts
              </span>
              <div className="space-y-2">
                {items.map((itm) => (
                  <div
                    key={itm.tempId}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-black block truncate">{itm.item_name_snapshot}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Base Fee: ₹{Number(itm.original_price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={itm.discount_type}
                        onChange={(e) => handleItemDiscountTypeChange(itm.tempId, e.target.value)}
                        className="h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-medium focus:outline-none focus:border-odoo-600"
                      >
                        <option value="NONE">No Discount</option>
                        <option value="PERCENTAGE">Percentage (%)</option>
                        <option value="FIXED">Fixed Amount (₹)</option>
                      </select>

                      {itm.discount_type !== 'NONE' ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={itm.discount_type === 'PERCENTAGE' ? '%' : '₹'}
                          value={itm.discount_value === 0 || itm.discount_value === '0' ? '' : itm.discount_value}
                          onChange={(e) => handleItemDiscountValueChange(itm.tempId, e.target.value)}
                          className="w-24 h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-mono font-bold text-right focus:outline-none focus:border-odoo-600"
                        />
                      ) : (
                        <span className="w-24 text-slate-400 font-mono text-center block text-[11px]">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Overall Discount & GST */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {/* Overall Discount */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <label className="block text-xs font-semibold text-black">
                  B. Overall Admission Discount
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={overallDiscountType}
                    onChange={(e) => handleOverallDiscountTypeChange(e.target.value)}
                    className="h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-medium focus:outline-none focus:border-odoo-600"
                  >
                    <option value="NONE">No Overall Discount</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (₹)</option>
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={overallDiscountType === 'NONE'}
                    value={overallDiscountValue === '0' || overallDiscountValue === 0 ? '' : overallDiscountValue}
                    onChange={(e) => setOverallDiscountValue(e.target.value)}
                    placeholder={overallDiscountType === 'PERCENTAGE' ? '%' : '₹'}
                    className="w-24 h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-mono font-bold text-right disabled:bg-slate-100 focus:outline-none focus:border-odoo-600"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  Applied proportionally across items after individual discounts
                </p>
              </div>

              {/* GST Inclusive */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black">
                  <input
                    type="checkbox"
                    checked={gstEnabled}
                    onChange={(e) => setGstEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-odoo-600 focus:ring-odoo-500 w-4 h-4"
                  />
                  <span>Apply GST (Inclusive Pricing)</span>
                </label>

                {gstEnabled && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 font-medium">GST Rate (%):</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={gstRate}
                        onChange={(e) => setGstRate(e.target.value)}
                        className="w-20 h-8 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-black font-mono font-bold focus:outline-none focus:border-odoo-600"
                      />
                    </div>
                    {gstNumber && (
                      <div className="text-[11px] text-slate-600 font-mono">
                        GSTIN: <span className="font-semibold text-black">{gstNumber}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  Tax is inclusive within fee; total payable does NOT increase.
                </p>
              </div>
            </div>

            {/* Financial Breakdown Card */}
            {calculation && (
              <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold text-black flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-odoo-600" />
                    Itemized Net Pricing Preview
                  </span>
                  <span className="text-[11px] text-slate-600 font-normal">
                    {calculation.items.length} Course Item(s)
                  </span>
                </div>

                <div className="bg-white rounded border border-slate-200 divide-y divide-slate-100 text-xs">
                  {calculation.items.map((ci, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-bold text-black block">{ci.item_name_snapshot}</span>
                        <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                          <span>Base: ₹{Number(ci.original_price).toFixed(2)}</span>
                          {ci.individual_discount > 0 && (
                            <span className="text-emerald-800 font-semibold">
                              • Individual discount: -₹{Number(ci.individual_discount).toFixed(2)}
                            </span>
                          )}
                          {ci.overall_discount_share > 0 && (
                            <span className="text-emerald-800 font-semibold">
                              • Overall discount: -₹{Number(ci.overall_discount_share).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-black text-xs block">
                          ₹{Number(ci.net_price).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500">Net Item Fee</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded border border-slate-200 p-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross Subtotal:</span>
                    <span className="font-mono text-black font-semibold">₹{Number(calculation.subtotal).toFixed(2)}</span>
                  </div>
                  {calculation.individual_discount_total > 0 && (
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>Individual Subject Discounts:</span>
                      <span className="font-mono">-₹{Number(calculation.individual_discount_total).toFixed(2)}</span>
                    </div>
                  )}
                  {calculation.overall_discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>Overall Admission Discount:</span>
                      <span className="font-mono">-₹{Number(calculation.overall_discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  {calculation.total_discount > 0 && (
                    <div className="flex justify-between text-emerald-900 font-bold border-t border-slate-200 pt-1">
                      <span>Total Savings / Discount:</span>
                      <span className="font-mono">-₹{Number(calculation.total_discount).toFixed(2)}</span>
                    </div>
                  )}
                  {calculation.gst_enabled && (
                    <div className="flex justify-between text-slate-600">
                      <span>Inclusive GST ({calculation.gst_rate}%):</span>
                      <span className="font-mono text-black">₹{Number(calculation.gst_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold text-black">
                    <span>Total Fee Payable:</span>
                    <span className="font-mono text-base font-black text-odoo-700">
                      ₹{Number(calculation.total_payable).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: CONFIRM & PAY */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3.5">
            <div className="border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-bold text-black flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-odoo-600 text-white flex items-center justify-center text-xs">
                  4
                </span>
                <span>Payment Settlement & Enrolment Confirmation</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Select payment collection mode and review admission invoice before issuing slip
              </p>
            </div>

            {/* Payment Method Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black">
                Payment Collection Method <span className="text-rose-600">*</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { value: 'CASH', label: 'Cash', icon: DollarSign },
                  { value: 'UPI', label: 'UPI / QR', icon: CreditCard },
                  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: ShieldCheck },
                  { value: 'CARD', label: 'Card', icon: CreditCard },
                  { value: 'OTHER', label: 'Other', icon: Tag },
                ].map((mode) => {
                  const isSelected = paymentMode === mode.value;
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setPaymentMode(mode.value)}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-1 min-h-[50px] ${
                        isSelected
                          ? 'bg-odoo-600 text-white border-odoo-700 shadow-xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMode !== 'CASH' ? (
                <div className="pt-1">
                  <Input
                    label="Transaction Reference / UTR Number"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="e.g. UTR / UPI Ref / Cheque No"
                  />
                </div>
              ) : (
                <div className="pt-1">
                  <Input
                    label="Payment Notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Cash collected by cashier at front desk"
                  />
                </div>
              )}
            </div>

            {/* Payment Amount Settlement (Full vs Partial) */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <label className="block text-xs font-semibold text-black">
                Payment Settlement Mode <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentOption('FULL');
                    setCustomPaidAmount(String(totalPayableAmount));
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                    paymentOption === 'FULL'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs">Paid in Full</span>
                  <span className="text-[11px] font-mono">₹{totalPayableAmount.toFixed(2)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentOption('PARTIAL');
                    if (customPaidAmount === '' || Number(customPaidAmount) === totalPayableAmount) {
                      setCustomPaidAmount(String(Math.round(totalPayableAmount / 2)));
                    }
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                    paymentOption === 'PARTIAL'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs">Partial Payment</span>
                  <span className="text-[11px] font-mono">Pay part now, balance due</span>
                </button>
              </div>

              {paymentOption === 'PARTIAL' && (
                <div className="p-3 bg-white border border-amber-200 rounded-md space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">
                        Amount Paid Now (₹) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={totalPayableAmount}
                        step="0.01"
                        value={customPaidAmount}
                        onChange={(e) => setCustomPaidAmount(e.target.value)}
                        placeholder="Enter amount collected..."
                        className="w-full rounded border border-amber-300 bg-amber-50/50 px-3 py-1.5 text-sm font-mono font-black text-black focus:outline-none focus:border-amber-600 min-h-[38px]"
                      />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Total Course Fee:</span>
                        <span className="font-mono font-bold text-black">₹{totalPayableAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800 font-semibold">
                        <span>Amount Paid Now:</span>
                        <span className="font-mono">₹{actualPaidAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-amber-900">
                        <span>Remaining Balance Due:</span>
                        <span className="font-mono text-sm font-black text-amber-700">₹{balanceDueAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Internal Admission Notes */}
            <div>
              <Input
                label="Internal Admission Notes (Optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Guardian accompanied, classes start next Monday"
              />
            </div>

            {/* Complete Admission Summary Review */}
            <div className="bg-slate-50 border border-slate-300 rounded-lg p-3.5 text-xs space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-black block border-b border-slate-200 pb-1.5">
                Summary Review Before Confirmation
              </span>

              {/* Student Summary */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600">Student:</span>
                <strong className="text-black text-sm">{selectedStudentObj?.name || 'Selected Student'} ({selectedStudentObj?.student_code})</strong>
              </div>

              {/* Items Summary */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Enrolled Subjects ({items.length}):</span>
                <div className="bg-white rounded border border-slate-200 divide-y divide-slate-100">
                  {items.map((itm, i) => (
                    <div key={i} className="p-2 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-black">{itm.item_name_snapshot}</span>
                        {itm.is_subject_change && (
                          <span className="text-[10px] text-purple-700 font-bold block">
                            ↻ Replaces: {itm.replaced_subject_name || 'Active Subject'} (Archives old subject to history)
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 block">
                          Coverage: {itm.valid_from || validFrom} to {itm.valid_to || validTo} ({itm.months || 1} mo)
                        </span>
                      </div>
                      <span className="font-mono font-bold text-black">
                        ₹{Number(itm.original_price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Review */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>Gross Fee Subtotal:</span>
                  <span className="font-mono font-semibold">₹{calculation?.subtotal.toFixed(2)}</span>
                </div>
                {calculation && calculation.individual_discount_total > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span>Individual Discounts:</span>
                    <span className="font-mono">-₹{calculation.individual_discount_total.toFixed(2)}</span>
                  </div>
                )}
                {calculation && calculation.overall_discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span>Overall Discount:</span>
                    <span className="font-mono">-₹{calculation.overall_discount_amount.toFixed(2)}</span>
                  </div>
                )}
                {calculation && calculation.total_discount > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold border-t border-emerald-200/80 pt-1">
                    <span>Total Discounts:</span>
                    <span className="font-mono">-₹{calculation.total_discount.toFixed(2)}</span>
                  </div>
                )}
                {calculation?.gst_enabled && (
                  <div className="flex justify-between text-slate-700">
                    <span>Inclusive GST ({calculation.gst_rate}%):</span>
                    <span className="font-mono">₹{calculation.gst_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-emerald-300 pt-1.5 text-sm font-black text-black">
                  <span>Total Course Fee:</span>
                  <span className="font-mono text-base font-black text-black">
                    ₹{totalPayableAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-emerald-950">
                  <span>Amount Paid Now:</span>
                  <span className="font-mono text-base font-black text-emerald-700">
                    ₹{actualPaidAmount.toFixed(2)}
                  </span>
                </div>
                {balanceDueAmount > 0 ? (
                  <div className="flex justify-between border-t border-amber-300 pt-1.5 text-sm font-bold text-amber-950 bg-amber-100/60 p-1.5 rounded">
                    <span>Remaining Balance Due:</span>
                    <span className="font-mono text-base font-black text-amber-800">
                      ₹{balanceDueAmount.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between text-[11px] text-emerald-800 font-bold border-t border-emerald-200 pt-1">
                    <span>Balance Due:</span>
                    <span className="font-mono font-bold text-emerald-700">₹0.00 (Paid in Full)</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-700 font-medium pt-1 border-t border-emerald-200">
                  <span>Settlement Mode:</span>
                  <span className="font-bold">
                    {paymentMode} {balanceDueAmount > 0 ? `(Partial Payment • ₹${balanceDueAmount.toFixed(2)} Due)` : '(Paid in Full)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALWAYS VISIBLE BOTTOM STICKY BAR (Optimized for Mobile & Desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-2xl px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Total Payable Box */}
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {currentStep === 4 && paymentOption === 'PARTIAL' && balanceDueAmount > 0
                ? 'Paying Now (Partial)'
                : 'Total Payable'}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg sm:text-2xl font-black font-mono text-odoo-800 tracking-tight">
                ₹{currentStep === 4 && paymentOption === 'PARTIAL' ? actualPaidAmount.toFixed(2) : Number(currentPayable).toFixed(2)}
              </span>
              {currentStep === 4 && paymentOption === 'PARTIAL' && balanceDueAmount > 0 ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-full">
                  Due: ₹{balanceDueAmount.toFixed(2)}
                </span>
              ) : currentDiscounts > 0 ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full hidden sm:inline">
                  Save ₹{Number(currentDiscounts).toFixed(0)}
                </span>
              ) : null}
            </div>
            <span className="text-[10px] text-slate-600 truncate block font-medium">
              {items.length} Subject{items.length === 1 ? '' : 's'} • {selectedStudentObj?.name || 'No student selected'}
            </span>
          </div>

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleGoToPrevStep}
                className="min-h-[44px] px-3 text-xs"
              >
                <ChevronLeft className="w-4 h-4 mr-0.5" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}

            {currentStep < 4 ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleGoToNextStep}
                className="min-h-[44px] px-4 text-xs font-bold"
              >
                <span>
                  {currentStep === 1
                    ? 'Next: Subjects'
                    : currentStep === 2
                    ? 'Next: Discounts'
                    : 'Next: Confirm & Pay'}
                </span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={submitting}
                icon={CheckCircle2}
                onClick={handleFinalExecutePurchase}
                className="min-h-[44px] px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white"
              >
                Confirm & Issue Slip
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Student Registration Modal */}
      <QuickStudentModal
        isOpen={isQuickStudentOpen}
        onClose={() => setIsQuickStudentOpen(false)}
        initialData={quickStudentInitialData}
        onSuccess={(newStu) => {
          setStudents((prev) => [newStu, ...prev]);
          setStudentId(newStu.id);
          setIsQuickStudentOpen(false);
          if (paramEnquiryId) {
            enquiryApi.update(paramEnquiryId, {
              status: 'CONVERTED',
              converted_student_id: newStu.id,
            }).catch(console.warn);
          }
          success(`Student ${newStu.name} registered and selected for admission!`);
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
