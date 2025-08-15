import React from 'react';
import { 
  Home, 
  ArrowUpDown, 
  ArrowRightLeft, 
  CreditCard, 
  Settings, 
  BarChart3,
  QrCode,
  Users,
  DollarSign,
  Receipt,
  UserPlus,
  Coins
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import PayCryptLogo from './Logo';

interface SidebarProps {
  isAdmin?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isAdmin = false }) => {
  const userMenuItems = [
    { to: '/', label: 'Dashboard', icon: Home, end: true },
    { to: '/balances', label: 'Balances', icon: CreditCard },
    { to: '/multi-currency', label: 'Multi-Currency', icon: Coins },
    { to: '/deposits', label: 'Deposits', icon: ArrowUpDown },
    { to: '/qr-code', label: 'QR Code', icon: QrCode },
    { to: '/withdraw', label: 'Withdraw', icon: CreditCard },
    { to: '/swap', label: 'Swap', icon: ArrowRightLeft },
    { to: '/bills', label: 'Pay Bills', icon: Receipt },
    { to: '/split', label: 'Split Payment', icon: UserPlus },
    { to: '/settings', label: 'Settings', icon: Settings }
  ];

  const adminMenuItems = [
    { to: '/admin/overview', label: 'Overview', icon: BarChart3 },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/payouts', label: 'Payouts', icon: DollarSign },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 }
  ];

  const menuItems = isAdmin ? adminMenuItems : userMenuItems;

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      <div className="p-6">
        <PayCryptLogo className="w-10 h-10" showText={true} />
      </div>

      <nav className="px-4 space-y-1 flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-100">
          <div className="text-sm font-medium text-gray-800">Need Help?</div>
          <div className="text-xs text-gray-600 mt-1">
            Contact our support team for assistance
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;