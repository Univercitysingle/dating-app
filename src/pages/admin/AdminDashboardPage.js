import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import logger from '../../utils/logger';

// A simple component for displaying a statistic
const StatCard = ({ title, value, loading }) => {
  return (
    <div className="bg-white p-6 shadow rounded-lg text-center">
      <h3 className="text-md font-medium text-gray-500 uppercase tracking-wider">{title}</h3>
      {loading ? (
        <div className="text-3xl font-semibold text-gray-800 mt-2">-</div>
      ) : (
        <p className="text-3xl font-semibold text-gray-800 mt-2">{value}</p>
      )}
    </div>
  );
};

const AdminDashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user: adminUser } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      if (!adminUser || !adminUser.token) {
        setError("Authentication token not available.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/users/stats', {
          headers: {
            'Authorization': `Bearer ${adminUser.token}`,
          },
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Failed to fetch dashboard stats');
        }

        const data = await response.json();
        logger.info("Fetched dashboard stats:", data);
        setStats(data);
      } catch (err) {
        setError(err.message);
        console.error("Fetch stats error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [adminUser]);

  return (
    <div className="bg-white p-6 shadow rounded-lg">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Admin Dashboard</h2>

      {error && <p className="text-red-500 text-center mb-4">Error: {error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={stats?.totalUsers} loading={isLoading} />
        <StatCard title="New Users (24h)" value={stats?.newUsers} loading={isLoading} />
        <StatCard title="Active Users (24h)" value={stats?.activeUsers} loading={isLoading} />
        <StatCard title="Pending Reports" value={stats?.pendingReports} loading={isLoading} />
      </div>

      {/* TODO: Add Recent Users List and Quick Links as per the plan */}
      <div className="mt-8">
        <p className="text-gray-600">
          Welcome to the Admin Dashboard. Use the navigation on the left to manage different aspects of the application.
        </p>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
