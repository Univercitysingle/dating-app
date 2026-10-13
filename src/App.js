import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import Onboarding from './pages/Onboarding';
import SetInitialPasswordPage from './pages/SetInitialPasswordPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AdminUserListPage from './pages/admin/AdminUserListPage';
import AdminUserEditPage from './pages/admin/AdminUserEditPage';
import AdminUserProfileViewPage from './pages/admin/AdminUserProfileViewPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminReportDetailPage from './pages/admin/AdminReportDetailPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage';
import AdminSupportTicketListPage from './pages/admin/AdminSupportTicketListPage';
import AdminSupportTicketDetailPage from './pages/admin/AdminSupportTicketDetailPage';
import SwipeDeck from './pages/SwipeDeck';
import LikesPage from './pages/LikesPage';
import ConversationsPage from './pages/ConversationsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import SupportPage from './pages/SupportPage';
import SupportTicketDetailPage from './pages/SupportTicketDetailPage';
import StorePage from './pages/StorePage';
import MainLayout from './components/MainLayout';
import FAQPage from './pages/legal/FAQPage';
import SafetyTipsPage from './pages/legal/SafetyTipsPage';
import TermsPage from './pages/legal/TermsPage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import PrivacySettingsPage from './pages/legal/PrivacySettingsPage';
import DebugSwipeCardPage from './pages/DebugSwipeCardPage';

function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth();

  // --- START DIAGNOSTIC LOGGING ---
  console.log('%cPrivateRoute Check:', 'color: green; font-weight: bold;', {
    isLoading,
    isUserPresent: !!user,
    isOnboardingComplete: user ? user.isOnboardingComplete : 'N/A',
  });
  // --- END DIAGNOSTIC LOGGING ---

  if (isLoading) {
    console.log('PrivateRoute Decision: Rendering loading screen.');
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-neutral-50 font-sans text-center">
        <h1 className="text-4xl font-bold text-primary mb-2">Hart2Hart</h1>
        <p className="text-lg text-neutral-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    console.log('PrivateRoute Decision: No user found, redirecting to /login.');
    return <Navigate to="/login" replace />;
  }

  if (user.isOnboardingComplete === false) {
    console.log('PrivateRoute Decision: Onboarding is not complete, redirecting to /onboarding.');
    return <Navigate to="/onboarding" replace />;
  }

  console.log('PrivateRoute Decision: User is authenticated and onboarded, rendering children.');
  return children;
}

function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-neutral-50 font-sans text-center">
        <h1 className="text-3xl font-bold text-neutral-800">Loading Admin Section...</h1>
        <p className="text-primary-dark font-bold">Hart2Hart</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdminOrSuperAdmin =
    user.role === 'admin' || user.role === 'superadmin';
  if (!isAdminOrSuperAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SocketProvider>
            <ToastContainer
              position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route
              path="/set-initial-password"
              element={<SetInitialPasswordPage />}
            />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Static Legal Pages */}
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/safety" element={<SafetyTipsPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookies" element={<CookiePolicyPage />} />
            <Route path="/privacy-settings" element={<PrivacySettingsPage />} />

            {/* User-facing protected routes with MainLayout */}
            <Route
              element={
                <PrivateRoute>
                  <MainLayout />
                </PrivateRoute>
              }
            >
              <Route path="/discover" element={<SwipeDeck />} />
              <Route path="/likes" element={<LikesPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/matches" element={<ConversationsPage />} />
              <Route path="/chat/:chatId" element={<Chat />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/premium" element={<SubscriptionPage />} />
              <Route path="/manage-subscription" element={<SubscriptionPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/support/tickets/:ticketId" element={<SupportTicketDetailPage />} />
              <Route path="/store" element={<StorePage />} />
            </Route>

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUserListPage />} />
              <Route path="users/new" element={<AdminUserEditPage />} />
              <Route path="users/:userId/edit" element={<AdminUserEditPage />} />
              <Route path="users/:userId/profile" element={<AdminUserProfileViewPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="reports/:reportId" element={<AdminReportDetailPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="transactions" element={<AdminTransactionsPage />} />
              <Route path="support-tickets" element={<AdminSupportTicketListPage />} />
              <Route path="support-tickets/:ticketId" element={<AdminSupportTicketDetailPage />} />
            </Route>

            {/* Default route */}
            <Route path="/" element={<Navigate to="/discover" />} />
            <Route path="*" element={<Navigate to="/discover" />} />

            {/* --- JULES'S TEMPORARY DEBUG ROUTE --- */}
            <Route path="/debug-swipe" element={<DebugSwipeCardPage />} />
            {/* --- END DEBUG ROUTE --- */}

          </Routes>
        </SocketProvider>
      </Router>
    </AuthProvider>
  </ThemeProvider>
  );
}

export default App;
