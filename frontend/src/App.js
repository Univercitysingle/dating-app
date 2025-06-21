import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import PremiumContent from "./pages/PremiumContent";
import SetInitialPasswordPage from "./pages/SetInitialPasswordPage";
import AdminLayout from "./components/admin/AdminLayout"; // Import AdminLayout
import AdminDashboardPage from "./pages/admin/AdminDashboardPage"; // Import AdminDashboardPage
import UnauthorizedPage from "./pages/UnauthorizedPage"; // Import UnauthorizedPage


function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth(); // Include isLoading from useAuth

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh', // Full viewport height
        backgroundColor: '#f8f9fa', // A light, neutral background
        fontFamily: 'Arial, sans-serif', // A common, clean font
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '2.5em', // Larger font for the app name
          color: '#e91e63', // A thematic pink/magenta color, adjust as needed
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
        {/* Optional: Consider adding a subtle loading spinner animation here later */}
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

// AdminRoute to protect admin sections further, though AdminLayout also does this.
// This can be seen as an additional layer or primary guard at route level.
function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Using a similar themed loading for AdminRoute as well, or could be a simpler one
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

  return children; // This will render AdminLayout which contains its own checks too
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
            {/* Add other admin sub-routes here, they will be rendered via AdminLayout's Outlet */}
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
