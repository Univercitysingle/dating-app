import React from 'react';
import { Outlet, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Adjust path as needed

const AdminLayout = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-lg font-semibold">Loading admin section...</p>
        {/* You can replace this with a spinner component */}
      </div>
    );
  }

  if (!user) {
    // User is not logged in, redirect to login page
    return <Navigate to="/login" replace />;
  }

  const isAdminOrSuperAdmin = user.role === 'admin' || user.role === 'superadmin';

  if (!isAdminOrSuperAdmin) {
    // User is logged in but does not have the required role
    return <Navigate to="/unauthorized" replace />;
    // Or redirect to home: return <Navigate to="/" replace />;
  }

  // User is authenticated and authorized
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
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
                to="/admin/users" // Placeholder for future user management page
                className="block px-3 py-2 rounded-md hover:bg-gray-700"
              >
                User Management
              </Link>
            </li>
            {/* Add more admin links here as needed */}
          </ul>
        </nav>
        <div className="mt-auto">
          <p className="text-sm">Logged in as: {user.email}</p>
          <p className="text-xs">Role: {user.role}</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet /> {/* Child routes will be rendered here */}
      </main>
    </div>
  );
};

export default AdminLayout;
