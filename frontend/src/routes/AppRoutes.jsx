import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';

// Pages
import LoginPage from '../pages/auth/LoginPage';
import DashboardSwitcher from '../pages/dashboard/DashboardSwitcher';
import TeachersPage from '../pages/teachers/TeachersPage';
import TeacherDetailPage from '../pages/teachers/TeacherDetailPage';
import StudentsPage from '../pages/students/StudentsPage';
import StudentDetailPage from '../pages/students/StudentDetailPage';
import EnquiriesPage from '../pages/enquiries/EnquiriesPage';
import EnquiryDetailPage from '../pages/enquiries/EnquiryDetailPage';
import SubjectsPage from '../pages/subjects/SubjectsPage';
import SubjectDetailPage from '../pages/subjects/SubjectDetailPage';
import BatchesPage from '../pages/batches/BatchesPage';
import BatchDetailPage from '../pages/batches/BatchDetailPage';
import GreenCardPage from '../pages/greencard/GreenCardPage';
import AdmissionsPage from '../pages/admissions/AdmissionsPage';
import NewAdmissionPage from '../pages/admissions/NewAdmissionPage';
import AdmissionDetailPage from '../pages/admissions/AdmissionDetailPage';
import PaymentsPage from '../pages/payments/PaymentsPage';
import PaymentDetailPage from '../pages/payments/PaymentDetailPage';
import RemindersPage from '../pages/reminders/RemindersPage';
import ExpensesPage from '../pages/expenses/ExpensesPage';
import SubjectRevenuePage from '../pages/reports/SubjectRevenuePage';
import CashFlowPage from '../pages/reports/CashFlowPage';
import ReportsHubPage from '../pages/reports/ReportsHubPage';
import StaffUsersPage from '../pages/users/StaffUsersPage';
import AuditLogPage from '../pages/audit/AuditLogPage';
import PublicVerifyPage from '../pages/verify/PublicVerifyPage';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">
        Authenticating...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Public Verification Portal (No login required) */}
      <Route path="/verify" element={<PublicVerifyPage />} />
      <Route path="/verify/:identifier" element={<PublicVerifyPage />} />

      {/* Protected App Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardSwitcher />} />

        {/* Admissions & Course Purchases (Admin & Cashier) */}
        <Route
          path="admissions"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <AdmissionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admissions/new"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <NewAdmissionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admissions/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <AdmissionDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Payments Ledger (Admin & Cashier) */}
        <Route
          path="payments"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <PaymentDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Due Reminders & WhatsApp Queue (Admin & Cashier) */}
        <Route
          path="reminders"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <RemindersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="due-reminders"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <RemindersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <RemindersPage />
            </ProtectedRoute>
          }
        />

        {/* Students (Admin & Cashier) */}
        <Route
          path="students"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <StudentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <StudentDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Enquiries & Demos (Admin & Cashier) */}
        <Route
          path="enquiries"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <EnquiriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="enquiries/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <EnquiryDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Faculty & Teachers */}
        <Route
          path="teachers"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <TeachersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER', 'TEACHER']}>
              <TeacherDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Subjects & Batches */}
        <Route
          path="subjects"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SubjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SubjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/subject/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SubjectDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="batches"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <BatchesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="batches/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <BatchDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/batch/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <BatchDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Other Operations */}
        <Route
          path="green-card"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <GreenCardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <ReportsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/:reportTab"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <ReportsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/subject-revenue"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SubjectRevenuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/cash-flow"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <CashFlowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <StaffUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <StaffUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
