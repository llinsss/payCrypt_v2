import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import { useWebSocket } from "./hooks/useWebSocket";
import { Toaster } from "react-hot-toast";

// Layout — loaded eagerly (always visible)
import Sidebar from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";
import LoadingSpinner from "./components/LoadingSpinner";

// Error boundaries (#524)
import { ErrorBoundary, RouteErrorBoundary } from "./components/ErrorBoundary";

import { apiClient } from "./utils/api";

// ── Lazy-loaded route-level views ────────────────────────────────────────────
// Public
const AuthPage = React.lazy(
  () => import("./components/Auth/AuthPage")
);

// User routes
const UserDashboard = React.lazy(
  () => import("./components/Dashboard/UserDashboard")
);
const BalancesView = React.lazy(
  () => import("./components/Balances/BalancesView")
);
const DepositsView = React.lazy(
  () => import("./components/Deposits/DepositsView")
);
const QRCodeGenerator = React.lazy(
  () => import("./components/QRCode/QRCodeGenerator")
);
const WithdrawView = React.lazy(
  () => import("./components/Withdraw/WithdrawView")
);
const SwapView = React.lazy(
  () => import("./components/Swap/SwapView")
);
const BillsView = React.lazy(
  () => import("./components/Bills/BillsView")
);
const SplitPaymentView = React.lazy(
  () => import("./components/Split/SplitPaymentView")
);
const MultiCurrencyView = React.lazy(
  () => import("./components/MultiCurrency/MultiCurrencyView")
);
const SettingsView = React.lazy(
  () => import("./components/Settings/SettingsView")
);
const KYCForm = React.lazy(
  () => import("./components/KYC/KYCForm")
);
const ApiTest = React.lazy(
  () => import("./components/Test/ApiTest")
);

// Admin routes — their own chunk so non-admin users never load them
const AdminDashboard = React.lazy(
  () => import("./components/Admin/AdminDashboard")
);
const AdminUsers = React.lazy(
  () => import("./components/Admin/AdminUsers")
);
const AdminPayouts = React.lazy(
  () => import("./components/Admin/AdminPayouts")
);
const AdminKyc = React.lazy(
  () => import("./components/Admin/AdminKyc")
);
const AdminDisputes = React.lazy(
  () => import("./components/Admin/AdminDisputes")
);
const AdminTransactions = React.lazy(
  () => import("./components/Admin/AdminTransactions")
);
const AdminHealth = React.lazy(
  () => import("./components/Admin/AdminHealth")
);

// ── Shared suspense fallback ─────────────────────────────────────────────────
function RouteLoader() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <LoadingSpinner />
    </div>
  );
}

// ── Private app layout with auth guard ──────────────────────────────────────
const PrivateLayout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { isConnected } = useWebSocket("ws://localhost:3001", user?.id);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!user) {
      return;
    }

    const syncBalances = async () => {
      try {
        await apiClient.get("/balances/sync");
        console.log("✅ Balance sync triggered");
      } catch (err) {
        console.error("❌ Balance sync failed:", err);
      }
    };

    syncBalances();
    const intervalId = setInterval(syncBalances, 30000);

    return () => clearInterval(intervalId);
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Toaster position="top-center" reverseOrder={false} />
      <Sidebar
        isAdmin={isAdmin}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-[280px]">
        <Header isAdmin={isAdmin} onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto mt-[80px] z-0">
          {isConnected && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 lg:px-6 py-2">
              <div className="flex items-center space-x-2 text-sm text-emerald-700">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span>Live updates connected</span>
              </div>
            </div>
          )}
          <div className="p-4 lg:p-6">
            {/*
             * Route-level error boundary (#524):
             * A render failure inside any lazy-loaded view renders a safe
             * fallback for that route only — the sidebar/header remain usable.
             */}
            <RouteErrorBoundary name="main-outlet">
              <Suspense fallback={<RouteLoader />}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};

// ── Guard for admin-only sections ────────────────────────────────────────────
const AdminGuard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

// ── App routes ───────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      {/* Public route */}
      <Route
        path="/auth"
        element={
          <PublicRoute>
            {/* Route-level boundary for the auth page (#524) */}
            <RouteErrorBoundary name="auth">
              <Suspense fallback={<RouteLoader />}>
                <AuthPage />
              </Suspense>
            </RouteErrorBoundary>
          </PublicRoute>
        }
      />

      {/* Private routes */}
      <Route element={<PrivateLayout />}>
        {/* Default dashboard */}
        <Route
          index
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          }
        />

        {/* User routes */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="balances"
          element={
            <ProtectedRoute requireKyc={true}>
              <BalancesView />
            </ProtectedRoute>
          }
        />
        <Route
          path="multi-currency"
          element={
            <ProtectedRoute requireKyc={true}>
              <MultiCurrencyView />
            </ProtectedRoute>
          }
        />
        <Route
          path="deposits"
          element={
            <ProtectedRoute requireKyc={true}>
              <DepositsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="qr-code"
          element={
            <ProtectedRoute requireKyc={true}>
              <QRCodeGenerator />
            </ProtectedRoute>
          }
        />
        <Route
          path="withdraw"
          element={
            <ProtectedRoute requireKyc={true}>
              <WithdrawView />
            </ProtectedRoute>
          }
        />
        <Route
          path="swap"
          element={
            <ProtectedRoute requireKyc={true}>
              <SwapView />
            </ProtectedRoute>
          }
        />
        <Route
          path="bills"
          element={
            <ProtectedRoute requireKyc={true}>
              <BillsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="split"
          element={
            <ProtectedRoute requireKyc={true}>
              <SplitPaymentView />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <SettingsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="kyc"
          element={
            <ProtectedRoute>
              <KYCForm />
            </ProtectedRoute>
          }
        />
        <Route path="test/api" element={<ApiTest />} />

        {/* Admin-only routes — wrapped in their own boundary (#524) */}
        <Route path="admin" element={<AdminGuard />}>
          <Route
            path="overview"
            element={
              <RouteErrorBoundary name="admin-overview">
                <AdminDashboard />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="users"
            element={
              <RouteErrorBoundary name="admin-users">
                <AdminUsers />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="kyc"
            element={
              <RouteErrorBoundary name="admin-kyc">
                <AdminKyc />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="disputes"
            element={
              <RouteErrorBoundary name="admin-disputes">
                <AdminDisputes />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="transactions"
            element={
              <RouteErrorBoundary name="admin-transactions">
                <AdminTransactions />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="health"
            element={
              <RouteErrorBoundary name="admin-health">
                <AdminHealth />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="payouts"
            element={
              <RouteErrorBoundary name="admin-payouts">
                <AdminPayouts />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="analytics"
            element={
              <div className="text-center py-12 text-gray-500">
                Admin Analytics Panel - Coming Soon
              </div>
            }
          />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── Root component ───────────────────────────────────────────────────────────
// Top-level error boundary (#524): catches any error that escapes route-level
// boundaries (e.g. a broken AuthProvider) and prevents a completely blank page.
function App() {
  return (
    <ErrorBoundary name="app-root">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
