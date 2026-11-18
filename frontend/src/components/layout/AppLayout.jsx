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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header */}
        <Topbar
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onQuickStudent={() => setIsStudentModalOpen(true)}
          onQuickPayment={() => setIsPaymentModalOpen(true)}
        />

        {/* Dynamic page content */}
        <main className="flex-1 p-3 sm:p-5 overflow-y-auto">
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
