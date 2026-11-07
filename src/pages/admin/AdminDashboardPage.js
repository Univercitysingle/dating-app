import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logger from '../../utils/logger';
import apiClient from '../../api/apiClient';

const formatMetric = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? new Intl.NumberFormat().format(numericValue)
    : String(value);
};

const StatCard = ({ title, value, description, loading, accent }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {loading ? (
          <div className="mt-3 h-9 w-24 animate-pulse rounded bg-gray-100" aria-label="Loading metric" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {formatMetric(value)}
          </p>
        )}
      </div>
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${accent}`} aria-hidden="true" />
    </div>
    {description && <p className="mt-3 text-xs text-gray-500">{description}</p>}
  </section>
);

const quickLinks = [
  { title: 'Manage users', description: 'Search accounts, review profiles, and manage user access.', to: '/admin/users' },
  { title: 'Review reports', description: 'Open user reports and follow up on safety concerns.', to: '/admin/reports' },
  { title: 'View analytics', description: 'Review signup trends and available platform metrics.', to: '/admin/analytics' },
  { title: 'Payment review', description: 'Review pending purchases and reconcile late payment refunds.', to: '/admin/purchases' },
  { title: 'Transactions', description: 'Inspect subscription and purchase records.', to: '/admin/transactions' },
  { title: 'Support tickets', description: 'Review user support requests and their status.', to: '/admin/support-tickets' },
];

const AdminDashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { user: adminUser } = useAuth();

  const fetchStats = useCallback(async () => {
    if (!adminUser) {
      setError('Authentication failed. Sign in with an administrator account to view dashboard metrics.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/admin/users/stats');
      logger.info('Fetched dashboard stats.');
      setStats(data || {});
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to load dashboard metrics.');
      logger.error('Fetch stats error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [adminUser]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const metricCards = [
    { title: 'Total users', value: stats?.totalUsers, description: 'Accounts registered on the platform', accent: 'bg-indigo-500' },
    { title: 'New users', value: stats?.newUsers, description: 'Sign-ups in the last 24 hours', accent: 'bg-blue-500' },
    { title: 'Active users', value: stats?.activeUsers, description: 'Activity in the last 24 hours', accent: 'bg-emerald-500' },
    { title: 'Pending reports', value: stats?.pendingReports, description: 'Reports awaiting moderation', accent: 'bg-amber-500' },
  ];

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-800 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Platform operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Admin dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-indigo-100">
            Monitor platform activity, manage accounts, and keep user safety and support workflows moving.
          </p>
          {adminUser?.email && (
            <p className="mt-3 text-xs text-indigo-200">
              Signed in as {adminUser.email} · {adminUser.role === 'superadmin' ? 'Super administrator' : 'Administrator'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={fetchStats}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Refreshing…' : 'Refresh metrics'}
        </button>
      </header>

      {error && (
        <section role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-red-900">Dashboard metrics unavailable</h2>
            <p className="mt-1 text-sm text-red-800">{error}</p>
          </div>
          <button type="button" onClick={fetchStats} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">
            Try again
          </button>
        </section>
      )}

      <section aria-label="Platform metrics">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Platform overview</h2>
          {lastUpdated && (
            <p className="text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((metric) => (
            <StatCard key={metric.title} {...metric} loading={isLoading && !stats} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Administration shortcuts</h2>
          <p className="mt-1 text-sm text-gray-500">Jump directly to the main operational areas.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-xl border border-gray-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900 group-hover:text-indigo-800">{item.title}</span>
                <span aria-hidden="true" className="text-gray-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">→</span>
              </span>
              <span className="mt-2 block text-sm leading-5 text-gray-500">{item.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-xs leading-5 text-gray-500">
        Metrics are supplied by the admin API. A blank metric is shown as unavailable, not as zero, so missing data is not mistaken for a confirmed count.
      </p>
    </main>
  );
};

export default AdminDashboardPage;
