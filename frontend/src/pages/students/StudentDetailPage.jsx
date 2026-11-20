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
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import { studentApi, admissionApi, paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompressor';
import { useAuth } from '../../context/AuthContext';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import AdmissionAllSlipsModal from '../../components/receipts/AdmissionAllSlipsModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import RevokeStudentModal from '../../components/modals/RevokeStudentModal';
import RevokeBatchModal from '../../components/modals/RevokeBatchModal';
import EditStudentModal from '../../components/modals/EditStudentModal';
import EditValidityModal from '../../components/modals/EditValidityModal';
import SuspendDiscontinueModal from '../../components/modals/SuspendDiscontinueModal';
import RenewSubjectModal from '../../components/modals/RenewSubjectModal';

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
      canRenew: true,
    };
  }

  const isCancelledOrRevoked = adm.status === 'REVOKED' || adm.status === 'CANCELLED';
  if (isCancelledOrRevoked) {
    const formattedDate = adm.revoked_at ? new Date(adm.revoked_at).toLocaleDateString('en-IN') : null;
    return {
      status: 'CANCELLED',
      badgeVariant: 'danger',
      label: 'Cancelled',
      subtext: adm.revocation_reason ? adm.revocation_reason : (formattedDate ? `Cancelled on ${formattedDate}` : 'Cancelled'),
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(adm.valid_to);
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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
  const { isAdmin } = useAuth();
  const [student, setStudent] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Tab State: 'HISTORY' | 'INVOICES' | 'LEDGER'
  const [activeMainTab, setActiveMainTab] = useState('HISTORY');

  // Active Enrollment State
  const [enrollmentData, setEnrollmentData] = useState(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  // Renewal Modal
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [selectedItemForRenew, setSelectedItemForRenew] = useState(null);

  // Item-level Validity & Lifecycle Actions
  const [selectedItemForValidity, setSelectedItemForValidity] = useState(null);
  const [selectedItemForSuspend, setSelectedItemForSuspend] = useState(null);
  const [resumingItemId, setResumingItemId] = useState(null);

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetAdmissionId, setTargetAdmissionId] = useState(null);
  const [receiptToShow, setReceiptToShow] = useState(null);
  const [admissionSlipToShow, setAdmissionSlipToShow] = useState(null);

  // Lifecycle Modals (Edit Validity, Suspend, Discontinue)
  const [selectedAdmissionForValidity, setSelectedAdmissionForValidity] = useState(null);
  const [validityModalOpen, setValidityModalOpen] = useState(false);
  const [selectedAdmissionForSuspend, setSelectedAdmissionForSuspend] = useState(null);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendMode, setSuspendMode] = useState('SUSPEND');

  // Revocation & Refund Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeBatchModalOpen, setRevokeBatchModalOpen] = useState(false);
  const [selectedAdmissionForBatchRevoke, setSelectedAdmissionForBatchRevoke] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedAdmissionForRefund, setSelectedAdmissionForRefund] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringBatchId, setRestoringBatchId] = useState(null);

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

  // All Slips Modal
  const [allSlipsModalOpen, setAllSlipsModalOpen] = useState(false);
  const [selectedAdmissionForSlips, setSelectedAdmissionForSlips] = useState(null);

  const fetchStudentProfile = async () => {
    setLoading(true);
    try {
      const stRes = await studentApi.get(id);
      setStudent(stRes);
      return stRes;
    } catch (err) {
      error(err.message || 'Failed to load student profile');
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

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStudentProfile(),
        fetchEnrollmentData(),
        fetchAdmissionsData(admPage, admPageSize, admSearch, admStatusFilter),
        fetchTransactionsData(txnPage, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentProfile();
    fetchEnrollmentData();
  }, [id]);

  useEffect(() => {
    fetchAdmissionsData(admPage, admPageSize, admSearch, admStatusFilter);
  }, [id, admPage, admPageSize, admStatusFilter]);

  useEffect(() => {
    fetchTransactionsData(txnPage, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter);
  }, [id, txnPage, txnPageSize, txnModeFilter, txnTypeFilter]);

  const handleViewReceipt = async (txn) => {
    if (txn.type === 'PAYMENT') {
      try {
        const rcpt = await paymentApi.getReceipt(txn.id);
        setReceiptToShow(rcpt);
      } catch (e) {
        error(e.message || 'Failed to fetch payment receipt');
      }
    } else {
      try {
        const rcpt = await paymentApi.getRefundReceipt(txn.id);
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

  const handleRestoreBatch = async (adm) => {
    setRestoringBatchId(adm.id);
    try {
      await admissionApi.restore(adm.id);
      success(`Batch purchase ${adm.purchase_transaction_id || adm.admission_number} restored to ACTIVE`);
      fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to restore batch purchase');
    } finally {
      setRestoringBatchId(null);
    }
  };

  const handleResumeBatch = async (adm) => {
    try {
      await admissionApi.resume(adm.id);
      success(`Batch ${adm.purchase_transaction_id || adm.admission_number} resumed to ACTIVE`);
      fetchStudentData();
    } catch (err) {
      error(err.message || 'Failed to resume batch');
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
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="font-medium text-slate-600">Loading Student Profile...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-slate-600">Student record not found.</p>
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

  const activeTotalFee = activeAdmissions.reduce((acc, a) => acc + Number(a.total_payable || 0), 0);
  const activeTotalPaid = activeAdmissions.reduce((acc, a) => acc + Number(a.amount_paid || 0), 0);
  const activeTotalDue = activeAdmissions.reduce((acc, a) => acc + Number(a.balance_due || 0), 0);

  return (
    <div className="space-y-4">
      {/* Revocation Alert Banner */}
      {isRevoked && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-950 uppercase tracking-wider block">
                STUDENT ADMISSION REVOKED — ALL ACTIVE ENROLLMENTS CANCELLED
              </span>
              <p className="text-rose-800">
                Reason: <strong className="text-black italic">{student.revoke_reason || 'Administrative action'}</strong>
                {student.revoked_at && (
                  <span className="text-slate-500 ml-2 font-mono">
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
          >
            Restore Student
          </Button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/students')}
            className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Student Profile Picture with Direct Upload (< 20 KB) */}
          <div className="relative group">
            <Avatar
              src={student.photo_url}
              name={student.name}
              size="lg"
              status={student.status}
            />
            <label
              className="absolute -bottom-1 -right-1 p-1 bg-white border border-slate-300 rounded-full shadow-xs cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition"
              title="Change Profile Photo (auto-compressed to <= 20 KB)"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-700" />
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-black">{student.name}</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-indigo-700 font-bold border border-slate-300">
                {student.student_code}
              </span>
              <Badge variant={isRevoked ? 'danger' : student.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {student.status}
              </Badge>
            </div>
            {student.father_name && (
              <p className="text-xs text-slate-500">Father: {student.father_name}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Student Profile Button */}
          <Button
            size="xs"
            variant="secondary"
            icon={Edit2}
            onClick={() => setEditModalOpen(true)}
            title="Edit Student Information"
          >
            Edit Profile
          </Button>

          {/* Revoke / Restore Button (Admin Only) */}
          {isAdmin && (
            isRevoked ? (
              <Button size="xs" variant="secondary" onClick={handleRestore} loading={restoring}>
                Restore Status
              </Button>
            ) : (
              <Button
                size="xs"
                variant="danger"
                icon={UserX}
                onClick={() => setRevokeModalOpen(true)}
              >
                Revoke Student
              </Button>
            )
          )}

          {/* Collect Due Fee Button */}
          {!isRevoked && Number(student.total_balance_due) > 0 && (
            <Button
              variant="success"
              icon={CreditCard}
              onClick={() => {
                const firstDue = admissions.find((a) => Number(a.balance_due) > 0);
                setTargetAdmissionId(firstDue ? firstDue.id : null);
                setPayModalOpen(true);
              }}
            >
              Collect Due Fee
            </Button>
          )}

          {/* Purchase Another Course / Batch Shortcut */}
          {!isRevoked && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() =>
                navigate(
                  `/admissions/new?student_id=${student.id}&name=${encodeURIComponent(
                    student.name
                  )}`
                )
              }
            >
              + Purchase Another Course / Batch
            </Button>
          )}
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className={`grid grid-cols-2 ${Number(student.total_refunded) > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Purchases
          </span>
          <div className="text-xl font-bold text-black mt-0.5">{student.admissions_count || 0}</div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
            <span className="text-emerald-700">{student.active_admissions_count || 0} Active</span>
            {Number(student.revoked_admissions_count) > 0 && (
              <>
                <span>•</span>
                <span className="text-rose-600">{student.revoked_admissions_count} Cancelled</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Active Billed Fees
          </span>
          <div className="text-xl font-bold text-black mt-0.5">
            ₹{Number(student.total_billed).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">
            {Number(student.active_admissions_count) > 0 ? 'Active courses fee' : 'No active courses'}
          </span>
        </div>

        <div className="bg-white rounded-lg border border-emerald-200 border-l-4 border-l-emerald-600 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase">
            Total Fees Paid
          </span>
          <div className="text-xl font-bold text-emerald-800 mt-0.5">
            ₹{Number(student.total_paid).toFixed(2)}
          </div>
          <span className="text-[10px] text-emerald-700 block truncate">
            {Number(student.total_refunded) > 0
              ? `Gross collected (Net: ₹${Number(student.net_paid !== undefined ? student.net_paid : student.total_paid - student.total_refunded).toFixed(2)})`
              : 'Total receipts collected'}
          </span>
        </div>

        {Number(student.total_refunded) > 0 && (
          <div className="bg-white rounded-lg border border-rose-200 border-l-4 border-l-rose-500 p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-800 uppercase">
              Total Refunded
            </span>
            <div className="text-xl font-bold text-rose-800 mt-0.5">
              ₹{Number(student.total_refunded).toFixed(2)}
            </div>
            <span className="text-[10px] text-rose-700">Returned to student</span>
          </div>
        )}

        <div className={`bg-white rounded-lg border ${Number(student.total_balance_due) > 0 ? 'border-rose-300 border-l-4 border-l-rose-600' : 'border-slate-200 border-l-4 border-l-slate-400'} p-3 shadow-xs`}>
          <span className={`text-[11px] font-semibold uppercase ${Number(student.total_balance_due) > 0 ? 'text-rose-900' : 'text-slate-500'}`}>
            Current Balance Due
          </span>
          <div className={`text-xl font-bold mt-0.5 ${Number(student.total_balance_due) > 0 ? 'text-rose-700' : 'text-black'}`}>
            ₹{Number(student.total_balance_due).toFixed(2)}
          </div>
          <span className={`text-[10px] ${Number(student.total_balance_due) > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
            {Number(student.total_balance_due) > 0 ? 'Pending payment • Due' : 'All active fees cleared ✓'}
          </span>
        </div>
      </div>

      {/* Two Column Section: Profile Details + Green Card Pass info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Student Bio Card */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-slate-100 pb-2">
            Personal & Contact Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Contact Phone:</span>
              <span className="font-mono font-semibold text-black">
                {student.mobile || 'Not provided'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Email Address:</span>
              <span className="text-black">{student.email || 'Not provided (optional)'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Date of Birth:</span>
              <span className="text-black">{student.dob || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Registration Date:</span>
              <span className="text-black">{student.registration_date}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-slate-500 block">Residential Address:</span>
              <span className="text-black">{student.address || '—'}</span>
            </div>
          </div>
        </div>

        {/* Green Card Membership Box */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-purple-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-black">
                Green Card Pass Status
              </h2>
            </div>

            {student.has_green_card ? (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1 text-xs">
                <Badge variant="purple">ACTIVE ALL-ACCESS PASS</Badge>
                <p className="text-purple-950 font-medium pt-1">
                  Student is entitled to attend all active batches & subjects.
                </p>
                <p className="text-slate-600 text-[11px]">
                  Pass Valid Till: <strong className="text-black font-mono">{student.green_card_expiry || 'Permanent'}</strong>
                </p>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2">
                <p>No active Green Card membership.</p>
                {!isRevoked && (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/admissions/new?student_id=${student.id}&item_type=GREEN_CARD`
                      )
                    }
                  >
                    Purchase Green Card
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1. Prominent Current Enrollment Card */}
      <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-indigo-100 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-black">Current Institute Enrollment</h2>
                <span className="font-mono text-xs font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">
                  {enrollmentData?.enrollment_number || `ENR-${student?.student_code}`}
                </span>
                <Badge variant={enrollmentData?.is_student_active ? 'success' : 'neutral'}>
                  {enrollmentData?.is_student_active ? 'Active Enrollment' : 'Inactive / Between Cycles'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Active subjects currently attended by the student with independent fee validity periods
              </p>
            </div>
          </div>

          {!isRevoked && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={Plus}
                onClick={() =>
                  navigate(
                    `/admissions/new?student_id=${student.id}&name=${encodeURIComponent(
                      student.name
                    )}`
                  )
                }
              >
                + Add / Enroll Subject
              </Button>
            </div>
          )}
        </div>

        {/* Active Subjects Table / Empty State */}
        {!enrollmentData?.active_subjects || enrollmentData.active_subjects.length === 0 ? (
          <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center space-y-2">
            <p className="text-xs text-slate-600 font-medium">
              No currently active subjects. The student is inactive or between validity cycles.
            </p>
            <p className="text-[11px] text-slate-400">
              Past subject history, marks, and invoices are preserved below. Renew any previous subject or add a new subject to reactivate enrollment.
            </p>
            {!isRevoked && (
              <Button
                size="xs"
                variant="secondary"
                icon={Plus}
                className="mt-2"
                onClick={() =>
                  navigate(`/admissions/new?student_id=${student.id}&name=${encodeURIComponent(student.name)}`)
                }
              >
                Enroll in a Subject
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-indigo-50/70 text-indigo-950 font-semibold border-y border-indigo-100">
                <tr>
                  <th className="py-2.5 px-3">Subject / Course</th>
                  <th className="py-2.5 px-3">Assigned Faculty</th>
                  <th className="py-2.5 px-3">Validity Coverage</th>
                  <th className="py-2.5 px-3 text-right">Fee</th>
                  <th className="py-2.5 px-3 text-right">Paid</th>
                  <th className="py-2.5 px-3 text-right">Balance Due</th>
                  <th className="py-2.5 px-3 text-center">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollmentData.active_subjects.map((item) => (
                  <tr key={item.id} className="hover:bg-indigo-50/30 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-black flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>{item.subject_name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Invoice #{item.admission_number}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-800 font-medium">
                        {item.teacher_name || 'Unassigned / General'}
                      </div>
                      {item.hall_number && (
                        <span className="text-[10px] text-slate-500 block">Hall: {item.hall_number}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-slate-700 font-semibold">
                        {item.valid_from} → {item.valid_to}
                      </div>
                      <div className="text-[10px] mt-0.5">
                        {item.days_remaining !== null && (
                          <span className={`px-1.5 py-0.2 rounded font-semibold ${
                            item.days_remaining <= 3 ? 'bg-rose-100 text-rose-800' :
                            item.days_remaining <= 7 ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {item.days_remaining}d remaining
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-black">
                      ₹{Number(item.net_price).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                      ₹{Number(item.amount_collected).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <span className={Number(item.balance_due) > 0 ? 'text-rose-600' : 'text-slate-400'}>
                        ₹{Number(item.balance_due).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="xs"
                          variant="secondary"
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
                          variant="ghost"
                          icon={Calendar}
                          onClick={() => {
                            setSelectedItemForValidity(item);
                            setValidityModalOpen(true);
                          }}
                          title="Adjust Validity Dates"
                        >
                          Dates
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                setSelectedItemForSuspend(item);
                                setSuspendMode('SUSPEND');
                                setSuspendModalOpen(true);
                              }}
                              title="Suspend Subject Temporarily"
                            >
                              Suspend
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                setSelectedItemForSuspend(item);
                                setSuspendMode('DISCONTINUE');
                                setSuspendModalOpen(true);
                              }}
                              title="Discontinue Subject"
                            >
                              Stop
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Active Totals Footer */}
            <div className="bg-indigo-50/50 border-t border-indigo-100 p-3 rounded-b-lg flex flex-wrap items-center justify-between text-xs">
              <span className="font-semibold text-indigo-950">
                Active Subjects Summary ({enrollmentData.active_subjects.length} active)
              </span>
              <div className="flex items-center gap-4 font-mono font-bold">
                <span className="text-slate-700">
                  Total Fee: ₹{Number(enrollmentData.active_totals.total_fee).toFixed(2)}
                </span>
                <span className="text-emerald-700">
                  Total Paid: ₹{Number(enrollmentData.active_totals.total_paid).toFixed(2)}
                </span>
                <span className={Number(enrollmentData.active_totals.total_due) > 0 ? 'text-rose-600' : 'text-slate-500'}>
                  Outstanding Due: ₹{Number(enrollmentData.active_totals.total_due).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveMainTab('HISTORY')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeMainTab === 'HISTORY'
              ? 'border-indigo-600 text-indigo-700 bg-white'
              : 'border-transparent text-slate-500 hover:text-black'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Subject & Enrollment History</span>
          {enrollmentData?.historical_subjects?.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 text-slate-700">
              {enrollmentData.historical_subjects.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('INVOICES')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeMainTab === 'INVOICES'
              ? 'border-indigo-600 text-indigo-700 bg-white'
              : 'border-transparent text-slate-500 hover:text-black'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Invoices & Purchases</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 text-slate-700">
            {admTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('LEDGER')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeMainTab === 'LEDGER'
              ? 'border-indigo-600 text-indigo-700 bg-white'
              : 'border-transparent text-slate-500 hover:text-black'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Receipts & Financial Ledger</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 text-slate-700">
            {txnTotal}
          </span>
        </button>
      </div>

      {/* TAB 1: Subject & Enrollment History */}
      {activeMainTab === 'HISTORY' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-black">Subject & Enrollment History</h2>
              </div>
              <p className="text-xs text-slate-500">
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
                    `/admissions/new?student_id=${student.id}&name=${encodeURIComponent(
                      student.name
                    )}`
                  )
                }
              >
                + Enroll Another Subject
              </Button>
            )}
          </div>

          {!enrollmentData?.historical_subjects || enrollmentData.historical_subjects.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No past or inactive subject records. All current subjects (if any) are active.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100">
                  {enrollmentData.historical_subjects.map((item) => {
                    const isSuspended = item.status === 'SUSPENDED';
                    const isDiscontinued = item.status === 'DISCONTINUED';
                    const isCancelled = item.status === 'REVOKED' || item.status === 'CANCELLED';
                    const isExpired = item.is_expired;

                    let statusBadge = (
                      <Badge variant="neutral">{item.status}</Badge>
                    );
                    if (isSuspended) statusBadge = <Badge variant="warning">Suspended</Badge>;
                    else if (isDiscontinued) statusBadge = <Badge variant="neutral">Discontinued</Badge>;
                    else if (isCancelled) statusBadge = <Badge variant="danger">Cancelled</Badge>;
                    else if (isExpired) statusBadge = <Badge variant="danger">Expired</Badge>;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-semibold text-black">
                          {item.subject_name}
                          <span className="block text-[10px] text-slate-400 font-mono">
                            #{item.admission_number}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {item.teacher_name || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {item.valid_from || '—'} → {item.valid_to || '—'}
                        </td>
                        <td className="py-2.5 px-3">{statusBadge}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                          {item.lifecycle_reason || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="text-black font-semibold">₹{Number(item.net_price).toFixed(2)}</span>
                          {Number(item.balance_due) > 0 && (
                            <span className="block text-[10px] text-rose-600 font-bold">
                              Due: ₹{Number(item.balance_due).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {isSuspended && isAdmin && (
                              <Button
                                size="xs"
                                variant="success"
                                icon={PlayCircle}
                                loading={resumingItemId === item.id}
                                onClick={() => handleResumeItem(item)}
                              >
                                Resume
                              </Button>
                            )}
                            {!isCancelled && (
                              <Button
                                size="xs"
                                variant="secondary"
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
          )}
        </div>
      )}

      {/* TAB 2: Course Purchases & Batch Enrollments (Invoices) */}
      {activeMainTab === 'INVOICES' && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-black">Course Purchases & Batch Enrollments</h2>
            <p className="text-xs text-slate-500">
              History of all course purchases, rolling fee cycle validity, and payment statuses
            </p>
          </div>

          {!isRevoked && (
            <Button
              size="xs"
              variant="primary"
              icon={Plus}
              onClick={() =>
                navigate(
                  `/admissions/new?student_id=${student.id}&name=${encodeURIComponent(
                    student.name
                  )}`
                )
              }
            >
              + Purchase Another Course / Batch
            </Button>
          )}
        </div>

        {/* Admissions Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
                className="w-full pl-8 pr-7 py-1 text-xs border border-slate-300 rounded-md bg-white text-black placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {admSearch && (
                <button
                  onClick={() => {
                    setAdmSearch('');
                    setAdmPage(1);
                    fetchAdmissionsData(1, admPageSize, '', admStatusFilter);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black"
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
              className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Fully Paid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="UNPAID">Unpaid</option>
              <option value="CANCELLED">Cancelled / Revoked</option>
            </select>
          </div>

          <div className="text-xs text-slate-500">
            Total Purchases: <strong className="text-black font-mono">{admTotal}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          {admLoading ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-2">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p>Loading course purchases...</p>
            </div>
          ) : admissions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No course purchases found matching your filter criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Purchase Transaction ID</th>
                  <th className="p-2">Date & Validity</th>
                  <th className="p-2">Enrolled Items (Faculty & Hall)</th>
                  <th className="p-2 text-right">Total Payable</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2 text-right text-rose-700">Due</th>
                  <th className="p-2 text-center">Payment & Batch Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissions.map((adm) => {
                  const isBatchCancelled = adm.status === 'REVOKED' || adm.status === 'CANCELLED';
                  const validity = getValidityStatus(adm);
                  return (
                    <tr key={adm.id} className={`hover:bg-slate-50 ${isBatchCancelled ? 'bg-rose-50/40 opacity-85' : ''}`}>
                      <td className="p-2 font-mono font-bold text-black">
                        <div>{adm.purchase_transaction_id || adm.admission_number}</div>
                        {isBatchCancelled && (
                          <span className="text-[10px] text-rose-700 font-normal block">
                            (Batch Cancelled)
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-slate-600">
                        <span className="font-semibold text-black block">{adm.admission_date}</span>
                        {isBatchCancelled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-rose-50 text-rose-800 border-rose-200 mt-1">
                            {validity.subtext}
                          </span>
                        ) : adm.valid_from && adm.valid_to ? (
                          <div className="mt-1 space-y-0.5">
                            <span className="text-[10px] text-slate-700 font-mono block">
                              {adm.valid_from} &rarr; {adm.valid_to}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
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
                          <span className="text-[10px] text-slate-500 font-mono">Standard Validity</span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          {(adm.items || []).map((itm, i) => (
                            <div
                              key={i}
                              className="bg-slate-50 border border-slate-200 text-black px-2 py-0.5 rounded text-[11px]"
                            >
                              <span className="font-semibold text-indigo-950 block">{itm.item_name_snapshot}</span>
                              {(itm.teacher_name_snapshot || itm.hall_number_snapshot) && (
                                <span className="text-[10px] text-slate-600 block">
                                  {itm.teacher_name_snapshot && `Faculty: ${itm.teacher_name_snapshot}`}
                                  {itm.teacher_name_snapshot && itm.hall_number_snapshot && ' • '}
                                  {itm.hall_number_snapshot && `Hall: ${itm.hall_number_snapshot}`}
                                </span>
                              )}
                              {itm.valid_from && itm.valid_to && (
                                <span className="text-[10px] text-emerald-800 font-mono block">
                                  Period: {itm.valid_from} to {itm.valid_to}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-black">
                        ₹{Number(adm.total_payable).toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-emerald-800 font-semibold">
                        ₹{Number(adm.amount_paid).toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono text-rose-700 font-bold">
                        {isBatchCancelled ? (
                          <span className="line-through text-slate-400">₹0.00</span>
                        ) : (
                          `₹${Number(adm.balance_due).toFixed(2)}`
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {isBatchCancelled ? (
                          <div className="space-y-0.5">
                            <Badge size="xs" variant="danger">
                              CANCELLED
                            </Badge>
                            {adm.revocation_reason && (
                              <div
                                className="text-[10px] text-rose-700 italic max-w-[120px] truncate mx-auto"
                                title={adm.revocation_reason}
                              >
                                {adm.revocation_reason}
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
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {/* All Slips (Multi-Slip Picker & Full Statement) */}
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={FileText}
                            onClick={() => {
                              setSelectedAdmissionForSlips(adm);
                              setAllSlipsModalOpen(true);
                            }}
                            title="View all admission invoices, payment receipts and refund vouchers"
                          >
                            All Slips ▾
                          </Button>

                          {/* Collect Due Fee (2nd Payment) if pending */}
                          {Number(adm.balance_due) > 0 && !isBatchCancelled && !isRevoked && (
                            <Button
                              size="xs"
                              variant="success"
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

                          {/* Renew / Next Cycle button */}
                          {!isBatchCancelled && !isRevoked && (
                            <Button
                              size="xs"
                              variant={validity.isExpired ? 'danger' : validity.isExpiringSoon ? 'warning' : 'primary'}
                              onClick={() =>
                                navigate(
                                  `/admissions/new?student_id=${student.id}&name=${encodeURIComponent(
                                    student.name
                                  )}&renew=1`
                                )
                              }
                              title={validity.isExpired ? 'Renew expired batch cycle' : 'Pay next month fee cycle'}
                            >
                              {validity.isExpired ? 'Renew Batch' : '+ Next Month'}
                            </Button>
                          )}

                          {/* If Cancelled: Offer Refund (if paid) and Restore Batch */}
                          {isBatchCancelled ? (
                            <>
                              {isAdmin && Number(adm.amount_paid) > 0 && (
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => {
                                    setSelectedAdmissionForRefund(adm);
                                    setRefundModalOpen(true);
                                  }}
                                  title="Issue refund on cancelled batch"
                                >
                                  Refund
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  size="xs"
                                  variant="primary"
                                  icon={RotateCcw}
                                  loading={restoringBatchId === adm.id}
                                  onClick={() => handleRestoreBatch(adm)}
                                  title="Restore cancelled batch to Active"
                                >
                                  Restore Batch
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Cancel Batch Button (Admin Only) */}
                              {isAdmin && (
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => {
                                    setSelectedAdmissionForBatchRevoke(adm);
                                    setRevokeBatchModalOpen(true);
                                  }}
                                  title="Cancel student batch enrollment"
                                >
                                  Cancel Batch
                                </Button>
                              )}

                              {/* Issue Refund Button (Admin Only) */}
                              {isAdmin && Number(adm.amount_paid) > 0 && (
                                <Button
                                  size="xs"
                                  variant="secondary"
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
          )}
        </div>

        {/* Admissions Backend Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span>
              Showing {admTotal === 0 ? 0 : (admPage - 1) * admPageSize + 1} to{' '}
              {Math.min(admPage * admPageSize, admTotal)} of {admTotal} course purchases
            </span>
            <span className="text-slate-300">•</span>
            <label className="flex items-center gap-1 text-slate-500 text-[11px]">
              Per page:
              <select
                value={admPageSize}
                onChange={(e) => {
                  setAdmPageSize(Number(e.target.value));
                  setAdmPage(1);
                }}
                className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-black font-semibold text-xs"
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
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setAdmPage((p) => Math.max(1, p - 1))}
              disabled={admPage <= 1 || admLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <span className="px-2 font-bold text-black">
              Page {admPage} of {Math.max(1, admTotalPages)}
            </span>
            <button
              onClick={() => setAdmPage((p) => Math.min(admTotalPages, p + 1))}
              disabled={admPage >= admTotalPages || admLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setAdmPage(admTotalPages)}
              disabled={admPage >= admTotalPages || admLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* TAB 3: Financial Transactions & Receipts Ledger */}
      {activeMainTab === 'LEDGER' && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-black">
                Financial Transactions & Receipts Ledger
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Audit trail of all receipts collected (initial payment, 2nd payments / due settlement) and refund vouchers with official slips
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold">
              Total Receipts: ₹{transactions.filter((t) => t.type === 'PAYMENT').reduce((acc, t) => acc + (Number(t.amount) || 0), 0).toFixed(2)}
            </span>
            {transactions.some((t) => t.type === 'REFUND') && (
              <span className="font-mono bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded font-bold">
                Total Refunded: ₹{Math.abs(transactions.filter((t) => t.type === 'REFUND').reduce((acc, t) => acc + (Number(t.amount) || 0), 0)).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Search and Filters for Financial Transactions Ledger */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search receipts by #, note, mode, cashier, or ref..."
                value={txnSearch}
                onChange={(e) => setTxnSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setTxnPage(1);
                    fetchTransactionsData(1, txnPageSize, txnSearch, txnModeFilter, txnTypeFilter);
                  }
                }}
                className="w-full pl-8 pr-7 py-1 text-xs border border-slate-300 rounded-md bg-white text-black placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {txnSearch && (
                <button
                  onClick={() => {
                    setTxnSearch('');
                    setTxnPage(1);
                    fetchTransactionsData(1, txnPageSize, '', txnModeFilter, txnTypeFilter);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black"
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
              className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {txnsLoading ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-2">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p>Loading financial transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No payment transactions or refund vouchers found matching your filter criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Receipt / Voucher #</th>
                  <th className="p-2">Date & Time</th>
                  <th className="p-2">Type & Purpose</th>
                  <th className="p-2">Course Ref</th>
                  <th className="p-2">Payment Mode</th>
                  <th className="p-2">Handled By</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((txn) => {
                  const isRefund = txn.type === 'REFUND';
                  return (
                    <tr
                      key={txn.id}
                      className={`hover:bg-slate-50 ${isRefund ? 'bg-rose-50/30' : ''}`}
                    >
                      <td className="p-2 font-mono font-bold">
                        <span className="flex items-center gap-1.5">
                          {isRefund ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span className={isRefund ? 'text-rose-700' : 'text-indigo-900'}>
                            {txn.number}
                          </span>
                        </span>
                      </td>
                      <td className="p-2 text-slate-600">
                        {txn.date
                          ? new Date(txn.date).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="p-2">
                        {isRefund ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                            Refund Voucher
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            Fee Payment
                          </span>
                        )}
                        {txn.notes && (
                          <span className="block text-[10px] text-slate-500 italic truncate max-w-[200px]">
                            {txn.notes}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {txn.admission_number ? (
                          <div>
                            <span className="font-mono font-bold text-indigo-700 block">
                              {txn.admission_number}
                            </span>
                            {txn.course_name && (
                              <span
                                className="text-[11px] text-slate-600 block line-clamp-1 max-w-[200px]"
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
                      <td className="p-2 font-semibold text-slate-800">
                        <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                          {txn.mode}
                        </span>
                        {txn.ref && (
                          <span className="block text-[10px] text-slate-500 font-mono">
                            Ref: {txn.ref}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-slate-600">
                        {txn.collector || 'Admin'}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-sm">
                        {isRefund ? (
                          <span className="text-rose-700">-₹{Math.abs(Number(txn.amount) || 0).toFixed(2)}</span>
                        ) : (
                          <span className="text-emerald-700">+₹{(Number(txn.amount) || 0).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="xs"
                          variant="secondary"
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
          )}
        </div>

        {/* Transactions Backend Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-200 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span>
              Showing {txnTotal === 0 ? 0 : (txnPage - 1) * txnPageSize + 1} to{' '}
              {Math.min(txnPage * txnPageSize, txnTotal)} of {txnTotal} transactions
            </span>
            <span className="text-slate-300">•</span>
            <label className="flex items-center gap-1 text-slate-500 text-[11px]">
              Per page:
              <select
                value={txnPageSize}
                onChange={(e) => {
                  setTxnPageSize(Number(e.target.value));
                  setTxnPage(1);
                }}
                className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-black font-semibold text-xs"
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
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First Page"
            >
              <ChevronsLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
              disabled={txnPage <= 1 || txnsLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <span className="px-2 font-bold text-black">
              Page {txnPage} of {Math.max(1, txnTotalPages)}
            </span>
            <button
              onClick={() => setTxnPage((p) => Math.min(txnTotalPages, p + 1))}
              disabled={txnPage >= txnTotalPages || txnsLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
            <button
              onClick={() => setTxnPage(txnTotalPages)}
              disabled={txnPage >= txnTotalPages || txnsLoading}
              className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last Page"
            >
              <ChevronsRight className="w-3.5 h-3.5 text-slate-700" />
            </button>
          </div>
        </div>
      </div>
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

      {/* Revoke Batch Modal */}
      <RevokeBatchModal
        isOpen={revokeBatchModalOpen}
        onClose={() => {
          setRevokeBatchModalOpen(false);
          setSelectedAdmissionForBatchRevoke(null);
        }}
        admission={selectedAdmissionForBatchRevoke}
        onSuccess={async (res, hasRefund) => {
          await fetchStudentData();
          if (hasRefund && selectedAdmissionForBatchRevoke) {
            try {
              const refList = await paymentApi.listRefunds({
                admission_id: selectedAdmissionForBatchRevoke.id,
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
        onSuccess={() => fetchStudentData()}
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

      {/* Suspend or Discontinue Modal */}
      <SuspendDiscontinueModal
        isOpen={suspendModalOpen}
        onClose={() => {
          setSuspendModalOpen(false);
          setSelectedAdmissionForSuspend(null);
          setSelectedItemForSuspend(null);
        }}
        admission={selectedAdmissionForSuspend}
        item={selectedItemForSuspend}
        mode={suspendMode}
        onSuccess={() => fetchStudentData()}
      />
    </div>
  );
}
