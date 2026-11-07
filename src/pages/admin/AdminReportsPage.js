import React, { useState } from 'react';
import PaymentLogsReport from '../../components/admin/reports/PaymentLogsReport';
import UserActivityLogsReport from '../../components/admin/reports/UserActivityLogsReport';
import AuditLogsReport from '../../components/admin/reports/AuditLogsReport';
import AdminReportListPage from './AdminReportListPage';

const reportTabs = [
  { id: 'user-reports', label: 'User reports', description: 'Community safety and moderation', icon: '⚑' },
  { id: 'payment-logs', label: 'Payment logs', description: 'Payment activity and status', icon: '◇' },
  { id: 'user-activity-logs', label: 'Login activity', description: 'Account access history', icon: '◎' },
  { id: 'audit-logs', label: 'Audit trail', description: 'Administrator actions', icon: '▤' },
];

const AdminReportsPage = () => {
  const [selectedReport, setSelectedReport] = useState('user-reports');

  const renderReport = () => {
    switch (selectedReport) {
      case 'user-reports': return <AdminReportListPage />;
      case 'payment-logs': return <PaymentLogsReport />;
      case 'user-activity-logs': return <UserActivityLogsReport />;
      case 'audit-logs': return <AuditLogsReport />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Insights & governance</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Reports centre</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Review community reports, payment activity, account access, and administrator audit events from one workspace.</p>
      </header>

      <nav aria-label="Report categories" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {reportTabs.map((tab) => {
          const active = selectedReport === tab.id;
          return (
            <button key={tab.id} type="button" aria-pressed={active} onClick={() => setSelectedReport(tab.id)}
              className={`flex min-h-[88px] items-start gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${active ? 'border-indigo-300 bg-indigo-50 shadow-sm ring-1 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`} aria-hidden="true">{tab.icon}</span>
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${active ? 'text-indigo-950' : 'text-slate-800'}`}>{tab.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{tab.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-live="polite">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900">{reportTabs.find((tab) => tab.id === selectedReport)?.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{reportTabs.find((tab) => tab.id === selectedReport)?.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin data</span>
        </div>
        {renderReport()}
      </section>
    </div>
  );
};

export default AdminReportsPage;
