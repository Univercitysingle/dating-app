import React from 'react';

const AdminDashboardPage = () => {
  return (
    <div className="bg-white p-6 shadow rounded-lg">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Admin Dashboard</h2>
      <p className="text-gray-600">
        Welcome to the Admin Dashboard. Use the navigation on the left to manage different aspects of the application.
      </p>
      {/* More dashboard widgets or summaries can be added here later */}
    </div>
  );
};

export default AdminDashboardPage;
