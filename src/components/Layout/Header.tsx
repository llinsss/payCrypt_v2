import React, { useEffect, useState } from "react";
import { Bell, User, ChevronDown, Menu } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/api";

interface HeaderProps {
  isAdmin?: boolean;
  onMenuClick?: () => void;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

const Header: React.FC<HeaderProps> = ({ isAdmin = false, onMenuClick }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch unread notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await apiClient.get("/notifications/unread");
        setNotifications(res.data || []);
      } catch (err) {
        console.error("Failed to load notifications:", err);
      }
    };
    fetchNotifications();
  }, []);

  // Mark notification as read
  const markAsRead = async (id: string) => {
    try {
      await apiClient.put(`/notifications/${id}`);
      setNotifications(
        (prev) => prev.filter((n) => n.id !== id) // remove after marking read
      );
    } catch (err) {
      console.error("Failed to update notification:", err);
    }
  };

  const unreadCount = notifications.length;

  return (
    <header className="z-[99] bg-white border-b border-gray-200 px-4 lg:px-6 py-4 fixed w-full lg:w-[calc(100%-280px)] h-[80px] lg:-ml-[0px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
              {isAdmin ? "Admin Dashboard" : "Dashboard"}
            </h1>
            <p className="text-gray-600 text-sm lg:text-base hidden sm:block">
              {isAdmin
                ? "Manage users and monitor system activity"
                : `Welcome back, @${user?.tag}`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 lg:space-x-4 relative">
          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-semibold text-white bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                  <span className="font-semibold text-gray-700">
                    Notifications
                  </span>
                  <span className="text-sm text-gray-500">
                    {unreadCount} unread
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-gray-500 text-sm text-center">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
                      >
                        <div className="font-medium text-gray-900">
                          {n.title}
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          {n.body}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <div className="flex items-center space-x-1 lg:space-x-2 cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-blue-800 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-sm hidden sm:block">
              <div className="font-medium text-gray-900">
                {isAdmin ? "Admin" : `@${user?.tag}`}
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
