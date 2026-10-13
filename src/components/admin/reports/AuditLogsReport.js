import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../api/apiClient';

const AuditLogsReport = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAuditLogs = useCallback(async (search) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) {
        params.search = search;
      }
      const response = await apiClient.get('/admin/audit-logs', { params });
      setAuditLogs(response || []);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while fetching audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAuditLogs(searchQuery);
    }, 500); // Debounce search
    return () => clearTimeout(timer);
  }, [searchQuery, fetchAuditLogs]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan="5" className="text-center py-4">Loading...</td>
        </tr>
      );
    }

    if (error) {
        return (
          <tr>
            <td colSpan="5" className="text-center py-4 text-red-500">{error}</td>
          </tr>
        );
    }

    if (!auditLogs || auditLogs.length === 0) {
      return (
        <tr>
          <td colSpan="5" className="text-center py-4">No audit logs found.</td>
        </tr>
      );
    }

    return auditLogs.map((log) => (
      <tr key={log._id}>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{log.adminId ? log.adminId.name : 'Unknown Admin'}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{log.action}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{log.targetType}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{log.targetId}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">
            {new Date(log.timestamp).toLocaleString()}
          </p>
        </td>
      </tr>
    ));
  };

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm w-full"
          placeholder="Search by Admin Name or Email..."
        />
      </div>
      <div className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-4 overflow-x-auto">
        <div className="inline-block min-w-full shadow rounded-lg overflow-hidden">
          <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Target Type
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Target ID
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody>
            {renderContent()}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
};

export default AuditLogsReport;
