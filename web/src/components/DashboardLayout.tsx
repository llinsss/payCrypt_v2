"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = document.cookie.includes("authToken");
        if (!token) {
          router.push("/login");
        }
      } catch {
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

  const handleLogout = () => {
    document.cookie = "authToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <h2 className="text-xl font-bold">Tagged</h2>
        </div>
        <nav className="space-y-2 px-4">
          <Link
            href="/dashboard"
            className="block px-4 py-2 rounded-lg hover:bg-gray-100 font-medium"
          >
            Dashboard
          </Link>
          <Link
            href="/transactions"
            className="block px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Transactions
          </Link>
          <Link
            href="/send"
            className="block px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Send
          </Link>
          <Link
            href="/receive"
            className="block px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Receive
          </Link>
          <Link
            href="/settings"
            className="block px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Settings
          </Link>
        </nav>
        <div className="p-4 border-t mt-8">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
