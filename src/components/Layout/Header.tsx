import React from 'react';
import { Bell, User, ChevronDown } from 'lucide-react';
import { mockUser } from '../../utils/mockData';

interface HeaderProps {
  isAdmin?: boolean;
}

const Header: React.FC<HeaderProps> = ({ isAdmin = false }) => {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdmin ? 'Admin Dashboard' : 'Dashboard'}
          </h1>
          <p className="text-gray-600">
            {isAdmin ? 'Manage users and monitor system activity' : `Welcome back, @${mockUser.tag}`}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </button>

          <div className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-sm">
              <div className="font-medium text-gray-900">
                {isAdmin ? 'Admin User' : `@${mockUser.tag}`}
              </div>
              <div className="text-gray-500">
                {isAdmin ? 'System Administrator' : mockUser.walletAddress.slice(0, 8) + '...'}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;