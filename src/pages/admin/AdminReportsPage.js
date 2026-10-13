import React, { useState } from 'react';
import PaymentLogsReport from '../../components/admin/reports/PaymentLogsReport';
import UserActivityLogsReport from '../../components/admin/reports/UserActivityLogsReport';
import AuditLogsReport from '../../components/admin/reports/AuditLogsReport';
import AdminReportListPage from './AdminReportListPage';

const AdminReportsPage = () => {
  const [selectedReport, setSelectedReport] = useState('user-reports');

  const renderReport = () => {
    switch (selectedReport) {
      case 'user-reports':
        return <AdminReportListPage />;
      case 'payment-logs':
        return <PaymentLogsReport />;
      case 'user-activity-logs':
        return <UserActivityLogsReport />;
      case 'audit-logs':
        return <AuditLogsReport />;
      default:
        return <p>Please select a report to view.</p>;
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-8">
      <div className="py-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold leading-tight">Reports</h2>
          <select
            value={selectedReport}
            onChange={(e) => setSelectedReport(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md"
          >
            <option value="user-reports">User Reports</option>
            <option value="payment-logs">Payment Logs</option>
            <option value="user-activity-logs">User Activity Logs</option>
            <option value="audit-logs">Audit Logs</option>
          </select>
        </div>
        <div className="mt-4">
          {renderReport()}
        </div>
      </div>
    </div>
  );
};

export default AdminReportsPage;
