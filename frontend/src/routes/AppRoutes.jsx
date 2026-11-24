import React from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
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
import GreenCardPage from '../pages/greencard/GreenCardPage';
import AdmissionsPage from '../pages/admissions/AdmissionsPage';
import NewAdmissionPage from '../pages/admissions/NewAdmissionPage';
import AdmissionDetailPage from '../pages/admissions/AdmissionDetailPage';
import PaymentsPage from '../pages/payments/PaymentsPage';
import PaymentDetailPage from '../pages/payments/PaymentDetailPage';
import RemindersPage from '../pages/reminders/RemindersPage';
import RenewalsPage from '../pages/renewals/RenewalsPage';
import ExpensesPage from '../pages/expenses/ExpensesPage';
import SubjectRevenuePage from '../pages/reports/SubjectRevenuePage';
import CashFlowPage from '../pages/reports/CashFlowPage';
import ReportsHubPage from '../pages/reports/ReportsHubPage';
import StaffUsersPage from '../pages/users/StaffUsersPage';
import SettingsPage from '../pages/settings/SettingsPage';
import AuditLogPage from '../pages/audit/AuditLogPage';
import PublicVerifyPage from '../pages/verify/PublicVerifyPage';
import PublicIDCardPage from '../pages/idcard/PublicIDCardPage';
import TeacherAttendancePage from '../pages/teachers/TeacherAttendancePage';

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

function NavigateWithSearch({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

function AdmissionsIdRedirect() {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`/enrollments/${id}${location.search}`} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Public Verification Portal (No login required) */}
      <Route path="/verify" element={<PublicVerifyPage />} />
      <Route path="/verify/:identifier" element={<PublicVerifyPage />} />

      {/* Public ID Card Portal (No login required) */}
      <Route path="/id-card" element={<PublicIDCardPage />} />
      <Route path="/id-card/:identifier" element={<PublicIDCardPage />} />
      <Route path="/idcard" element={<PublicIDCardPage />} />
      <Route path="/idcard/:identifier" element={<PublicIDCardPage />} />
      <Route path="/public/id-card" element={<PublicIDCardPage />} />
      <Route path="/public/id-card/:identifier" element={<PublicIDCardPage />} />

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

        {/* Enrollment (Courses) (Admin & Cashier) */}
        <Route
          path="enrollments"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <AdmissionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="enrollments/new"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <NewAdmissionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="enrollments/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <AdmissionDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Redirects from old /admissions routes to keep links & bookmarks working */}
        <Route path="admissions" element={<NavigateWithSearch to="/enrollments" />} />
        <Route path="admissions/new" element={<NavigateWithSearch to="/enrollments/new" />} />
        <Route path="admissions/:id" element={<AdmissionsIdRedirect />} />

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

        {/* Course Renewals (Admin & Cashier) */}
        <Route
          path="renewals"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <RenewalsPage />
            </ProtectedRoute>
          }
        />

        {/* Students (Admin, Cashier, Teacher) */}
        <Route
          path="students"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER', 'TEACHER']}>
              <StudentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="students/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER', 'TEACHER']}>
              <StudentDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Enquiries & Demos (Admin only) */}
        <Route
          path="enquiries"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <EnquiriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="enquiries/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <EnquiryDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Faculty & Teachers */}
        <Route
          path="teachers"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TeachersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers/attendance"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <TeacherAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teacher-attendance"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <TeacherAttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}>
              <TeacherDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Subjects (Admin & Teacher) */}
        <Route
          path="subjects"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}>
              <SubjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="subjects/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']}>
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
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ReportsHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/:reportTab"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
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
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <SettingsPage />
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
