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
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import RevokeStudentModal from '../../components/modals/RevokeStudentModal';
import RevokeBatchModal from '../../components/modals/RevokeBatchModal';

function getValidityStatus(adm) {
  if (adm.status === 'REVOKED') {
    return {
      status: 'REVOKED',
      badgeVariant: 'danger',
      label: 'Revoked',
      subtext: adm.revoked_at ? `Revoked on ${new Date(adm.revoked_at).toLocaleDateString('en-IN')}` : 'Revoked',
      isExpired: false,
      isExpiringSoon: false,
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

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetAdmissionId, setTargetAdmissionId] = useState(null);
  const [receiptToShow, setReceiptToShow] = useState(null);
  const [admissionSlipToShow, setAdmissionSlipToShow] = useState(null);

  // Revocation & Refund Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeBatchModalOpen, setRevokeBatchModalOpen] = useState(false);
  const [selectedAdmissionForBatchRevoke, setSelectedAdmissionForBatchRevoke] = useState(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedAdmissionForRefund, setSelectedAdmissionForRefund] = useState(null);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoringBatchId, setRestoringBatchId] = useState(null);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const [stRes, admRes, payRes, refRes] = await Promise.all([
        studentApi.get(id),
        admissionApi.list({ student_id: id, page_size: 50 }),
        paymentApi.list({ student_id: id, page_size: 100 }),
        paymentApi.listRefunds({ student_id: id, page_size: 100 }),
      ]);
      setStudent(stRes);
      setAdmissions(admRes.items || []);

      const payTxns = (payRes.items || []).map((p) => {
        const matchedAdm = (admRes.items || []).find((a) => a.id === p.admission_id);
        const courseName =
          p.course_name ||
          matchedAdm?.items?.map((i) => i.item_name_snapshot).join(', ') ||
          '';
        const admNo =
          p.admission_number ||
          matchedAdm?.purchase_transaction_id ||
          matchedAdm?.admission_number;
        return {
          id: p.id,
          type: 'PAYMENT',
          number: p.payment_number,
          date: p.payment_date,
          amount: Number(p.amount),
          mode: p.payment_mode,
          ref: p.transaction_reference,
          notes: p.notes,
          collector: p.collector_name_snapshot,
          admission_id: p.admission_id,
          admission_number: admNo,
          course_name: courseName,
          fee_period: p.fee_period,
          raw: p,
        };
      });

      const refTxns = (refRes.items || []).map((r) => {
        const matchedAdm = (admRes.items || []).find((a) => a.id === r.admission_id);
        const courseName =
          r.course_name ||
          matchedAdm?.items?.map((i) => i.item_name_snapshot).join(', ') ||
          '';
        const admNo =
          r.admission_number ||
          matchedAdm?.purchase_transaction_id ||
          matchedAdm?.admission_number;
        return {
          id: r.id,
          type: 'REFUND',
          number: r.refund_number,
          date: r.refund_date,
          amount: -Number(r.amount),
          mode: r.refund_mode,
          ref: null,
          notes: r.reason,
          collector: r.processor_name_snapshot,
          admission_id: r.admission_id,
          admission_number: admNo,
          course_name: courseName,
          fee_period: null,
          raw: r,
        };
      });

      const allTxns = [...payTxns, ...refTxns].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      setTransactions(allTxns);
    } catch (err) {
      error(err.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [id]);

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

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500 animate-pulse">Loading Student Profile...</div>;
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

  return (
    <div className="space-y-4">
      {/* Revocation Alert Banner */}
      {isRevoked && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-950 uppercase tracking-wider block">
                STUDENT ADMISSION HAS BEEN REVOKED
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
                <span className="text-rose-600">{student.revoked_admissions_count} Revoked</span>
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
          <span className="text-[10px] text-slate-500">Active courses fee</span>
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

      {/* Admissions / Purchases Taken List */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-black">Course Purchases & Batch Enrollments</h2>
            <p className="text-xs text-slate-500">
              History of all course purchases, validity coverage (active vs expiring/expired), and payments
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

        <div className="mt-3 overflow-x-auto">
          {admissions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No course purchases recorded for this student yet.
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
                  const isBatchRevoked = adm.status === 'REVOKED';
                  const validity = getValidityStatus(adm);
                  return (
                    <tr key={adm.id} className={`hover:bg-slate-50 ${isBatchRevoked ? 'bg-rose-50/40 opacity-85' : ''}`}>
                      <td className="p-2 font-mono font-bold text-black">
                        <div>{adm.purchase_transaction_id || adm.admission_number}</div>
                        {isBatchRevoked && (
                          <span className="text-[10px] text-rose-700 font-normal">
                            (Batch Revoked)
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-slate-600">
                        <span className="font-semibold text-black block">{adm.admission_date}</span>
                        {adm.valid_from && adm.valid_to ? (
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
                        {isBatchRevoked ? (
                          <span className="line-through text-slate-400">₹0.00</span>
                        ) : (
                          `₹${Number(adm.balance_due).toFixed(2)}`
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {isBatchRevoked ? (
                          <div className="space-y-0.5">
                            <Badge size="xs" variant="danger">
                              REVOKED
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
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={Printer}
                            onClick={() => setAdmissionSlipToShow(adm)}
                          >
                            Slip
                          </Button>

                          {/* Collect Due Fee (2nd Payment) if pending */}
                          {Number(adm.balance_due) > 0 && !isBatchRevoked && !isRevoked && (
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
                          {!isBatchRevoked && !isRevoked && (
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
                              title="Pay next month fee cycle / renew batch"
                            >
                              {validity.isExpired ? 'Renew Batch' : '+ Next Month'}
                            </Button>
                          )}

                          {/* If Revoked: Offer Refund (if paid) and Restore Batch */}
                          {isBatchRevoked ? (
                            <>
                              {isAdmin && Number(adm.amount_paid) > 0 && (
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => {
                                    setSelectedAdmissionForRefund(adm);
                                    setRefundModalOpen(true);
                                  }}
                                  title="Issue refund on revoked batch"
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
                                >
                                  Restore
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Revoke Batch Button (Admin Only) */}
                              {isAdmin && (
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() => {
                                    setSelectedAdmissionForBatchRevoke(adm);
                                    setRevokeBatchModalOpen(true);
                                  }}
                                >
                                  Revoke
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
      </div>

      {/* Financial Transactions & Receipts Ledger */}
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
              Total Receipts: ₹{transactions.filter((t) => t.type === 'PAYMENT').reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
            </span>
            {transactions.some((t) => t.type === 'REFUND') && (
              <span className="font-mono bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded font-bold">
                Total Refunded: ₹{Math.abs(transactions.filter((t) => t.type === 'REFUND').reduce((acc, t) => acc + t.amount, 0)).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No payment transactions or refund vouchers recorded for this student yet.
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
                          <span className="text-rose-700">-₹{Math.abs(txn.amount).toFixed(2)}</span>
                        ) : (
                          <span className="text-emerald-700">+₹{txn.amount.toFixed(2)}</span>
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
      </div>

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
    </div>
  );
}
