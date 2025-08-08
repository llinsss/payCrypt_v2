import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useWebSocket } from './hooks/useWebSocket';
import AuthPage from './components/Auth/AuthPage';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import UserDashboard from './components/Dashboard/UserDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
import AdminUsers from './components/Admin/AdminUsers';
import AdminPayouts from './components/Admin/AdminPayouts';
import BalancesView from './components/Balances/BalancesView';
import DepositsView from './components/Deposits/DepositsView';
import QRCodeGenerator from './components/QRCode/QRCodeGenerator';
import WithdrawView from './components/Withdraw/WithdrawView';
import SwapView from './components/Swap/SwapView';
import BillsView from './components/Bills/BillsView';
import SplitPaymentView from './components/Split/SplitPaymentView';
import MultiCurrencyView from './components/MultiCurrency/MultiCurrencyView';
import SettingsView from './components/Settings/SettingsView';

const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const { isConnected, messages } = useWebSocket('ws://localhost:3001', user?.id);

  if (!user) {
    return <AuthPage />;
  }

  const isAdmin = user.role === 'admin';

  const renderContent = () => {
    if (isAdmin) {
      switch (activeTab) {
        case 'admin-overview':
          return <AdminDashboard />;
        case 'admin-users':
          return <AdminUsers />;
        case 'admin-transactions':
          return <AdminPayouts />;
        case 'admin-analytics':
          return <div className="text-center py-12 text-gray-500">Admin Analytics Panel - Coming Soon</div>;
        default:
          return <AdminDashboard />;
      }
    }

    switch (activeTab) {
      case 'dashboard':
        return <UserDashboard />;
      case 'balances':
        return <BalancesView />;
      case 'multi-currency':
        return <MultiCurrencyView />;
      case 'deposits':
        return <DepositsView />;
      case 'qr-code':
        return <QRCodeGenerator />;
      case 'withdraw':
        return <WithdrawView />;
      case 'swap':
        return <SwapView />;
      case 'bills':
        return <BillsView />;
      case 'split':
        return <SplitPaymentView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <UserDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isAdmin={isAdmin}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header isAdmin={isAdmin} />
        
        {/* WebSocket Status */}
        {isConnected && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2">
            <div className="flex items-center space-x-2 text-sm text-emerald-700">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>Live updates connected</span>
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;