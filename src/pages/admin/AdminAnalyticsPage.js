import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';
import apiClient from '../../api/apiClient';
import logger from '../../utils/logger';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const AdminAnalyticsPage = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const data = await apiClient.get('/api/admin/analytics/summary');
        logger.info("Fetched analytics summary:", data);
        setAnalyticsData(data);
      } catch (err) {
        setError(err.message);
        logger.error("Failed to fetch analytics summary:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const lineChartData = {
    labels: analyticsData?.signupsPerDay.map(d => d._id) || [],
    datasets: [
      {
        label: 'New User Sign-ups (Last 30 Days)',
        data: analyticsData?.signupsPerDay.map(d => d.count) || [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
    ],
  };

  const pieChartData = {
    labels: ['Paid Users', 'Unpaid Users'],
    datasets: [
      {
        label: '# of Users',
        data: [
          analyticsData?.userStats.paid || 0,
          analyticsData?.userStats.unpaid || 0,
        ],
        backgroundColor: [
          'rgba(75, 192, 192, 0.2)',
          'rgba(255, 99, 132, 0.2)',
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  if (isLoading) return <p className="text-center p-4">Loading analytics data...</p>;
  if (error) return <p className="text-center text-red-500 p-4">Error: {error}</p>;
  if (!analyticsData) return <p className="text-center p-4">No analytics data found.</p>;

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-semibold text-gray-800">Analytics Dashboard</h1>

      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 shadow rounded-lg text-center">
            <h3 className="text-md font-medium text-gray-500 uppercase">Total Users</h3>
            <p className="text-3xl font-semibold text-gray-800 mt-2">{analyticsData.userStats.total}</p>
        </div>
        <div className="bg-white p-6 shadow rounded-lg text-center">
            <h3 className="text-md font-medium text-gray-500 uppercase">Paid Users</h3>
            <p className="text-3xl font-semibold text-gray-800 mt-2">{analyticsData.userStats.paid}</p>
        </div>
        <div className="bg-white p-6 shadow rounded-lg text-center">
            <h3 className="text-md font-medium text-gray-500 uppercase">Reported Users</h3>
            <p className="text-3xl font-semibold text-gray-800 mt-2">{analyticsData.reportedUsersCount}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 shadow rounded-lg">
          <h3 className="text-lg font-semibold mb-4">User Subscription Status</h3>
          <Pie data={pieChartData} />
        </div>
        <div className="bg-white p-6 shadow rounded-lg">
          <h3 className="text-lg font-semibold mb-4">New User Sign-ups</h3>
          <Line data={lineChartData} />
        </div>
      </div>

      {/* Location Data Table */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h3 className="text-lg font-semibold mb-4">User Locations (Placeholder)</h3>
        <p className="text-sm text-gray-500 mb-4">Note: Location data is placeholder and not live.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User Count</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analyticsData.locations.map(loc => (
                <tr key={loc._id}>
                  <td className="px-6 py-4 whitespace-nowrap">{loc._id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{loc.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
