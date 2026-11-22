import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import CoachingAppsModal from './CoachingAppsModal';
import BottomNav from './BottomNav';
import QuickStudentModal from '../modals/QuickStudentModal';
import QuickPaymentModal from '../modals/QuickPaymentModal';
import PaymentReceiptModal from '../receipts/PaymentReceiptModal';

export default function AppLayout() {
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState(null);

  const handlePaymentSuccess = (receipt) => {
    setReceiptToShow(receipt);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 antialiased font-sans">
      {/* 1. Top Navbar in Odoo / Hostel ERP style */}
      <Topbar
        onOpenAppMenu={() => setAppMenuOpen(true)}
        onQuickStudent={() => setIsStudentModalOpen(true)}
        onQuickPayment={() => setIsPaymentModalOpen(true)}
      />

      {/* 2. Main Page Content (outlet for React Router) */}
      <main className="flex-1 w-full max-w-full px-3.5 py-4 sm:px-6 sm:py-5 pb-20 md:pb-8 overflow-y-auto overflow-x-hidden min-w-0">
        <Outlet />
      </main>

      {/* 3. Mobile Fixed Bottom Navigation Bar */}
      <BottomNav onOpenAppMenu={() => setAppMenuOpen(true)} />

      {/* 4. Coaching ERP Apps Modal */}
      <CoachingAppsModal
        isOpen={appMenuOpen}
        onClose={() => setAppMenuOpen(false)}
      />

      {/* 5. Global Action Modals */}
      <QuickStudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
      />

      <QuickPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <PaymentReceiptModal
        isOpen={!!receiptToShow}
        onClose={() => setReceiptToShow(null)}
        receipt={receiptToShow}
      />
    </div>
  );
}
