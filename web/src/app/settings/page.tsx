"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const result = await apiClient.getUser();
        setUser(result.data || result.user);
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : user ? (
          <div className="max-w-2xl">
            {/* Profile Section */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
              <h2 className="text-lg font-semibold mb-4">Profile Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">Email</label>
                  <p className="text-lg">{user.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Tag</label>
                  <p className="text-lg">@{user.tag}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">KYC Status</label>
                  <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm mt-2">
                    {user.kyc_status || "Pending"}
                  </span>
                </div>
              </div>
            </div>

            {/* Security Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold mb-4">Security</h2>
              <div className="space-y-4">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Change Password
                </button>
                {user.two_factor_enabled ? (
                  <div className="p-4 bg-green-100 rounded-lg">
                    <p className="text-green-800">✓ Two-factor authentication enabled</p>
                  </div>
                ) : (
                  <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                    Enable Two-Factor Authentication
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">Failed to load user data</div>
        )}
      </div>
    </DashboardLayout>
  );
}
