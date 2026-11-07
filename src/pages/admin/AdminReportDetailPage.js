import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/apiClient';
import logger from '../../utils/logger';

const AdminReportDetailPage = () => {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user: adminUser } = useAuth();

  // State for moderation actions
  const [action, setAction] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [adminNotes, setAdminNotes] = useState('');

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get(`/admin/reports/${reportId}`);
      setReport(data);
      setAdminNotes(data.adminNotes || '');
    } catch (err) {
      setError(err.message);
      logger.error(`Failed to fetch report ${reportId}`, err);
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handlePerformAction = async () => {
    if (!action) {
      alert('Please select an action.');
      return;
    }
    if (!window.confirm(`Are you sure you want to perform action: '${action}'?`)) return;

    try {
      const payload = { action, adminNotes };
      if (action === 'suspend_user') {
        payload.durationDays = durationDays;
      }

      await apiClient.post(`/admin/reports/${reportId}/action`, payload);
      alert('Action performed successfully!');
      fetchReport(); // Refresh report details
    } catch (err) {
      alert(`Error: ${err.message}`);
      logger.error(`Failed to perform action on report ${reportId}`, err);
    }
  };

  if (isLoading) return <p className="text-center p-4">Loading report details...</p>;
  if (error) return <p className="text-center text-red-500 p-4">Error: {error}</p>;
  if (!report) return <p className="text-center p-4">Report not found.</p>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Report Details</h1>

      {/* Report Info Section */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Report Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <p><strong>Report ID:</strong> {report._id}</p>
          <p><strong>Date:</strong> {new Date(report.createdAt).toLocaleString()}</p>
          <p><strong>Category:</strong> {report.category}</p>
          <p><strong>Status:</strong> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{report.status}</span></p>
          <div className="col-span-2">
            <strong>Reason:</strong>
            <p className="mt-1 p-2 bg-gray-50 rounded border">{report.reason}</p>
          </div>
        </div>
      </div>

      {/* User Info Section */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 shadow rounded-lg">
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">Reported User</h3>
          <p><strong>Name:</strong> {report.reportedUser?.name || 'N/A'}</p>
          <p><strong>Email:</strong> {report.reportedUser?.email || 'N/A'}</p>
          <p><strong>Role:</strong> {report.reportedUser?.role || 'N/A'}</p>
          <p><strong>Suspended Until:</strong> {report.reportedUser?.suspendedUntil ? new Date(report.reportedUser.suspendedUntil).toLocaleString() : 'Not suspended'}</p>
        </div>
        <div className="bg-white p-6 shadow rounded-lg">
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">Reporter</h3>
          <p><strong>Name:</strong> {report.reporter?.name || 'N/A'}</p>
          <p><strong>Email:</strong> {report.reporter?.email || 'N/A'}</p>
        </div>
      </div>

      {/* Moderation Actions Section */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h3 className="text-lg font-semibold border-b pb-2 mb-4">Moderation Actions</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="adminNotes" className="block text-sm font-medium text-gray-700">Admin Notes</label>
            <textarea
              id="adminNotes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows="3"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              placeholder="Add internal notes here..."
            />
          </div>
          <div>
            <label htmlFor="action" className="block text-sm font-medium text-gray-700">Select Action</label>
            <select
              id="action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
            >
              <option value="">-- Choose an action --</option>
              <option value="dismiss">Dismiss Report</option>
              <option value="suspend_user">Suspend User</option>
              <option value="ban_user">Ban User</option>
            </select>
          </div>
          {action === 'suspend_user' && (
            <div>
              <label htmlFor="durationDays" className="block text-sm font-medium text-gray-700">Suspension Duration (in days)</label>
              <input
                type="number"
                id="durationDays"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                min="1"
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handlePerformAction}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded shadow-md"
            >
              Submit Action
            </button>
          </div>
        </div>
      </div>
      <div className="text-center mt-4">
        <Link to="/admin/reports" className="text-indigo-600 hover:underline">
          &larr; Back to Reports List
        </Link>
      </div>
    </div>
  );
};

export default AdminReportDetailPage;
