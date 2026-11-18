import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';

// Pages
import LoginPage from '../pages/auth/LoginPage';
import DashboardSwitcher from '../pages/dashboard/DashboardSwitcher';
import TeachersPage from '../pages/teachers/TeachersPage';
import StudentsPage from '../pages/students/StudentsPage';
import StudentDetailPage from '../pages/students/StudentDetailPage';
import EnquiriesPage from '../pages/enquiries/EnquiriesPage';
import SubjectsPage from '../pages/subjects/SubjectsPage';
import BatchesPage from '../pages/batches/BatchesPage';
import GreenCardPage from '../pages/greencard/GreenCardPage';
import AdmissionsPage from '../pages/admissions/AdmissionsPage';
import NewAdmissionPage from '../pages/admissions/NewAdmissionPage';
import PaymentsPage from '../pages/payments/PaymentsPage';
import ExpensesPage from '../pages/expenses/ExpensesPage';
import SubjectRevenuePage from '../pages/reports/SubjectRevenuePage';
import CashFlowPage from '../pages/reports/CashFlowPage';
import StaffUsersPage from '../pages/users/StaffUsersPage';

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

        {/* Admissions & Payments (Admin & Cashier) */}
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
          path="payments"
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']}>
              <PaymentsPage />
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

        {/* Admin Only Operations */}
        <Route
          path="teachers"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TeachersPage />
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
          path="subjects"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SubjectsPage />
            </ProtectedRoute>
          }
        />
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
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
