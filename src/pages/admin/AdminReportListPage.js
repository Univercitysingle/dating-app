import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import logger from '../../utils/logger';

const AdminReportListPage = () => {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user: adminUser } = useAuth();

  // State for filters and pagination
  const [filterStatus, setFilterStatus] = useState('pending_review');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchReports = useCallback(async (page, status) => {
    setIsLoading(true);
    setError(null);
    if (!adminUser || !adminUser.token) {
      setError("Authentication failed.");
      setIsLoading(false);
      return;
    }
    try {
      const queryParams = new URLSearchParams({ page, status, limit: 10 });
      const response = await fetch(`/api/admin/reports?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${adminUser.token}` },
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to fetch reports');
      }
      const data = await response.json();
      logger.info("Fetched reports data:", {
        reports: data.reports,
        totalPages: data.totalPages,
        currentPage: data.currentPage
      });
      setReports(data.reports || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.currentPage || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [adminUser]);

  useEffect(() => {
    fetchReports(currentPage, filterStatus);
  }, [currentPage, filterStatus, fetchReports]);

  const handleAction = async (reportId, action) => {
    const adminNotes = prompt(`Enter optional notes for action: '${action}'`);
    if (adminNotes === null) return; // User cancelled prompt

    if (!window.confirm(`Are you sure you want to perform action: '${action}' on report ${reportId}?`)) return;

    try {
      const response = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminUser.token}`,
        },
        body: JSON.stringify({ action, adminNotes }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || `Failed to perform action`);
      }
      alert(`Action '${action}' successful.`);
      fetchReports(currentPage, filterStatus); // Refresh the list
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Content & Report Moderation</h1>

      {/* Filters */}
      <div className="mb-4">
        <label htmlFor="status-filter" className="mr-2 font-medium">Filter by status:</label>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm"
        >
          <option value="pending_review">Pending Review</option>
          <option value="under_investigation">Under Investigation</option>
          <option value="resolved_no_action">Resolved: No Action</option>
          <option value="resolved_user_suspended">Resolved: User Suspended</option>
          <option value="resolved_user_banned">Resolved: User Banned</option>
        </select>
      </div>

      {isLoading && <p className="text-center p-4">Loading reports...</p>}
      {error && <p className="text-center text-red-500 p-4">Error: {error}</p>}

      {!isLoading && !error && (
        <>
          <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reporter</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reports.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-4">No reports found for this status.</td></tr>
                ) : (
                  reports.map(report => (
                    <tr key={report._id}>
                      <td className="px-6 py-4">{report.reportedUserUid?.name || 'N/A'}</td>
                      <td className="px-6 py-4">{report.reporterUid?.name || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm">{report.reason}</td>
                      <td className="px-6 py-4"><span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">{report.status}</span></td>
                      <td className="px-6 py-4">{new Date(report.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 space-x-2 text-sm">
                        <button onClick={() => handleAction(report._id, 'dismiss')} className="text-gray-600 hover:text-gray-900">Dismiss</button>
                        <button onClick={() => handleAction(report._id, 'suspend_user')} className="text-yellow-600 hover:text-yellow-900">Suspend</button>
                        <button onClick={() => handleAction(report._id, 'ban_user')} className="text-red-600 hover:text-red-900">Ban</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="mt-4 flex justify-between items-center">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-4 py-2 bg-white border rounded-md">Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border rounded-md">Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminReportListPage;
