import React from 'react';
import { useAuth } from '../../context/AuthContext';
import AdminDashboard from './AdminDashboard';
import CashierDashboard from './CashierDashboard';
import TeacherDashboard from './TeacherDashboard';

export default function DashboardSwitcher() {
  const { role, isAdmin, isCashier, isTeacher } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }
  if (isCashier) {
    return <CashierDashboard />;
  }
  if (isTeacher) {
    return <TeacherDashboard />;
  }

  return (
    <div className="p-8 text-center text-xs text-slate-500">
      Loading your role-specific dashboard...
    </div>
  );
}
