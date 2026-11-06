import React, { useState } from 'react';
import { Navigate, Link, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminLayout = () => {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [isSidebarMinimized, setSidebarMinimized] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-lg font-semibold">Loading admin section...</p>
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

  const toggleSidebar = () => {
    setSidebarMinimized(!isSidebarMinimized);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside
        className={`bg-gray-800 text-white p-4 space-y-6 transition-all duration-300 ${
          isSidebarMinimized ? 'w-20' : 'w-64'
        }`}
      >
        <h1 className="text-2xl font-semibold text-center">
          <Link to="/admin">{isSidebarMinimized ? 'AP' : 'Admin Panel'}</Link>
        </h1>
        <nav>
          <ul className="space-y-2">
            <li>
              <Link
                to="/admin/dashboard"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">🏠</span>
                {!isSidebarMinimized && 'Dashboard'}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/users"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">👥</span>
                {!isSidebarMinimized && 'User Management'}
              </Link>
            </li>
            {user.role === 'superadmin' && <li>
              <Link
                to="/admin/verifications"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">📷</span>
                {!isSidebarMinimized && 'Photo Verification'}
              </Link>
            </li>}
            <li>
              <Link
                to="/admin/reports"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">📄</span>
                {!isSidebarMinimized && 'Reports'}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/analytics"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">📈</span>
                {!isSidebarMinimized && 'Analytics'}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/transactions"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">💳</span>
                {!isSidebarMinimized && 'Transactions'}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/support-tickets"
                className="flex items-center px-3 py-2 rounded-md hover:bg-gray-700"
              >
                <span className="mr-4">🎫</span>
                {!isSidebarMinimized && 'Support Tickets'}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="mt-auto">
          {!isSidebarMinimized && (
            <>
              <p className="text-sm">Logged in as: {user.email}</p>
              <p className="text-xs">Role: {user.role}</p>
            </>
          )}
          <button
            onClick={handleLogout}
            className="w-full mt-4 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            {isSidebarMinimized ? '🚪' : 'Logout'}
          </button>
          <button
            onClick={toggleSidebar}
            className="w-full mt-4 px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"
          >
            {isSidebarMinimized ? '»' : '«'}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
