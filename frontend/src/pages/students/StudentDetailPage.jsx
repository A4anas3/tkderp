import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CalendarDays,
  Award,
  CreditCard,
  Plus,
  FileText,
  Printer,
  UserX,
  RotateCcw,
  AlertTriangle,
  Camera,
  RefreshCw,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  Edit2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Filter,
  PlayCircle,
  History,
  BookOpen,
  Layers,
  Sparkles,
  ShieldCheck,
  Eye,
  IdCard,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { getActionMeta, formatDateTime, AuditDetailsSummary } from '../audit/AuditLogPage';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import { studentApi, admissionApi, paymentApi, remindersApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';
import { useAuth } from '../../context/AuthContext';
import { WhatsAppIcon } from '../../utils/whatsappHelpers';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import AdmissionAllSlipsModal from '../../components/receipts/AdmissionAllSlipsModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import RevokeStudentModal from '../../components/modals/RevokeStudentModal';
import CancelPurchaseModal from '../../components/modals/CancelPurchaseModal';
import EditStudentModal from '../../components/modals/EditStudentModal';
import EditValidityModal from '../../components/modals/EditValidityModal';
import RenewSubjectModal from '../../components/modals/RenewSubjectModal';
import WaiveDueModal from '../../components/modals/WaiveDueModal';
import StudentIDCardModal from '../../components/modals/StudentIDCardModal';
import GiveDemoModal from '../../components/modals/GiveDemoModal';
import DemoPassModal from '../../components/modals/DemoPassModal';
import { getCleanCancelReason, formatIndianDate, computeDaysRemaining, computeDaysRemainingForPeriods, computeGapDays } from '../../utils/dateCycleUtils';

function getValidityStatus(adm) {
  if (adm.status === 'SUSPENDED') {
    return {
      status: 'SUSPENDED',
      badgeVariant: 'warning',
      label: 'Suspended',
      subtext: adm.revocation_reason || 'Temporarily Suspended',
      isExpired: false,
      isExpiringSoon: false,
      isSuspended: true,
      canRenew: false,
    };
  }

  if (adm.status === 'DISCONTINUED') {
    return {
      status: 'DISCONTINUED',
      badgeVariant: 'neutral',
      label: 'Discontinued',
      subtext: adm.revocation_reason || 'Discontinued',
      isExpired: false,
      isExpiringSoon: false,
      isDiscontinued: true,
      canRenew: false,
    };
  }

  const isCancelledOrRevoked = adm.status === 'REVOKED' || adm.status === 'CANCELLED';
  if (isCancelledOrRevoked) {
    return {
      status: 'CANCELLED',
      badgeVariant: 'danger',
      label: 'Cancelled',
      subtext: 'Cancelled',
      isExpired: false,
      isExpiringSoon: false,
      isCancelled: true,
      canRenew: false,
    };
  }

  if (!adm.valid_to) {
    return {
      status: 'ACTIVE',
      badgeVariant: 'success',
      label: 'Active',
      subtext: 'Open validity',
      isExpired: false,
      isExpiringSoon: false,
      canRenew: true,
    };
  }

  const diffDays = computeDaysRemaining(adm.valid_to, adm.valid_from || adm.admission_date);
  if (diffDays === null) {
    return {
      status: 'ACTIVE',
      badgeVariant: 'success',
      label: 'Active',
      subtext: 'Open validity',
      isExpired: false,
      isExpiringSoon: false,
      canRenew: true,
    };
  }

  if (diffDays < 0) {
    return {
      status: 'EXPIRED',
      badgeVariant: 'danger',
      label: 'Expired',
      subtext: `Expired ${Math.abs(diffDays)}d ago (${adm.valid_to})`,
      isExpired: true,
      isExpiringSoon: false,
      canRenew: true,
    };
  } else if (diffDays <= 7) {
    return {
      status: 'EXPIRING_SOON',
      badgeVariant: 'warning',
      label: 'Expiring Soon',
      subtext: `Expires in ${diffDays}d (${adm.valid_to})`,
      isExpired: false,
      isExpiringSoon: true,
      canRenew: true,
    };
  } else {
    return {
      status: 'ACTIVE',
      badgeVariant: 'success',
      label: 'Active',
      subtext: `${diffDays}d remaining (${adm.valid_to})`,
      isExpired: false,
      isExpiringSoon: false,
      canRenew: true,
    };
  }
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { isAdmin, isTeacher, canManageAdmissions } = useAuth();
  const [student, setStudent] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [demos, setDemos] = useState([]);
  const [demosLoading, setDemosLoading] = useState(false);

  // Tab State: 'HISTORY' | 'INVOICES' | 'LEDGER'
  const [activeMainTab, setActiveMainTab] = useState(() => (isTeacher ? 'DEMOS' : 'HISTORY'));

  // Active Enrollment State
  const [enrollmentData, setEnrollmentData] = useState(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  // Renewal Modal
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [selectedItemForRenew, setSelectedItemForRenew] = useState(null);

  // Item-level Validity & Lifecycle Actions
  const [selectedItemForValidity, setSelectedItemForValidity] = useState(null);
  const [resumingItemId, setResumingItemId] = useState(null);

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [selectedAdmissionForWaive, setSelectedAdmissionForWaive] = useState(null);
  const [targetAdmissionId, setTargetAdmissionId] = useState(null);
  const [receiptToShow, setReceiptToShow] = useState(null);
  const [admissionSlipToShow, setAdmissionSlipToShow] = useState(null);
  const [idCardModalOpen, setIdCardModalOpen] = useState(false);
  const [giveDemoModalOpen, setGiveDemoModalOpen] = useState(false);
  const [demoPassToShow, setDemoPassToShow] = useState(null);

  // Lifecycle Modals (Edit Validity)
  const [selectedAdmissionForValidity, setSelectedAdmissionForValidity] = useState(null);
  const [validityModalOpen, setValidityModalOpen] = useState(false);

  // Revocation & Refund Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [cancelPurchaseModalOpen, setCancelPurchaseModalOpen] = useState(false);
  const [selectedAdmissionForPurchaseCancel, setSelectedAdmissionForPurchaseCancel] = useState(null);
  const [selectedItemForCancel, setSelectedItemForCancel] = useState(null);
  const [cancellingItemLoadingId, setCancellingItemLoadingId] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedAdmissionForRefund, setSelectedAdmissionForRefund] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringPurchaseId, setRestoringPurchaseId] = useState(null);

  // Admissions backend pagination & search
  const [admPage, setAdmPage] = useState(1);
  const [admPageSize, setAdmPageSize] = useState(5);
  const [admSearch, setAdmSearch] = useState('');
  const [admStatusFilter, setAdmStatusFilter] = useState('ALL');
  const [admTotal, setAdmTotal] = useState(0);
  const [admTotalPages, setAdmTotalPages] = useState(1);
  const [admLoading, setAdmLoading] = useState(false);

  // Financial Transactions backend pagination & search
  const [txnPage, setTxnPage] = useState(1);
  const [txnPageSize, setTxnPageSize] = useState(10);
  const [txnSearch, setTxnSearch] = useState('');
  const [txnModeFilter, setTxnModeFilter] = useState('ALL');
  const [txnTypeFilter, setTxnTypeFilter] = useState('ALL');
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnTotalPages, setTxnTotalPages] = useState(1);
  const [txnsLoading, setTxnsLoading] = useState(false);

  // Student Audit Tab State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [selectedAuditForInspection, setSelectedAuditForInspection] = useState(null);

  // All Slips Modal
  const [allSlipsModalOpen, setAllSlipsModalOpen] = useState(false);
  const [selectedAdmissionForSlips, setSelectedAdmissionForSlips] = useState(null);

  const [sendingReminder, setSendingReminder] = useState(false);

  const handleSendStudentReminder = async () => {
    try {
      setSendingReminder(true);
      const res = await remindersApi.sendStudentReminder(id);
      success(res?.message || 'WhatsApp reminder ready');
      if (res?.whatsapp_url) {
        window.open(res.whatsapp_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to send reminder:', err);
      error(err?.response?.data?.detail || err?.message || 'Failed to trigger reminder');
    } finally {
      setSendingReminder(false);
    }
  };

  const fetchDemosData = async () => {
    setDemosLoading(true);
    try {
      const res = await studentApi.getDemos(id);
      setDemos(res || []);
    } catch (err) {
      console.warn('Failed to fetch student demos:', err);
    } finally {
      setDemosLoading(false);
    }
  };

  const fetchStudentProfile = async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const stRes = await studentApi.get(id);
      setStudent(stRes);
      if (stRes?.demos) {
        setDemos(stRes.demos);
      } else {
        fetchDemosData();
      }
      return stRes;
    } catch (err) {
      if (err?.response?.status === 403) {
        setAccessDenied(true);
      }
      error(err?.response?.data?.detail || err.message || 'Failed to load student profile');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmissionsData = async (
    page = admPage,
    pageSize = admPageSize,
    search = admSearch,
    status = admStatusFilter
  ) => {
    setAdmLoading(true);
    try {
      const params = {
        student_id: id,
        page,
        page_size: pageSize,
      };
      if (search?.trim()) params.search = search.trim();
      if (status && status !== 'ALL') params.payment_status = status;

      const res = await admissionApi.list(params);
      setAdmissions(res.items || []);
      setAdmTotal(res.total || 0);
      setAdmTotalPages(res.total_pages || 1);
    } catch (err) {
      error(err.message || 'Failed to load course purchases');
    } finally {
      setAdmLoading(false);
    }
  };

  const fetchTransactionsData = async (
    page = txnPage,
    pageSize = txnPageSize,
    search = txnSearch,
    mode = txnModeFilter,
    type = txnTypeFilter
  ) => {
    setTxnsLoading(true);
    try {
      const params = {
        student_id: id,
        page,
        page_size: pageSize,
      };
      if (search?.trim()) params.search = search.trim();
      if (mode && mode !== 'ALL') params.payment_mode = mode;
      if (type && type !== 'ALL') params.txn_type = type;

      const res = await paymentApi.listTransactions(params);
      setTransactions(res.items || []);
      setTxnTotal(res.total || 0);
      setTxnTotalPages(res.total_pages || 1);
    } catch (err) {
      error(err.message || 'Failed to load financial transactions ledger');
    } finally {
      setTxnsLoading(false);
    }
  };

  const fetchEnrollmentData = async () => {
    setEnrollmentLoading(true);
    try {
      const data = await studentApi.getActiveEnrollment(id);
      setEnrollmentData(data);
      return data;
    } catch (e) {
      console.warn('Failed to load active enrollment', e);
      return null;
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const handleResumeItem = async (item) => {
    setResumingItemId(item.id);
    try {
      await admissionApi.resumeItem(item.id);
      success(`Subject "${item.subject_name}" has been resumed successfully!`);
      await fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to resume subject');
    } finally {
      setResumingItemId(null);
    }
  };

  const handleOpenItemCancel = async (item) => {
    if (!item?.admission_id) return;
    const existingAdm = admissions.find((a) => a.id === item.admission_id);
    if (existingAdm) {
      setSelectedAdmissionForPurchaseCancel(existingAdm);
      setSelectedItemForCancel(item);
      setCancelPurchaseModalOpen(true);
      return;
    }
    setCancellingItemLoadingId(item.id);
    try {
      const adm = await admissionApi.get(item.admission_id);
      setSelectedAdmissionForPurchaseCancel(adm);
      setSelectedItemForCancel(item);
      setCancelPurchaseModalOpen(true);
    } catch (err) {
      error(err.message || 'Failed to load course purchase details');
    } finally {
      setCancellingItemLoadingId(null);
    }
  };

  const fetchStudentAuditLogs = async (
    page = auditPage,
    pageSize = auditPageSize,
    search = auditSearch,
    action = auditActionFilter
  ) => {
    if (!id) return;
    setAuditLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (search?.trim()) params.search = search.trim();
      if (action && action !== 'ALL') params.action = action;

      const res = await studentApi.getAudit(id, params);
      setAuditLogs(res.items || []);
      setAuditTotal(res.total || 0);
      setAuditTotalPages(res.total_pages || 1);
    } catch (e) {
      console.warn('Failed to load student audit logs', e);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const tasks = [
        fetchStudentProfile(),
        fetchEnrollmentData(),
        fetchDemosData(),
      ];
      if (!isTeacher) {
        tasks.push(
          fetchAdmissionsData(admPage, admPageSize, admSearch, admStatusFilter),
          fetchTransactionsData(txnPage, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter),
          fetchStudentAuditLogs(auditPage, auditPageSize, auditSearch, auditActionFilter),
        );
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentProfile();
    fetchEnrollmentData();
    fetchDemosData();
  }, [id]);

  useEffect(() => {
    if (!isTeacher) {
      fetchAdmissionsData(admPage, admPageSize, admSearch, admStatusFilter);
    }
  }, [id, admPage, admPageSize, admStatusFilter, isTeacher]);

  useEffect(() => {
    if (!isTeacher) {
      fetchTransactionsData(txnPage, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter);
    }
  }, [id, txnPage, txnPageSize, txnModeFilter, txnTypeFilter, isTeacher]);

  useEffect(() => {
    if (!isTeacher) {
      fetchStudentAuditLogs(auditPage, auditPageSize, auditSearch, auditActionFilter);
    }
  }, [id, auditPage, auditPageSize, auditActionFilter, isTeacher]);

  const handleViewReceipt = async (txn) => {
    if (txn.type === 'PAYMENT') {
      try {
        const rcpt = await paymentApi.getReceipt(txn.payment_id || txn.id);
        setReceiptToShow(rcpt);
      } catch (e) {
        error(e.message || 'Failed to fetch payment receipt');
      }
    } else if (txn.type === 'WAIVER') {
      if (txn.admission_id) {
        const adm = admissions.find((a) => a.id === txn.admission_id);
        setSelectedAdmissionForSlips(adm || { id: txn.admission_id, admission_number: txn.admission_number });
        setAllSlipsModalOpen(true);
      }
    } else if (txn.type === 'REVERSAL') {
      if (txn.payment_id) {
        try {
          const rcpt = await paymentApi.getReceipt(txn.payment_id);
          setReceiptToShow(rcpt);
        } catch (e) {
          error(e.message || 'Failed to fetch payment receipt');
        }
      } else if (txn.admission_id) {
        const adm = admissions.find((a) => a.id === txn.admission_id);
        setSelectedAdmissionForSlips(adm || { id: txn.admission_id, admission_number: txn.admission_number });
        setAllSlipsModalOpen(true);
      }
    } else {
      try {
        const rcpt = await paymentApi.getRefundReceipt(txn.refund_id || txn.id);
        setRefundReceiptToShow(rcpt);
      } catch (e) {
        error(e.message || 'Failed to fetch refund receipt');
      }
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await studentApi.restore(student.id);
      success(`Student ${student.name} restored to ACTIVE status`);
      fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to restore student');
    } finally {
      setRestoring(false);
    }
  };

  const handleRestorePurchase = async (adm) => {
    setRestoringPurchaseId(adm.id);
    try {
      await admissionApi.restore(adm.id);
      success(`Purchase ${adm.purchase_transaction_id || adm.admission_number} restored to ACTIVE`);
      fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to restore purchase');
    } finally {
      setRestoringPurchaseId(null);
    }
  };

  const handleResumePurchase = async (adm) => {
    try {
      await admissionApi.resume(adm.id);
      success(`Purchase ${adm.purchase_transaction_id || adm.admission_number} resumed to ACTIVE`);
      fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to resume purchase');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const { file: compressedFile, sizeKb } = await compressImage(file, 20);
      const updated = await studentApi.uploadPhoto(student.id, compressedFile);
      setStudent((prev) => ({ ...prev, photo_url: updated.photo_url }));
      success(`Profile photo updated successfully (${sizeKb} KB, <= 20 KB limit)`);
    } catch (err) {
      error(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading && !student) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 space-y-2">
        <div className="w-6 h-6 border-2 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="font-medium text-slate-600">Loading Student Profile...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-slate-600 font-medium">
          {accessDenied
            ? 'Access Denied: You can only view active students enrolled in your assigned subjects.'
            : 'Student record not found.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/students')}>
          Back to Students
        </Button>
      </div>
    );
  }

  const isRevoked = student.status === 'REVOKED';

  // Filter only currently active subjects (Section 9)
  const activeAdmissions = admissions.filter((adm) => {
    if (adm.status !== 'ACTIVE') return false;
    const v = getValidityStatus(adm);
    return !v.isExpired && !v.isCancelled && !v.isSuspended && !v.isDiscontinued;
  });

  const activeSubjects = (enrollmentData?.active_subjects || []).filter(
    (item) => (item.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
  );
  const activeGreenCard =
    enrollmentData?.active_green_card &&
    (enrollmentData.active_green_card.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
      ? enrollmentData.active_green_card
      : null;

  const activeTotalFee = activeAdmissions.reduce((acc, a) => acc + Number(a.total_payable || 0), 0);
  const activeTotalPaid = activeAdmissions.reduce((acc, a) => acc + Number(a.amount_paid || 0), 0);
  const activeTotalDue = activeAdmissions.reduce((acc, a) => acc + Number(a.balance_due || 0), 0);

  const renderDemosSection = () => {
    const demoStatusVariants = {
      SCHEDULED: 'primary',
      ACTIVE: 'primary',
      ATTENDED: 'warning',
      CONVERTED: 'success',
      DROPPED: 'neutral',
      EXPIRED: 'danger',
    };

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-odoo-600" />
              <h2 className="text-sm font-bold text-black">Trial Demos & Conversion</h2>
              {demos.length > 0 && (
                <Badge size="xs" variant="purple">
                  {demos.length} {demos.length === 1 ? 'Demo' : 'Demos'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              Trial classes attended by candidate, with linkage to enrolled course admissions
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isRevoked && !isTeacher && canManageAdmissions && (
              <Button
                size="xs"
                variant="primary"
                icon={Sparkles}
                onClick={() => setGiveDemoModalOpen(true)}
                title="Give a trial demo class for this student"
              >
                Give Demo
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              icon={RefreshCw}
              loading={demosLoading}
              onClick={fetchDemosData}
            >
              Refresh
            </Button>
          </div>
        </div>

        {demosLoading && demos.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-odoo-600" />
            Loading demo history...
          </div>
        ) : demos.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg">
            <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No trial demos recorded</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              This student has not taken any trial classes through the enquiry system.
            </p>
            {!isRevoked && !isTeacher && canManageAdmissions && (
              <Button
                size="xs"
                variant="primary"
                icon={Sparkles}
                className="mt-3"
                onClick={() => setGiveDemoModalOpen(true)}
              >
                Give Demo
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Demo ID</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Teacher</th>
                  <th className="p-3">Hall & Timing</th>
                  <th className="p-3">Trial Dates</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Purchased Course</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demos.map((d) => {
                  const isConverted = d.status === 'CONVERTED' || Boolean(d.converted_admission_item_id) || Boolean(d.linked_course);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-odoo-900 inline-block">
                          {d.demo_reference_number}
                        </span>
                        {d.enquiry_code && (
                          <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                            Enquiry: {d.enquiry_code}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-black">{d.subject_name}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-black flex items-center gap-1">
                          <User className="w-3 h-3 text-odoo-600" />
                          {d.teacher_name || 'Faculty'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-700">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Hall: <strong className="text-black">{d.hall || d.hall_number || 'Main Hall'}</strong></span>
                          </span>
                          {(d.timing || d.schedule) && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>Timing: <strong className="text-black">{d.timing || d.schedule}</strong></span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-black">
                          {formatIndianDate(d.demo_start_date)}
                          {d.demo_end_date && ` → ${formatIndianDate(d.demo_end_date)}`}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {d.demo_duration_days} days trial
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          size="xs"
                          variant={demoStatusVariants[d.status] || (isConverted ? 'success' : 'neutral')}
                        >
                          {d.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {isConverted ? (
                          <div>
                            <div className="font-bold text-emerald-900">
                              {d.linked_course?.subject || d.subject_name}
                            </div>
                            <div className="text-[11px] font-mono text-purple-700 font-semibold">
                              {d.linked_course?.admission_id ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/enrollments/${d.linked_course.admission_id}`)}
                                  className="hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                  title="View linked enrollment"
                                >
                                  <span>{d.linked_course.admission_number || 'Enrollment Linked'}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              ) : (
                                d.linked_course?.admission_number ? `${d.linked_course.admission_number}` : 'Admission Linked'
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">
                            Not converted yet
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {/* Revocation Alert Banner */}
      {isRevoked && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 sm:p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-950 uppercase tracking-wider block text-xs">
                STUDENT ADMISSION REVOKED — ALL ACTIVE ENROLLMENTS CANCELLED
              </span>
              <p className="text-rose-900 mt-0.5">
                Reason: <strong className="text-black italic">{student.revoke_reason || 'Administrative action'}</strong>
                {student.revoked_at && (
                  <span className="text-slate-700 ml-2 font-mono">
                    (Revoked on {new Date(student.revoked_at).toLocaleDateString('en-IN')})
                  </span>
                )}
              </p>
            </div>
          </div>

          <Button
            size="xs"
            variant="primary"
            loading={restoring}
            onClick={handleRestore}
            icon={RotateCcw}
            className="w-full sm:w-auto shrink-0 justify-center"
          >
            Restore Student
          </Button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => navigate('/students')}
              className="p-2 rounded-lg border border-slate-300 text-slate-700 hover:text-black hover:bg-slate-100 active:bg-slate-200 transition shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
              title="Back to Students list"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Student Profile Picture with Direct Upload (< 20 KB) */}
            <div className="relative group shrink-0">
              <Avatar
                src={student.photo_url}
                name={student.name}
                size="lg"
                status={student.status}
              />
              {!isTeacher && (
                <label
                  className="absolute -bottom-1 -right-1 p-1 bg-white border border-slate-300 rounded-full shadow-xs cursor-pointer hover:bg-purple-50 hover:border-odoo-400 transition"
                  title="Change Profile Photo (auto-compressed to <= 20 KB)"
                >
                  <Camera className="w-3.5 h-3.5 text-odoo-700" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-xl font-bold text-black break-words leading-tight">{student.name}</h1>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-odoo-800 font-bold border border-slate-300 shrink-0">
                  {student.student_code}
                </span>
                <Badge variant={isRevoked ? 'danger' : student.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {student.status}
                </Badge>
              </div>
              {student.father_name && (
                <p className="text-xs text-slate-700 font-medium truncate mt-0.5">Father: {student.father_name}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Edit Student Profile Button */}
            {!isTeacher && (
              <Button
                size="xs"
                variant="amber"
                icon={Edit2}
                onClick={() => setEditModalOpen(true)}
                title="Edit Student Information"
                className="flex-1 sm:flex-initial justify-center"
              >
                Edit Profile
              </Button>
            )}

            {/* Student ID Card Button */}
            {!isTeacher && (
              <Button
                size="xs"
                variant="indigo"
                icon={IdCard}
                onClick={() => setIdCardModalOpen(true)}
                title="View, Print & WhatsApp Student ID Card"
                className="flex-1 sm:flex-initial justify-center"
              >
                ID Card
              </Button>
            )}

            {/* Revoke / Restore Button (Admin Only) */}
            {isAdmin && (
              isRevoked ? (
                <Button
                  size="xs"
                  variant="success-soft"
                  onClick={handleRestore}
                  loading={restoring}
                  className="flex-1 sm:flex-initial justify-center"
                >
                  Restore Status
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="danger"
                  icon={UserX}
                  onClick={() => setRevokeModalOpen(true)}
                  className="flex-1 sm:flex-initial justify-center"
                >
                  Revoke Student
                </Button>
              )
            )}

            {/* Collect Due Fee Button */}
            {!isRevoked && !isTeacher && Number(student.total_balance_due) > 0 && (
              <Button
                size="xs"
                variant="success"
                icon={CreditCard}
                onClick={() => {
                  const firstDue = admissions.find((a) => Number(a.balance_due) > 0);
                  setTargetAdmissionId(firstDue ? firstDue.id : null);
                  setPayModalOpen(true);
                }}
                className="flex-1 sm:flex-initial justify-center"
              >
                Collect Due Fee
              </Button>
            )}

            {/* One-Click Send Due Reminder Button */}
            {!isRevoked && !isTeacher && Number(student.total_balance_due) > 0 && (
              <button
                type="button"
                onClick={handleSendStudentReminder}
                disabled={sendingReminder}
                title="Send WhatsApp due reminder to student"
                className="min-h-[30px] px-3 py-1 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
                <span>{sendingReminder ? 'Preparing...' : 'Send Due Reminder'}</span>
              </button>
            )}

            {/* Waive Due Fee Button (Admin Only) */}
            {!isRevoked && isAdmin && Number(student.total_balance_due) > 0 && (
              <Button
                size="xs"
                variant="warning"
                icon={Sparkles}
                onClick={() => {
                  const firstDue = admissions.find((a) => Number(a.balance_due) > 0);
                  setSelectedAdmissionForWaive(firstDue || null);
                  setWaiveModalOpen(true);
                }}
                className="flex-1 sm:flex-initial justify-center bg-amber-500 hover:bg-amber-600 text-black font-bold border-amber-600"
                title="Admin only: Waive / forgive pending fee due"
              >
                Waive Due
              </Button>
            )}

            {/* Give Demo Action (Admin & Cashier only; teachers stay read-only) */}
            {!isRevoked && !isTeacher && canManageAdmissions && (
              <Button
                size="xs"
                variant="purple"
                icon={Sparkles}
                onClick={() => setGiveDemoModalOpen(true)}
                title="Give a trial demo class for this student"
                className="flex-1 sm:flex-initial justify-center"
              >
                Give Demo
              </Button>
            )}

            {/* Purchase Another Course / Subject Shortcut */}
            {!isRevoked && !isTeacher && (
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                onClick={() =>
                  navigate(
                    `/enrollments/new?student_id=${student.id}&name=${encodeURIComponent(
                      student.name
                    )}`
                  )
                }
                className="w-full sm:w-auto justify-center"
              >
                <span className="hidden sm:inline">Purchase Another Course / Subject</span>
                <span className="sm:hidden">Purchase Subject / Course</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Financial Overview Cards */}
      {!isTeacher && (
      <div className={`grid grid-cols-2 ${Number(student.total_refunded) > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
            Total Purchases
          </span>
          <div className="text-lg sm:text-xl font-bold text-black mt-0.5">{student.admissions_count || 0}</div>
          <div className="text-[10px] sm:text-[11px] text-slate-700 flex items-center gap-1 mt-0.5 font-medium flex-wrap">
            <span className="text-emerald-700 font-bold">{student.active_admissions_count || 0} Active</span>
            {Number(student.revoked_admissions_count) > 0 && (
              <>
                <span className="text-slate-400">•</span>
                <span className="text-rose-700 font-bold">{student.revoked_admissions_count} Cancelled</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
            Active Billed Fees
          </span>
          <div className="text-lg sm:text-xl font-bold text-black mt-0.5 break-all sm:break-normal">
            ₹{Number(student.total_billed).toFixed(2)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-slate-700 font-medium block truncate">
            {Number(student.active_admissions_count) > 0 ? 'Active courses fee' : 'No active courses'}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 border-l-4 border-l-emerald-600 p-3 sm:p-3.5 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
            Total Fees Paid
          </span>
          <div className="text-lg sm:text-xl font-bold text-emerald-800 mt-0.5 break-all sm:break-normal">
            ₹{Number(student.total_paid).toFixed(2)}
          </div>
          <span className="text-[10px] sm:text-[11px] text-emerald-700 font-medium block truncate">
            {Number(student.total_refunded) > 0
              ? `Net: ₹${Number(student.net_paid !== undefined ? student.net_paid : student.total_paid - student.total_refunded).toFixed(2)}`
              : 'Total collected'}
          </span>
        </div>

        {Number(student.total_refunded) > 0 && (
          <div className="bg-white rounded-xl border border-rose-200 border-l-4 border-l-rose-500 p-3 sm:p-3.5 shadow-xs">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
              Total Refunded
            </span>
            <div className="text-lg sm:text-xl font-bold text-rose-800 mt-0.5 break-all sm:break-normal">
              ₹{Number(student.total_refunded).toFixed(2)}
            </div>
            <span className="text-[10px] sm:text-[11px] text-rose-700 font-medium block">Returned to student</span>
          </div>
        )}

        <div className={`bg-white rounded-xl border ${Number(student.total_balance_due) > 0 ? 'border-rose-300 border-l-4 border-l-rose-600' : 'border-slate-200 border-l-4 border-l-slate-400'} p-3 sm:p-3.5 shadow-xs ${Number(student.total_refunded) > 0 ? 'col-span-2 sm:col-span-1' : 'col-span-2 sm:col-span-1 lg:col-span-1'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider block ${Number(student.total_balance_due) > 0 ? 'text-rose-900' : 'text-slate-700'}`}>
              Current Balance Due
            </span>
            {Number(student.expired_balance_due || enrollmentData?.expired_due_total || 0) > 0 && (
              <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.2 rounded uppercase">
                Overdue
              </span>
            )}
          </div>
          <div className={`text-lg sm:text-xl font-bold mt-0.5 break-all sm:break-normal ${Number(student.total_balance_due) > 0 ? 'text-rose-700' : 'text-black'}`}>
            ₹{Number(student.total_balance_due).toFixed(2)}
          </div>
          <span className={`text-[10px] sm:text-[11px] font-medium block ${Number(student.total_balance_due) > 0 ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}>
            {Number(student.expired_balance_due || enrollmentData?.expired_due_total || 0) > 0
              ? `Includes ₹${Number(student.expired_balance_due || enrollmentData?.expired_due_total).toFixed(2)} Overdue / Expired`
              : Number(student.total_balance_due) > 0
              ? 'Pending payment • Due'
              : 'All active fees cleared ✓'}
          </span>
        </div>
      </div>
      )}

      {/* Two Column Section: Profile Details + Green Card Pass info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Student Bio Card */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-slate-100 pb-2">
            Personal & Contact Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
            <div>
              <span className="text-slate-700 font-semibold block text-[11px]">Contact Phone:</span>
              <span className="font-mono font-bold text-black text-xs sm:text-sm">
                {student.mobile || 'Not provided'}
              </span>
            </div>
            <div>
              <span className="text-slate-700 font-semibold block text-[11px]">Email Address:</span>
              <span className="text-black font-semibold text-xs sm:text-sm break-all">{student.email || 'Not provided (optional)'}</span>
            </div>
            <div>
              <span className="text-slate-700 font-semibold block text-[11px]">Date of Birth:</span>
              <span className="text-black font-semibold text-xs sm:text-sm">{student.dob || '—'}</span>
            </div>
            <div>
              <span className="text-slate-700 font-semibold block text-[11px]">Registration Date:</span>
              <span className="text-black font-semibold text-xs sm:text-sm">{student.registration_date}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-700 font-semibold block text-[11px]">Residential Address:</span>
              <span className="text-black font-semibold text-xs sm:text-sm">{student.address || '—'}</span>
            </div>
          </div>
        </div>

        {/* Green Card Membership Box */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-purple-600 shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                Green Card Pass Status
              </h2>
            </div>

            {student.has_green_card ? (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1.5 text-xs">
                <Badge variant="purple">ACTIVE ALL-ACCESS PASS</Badge>
                <p className="text-purple-950 font-semibold pt-0.5">
                  Student is entitled to attend all active subjects.
                </p>
                <p className="text-slate-800 text-[11px]">
                  Pass Valid Till: <strong className="text-black font-mono">{student.green_card_expiry || 'Permanent'}</strong>
                </p>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 space-y-2">
                <p className="font-medium">No active Green Card membership.</p>
                {!isRevoked && !isTeacher && (
                  <Button
                    size="xs"
                    variant="teal-soft"
                    onClick={() =>
                      navigate(
                        `/enrollments/new?student_id=${student.id}&item_type=GREEN_CARD`
                      )
                    }
                    className="w-full justify-center"
                  >
                    Purchase Green Card
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overdue / Expired Fees Due Banner */}
      {Number(enrollmentData?.expired_due_total || student?.expired_balance_due || 0) > 0 && (
        <div className="bg-rose-50/90 border-2 border-rose-300 rounded-xl p-3.5 sm:p-4 text-xs shadow-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <div>
                <span className="font-bold text-rose-900 text-sm">
                  Overdue / Expired Course Fee Due: ₹{Number(enrollmentData?.expired_due_total || student?.expired_balance_due).toFixed(2)}
                </span>
                <span className="ml-2 inline-block text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300">
                  Expired Due
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              {!isRevoked && (
                <Button
                  size="xs"
                  variant="success"
                  icon={CreditCard}
                  onClick={() => {
                    const overdueItem = (enrollmentData?.historical_subjects || []).find((h) => Number(h.balance_due) > 0);
                    if (overdueItem?.admission_id) {
                      setTargetAdmissionId(overdueItem.admission_id);
                    }
                    setPayModalOpen(true);
                  }}
                  className="font-bold"
                >
                  Pay Expired Due (₹{Number(enrollmentData?.expired_due_total || student?.expired_balance_due).toFixed(0)})
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="xs"
                  variant="warning"
                  icon={Sparkles}
                  onClick={() => {
                    const overdueItem = (enrollmentData?.historical_subjects || []).find((h) => Number(h.balance_due) > 0);
                    const dueAdm = overdueItem?.admission_id
                      ? admissions.find((a) => a.id === overdueItem.admission_id)
                      : admissions.find((a) => Number(a.balance_due) > 0);
                    if (dueAdm) {
                      setSelectedAdmissionForWaive(dueAdm);
                    }
                    setWaiveModalOpen(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold border-amber-600"
                  title="Admin only: Waive / forgive pending fee due"
                >
                  Waive Due
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-rose-800 font-medium">
            Course validity period has expired, but outstanding unpaid dues remain active and collectible. Review subject details below or collect fee payment.
          </p>
        </div>
      )}

      {/* 1. Prominent Current Enrollment Card */}
      <div className="bg-white border-2 border-purple-200 rounded-xl p-3.5 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-purple-100 gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-odoo-700 shrink-0 mt-0.5 sm:mt-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-black break-words">Current Institute Enrollment</h2>
                <span className="font-mono text-xs font-bold bg-purple-100 text-odoo-800 px-2 py-0.5 rounded border border-purple-200 shrink-0">
                  {enrollmentData?.enrollment_number || `ENR-${student?.student_code}`}
                </span>
                <Badge variant={enrollmentData?.is_student_active ? 'success' : 'neutral'}>
                  {enrollmentData?.is_student_active ? 'Active Enrollment' : 'Inactive / Between Cycles'}
                </Badge>
              </div>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Active subjects currently attended by the student with independent fee validity periods
              </p>
            </div>
          </div>

          {!isRevoked && !isTeacher && (
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                onClick={() =>
                  navigate(
                    `/enrollments/new?student_id=${student.id}&name=${encodeURIComponent(
                      student.name
                    )}`
                  )
                }
                className="w-full sm:w-auto justify-center"
              >
                Add / Enroll Subject
              </Button>
            </div>
          )}
        </div>

        {/* Active Green Card Pass Banner */}
        {activeGreenCard && (() => {
          const gcDays = computeDaysRemaining(activeGreenCard.valid_to, activeGreenCard.valid_from) ?? activeGreenCard.days_remaining;
          return (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-100 border border-purple-300 flex items-center justify-center text-purple-700 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs text-purple-950">Active Green Card All-Access Pass</span>
                  <Badge variant="purple" size="xs">ALL ACCESS</Badge>
                </div>
                <p className="text-[11px] text-purple-900 font-medium mt-0.5">
                  Entitled to attend all classes & subjects • Pass validity:{' '}
                  <span className="font-mono font-bold text-purple-950">
                    {activeGreenCard.valid_from} → {activeGreenCard.valid_to}
                  </span>
                  {gcDays !== null && gcDays !== undefined && !['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes(activeGreenCard.status) && (
                    <span className="ml-1.5 px-1.5 py-0.2 rounded bg-purple-200/70 text-purple-900 font-bold font-mono text-[10px]">
                      {gcDays}d remaining
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 text-left sm:text-right text-xs">
              <div>
                <span className="font-mono font-bold text-purple-950 block">
                  ₹{Number(activeGreenCard.net_price).toFixed(2)}
                </span>
                {Number(activeGreenCard.balance_due) > 0 ? (
                  <span className="text-[11px] font-mono text-rose-700 font-bold block">
                    Due: ₹{Number(activeGreenCard.balance_due).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-800 font-bold block">
                    ✓ Fully Paid
                  </span>
                )}
                <span className="text-[10px] text-purple-700 font-mono block">
                  Invoice #{activeGreenCard.admission_number}
                </span>
              </div>
              {Number(activeGreenCard.balance_due) > 0 && !isRevoked && (
                <Button
                  size="xs"
                  variant="success"
                  icon={CreditCard}
                  onClick={() => {
                    setTargetAdmissionId(activeGreenCard.admission_id);
                    setPayModalOpen(true);
                  }}
                  title="Collect pending Green Card pass fee"
                >
                  Pay Due
                </Button>
              )}
            </div>
          </div>
          );
        })()}

        {/* Active Subjects Content: Mobile Cards + Desktop Table */}
        {activeSubjects.length === 0 ? (
          <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
            <p className="text-xs text-slate-800 font-semibold">
              No currently active subjects. The student is inactive or between validity cycles.
            </p>
            <p className="text-[11px] text-slate-600">
              Past subject history, marks, and invoices are preserved below. Renew any previous subject or add a new subject to reactivate enrollment.
            </p>
            {!isRevoked && (
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                className="mt-2"
                onClick={() =>
                  navigate(`/enrollments/new?student_id=${student.id}&name=${encodeURIComponent(student.name)}`)
                }
              >
                Enroll in a Subject
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile Cards (Phone View) */}
            <div className="block sm:hidden space-y-1.5">
              {activeSubjects.map((item) => {
                const periods = Array.isArray(item.validity_periods) && item.validity_periods.length > 0
                  ? item.validity_periods
                  : [{ valid_from: item.valid_from, valid_to: item.valid_to, item_id: item.id }];
                const daysRem = (item.validity_periods?.length ? computeDaysRemainingForPeriods(periods) : null)
                  ?? computeDaysRemaining(item.valid_to, item.valid_from)
                  ?? item.days_remaining;
                const latestOwnPeriod = periods.find((p) => p.item_id === item.id) || periods[periods.length - 1];
                return (
                <div key={item.id} className="bg-slate-50/80 border border-purple-200 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-black text-xs leading-tight flex items-center gap-1.5 flex-wrap">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>{item.subject_name}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-odoo-800 bg-purple-100/70 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-bold">
                          #{item.admission_number}
                        </span>
                        {item.source_demo_number && (
                          <span className="text-[10px] text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-semibold">
                            Demo {item.source_demo_number}
                          </span>
                        )}
                        {item.is_renewed && (
                          <Badge variant="success" size="xs">
                            Renewed ({item.cycle_count} Mo)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs bg-white px-2 py-1.5 rounded-md border border-slate-200 leading-tight">
                    <div>
                      <span className="text-[10px] text-slate-700 font-semibold block uppercase">Faculty / Hall</span>
                      <div className="text-black font-semibold truncate">
                        {item.teacher_name || 'General / Unassigned'}
                      </div>
                      {item.hall_number && (
                        <span className="text-[10px] text-slate-700 block font-mono">{item.hall_number}</span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-700 font-semibold block uppercase">Validity</span>
                      <div className="font-mono text-black font-semibold text-[11px] space-y-0.5">
                        {periods.map((p, pIdx) => {
                          const gapDays = pIdx > 0 ? computeGapDays(periods[pIdx - 1].valid_to, p.valid_from) : 0;
                          return (
                            <React.Fragment key={p.item_id || pIdx}>
                              {gapDays > 0 && (
                                <div className="text-[9px] font-sans font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-0.2 inline-block">
                                  Gap: {gapDays}d inactive
                                </div>
                              )}
                              <div>{p.valid_from} → {p.valid_to}</div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {daysRem !== null && daysRem !== undefined && !['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes(item.status) && (
                        <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded font-bold text-[10px] ${
                          daysRem <= 3 ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          daysRem <= 7 ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {daysRem}d remaining
                        </span>
                      )}
                      {['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes(item.status) && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded font-bold text-[10px] bg-rose-50 text-rose-800 border border-rose-200">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Financials Strip */}
                  {!isTeacher && (
                  <div className="flex items-center justify-between bg-white px-2 py-1 rounded-md border border-slate-200 text-xs font-mono leading-tight">
                    <div>
                      <span className="text-[10px] text-slate-700 block font-sans font-semibold">Fee</span>
                      <span className="font-bold text-black">₹{Number(item.net_price).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-700 block font-sans font-semibold">Paid</span>
                      <span className="font-bold text-emerald-800">₹{Number(item.amount_collected).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-700 block font-sans font-semibold">Due</span>
                      <span className={`font-bold ${Number(item.balance_due) > 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                        ₹{Number(item.balance_due).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  )}

                  {/* Actions Grid */}
                  {!isTeacher && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {Number(item.balance_due) > 0 && !isRevoked && (
                      <Button
                        size="xs"
                        variant="success-soft"
                        icon={CreditCard}
                        onClick={() => {
                          setTargetAdmissionId(item.admission_id);
                          setPayModalOpen(true);
                        }}
                        className="flex-1 justify-center"
                      >
                        Pay Due
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="success-soft"
                      icon={RefreshCw}
                      onClick={() => {
                        setSelectedItemForRenew(item);
                        setRenewModalOpen(true);
                      }}
                      className="flex-1 justify-center"
                    >
                      Renew
                    </Button>
                    <Button
                      size="xs"
                      variant="indigo"
                      icon={Calendar}
                      onClick={() => {
                        setSelectedItemForValidity(
                          latestOwnPeriod
                            ? { ...item, valid_from: latestOwnPeriod.valid_from, valid_to: latestOwnPeriod.valid_to }
                            : item
                        );
                        setValidityModalOpen(true);
                      }}
                      className="flex-1 justify-center"
                    >
                      Dates
                    </Button>
                    {isAdmin && !isRevoked && item.can_cancel !== false && (
                      <Button
                        size="xs"
                        variant="danger-soft"
                        loading={cancellingItemLoadingId === item.id}
                        onClick={() => handleOpenItemCancel(item)}
                        className="flex-1 justify-center"
                        title="Cancel this subject enrollment"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Desktop Table (Tablet / Desktop View) */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-purple-200">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-purple-50/70 text-odoo-900 font-bold border-b border-purple-200">
                  <tr>
                    <th className="py-2.5 px-3">Subject / Course</th>
                    <th className="py-2.5 px-3">Assigned Faculty</th>
                    <th className="py-2.5 px-3">Validity Coverage</th>
                    {!isTeacher && <th className="py-2.5 px-3 text-right">Fee</th>}
                    {!isTeacher && <th className="py-2.5 px-3 text-right">Paid</th>}
                    {!isTeacher && <th className="py-2.5 px-3 text-right">Balance Due</th>}
                    {!isTeacher && <th className="py-2.5 px-3 text-center">Lifecycle Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {activeSubjects.map((item) => {
                    const periods = Array.isArray(item.validity_periods) && item.validity_periods.length > 0
                      ? item.validity_periods
                      : [{ valid_from: item.valid_from, valid_to: item.valid_to, item_id: item.id }];
                    const daysRem = (item.validity_periods?.length ? computeDaysRemainingForPeriods(periods) : null)
                      ?? computeDaysRemaining(item.valid_to, item.valid_from)
                      ?? item.days_remaining;
                    const latestOwnPeriod = periods.find((p) => p.item_id === item.id) || periods[periods.length - 1];
                    return (
                    <tr key={item.id} className="hover:bg-purple-50/30 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-black flex items-center gap-1.5 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                          <span>{item.subject_name}</span>
                          {item.is_renewed && (
                            <Badge variant="success" size="xs">
                              Renewed ({item.cycle_count} Months)
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-odoo-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-bold">
                            Invoice #{item.admission_number}
                          </span>
                          {item.source_demo_number && (
                            <span className="text-[10px] text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-semibold">
                              Demo {item.source_demo_number}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-900 font-semibold">
                          {item.teacher_name || 'Unassigned / General'}
                        </div>
                        {item.hall_number && (
                          <span className="text-[10px] text-slate-700 block font-mono">Hall: {item.hall_number}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-slate-900 font-bold space-y-0.5">
                          {periods.map((p, pIdx) => {
                            const gapDays = pIdx > 0 ? computeGapDays(periods[pIdx - 1].valid_to, p.valid_from) : 0;
                            return (
                              <React.Fragment key={p.item_id || pIdx}>
                                {gapDays > 0 && (
                                  <div>
                                    <span className="text-[9px] font-sans font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2 inline-block">
                                      Gap: {gapDays}d inactive
                                    </span>
                                  </div>
                                )}
                                <div>{p.valid_from} → {p.valid_to}</div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                        <div className="text-[10px] mt-0.5">
                          {daysRem !== null && daysRem !== undefined && !['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes(item.status) ? (
                            <span className={`px-1.5 py-0.2 rounded font-bold ${
                              daysRem <= 3 ? 'bg-rose-100 text-rose-800' :
                              daysRem <= 7 ? 'bg-amber-100 text-amber-800' :
                              'bg-emerald-100 text-emerald-800'
                            }`}>
                              {daysRem}d remaining
                            </span>
                          ) : ['CANCELLED', 'REVOKED', 'DISCONTINUED'].includes(item.status) ? (
                            <span className="px-1.5 py-0.2 rounded font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              Cancelled
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {!isTeacher && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-black">
                        ₹{Number(item.net_price).toFixed(2)}
                      </td>
                      )}
                      {!isTeacher && (
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 font-bold">
                        ₹{Number(item.amount_collected).toFixed(2)}
                      </td>
                      )}
                      {!isTeacher && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        <span className={Number(item.balance_due) > 0 ? 'text-rose-700' : 'text-slate-500'}>
                          ₹{Number(item.balance_due).toFixed(2)}
                        </span>
                      </td>
                      )}
                      {!isTeacher && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {Number(item.balance_due) > 0 && !isRevoked && (
                            <Button
                              size="xs"
                              variant="success-soft"
                              icon={CreditCard}
                              onClick={() => {
                                setTargetAdmissionId(item.admission_id);
                                setPayModalOpen(true);
                              }}
                              title={`Pay pending due fee of ₹${Number(item.balance_due).toFixed(0)}`}
                            >
                              Pay Due
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="success-soft"
                            icon={RefreshCw}
                            onClick={() => {
                              setSelectedItemForRenew(item);
                              setRenewModalOpen(true);
                            }}
                            title="Renew Subject Validity"
                          >
                            Renew
                          </Button>
                          <Button
                            size="xs"
                            variant="indigo"
                            icon={Calendar}
                            onClick={() => {
                              setSelectedItemForValidity(
                                latestOwnPeriod
                                  ? { ...item, valid_from: latestOwnPeriod.valid_from, valid_to: latestOwnPeriod.valid_to }
                                  : item
                              );
                              setValidityModalOpen(true);
                            }}
                            title="Adjust Validity Dates"
                          >
                            Dates
                          </Button>
                          {isAdmin && !isRevoked && item.can_cancel !== false && (
                            <Button
                              size="xs"
                              variant="danger-soft"
                              loading={cancellingItemLoadingId === item.id}
                              onClick={() => handleOpenItemCancel(item)}
                              title="Cancel this subject enrollment"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Active Totals Footer */}
            {!isTeacher && (
            <div className="bg-purple-50/70 border border-purple-200 p-3 sm:p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="font-bold text-odoo-900">
                Active Subjects Summary ({activeSubjects.length} active)
              </span>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-mono font-bold text-xs">
                <span className="text-black bg-white px-2 py-0.5 rounded border border-purple-200">
                  Total Fee: ₹{Number(enrollmentData.active_totals.total_fee).toFixed(2)}
                </span>
                <span className="text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Total Paid: ₹{Number(enrollmentData.active_totals.total_paid).toFixed(2)}
                </span>
                <span className={`bg-white px-2 py-0.5 rounded border ${Number(enrollmentData.active_totals.total_due) > 0 ? 'text-rose-700 border-rose-200' : 'text-slate-700 border-slate-200'}`}>
                  Active Due: ₹{Number(enrollmentData.active_totals.total_due).toFixed(2)}
                </span>
                {Number(enrollmentData.expired_due_total || 0) > 0 && (
                  <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-300 font-bold">
                    Expired Due: ₹{Number(enrollmentData.expired_due_total).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Main Navigation Tabs */}
      {isTeacher ? (
        <div className="grid grid-cols-1 gap-1 p-1 bg-slate-100 rounded-xl sm:bg-transparent sm:p-0 sm:border-b sm:border-slate-200 sm:flex sm:items-center sm:gap-2 sm:rounded-none">
          <button
            onClick={() => setActiveMainTab('DEMOS')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
              activeMainTab === 'DEMOS'
                ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
                : 'text-slate-700 hover:text-black sm:border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
            <span>Active Demos</span>
            {demos.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-100 text-purple-900 font-mono font-bold">
                {demos.length}
              </span>
            )}
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 bg-slate-100 rounded-xl sm:bg-transparent sm:p-0 sm:border-b sm:border-slate-200 sm:flex sm:items-center sm:gap-2 sm:rounded-none">
        <button
          onClick={() => setActiveMainTab('HISTORY')}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
            activeMainTab === 'HISTORY'
              ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
              : 'text-slate-700 hover:text-black sm:border-transparent'
          }`}
        >
          <History className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
          <span>
            <span className="hidden sm:inline">Subject & Enrollment </span>History
          </span>
          {enrollmentData?.historical_subjects?.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-black font-mono font-bold">
              {enrollmentData.historical_subjects.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('DEMOS')}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
            activeMainTab === 'DEMOS'
              ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
              : 'text-slate-700 hover:text-black sm:border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
          <span>Demos</span>
          {demos.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-100 text-purple-900 font-mono font-bold">
              {demos.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('INVOICES')}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
            activeMainTab === 'INVOICES'
              ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
              : 'text-slate-700 hover:text-black sm:border-transparent'
          }`}
        >
          <FileText className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
          <span>
            Invoices<span className="hidden sm:inline"> & Purchases</span>
          </span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-black font-mono font-bold">
            {admTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('LEDGER')}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
            activeMainTab === 'LEDGER'
              ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
              : 'text-slate-700 hover:text-black sm:border-transparent'
          }`}
        >
          <Receipt className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
          <span>
            Ledger<span className="hidden sm:inline"> & Receipts</span>
          </span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-black font-mono font-bold">
            {txnTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('AUDIT')}
          className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold rounded-lg sm:rounded-none sm:border-b-2 transition ${
            activeMainTab === 'AUDIT'
              ? 'bg-white shadow-xs text-odoo-800 sm:bg-transparent sm:shadow-none sm:border-odoo-600 sm:text-odoo-700'
              : 'text-slate-700 hover:text-black sm:border-transparent'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-odoo-600" />
          <span>
            <span className="hidden sm:inline">Student </span>Audit Trail
          </span>
          {auditTotal > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-black font-mono font-bold">
              {auditTotal}
            </span>
          )}
        </button>
      </div>
      )}

      {/* TAB 1: Subject & Enrollment History */}
      {!isTeacher && activeMainTab === 'HISTORY' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
          <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-odoo-600" />
                <h2 className="text-sm font-bold text-black">Subject & Enrollment History</h2>
              </div>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Preserved record of all historical, expired, suspended, discontinued, or revoked subjects
              </p>
            </div>

            {!isRevoked && (
              <Button
                size="xs"
                variant="primary"
                icon={Plus}
                onClick={() =>
                  navigate(
                    `/enrollments/new?student_id=${student.id}&name=${encodeURIComponent(
                      student.name
                    )}`
                  )
                }
                className="w-full sm:w-auto justify-center"
              >
                Enroll Another Subject
              </Button>
            )}
          </div>

          {!enrollmentData?.historical_subjects || enrollmentData.historical_subjects.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-700 font-medium">
              No past or inactive subject records. All current subjects (if any) are active.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile Cards for History */}
              <div className="block sm:hidden space-y-2.5">
                {enrollmentData.historical_subjects.map((item) => {
                  const isSuspended = item.status === 'SUSPENDED';
                  const isDiscontinued = item.status === 'DISCONTINUED';
                  const isCancelled = item.status === 'REVOKED' || item.status === 'CANCELLED';
                  const isExpired = item.is_expired || item.status === 'EXPIRED';
                  const hasDue = Number(item.balance_due) > 0;

                  let statusBadge = (
                    <Badge variant="neutral">{item.status}</Badge>
                  );
                  if (isSuspended) statusBadge = <Badge variant="warning">Suspended</Badge>;
                  else if (isDiscontinued) statusBadge = <Badge variant="neutral">Discontinued</Badge>;
                  else if (isCancelled) statusBadge = <Badge variant="danger">Cancelled</Badge>;
                  else if (isExpired && hasDue) statusBadge = <Badge variant="danger">Expired (Overdue)</Badge>;
                  else if (isExpired) statusBadge = <Badge variant="danger">Expired</Badge>;

                  return (
                    <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-black text-xs">{item.subject_name}</div>
                          <span className="text-[10px] text-slate-700 font-mono block">
                            #{item.admission_number}
                          </span>
                          {item.source_demo_number && (
                            <span className="inline-block text-[10px] text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-semibold mt-0.5">
                              Demo {item.source_demo_number}
                            </span>
                          )}
                        </div>
                        <div>{statusBadge}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-700 font-semibold block uppercase">Faculty</span>
                          <span className="text-black font-semibold truncate block">{item.teacher_name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-700 font-semibold block uppercase">Validity</span>
                          <span className="font-mono text-black font-semibold text-[11px] block">
                            {item.valid_from || '—'} → {item.valid_to || '—'}
                          </span>
                        </div>
                      </div>

                      {item.lifecycle_reason && (
                        <div className="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                          <span className="font-semibold block text-[10px] uppercase text-slate-700">Reason / Notes</span>
                          {item.lifecycle_reason}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs font-mono bg-white p-2 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-700 font-sans font-semibold block">Fee</span>
                          <span className="font-bold text-black">₹{Number(item.net_price).toFixed(2)}</span>
                        </div>
                        {Number(item.balance_due) > 0 && (
                          <div className="text-right">
                            <span className="text-[10px] text-rose-700 font-sans font-bold block uppercase">
                              {isExpired ? 'Expired Due' : 'Due'}
                            </span>
                            <span className="font-bold text-rose-700">₹{Number(item.balance_due).toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        {isSuspended && isAdmin && (
                          <Button
                            size="xs"
                            variant="success"
                            icon={PlayCircle}
                            loading={resumingItemId === item.id}
                            onClick={() => handleResumeItem(item)}
                            className="flex-1 justify-center"
                          >
                            Resume
                          </Button>
                        )}
                        {hasDue && !isCancelled && !isRevoked && (
                          <Button
                            size="xs"
                            variant="success"
                            icon={CreditCard}
                            onClick={() => {
                              setTargetAdmissionId(item.admission_id);
                              setPayModalOpen(true);
                            }}
                            className="flex-1 justify-center"
                          >
                            Pay Due (₹{Number(item.balance_due).toFixed(0)})
                          </Button>
                        )}
                        {!isCancelled && !isDiscontinued && (
                          <Button
                            size="xs"
                            variant="success-soft"
                            icon={RefreshCw}
                            onClick={() => {
                              setSelectedItemForRenew(item);
                              setRenewModalOpen(true);
                            }}
                            className="flex-1 justify-center"
                          >
                            Renew
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table for History */}
              <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Faculty</th>
                      <th className="py-2.5 px-3">Validity Period</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Reason / Details</th>
                      <th className="py-2.5 px-3 text-right">Fee / Due</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {enrollmentData.historical_subjects.map((item) => {
                      const isSuspended = item.status === 'SUSPENDED';
                      const isDiscontinued = item.status === 'DISCONTINUED';
                      const isCancelled = item.status === 'REVOKED' || item.status === 'CANCELLED';
                      const isExpired = item.is_expired || item.status === 'EXPIRED';
                      const hasDue = Number(item.balance_due) > 0;

                      let statusBadge = (
                        <Badge variant="neutral">{item.status}</Badge>
                      );
                      if (isSuspended) statusBadge = <Badge variant="warning">Suspended</Badge>;
                      else if (isDiscontinued) statusBadge = <Badge variant="neutral">Discontinued</Badge>;
                      else if (isCancelled) statusBadge = <Badge variant="danger">Cancelled</Badge>;
                      else if (isExpired && hasDue) statusBadge = <Badge variant="danger">Expired (Overdue)</Badge>;
                      else if (isExpired) statusBadge = <Badge variant="danger">Expired</Badge>;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-bold text-black">
                            {item.subject_name}
                            <span className="block text-[10px] text-slate-700 font-mono">
                              #{item.admission_number}
                            </span>
                            {item.source_demo_number && (
                              <span className="inline-block text-[10px] text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded font-mono font-semibold mt-0.5">
                                Demo {item.source_demo_number}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">
                            {item.teacher_name || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-800 font-medium">
                            {item.valid_from || '—'} → {item.valid_to || '—'}
                          </td>
                          <td className="py-2.5 px-3">{statusBadge}</td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">
                            {item.lifecycle_reason || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            <span className="text-black font-bold">₹{Number(item.net_price).toFixed(2)}</span>
                            {Number(item.balance_due) > 0 && (
                              <span className="block text-[10px] text-rose-700 font-bold">
                                {isExpired ? 'Expired Due: ' : 'Due: '}₹{Number(item.balance_due).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isSuspended && isAdmin && (
                                <Button
                                  size="xs"
                                  variant="success-soft"
                                  icon={PlayCircle}
                                  loading={resumingItemId === item.id}
                                  onClick={() => handleResumeItem(item)}
                                >
                                  Resume
                                </Button>
                              )}
                              {hasDue && !isCancelled && !isRevoked && (
                                <Button
                                  size="xs"
                                  variant="success-soft"
                                  icon={CreditCard}
                                  onClick={() => {
                                    setTargetAdmissionId(item.admission_id);
                                    setPayModalOpen(true);
                                  }}
                                  title="Collect outstanding balance"
                                >
                                  Pay Due
                                </Button>
                              )}
                              {!isCancelled && !isDiscontinued && (
                                <Button
                                  size="xs"
                                  variant="success-soft"
                                  icon={RefreshCw}
                                  onClick={() => {
                                    setSelectedItemForRenew(item);
                                    setRenewModalOpen(true);
                                  }}
                                >
                                  Renew
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Demos Section in History Tab */}
          {demos.length > 0 && (
            <div className="pt-2">
              {renderDemosSection()}
            </div>
          )}
        </div>
      )}

      {/* TAB: Demos */}
      {activeMainTab === 'DEMOS' && (
        renderDemosSection()
      )}

      {/* TAB 2: Invoices & Billing History */}
      {!isTeacher && activeMainTab === 'INVOICES' && (
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-black">Invoices & Billing History</h2>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              Permanent financial ledger of all admission invoices, fee payments, and printable receipts
            </p>
          </div>

          {!isRevoked && (
            <Button
              size="xs"
              variant="primary"
              icon={Plus}
              onClick={() =>
                navigate(
                  `/enrollments/new?student_id=${student.id}&name=${encodeURIComponent(
                    student.name
                  )}`
                )
              }
              className="w-full sm:w-auto justify-center"
            >
              New Enrollment / Invoice
            </Button>
          )}
        </div>

        {/* Admissions Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search purchase #, course, or teacher..."
                value={admSearch}
                onChange={(e) => setAdmSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setAdmPage(1);
                    fetchAdmissionsData(1, admPageSize, admSearch, admStatusFilter);
                  }
                }}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-black placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
              />
              {admSearch && (
                <button
                  onClick={() => {
                    setAdmSearch('');
                    setAdmPage(1);
                    fetchAdmissionsData(1, admPageSize, '', admStatusFilter);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-black"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={admStatusFilter}
              onChange={(e) => {
                setAdmStatusFilter(e.target.value);
                setAdmPage(1);
              }}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-black font-medium focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Fully Paid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="UNPAID">Unpaid</option>
              <option value="CANCELLED">Cancelled / Revoked</option>
            </select>
          </div>

          <div className="text-xs text-slate-700 font-medium">
            Total Purchases: <strong className="text-black font-mono font-bold">{admTotal}</strong>
          </div>
        </div>

        {admLoading ? (
          <div className="py-8 text-center text-xs text-slate-700 space-y-2">
            <div className="w-5 h-5 border-2 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="font-semibold">Loading course purchases...</p>
          </div>
        ) : admissions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-700 font-medium">
            No course purchases found matching your filter criteria.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile Cards for Invoices */}
            <div className="block sm:hidden space-y-3">
              {admissions.map((adm) => {
                const isPurchaseCancelled = adm.status === 'REVOKED' || adm.status === 'CANCELLED';
                const validity = getValidityStatus(adm);
                const canCancelPurchase = Boolean(adm.can_cancel && (adm.items?.length > 0 ? adm.items.every((i) => i.can_cancel) : true));
                return (
                  <div
                    key={adm.id}
                    className={`border rounded-xl p-3 space-y-2.5 ${
                      isPurchaseCancelled ? 'bg-rose-50/50 border-rose-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-black text-xs block">
                          {adm.purchase_transaction_id || adm.admission_number}
                        </span>
                        <span className="text-[11px] text-slate-700 font-medium block">
                          {adm.admission_date}
                        </span>
                      </div>
                      <div className="text-right space-y-1">
                        {isPurchaseCancelled ? (
                          <div className="space-y-0.5">
                            <Badge size="xs" variant="danger">
                              CANCELLED
                            </Badge>
                            {getCleanCancelReason(adm.revocation_reason) && (
                              <div
                                className="text-[10px] text-rose-700 italic max-w-[120px] truncate"
                                title={getCleanCancelReason(adm.revocation_reason)}
                              >
                                {getCleanCancelReason(adm.revocation_reason)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge
                            size="xs"
                            variant={
                              adm.payment_status === 'PAID'
                                ? 'success'
                                : adm.payment_status === 'PARTIALLY_PAID'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {adm.payment_status === 'PARTIALLY_PAID' ? 'PARTIAL PAID' : adm.payment_status}
                          </Badge>
                        )}
                        {validity.subtext && !isPurchaseCancelled && (
                          <div className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            validity.badgeVariant === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : validity.badgeVariant === 'warning'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {validity.subtext}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Courses / Items */}
                    <div className="space-y-1.5">
                      {(adm.items || []).map((itm, i) => (
                        <div
                          key={i}
                          className="bg-white border border-slate-200 text-black p-2 rounded-lg text-xs"
                        >
                          <span className="font-bold text-odoo-900 block">{itm.item_name_snapshot}</span>
                          {itm.source_demo_number && (
                            <span className="inline-block text-[10px] font-mono font-semibold text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded mt-0.5">
                              Demo {itm.source_demo_number}
                            </span>
                          )}
                          {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                            <span className="text-[11px] text-slate-700 font-medium block mt-0.5">
                              {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                              {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                              {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                            </span>
                          )}
                          {itm.valid_from && itm.valid_to && (
                            <span className="text-[10px] text-emerald-800 font-mono font-bold block mt-0.5">
                              Period: {itm.valid_from} to {itm.valid_to}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Financial Summary */}
                    <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-slate-700 font-sans font-semibold block">Payable</span>
                        <span className="font-bold text-black">₹{Number(adm.total_payable).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-700 font-sans font-semibold block">Paid</span>
                        <span className="font-bold text-emerald-800">₹{Number(adm.amount_paid).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-700 font-sans font-semibold block">Due</span>
                        <span className={`font-bold ${isPurchaseCancelled ? 'line-through text-slate-400' : Number(adm.balance_due) > 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                          ₹{isPurchaseCancelled ? '0.00' : Number(adm.balance_due).toFixed(2)}
                        </span>
                        {Number(adm.balance_due) > 0 && !isPurchaseCancelled && (adm.status === 'EXPIRED' || validity.isExpired) && (
                          <span className="block text-[9px] font-bold text-rose-800 uppercase bg-rose-100 border border-rose-300 px-1 rounded mt-0.5">
                            Expired
                          </span>
                        )}
                        {Number(adm.written_off_amount) > 0 && !isPurchaseCancelled && (
                          <span className="block text-[9px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1 rounded mt-0.5">
                            ₹{Number(adm.written_off_amount).toFixed(0)} waived
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Button
                        size="xs"
                        variant="purple"
                        icon={FileText}
                        onClick={() => {
                          setSelectedAdmissionForSlips(adm);
                          setAllSlipsModalOpen(true);
                        }}
                        className="flex-1 justify-center"
                      >
                        All Slips ▾
                      </Button>

                      {Number(adm.balance_due) > 0 && !isPurchaseCancelled && !isRevoked && (
                        <Button
                          size="xs"
                          variant="success-soft"
                          icon={CreditCard}
                          onClick={() => {
                            setTargetAdmissionId(adm.id);
                            setPayModalOpen(true);
                          }}
                          className="flex-1 justify-center"
                        >
                          Pay Due (₹{Number(adm.balance_due).toFixed(0)})
                        </Button>
                      )}

                      {isAdmin && Number(adm.balance_due) > 0 && !isPurchaseCancelled && (
                        <Button
                          size="xs"
                          variant="amber"
                          icon={Sparkles}
                          onClick={() => {
                            setSelectedAdmissionForWaive(adm);
                            setWaiveModalOpen(true);
                          }}
                          className="flex-1 justify-center"
                          title="Admin only: Waive / forgive pending fee due"
                        >
                          Waive Due
                        </Button>
                      )}

                      {isPurchaseCancelled ? (
                        <>
                          {isAdmin && Number(adm.amount_paid) > 0 && (
                            <Button
                              size="xs"
                              variant="orange"
                              onClick={() => {
                                setSelectedAdmissionForRefund(adm);
                                setRefundModalOpen(true);
                              }}
                              className="flex-1 justify-center"
                            >
                              Refund
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="xs"
                              variant="info"
                              icon={RotateCcw}
                              loading={restoringPurchaseId === adm.id}
                              onClick={() => handleRestorePurchase(adm)}
                              className="flex-1 justify-center"
                            >
                              Restore
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {isAdmin && canCancelPurchase && (
                            <Button
                              size="xs"
                              variant="danger-soft"
                              onClick={() => {
                                setSelectedAdmissionForPurchaseCancel(adm);
                                setCancelPurchaseModalOpen(true);
                              }}
                              className="flex-1 justify-center"
                            >
                              Cancel Purchase
                            </Button>
                          )}
                          {isAdmin && Number(adm.amount_paid) > 0 && (
                            <Button
                              size="xs"
                              variant="orange"
                              onClick={() => {
                                setSelectedAdmissionForRefund(adm);
                                setRefundModalOpen(true);
                              }}
                              className="flex-1 justify-center"
                            >
                              Refund
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table for Invoices */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Invoice / Admission ID</th>
                    <th className="p-2.5">Invoice Date</th>
                    <th className="p-2.5">Billed Courses & Items</th>
                    <th className="p-2.5 text-right">Total Payable</th>
                    <th className="p-2.5 text-right">Paid</th>
                    <th className="p-2.5 text-right text-rose-700">Due</th>
                    <th className="p-2.5 text-center">Payment Status</th>
                    <th className="p-2.5 text-right">Slips & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {admissions.map((adm) => {
                    const isPurchaseCancelled = adm.status === 'REVOKED' || adm.status === 'CANCELLED';
                    const validity = getValidityStatus(adm);
                    const canCancelPurchase = Boolean(adm.can_cancel && (adm.items?.length > 0 ? adm.items.every((i) => i.can_cancel) : true));
                    return (
                      <tr key={adm.id} className={`hover:bg-slate-50 transition ${isPurchaseCancelled ? 'bg-rose-50/40 opacity-85' : ''}`}>
                        <td className="p-2.5 font-mono font-bold text-black">
                          <div>{adm.purchase_transaction_id || adm.admission_number}</div>
                          {isPurchaseCancelled && (
                            <span className="text-[10px] text-rose-700 font-semibold block">
                              (Cancelled)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-800">
                          <span className="font-bold text-black block">{adm.admission_date}</span>
                          {isPurchaseCancelled ? (
                            <div className="mt-1 space-y-0.5">
                              {adm.valid_from && adm.valid_to && (
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  {adm.valid_from} &rarr; {adm.valid_to}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-50 text-rose-800 border-rose-200">
                                Cancelled
                              </span>
                            </div>
                          ) : adm.valid_from && adm.valid_to ? (
                            <div className="mt-1 space-y-0.5">
                              <span className="text-[10px] text-slate-800 font-mono font-semibold block">
                                {adm.valid_from} &rarr; {adm.valid_to}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                validity.badgeVariant === 'success'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : validity.badgeVariant === 'warning'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}>
                                {validity.badgeVariant === 'warning' && <Clock className="w-2.5 h-2.5" />}
                                {validity.subtext}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-700 font-mono font-medium">Standard Validity</span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="space-y-1">
                            {(adm.items || []).map((itm, i) => (
                              <div
                                key={i}
                                className="bg-slate-50 border border-slate-200 text-black px-2 py-0.5 rounded text-[11px]"
                              >
                                <span className="font-bold text-odoo-900 block">{itm.item_name_snapshot}</span>
                                {itm.source_demo_number && (
                                  <span className="inline-block text-[10px] font-mono font-semibold text-purple-800 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded mt-0.5">
                                    Demo {itm.source_demo_number}
                                  </span>
                                )}
                                {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                                  <span className="text-[10px] text-slate-700 font-medium block">
                                    {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                                    {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                                    {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                                  </span>
                                )}
                                {itm.valid_from && itm.valid_to && (
                                  <span className="text-[10px] text-emerald-800 font-mono font-bold block">
                                    Period: {itm.valid_from} to {itm.valid_to}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-black">
                          ₹{Number(adm.total_payable).toFixed(2)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-emerald-800 font-bold">
                          ₹{Number(adm.amount_paid).toFixed(2)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-rose-700 font-bold">
                          {isPurchaseCancelled ? (
                            <span className="line-through text-slate-400">₹0.00</span>
                          ) : (
                            <div>
                              <span>₹{Number(adm.balance_due).toFixed(2)}</span>
                              {Number(adm.balance_due) > 0 && (adm.status === 'EXPIRED' || validity.isExpired) && (
                                <span className="block text-[9px] font-bold uppercase text-rose-800 bg-rose-100 border border-rose-300 px-1 rounded mt-0.5 w-fit ml-auto">
                                  Expired
                                </span>
                              )}
                              {Number(adm.written_off_amount) > 0 && (
                                <span className="block text-[9px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1 rounded mt-0.5 w-fit ml-auto">
                                  ₹{Number(adm.written_off_amount).toFixed(0)} waived
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {isPurchaseCancelled ? (
                            <div className="space-y-0.5">
                              <Badge size="xs" variant="danger">
                                CANCELLED
                              </Badge>
                              {getCleanCancelReason(adm.revocation_reason) && (
                                <div
                                  className="text-[10px] text-rose-700 italic max-w-[120px] truncate mx-auto"
                                  title={getCleanCancelReason(adm.revocation_reason)}
                                >
                                  {getCleanCancelReason(adm.revocation_reason)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Badge
                                size="xs"
                                variant={
                                  adm.payment_status === 'PAID'
                                    ? 'success'
                                    : adm.payment_status === 'PARTIALLY_PAID'
                                    ? 'warning'
                                    : 'danger'
                                }
                              >
                                {adm.payment_status === 'PARTIALLY_PAID' ? 'PARTIAL PAID' : adm.payment_status}
                              </Badge>
                              {validity.isExpired ? (
                                <Badge size="xs" variant="danger">
                                  EXPIRED
                                </Badge>
                              ) : validity.isExpiringSoon ? (
                                <Badge size="xs" variant="warning">
                                  EXPIRING
                                </Badge>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {/* All Slips */}
                            <Button
                              size="xs"
                              variant="purple"
                              icon={FileText}
                              onClick={() => {
                                setSelectedAdmissionForSlips(adm);
                                setAllSlipsModalOpen(true);
                              }}
                              title="View all admission invoices, payment receipts and refund vouchers"
                            >
                              All Slips ▾
                            </Button>

                            {/* Collect Due Fee if pending */}
                            {Number(adm.balance_due) > 0 && !isPurchaseCancelled && !isRevoked && (
                              <Button
                                size="xs"
                                variant="success-soft"
                                icon={CreditCard}
                                onClick={() => {
                                  setTargetAdmissionId(adm.id);
                                  setPayModalOpen(true);
                                }}
                                title="Collect outstanding balance (2nd Payment)"
                              >
                                Pay Due (₹{Number(adm.balance_due).toFixed(0)})
                              </Button>
                            )}

                            {/* Waive Due if pending (Admin only) */}
                            {isAdmin && Number(adm.balance_due) > 0 && !isPurchaseCancelled && (
                              <Button
                                size="xs"
                                variant="amber"
                                icon={Sparkles}
                                onClick={() => {
                                  setSelectedAdmissionForWaive(adm);
                                  setWaiveModalOpen(true);
                                }}
                                title="Admin only: Waive / forgive pending fee due"
                              >
                                Waive Due
                              </Button>
                            )}

                            {/* If Cancelled: Offer Refund and Restore Purchase */}
                            {isPurchaseCancelled ? (
                              <>
                                {isAdmin && Number(adm.amount_paid) > 0 && (
                                  <Button
                                    size="xs"
                                    variant="orange"
                                    onClick={() => {
                                      setSelectedAdmissionForRefund(adm);
                                      setRefundModalOpen(true);
                                    }}
                                    title="Issue refund on cancelled purchase"
                                  >
                                    Refund
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button
                                    size="xs"
                                    variant="info"
                                    icon={RotateCcw}
                                    loading={restoringPurchaseId === adm.id}
                                    onClick={() => handleRestorePurchase(adm)}
                                    title="Restore cancelled purchase to Active"
                                  >
                                    Restore Purchase
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                {isAdmin && canCancelPurchase && (
                                  <Button
                                    size="xs"
                                    variant="danger-soft"
                                    onClick={() => {
                                      setSelectedAdmissionForPurchaseCancel(adm);
                                      setCancelPurchaseModalOpen(true);
                                    }}
                                    title="Cancel student enrollment"
                                  >
                                    Cancel Purchase
                                  </Button>
                                )}
                                {isAdmin && Number(adm.amount_paid) > 0 && (
                                  <Button
                                    size="xs"
                                    variant="orange"
                                    onClick={() => {
                                      setSelectedAdmissionForRefund(adm);
                                      setRefundModalOpen(true);
                                    }}
                                    title="Issue refund"
                                  >
                                    Refund
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Admissions Backend Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <span>
              Showing {admTotal === 0 ? 0 : (admPage - 1) * admPageSize + 1} to{' '}
              {Math.min(admPage * admPageSize, admTotal)} of {admTotal}
            </span>
            <span className="text-slate-300">•</span>
            <label className="flex items-center gap-1 text-slate-700 text-[11px] font-semibold">
              Per page:
              <select
                value={admPageSize}
                onChange={(e) => {
                  setAdmPageSize(Number(e.target.value));
                  setAdmPage(1);
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 bg-white text-black font-bold text-xs"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setAdmPage(1)}
              disabled={admPage <= 1 || admLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setAdmPage((p) => Math.max(1, p - 1))}
              disabled={admPage <= 1 || admLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <span className="px-2 font-bold text-black text-xs">
              Page {admPage} of {Math.max(1, admTotalPages)}
            </span>
            <button
              onClick={() => setAdmPage((p) => Math.min(admTotalPages, p + 1))}
              disabled={admPage >= admTotalPages || admLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setAdmPage(admTotalPages)}
              disabled={admPage >= admTotalPages || admLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* TAB 3: Financial Transactions & Receipts Ledger */}
      {!isTeacher && activeMainTab === 'LEDGER' && (
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-odoo-600" />
              <h2 className="text-sm font-bold text-black">
                Financial Transactions & Receipts Ledger
              </h2>
            </div>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              Audit trail of all receipts collected (initial payment, 2nd payments / due settlement) and refund vouchers with official slips
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg font-bold">
              Total Receipts: ₹{transactions.filter((t) => t.type === 'PAYMENT').reduce((acc, t) => acc + (Number(t.amount) || 0), 0).toFixed(2)}
            </span>
            {transactions.some((t) => t.type === 'REFUND') && (
              <span className="font-mono bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-lg font-bold">
                Total Refunded: ₹{Math.abs(transactions.filter((t) => t.type === 'REFUND').reduce((acc, t) => acc + (Number(t.amount) || 0), 0)).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Search and Filters for Financial Transactions Ledger */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search receipts by #, note, mode, cashier..."
                value={txnSearch}
                onChange={(e) => setTxnSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setTxnPage(1);
                    fetchTransactionsData(1, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter);
                  }
                }}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-black placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
              />
              {txnSearch && (
                <button
                  onClick={() => {
                    setTxnSearch('');
                    setTxnPage(1);
                    fetchTransactionsData(1, txnPageSize, '', txnModeFilter, txnTypeFilter);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-black"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={txnTypeFilter}
              onChange={(e) => {
                setTxnTypeFilter(e.target.value);
                setTxnPage(1);
              }}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-black font-medium focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
            >
              <option value="ALL">All Types</option>
              <option value="PAYMENT">Fee Payments (+₹)</option>
              <option value="REFUND">Refund Vouchers (-₹)</option>
            </select>

            <select
              value={txnModeFilter}
              onChange={(e) => {
                setTxnModeFilter(e.target.value);
                setTxnPage(1);
              }}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-black font-medium focus:outline-none focus:ring-1 focus:ring-odoo-500 focus:border-odoo-600"
            >
              <option value="ALL">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>

            {(txnSearch || txnTypeFilter !== 'ALL' || txnModeFilter !== 'ALL') && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  setTxnSearch('');
                  setTxnTypeFilter('ALL');
                  setTxnModeFilter('ALL');
                  setTxnPage(1);
                  fetchTransactionsData(1, txnPageSize, '', 'ALL', 'ALL');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {txnsLoading ? (
          <div className="py-8 text-center text-xs text-slate-700 space-y-2">
            <div className="w-5 h-5 border-2 border-odoo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="font-semibold">Loading financial transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-700 font-medium">
            No payment transactions or refund vouchers found matching your filter criteria.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile Cards for Ledger */}
            <div className="block sm:hidden space-y-2.5">
              {transactions.map((txn) => {
                const isRefund = txn.type === 'REFUND';
                const isWaiver = txn.type === 'WAIVER';
                return (
                  <div
                    key={txn.id}
                    className={`border rounded-xl p-3 space-y-2 ${
                      isRefund
                        ? 'bg-rose-50/50 border-rose-200'
                        : isWaiver
                        ? 'bg-amber-50/60 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-xs">
                        {isRefund ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        ) : isWaiver ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span className={isRefund ? 'text-rose-700' : isWaiver ? 'text-amber-900' : 'text-odoo-900'}>
                          {txn.number}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-bold text-sm block ${isRefund ? 'text-rose-700' : isWaiver ? 'text-amber-800' : 'text-emerald-800'}`}>
                          {isRefund ? '-' : isWaiver ? '≈' : '+'}₹{Math.abs(Number(txn.amount) || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {isRefund ? (
                        <span className="inline-block px-1.5 py-0.2 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          Refund Voucher
                        </span>
                      ) : isWaiver ? (
                        <span className="inline-block px-1.5 py-0.2 rounded text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                          Fee Due Waived
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.2 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Fee Payment
                        </span>
                      )}
                      <span className="bg-white border border-slate-200 text-black px-1.5 py-0.2 rounded text-[11px] font-semibold">
                        {txn.mode}
                      </span>
                      {txn.ref && (
                        <span className="text-[10px] text-slate-700 font-mono">
                          Ref: {txn.ref}
                        </span>
                      )}
                    </div>

                    {txn.course_name && (
                      <div className="text-xs bg-white p-2 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-700 font-semibold uppercase block">Course Ref</span>
                        <div className="font-bold text-black">{txn.course_name}</div>
                        {txn.admission_number && (
                          <span className="font-mono text-[10px] text-odoo-800 font-semibold block">
                            #{txn.admission_number}
                          </span>
                        )}
                      </div>
                    )}

                    {txn.notes && (
                      <div className="text-[11px] text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200">
                        {txn.notes}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                      <div className="text-[11px] text-slate-700">
                        <span className="font-medium">Date: </span>
                        {txn.date
                          ? new Date(txn.date).toLocaleDateString('en-IN', {
                              dateStyle: 'medium',
                            })
                          : '—'}
                        <span className="ml-1 text-slate-500">by {txn.collector || 'Admin'}</span>
                      </div>

                      <Button
                        size="xs"
                        variant="indigo"
                        icon={Printer}
                        onClick={() => handleViewReceipt(txn)}
                      >
                        Print Slip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table for Ledger */}
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Receipt / Voucher #</th>
                    <th className="p-2.5">Date & Time</th>
                    <th className="p-2.5">Type & Purpose</th>
                    <th className="p-2.5">Course Ref</th>
                    <th className="p-2.5">Payment Mode</th>
                    <th className="p-2.5">Handled By</th>
                    <th className="p-2.5 text-right">Amount</th>
                    <th className="p-2.5 text-right">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {transactions.map((txn) => {
                    const isRefund = txn.type === 'REFUND';
                    const isWaiver = txn.type === 'WAIVER';
                    return (
                      <tr
                        key={txn.id}
                        className={`hover:bg-slate-50 transition ${
                          isRefund ? 'bg-rose-50/30' : isWaiver ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="p-2.5 font-mono font-bold">
                          <span className="flex items-center gap-1.5">
                            {isRefund ? (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            ) : isWaiver ? (
                              <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            <span className={isRefund ? 'text-rose-700' : isWaiver ? 'text-amber-900' : 'text-odoo-900'}>
                              {txn.number}
                            </span>
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-800 font-medium">
                          {txn.date
                            ? new Date(txn.date).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="p-2.5">
                          {isRefund ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              Refund Voucher
                            </span>
                          ) : isWaiver ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                              Fee Due Waived
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Fee Payment
                            </span>
                          )}
                          {txn.notes && (
                            <span className="block text-[10px] text-slate-700 font-medium italic truncate max-w-[200px]">
                              {txn.notes}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          {txn.admission_number ? (
                            <div>
                              <span className="font-mono font-bold text-odoo-800 block">
                                {txn.admission_number}
                              </span>
                              {txn.course_name && (
                                <span
                                  className="text-[11px] text-slate-800 font-medium block line-clamp-1 max-w-[200px]"
                                  title={txn.course_name}
                                >
                                  {txn.course_name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800">
                          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                            {txn.mode}
                          </span>
                          {txn.ref && (
                            <span className="block text-[10px] text-slate-700 font-mono">
                              Ref: {txn.ref}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-800 font-medium">
                          {txn.collector || 'Admin'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-sm">
                          {isRefund ? (
                            <span className="text-rose-700">-₹{Math.abs(Number(txn.amount) || 0).toFixed(2)}</span>
                          ) : (
                            <span className="text-emerald-800">+₹{(Number(txn.amount) || 0).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            size="xs"
                            variant="indigo"
                            icon={Printer}
                            onClick={() => handleViewReceipt(txn)}
                          >
                            Print Slip
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions Backend Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <span>
              Showing {txnTotal === 0 ? 0 : (txnPage - 1) * txnPageSize + 1} to{' '}
              {Math.min(txnPage * txnPageSize, txnTotal)} of {txnTotal}
            </span>
            <span className="text-slate-300">•</span>
            <label className="flex items-center gap-1 text-slate-700 text-[11px] font-semibold">
              Per page:
              <select
                value={txnPageSize}
                onChange={(e) => {
                  setTxnPageSize(Number(e.target.value));
                  setTxnPage(1);
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 bg-white text-black font-bold text-xs"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setTxnPage(1)}
              disabled={txnPage <= 1 || txnsLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
              disabled={txnPage <= 1 || txnsLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <span className="px-2 font-bold text-black text-xs">
              Page {txnPage} of {Math.max(1, txnTotalPages)}
            </span>
            <button
              onClick={() => setTxnPage((p) => Math.min(txnTotalPages, p + 1))}
              disabled={txnPage >= txnTotalPages || txnsLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setTxnPage(txnTotalPages)}
              disabled={txnPage >= txnTotalPages || txnsLoading}
              className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* TAB 4: Student Audit Trail */}
      {!isTeacher && activeMainTab === 'AUDIT' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
          <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-odoo-600" />
                <h2 className="text-sm font-bold text-black">Student Lifecycle & Activity Audit Trail</h2>
              </div>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Complete, immutable log of admissions, fee collections, receipts, renewals, status changes, and staff interactions for this student.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                icon={RefreshCw}
                loading={auditLoading}
                onClick={() => fetchStudentAuditLogs(auditPage, auditPageSize, auditSearch, auditActionFilter)}
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Filter / Search Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit events, reference numbers, or notes..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setAuditPage(1);
                    fetchStudentAuditLogs(1, auditPageSize, auditSearch, auditActionFilter);
                  }
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-black font-medium focus:outline-none focus:ring-1 focus:ring-odoo-500 placeholder:text-slate-400"
              />
            </div>

            <div className="w-full sm:w-auto flex items-center gap-2">
              <select
                value={auditActionFilter}
                onChange={(e) => {
                  setAuditActionFilter(e.target.value);
                  setAuditPage(1);
                }}
                className="w-full sm:w-auto px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-black font-semibold focus:outline-none"
              >
                <option value="ALL">All Event Types</option>
                <option value="STUDENT_CREATED">Student Registered</option>
                <option value="STUDENT_UPDATED">Profile Updated</option>
                <option value="DEMO_CREATED">Demo Created</option>
                <option value="ADMISSION_CREATED">Course Admission</option>
                <option value="PAYMENT_RECORDED">Payment Collected</option>
                <option value="PAYMENT_EDITED">Payment Edited</option>
                <option value="REFUND_PROCESSED">Refund Issued</option>
                <option value="SUBJECT_RENEWED">Subject Renewed</option>
                <option value="ADMISSION_ITEM_VALIDITY_UPDATED">Validity Adjusted</option>
                <option value="REVOKE_STUDENT">Student Revoked</option>
                <option value="RESTORE_STUDENT">Student Restored</option>
                <option value="PURCHASE_REVOKED">Purchase Revoked</option>
                <option value="PURCHASE_RESTORED">Purchase Restored</option>
                <option value="ADMISSION_ITEM_SUSPENDED">Subject Suspended</option>
                <option value="ADMISSION_ITEM_RESUMED">Subject Resumed</option>
                <option value="ADMISSION_ITEM_DISCONTINUED">Subject Discontinued</option>
              </select>

              {(auditSearch || auditActionFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setAuditSearch('');
                    setAuditActionFilter('ALL');
                    setAuditPage(1);
                    fetchStudentAuditLogs(1, auditPageSize, '', 'ALL');
                  }}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 whitespace-nowrap px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Audit Logs Content */}
          {auditLoading ? (
            <div className="py-12 text-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-odoo-600 mx-auto" />
              <p className="text-xs text-slate-600 font-semibold">Loading student audit history...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-black">No Audit Events Found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No activity logs matched the specified filters for this student.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-black font-bold uppercase text-[11px] tracking-wider">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Acting Staff</th>
                      <th className="py-2.5 px-3">Activity Summary</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {auditLogs.map((log) => {
                      const meta = getActionMeta(log.action);
                      const ActionIcon = meta.icon;
                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          onClick={() => setSelectedAuditForInspection(log)}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-black">{formatDateTime(log.created_at)}</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <Badge variant={meta.variant} size="xs" className="font-bold">
                              <ActionIcon className="w-3 h-3 shrink-0" />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-bold text-black">{log.user_name || 'System'}</div>
                            {log.user_role && (
                              <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                {log.user_role}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <AuditDetailsSummary audit={log} />
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAuditForInspection(log);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-black hover:bg-slate-200 transition"
                              title="Inspect Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2">
                {auditLogs.map((log) => {
                  const meta = getActionMeta(log.action);
                  const ActionIcon = meta.icon;
                  return (
                    <div
                      key={log.id}
                      onClick={() => setSelectedAuditForInspection(log)}
                      className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2 cursor-pointer hover:bg-slate-100/70 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={meta.variant} size="xs" className="font-bold">
                          <ActionIcon className="w-3 h-3 shrink-0" />
                          {meta.label}
                        </Badge>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      <div className="text-xs">
                        <AuditDetailsSummary audit={log} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="font-bold text-black">{log.user_name || 'System'}</span>
                        </div>
                        <button
                          type="button"
                          className="text-[10px] text-odoo-700 font-bold hover:underline flex items-center gap-0.5"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Audit Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span>
                    Showing {auditTotal === 0 ? 0 : (auditPage - 1) * auditPageSize + 1} to{' '}
                    {Math.min(auditPage * auditPageSize, auditTotal)} of {auditTotal}
                  </span>
                  <span className="text-slate-300">•</span>
                  <label className="flex items-center gap-1 text-slate-700 text-[11px] font-semibold">
                    Per page:
                    <select
                      value={auditPageSize}
                      onChange={(e) => {
                        setAuditPageSize(Number(e.target.value));
                        setAuditPage(1);
                      }}
                      className="border border-slate-300 rounded px-1.5 py-0.5 bg-white text-black font-bold text-xs"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAuditPage(1)}
                    disabled={auditPage <= 1 || auditLoading}
                    className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1 || auditLoading}
                    className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                  <span className="px-2 font-bold text-black text-xs">
                    Page {auditPage} of {Math.max(1, auditTotalPages)}
                  </span>
                  <button
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages || auditLoading}
                    className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                  <button
                    onClick={() => setAuditPage(auditTotalPages)}
                    disabled={auditPage >= auditTotalPages || auditLoading}
                    className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student Audit Event Inspector Modal */}
      {selectedAuditForInspection && (
        <Modal
          isOpen={Boolean(selectedAuditForInspection)}
          onClose={() => setSelectedAuditForInspection(null)}
          title={`Audit Event: ${getActionMeta(selectedAuditForInspection.action).label}`}
          subtitle={`Recorded on ${formatDateTime(selectedAuditForInspection.created_at)}`}
          maxWidth="max-w-xl"
        >
          <div className="p-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Action Code</span>
                <div className="font-mono font-bold text-black text-xs break-all">
                  {selectedAuditForInspection.action}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Staff / Actor</span>
                <div className="font-bold text-black text-xs">
                  {selectedAuditForInspection.user_name || 'System'}
                </div>
                {selectedAuditForInspection.user_role && (
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">
                    {selectedAuditForInspection.user_role}
                  </span>
                )}
              </div>
            </div>

            {selectedAuditForInspection.parsed_details ? (
              <div className="space-y-1">
                <h4 className="font-bold text-black text-xs uppercase tracking-wider">Event Details</h4>
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                  {Object.entries(selectedAuditForInspection.parsed_details).map(([k, v]) => (
                    <div key={k} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 gap-1">
                      <span className="font-mono text-slate-700 font-semibold uppercase text-[11px]">{k}</span>
                      <span className="font-medium text-black break-all">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedAuditForInspection.details ? (
              <div className="space-y-1">
                <h4 className="font-bold text-black text-xs uppercase tracking-wider">Event Details</h4>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <span className="font-medium text-black break-all">{selectedAuditForInspection.details}</span>
                </div>
              </div>
            ) : null}

            <div className="pt-1 flex justify-end">
              <Button variant="secondary" size="xs" onClick={() => setSelectedAuditForInspection(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* All Slips (Multi-Slip Picker & Comprehensive Statement Modal) */}
      <AdmissionAllSlipsModal
        isOpen={allSlipsModalOpen}
        onClose={() => {
          setAllSlipsModalOpen(false);
          setSelectedAdmissionForSlips(null);
        }}
        admissionId={selectedAdmissionForSlips?.id}
        admissionData={selectedAdmissionForSlips}
      />

      {/* Collect Payment Modal */}
      <QuickPaymentModal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        initialAdmissionId={targetAdmissionId}
        onPaymentSuccess={(receipt) => {
          setReceiptToShow(receipt);
          fetchStudentData();
        }}
      />

      {/* Waive Due Modal */}
      <WaiveDueModal
        isOpen={waiveModalOpen}
        onClose={() => {
          setWaiveModalOpen(false);
          setSelectedAdmissionForWaive(null);
        }}
        admission={selectedAdmissionForWaive || admissions.find((a) => Number(a.balance_due) > 0)}
        student={student}
        onSuccess={() => {
          fetchStudentData();
          fetchStudentAuditLogs(auditPage, auditPageSize, auditSearch, auditActionFilter);
        }}
      />

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!receiptToShow}
        onClose={() => setReceiptToShow(null)}
        receipt={receiptToShow}
      />

      {/* Admission Slip Modal */}
      <AdmissionReceiptModal
        isOpen={!!admissionSlipToShow}
        onClose={() => setAdmissionSlipToShow(null)}
        admission={admissionSlipToShow}
      />

      {/* Revoke Student Modal */}
      <RevokeStudentModal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        student={student}
        onSuccess={() => {
          fetchStudentData();
        }}
      />

      {/* Cancel Purchase Modal */}
      <CancelPurchaseModal
        isOpen={cancelPurchaseModalOpen}
        onClose={() => {
          setCancelPurchaseModalOpen(false);
          setSelectedAdmissionForPurchaseCancel(null);
          setSelectedItemForCancel(null);
        }}
        admission={selectedAdmissionForPurchaseCancel}
        item={selectedItemForCancel}
        onSuccess={async (res, hasRefund) => {
          await fetchStudentData();
          const admId = res?.id || selectedAdmissionForPurchaseCancel?.id;
          if (hasRefund && admId) {
            try {
              const refList = await paymentApi.listRefunds({
                admission_id: admId,
                page_size: 1,
              });
              if (refList.items?.length > 0) {
                setRefundReceiptToShow(refList.items[0]);
              }
            } catch (e) {
              console.error(e);
            }
          }
        }}
      />

      {/* Issue Refund Modal */}
      <IssueRefundModal
        isOpen={refundModalOpen}
        onClose={() => {
          setRefundModalOpen(false);
          setSelectedAdmissionForRefund(null);
        }}
        admission={selectedAdmissionForRefund}
        onSuccess={(receipt) => {
          setRefundReceiptToShow(receipt);
          fetchStudentData();
        }}
      />

      {/* Refund Receipt Modal */}
      <RefundReceiptModal
        isOpen={!!refundReceiptToShow}
        onClose={() => setRefundReceiptToShow(null)}
        refund={refundReceiptToShow}
      />

      {/* Edit Student Profile Modal */}
      <EditStudentModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        student={student}
        onSuccess={() => {
          fetchStudentData();
        }}
      />

      {/* Renew Subject Modal */}
      <RenewSubjectModal
        isOpen={renewModalOpen}
        onClose={() => {
          setRenewModalOpen(false);
          setSelectedItemForRenew(null);
        }}
        student={student}
        item={selectedItemForRenew}
        onSuccess={(createdAdmission) => {
          fetchStudentData();
          if (createdAdmission) {
            setAdmissionSlipToShow(createdAdmission);
          }
        }}
      />

      {/* Edit Validity Dates Modal */}
      <EditValidityModal
        isOpen={validityModalOpen}
        onClose={() => {
          setValidityModalOpen(false);
          setSelectedAdmissionForValidity(null);
          setSelectedItemForValidity(null);
        }}
        admission={selectedAdmissionForValidity}
        item={selectedItemForValidity}
        onSuccess={() => fetchStudentData()}
      />

      {/* Student ID Card Modal */}
      <StudentIDCardModal
        isOpen={idCardModalOpen}
        onClose={() => setIdCardModalOpen(false)}
        student={student}
        enrollmentData={enrollmentData}
        demos={demos}
      />

      {/* Give Demo Modal */}
      <GiveDemoModal
        isOpen={giveDemoModalOpen}
        onClose={() => setGiveDemoModalOpen(false)}
        student={student}
        onSuccess={(createdEnquiry) => {
          fetchDemosData();
          fetchStudentProfile();
          fetchStudentAuditLogs(auditPage, auditPageSize, auditSearch, auditActionFilter);
          if (createdEnquiry) {
            setDemoPassToShow(createdEnquiry);
          }
        }}
      />

      {/* Printable Demo Pass Modal */}
      <DemoPassModal
        isOpen={Boolean(demoPassToShow)}
        onClose={() => setDemoPassToShow(null)}
        enquiry={demoPassToShow}
      />
    </div>
  );
}
