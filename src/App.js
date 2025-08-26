import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Chat from './pages/Chat';
import PremiumContent from './pages/PremiumContent';
import SetInitialPasswordPage from './pages/SetInitialPasswordPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AdminUserListPage from './pages/admin/AdminUserListPage';
import AdminUserEditPage from './pages/admin/AdminUserEditPage';
import AdminReportListPage from './pages/admin/AdminReportListPage';
import AdminReportDetailPage from './pages/admin/AdminReportDetailPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import SwipeDeck from './pages/SwipeDeck';
import MainLayout from './components/MainLayout';

function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-neutral-50 font-sans text-center">
        <h1 className="text-4xl font-bold text-primary mb-2">Single</h1>
        <p className="text-lg text-neutral-600">
          Specially built for singles to mingle
        </p>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-neutral-50 font-sans text-center">
        <h1 className="text-3xl font-bold text-neutral-800">Loading Admin Section...</h1>
        <p className="text-primary-dark font-bold">Single</p>
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
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/set-initial-password"
            element={<SetInitialPasswordPage />}
          />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* User-facing protected routes with MainLayout */}
          <Route
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route path="/discover" element={<SwipeDeck />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          {/* Standalone protected routes */}
          <Route
            path="/premium"
            element={
              <PrivateRoute>
                <PremiumContent />
              </PrivateRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUserListPage />} />
            <Route path="users/new" element={<AdminUserEditPage />} />
            <Route path="users/:userId/edit" element={<AdminUserEditPage />} />
            <Route path="reports" element={<AdminReportListPage />} />
            <Route path="reports/:reportId" element={<AdminReportDetailPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
          </Route>

          {/* Default route */}
          <Route path="/" element={<Navigate to="/discover" />} />
          <Route path="*" element={<Navigate to="/discover" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
