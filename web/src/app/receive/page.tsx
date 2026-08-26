"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useState } from "react";

export default function ReceivePage() {
  const [user, setUser] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, walletsRes] = await Promise.all([
          apiClient.getUser(),
          apiClient.getWallets(),
        ]);
        setUser(userRes.data || userRes.user);
        setWallets(walletsRes.data || []);
      } catch (error) {
        console.error("Failed to fetch receive data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold mb-8">Receive Payment</h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Your Tag */}
            {user && (
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold mb-4">Your Tag</h2>
                <div className="p-4 bg-gray-100 rounded-lg text-center">
                  <p className="text-3xl font-bold">@{user.tag}</p>
                  <p className="text-sm text-gray-600 mt-2">
                    Share this tag to receive payments
                  </p>
                </div>
              </div>
            )}

            {/* Wallet Addresses */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-lg font-semibold mb-4">Wallet Addresses</h2>
              <div className="space-y-4">
                {wallets.map((wallet) => (
                  <div key={wallet.id} className="p-3 bg-gray-100 rounded-lg">
                    <p className="text-sm font-medium text-gray-600">
                      {wallet.chain || "Chain"}
                    </p>
                    <p className="text-sm font-mono break-all">
                      {wallet.address}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
