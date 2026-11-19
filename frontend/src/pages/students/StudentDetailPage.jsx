import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Award,
  CreditCard,
  Plus,
  FileText,
  Printer,
  UserX,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StatCard from '../../components/common/StatCard';
import { studentApi, admissionApi, paymentApi } from '../../services/allApis';
import { useToast } from '../../context/ToastContext';
import QuickPaymentModal from '../../components/modals/QuickPaymentModal';
import PaymentReceiptModal from '../../components/receipts/PaymentReceiptModal';
import AdmissionReceiptModal from '../../components/receipts/AdmissionReceiptModal';
import IssueRefundModal from '../../components/modals/IssueRefundModal';
import RefundReceiptModal from '../../components/receipts/RefundReceiptModal';
import RevokeStudentModal from '../../components/modals/RevokeStudentModal';

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [student, setStudent] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetAdmissionId, setTargetAdmissionId] = useState(null);
  const [receiptToShow, setReceiptToShow] = useState(null);
  const [admissionSlipToShow, setAdmissionSlipToShow] = useState(null);

  // Revocation & Refund Modals
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedAdmissionForRefund, setSelectedAdmissionForRefund] = useState(null);
  const [refundReceiptToShow, setRefundReceiptToShow] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const [stRes, admRes] = await Promise.all([
        studentApi.get(id),
        admissionApi.list({ student_id: id, page_size: 50 }),
      ]);
      setStudent(stRes);
      setAdmissions(admRes.items || []);
    } catch (err) {
      error(err.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [id]);

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
          {/* Revoke / Restore Button */}
          {isRevoked ? (
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
              + Enroll in Another Course / Batch
            </Button>
          )}
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Admissions
          </span>
          <div className="text-xl font-bold text-black mt-0.5">{student.admissions_count}</div>
          <span className="text-[10px] text-slate-500">Course admissions taken</span>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">
            Total Billed Fees
          </span>
          <div className="text-xl font-bold text-black mt-0.5">
            ₹{Number(student.total_billed).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">Gross payable amount</span>
        </div>

        <div className="bg-white rounded-lg border border-emerald-200 border-l-4 border-l-emerald-600 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase">
            Total Fees Paid
          </span>
          <div className="text-xl font-bold text-emerald-800 mt-0.5">
            ₹{Number(student.total_paid).toFixed(2)}
          </div>
          <span className="text-[10px] text-emerald-700">Receipts collected</span>
        </div>

        <div className="bg-white rounded-lg border border-rose-200 border-l-4 border-l-rose-500 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-800 uppercase">
            Current Balance Due
          </span>
          <div className="text-xl font-bold text-rose-800 mt-0.5">
            ₹{Number(student.total_balance_due).toFixed(2)}
          </div>
          <span className="text-[10px] text-rose-700">Pending payment</span>
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

      {/* Admissions Taken List */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
        <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-black">Admissions & Enrolled Batches / Courses</h2>
            <p className="text-xs text-slate-500">
              History of all course purchases, subjects with classroom halls & faculty snapshots, and payments
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
              Add Another Course / Batch
            </Button>
          )}
        </div>

        <div className="mt-3 overflow-x-auto">
          {admissions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No admissions recorded for this student yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Admission No</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Enrolled Items (Faculty & Hall)</th>
                  <th className="p-2 text-right">Total Payable</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2 text-right text-rose-700">Due</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono font-bold text-black">{adm.admission_number}</td>
                    <td className="p-2 text-slate-600">{adm.admission_date}</td>
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
                      ₹{Number(adm.balance_due).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
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
                        {adm.payment_status}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={Printer}
                          onClick={() => setAdmissionSlipToShow(adm)}
                        >
                          Slip
                        </Button>

                        {/* Issue Refund Button */}
                        {Number(adm.amount_paid) > 0 && (
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

                        {/* Pay Due Button */}
                        {Number(adm.balance_due) > 0 && !isRevoked && (
                          <Button
                            size="xs"
                            variant="success"
                            onClick={() => {
                              setTargetAdmissionId(adm.id);
                              setPayModalOpen(true);
                            }}
                          >
                            Pay
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
