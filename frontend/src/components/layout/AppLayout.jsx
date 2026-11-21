import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import QuickStudentModal from '../modals/QuickStudentModal';
import QuickPaymentModal from '../modals/QuickPaymentModal';
import PaymentReceiptModal from '../receipts/PaymentReceiptModal';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState(null);

  const handlePaymentSuccess = (receipt) => {
    setReceiptToShow(receipt);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden w-full max-w-full">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full lg:pl-64 overflow-x-hidden">
        {/* Top Header */}
        <Topbar
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onQuickStudent={() => setIsStudentModalOpen(true)}
          onQuickPayment={() => setIsPaymentModalOpen(true)}
        />

        {/* Dynamic page content */}
        <main className="flex-1 px-3.5 py-4 sm:px-6 sm:py-5 overflow-y-auto overflow-x-hidden min-w-0 w-full max-w-full">
          <Outlet />
        </main>
      </div>

      {/* Global Quick Action Modals */}
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
