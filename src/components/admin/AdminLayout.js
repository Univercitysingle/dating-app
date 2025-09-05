import React from 'react';
import { Outlet, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminLayout = () => {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-800 text-white p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <nav>
          <ul className="space-y-2">
            <li>
              <Link
                to="/admin"
                className="block px-3 py-2 rounded-md hover:bg-gray-700"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                to="/admin/users"
                className="block px-3 py-2 rounded-md hover:bg-gray-700"
              >
                User Management
              </Link>
            </li>
            <li>
              <Link
                to="/admin/reports"
                className="block px-3 py-2 rounded-md hover:bg-gray-700"
              >
                Report Moderation
              </Link>
            </li>
            <li>
              <Link
                to="/admin/analytics"
                className="block px-3 py-2 rounded-md hover:bg-gray-700"
              >
                Analytics
              </Link>
            </li>
            {user.role === 'superadmin' && (
              <li>
                <Link
                  to="/admin/subscriptions"
                  className="block px-3 py-2 rounded-md hover:bg-gray-700"
                >
                  Subscription Management
                </Link>
              </li>
            )}
          </ul>
        </nav>
        <div className="mt-auto">
          <p className="text-sm">Logged in as: {user.email}</p>
          <p className="text-xs">Role: {user.role}</p>
          <button
            onClick={handleLogout}
            className="w-full mt-4 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Logout
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
