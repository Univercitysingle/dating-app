import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import PremiumContent from "./pages/PremiumContent";
import SetInitialPasswordPage from "./pages/SetInitialPasswordPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import AdminUserListPage from "./pages/admin/AdminUserListPage";
import AdminUserEditPage from "./pages/admin/AdminUserEditPage";
import SwipeDeck from "./pages/SwipeDeck"; // Import SwipeDeck

function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '2.5em',
          color: '#e91e63',
          marginBottom: '10px'
        }}>
          Single
        </h1>
        <p style={{
          fontSize: '1.2em',
          color: '#555',
          marginTop: '0px'
        }}>
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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center'
      }}>
        <h1 style={{fontSize: '2em', color: '#333'}}>Loading Admin Section...</h1>
        <p style={{color: '#e91e63', fontWeight: 'bold'}}>Single</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdminOrSuperAdmin = user.role === 'admin' || user.role === 'superadmin';
  if (!isAdminOrSuperAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-initial-password" element={<SetInitialPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* User-facing protected routes */}
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
          <Route path="/premium" element={<PrivateRoute><PremiumContent /></PrivateRoute>} />
          <Route path="/discover" element={<PrivateRoute><SwipeDeck /></PrivateRoute>} /> {/* Add discover route */}

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
          </Route>

          {/* Default route */}
          <Route path="/" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
