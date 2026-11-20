import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logger from '../../utils/logger';
import apiClient from '../../api/apiClient';

const formatMetric = (value) => {
  if (value === null || value === undefined || value === '') return 'Not available';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? new Intl.NumberFormat().format(numericValue) : String(value);
};

const metricCards = [
  { title: 'Total users', key: 'totalUsers', description: 'All registered accounts', icon: '◎', tone: 'indigo' },
  { title: 'New users', key: 'newUsers', description: 'Sign-ups in the last 24 hours', icon: '↗', tone: 'sky' },
  { title: 'Active users', key: 'activeUsers', description: 'Activity in the last 24 hours', icon: '◉', tone: 'emerald' },
  { title: 'Pending reports', key: 'pendingReports', description: 'Awaiting moderation review', icon: '⚑', tone: 'amber' },
  { title: 'Active subscriptions', key: 'activeSubscriptions', description: 'Currently active paid plans', icon: '◇', tone: 'violet' },
  { title: 'Pending payments', key: 'pendingPayments', description: 'Awaiting verified gateway callbacks', icon: '◷', tone: 'amber' },
  { title: 'Refund reviews', key: 'pendingRefunds', description: 'Require payment-provider reconciliation', icon: '↺', tone: 'rose' },
  { title: 'Open support tickets', key: 'openSupportTickets', description: 'Customer requests not yet closed', icon: '▤', tone: 'sky' },
  { title: 'Pending verifications', key: 'pendingVerifications', description: 'Awaiting photo verification review', icon: '▧', tone: 'indigo', superadminOnly: true },
];

const quickLinks = [
  { title: 'User management', description: 'Search accounts, review profiles, and manage access.', to: '/admin/users', icon: '◎', tone: 'indigo' },
  { title: 'Reports & safety', description: 'Review reports and take action on safety concerns.', to: '/admin/reports', icon: '⚑', tone: 'rose' },
  { title: 'Photo verification', description: 'Review pending identity and photo checks.', to: '/admin/verifications', icon: '▧', tone: 'violet', superadminOnly: true },
  { title: 'Analytics', description: 'Understand sign-ups and platform activity.', to: '/admin/analytics', icon: '▥', tone: 'sky' },
  { title: 'Payment review', description: 'Review pending purchases and refund cases.', to: '/admin/purchases', icon: '◇', tone: 'violet' },
  { title: 'Transactions', description: 'Inspect subscription and purchase records.', to: '/admin/transactions', icon: '⇄', tone: 'emerald' },
  { title: 'Support tickets', description: 'Keep user support requests moving.', to: '/admin/support-tickets', icon: '▤', tone: 'amber' },
];

const toneClasses = {
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
};

const StatCard = ({ metric, value, loading }) => (
  <article className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{metric.title}</p>
        {loading ? (
          <div className="mt-4 h-9 w-28 animate-pulse rounded-lg bg-slate-100" aria-label="Loading metric" />
        ) : (
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{formatMetric(value)}</p>
        )}
      </div>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ring-1 ${toneClasses[metric.tone]}`} aria-hidden="true">{metric.icon}</span>
    </div>
    <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">{metric.description}</p>
  </article>
);

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

  return (
    <div className="space-y-8">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#111a35] px-6 py-7 text-white shadow-xl shadow-indigo-950/10 sm:px-9 sm:py-9">
        <div className="absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -bottom-32 right-1/3 -z-10 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Platform operations
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Good to see you{adminUser?.displayName || adminUser?.name ? `, ${(adminUser.displayName || adminUser.name).split(' ')[0]}` : ''}.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Your operations overview is ready. Monitor platform health, keep your community safe, and stay on top of payments and support.
            </p>
            <p className="mt-4 text-xs text-slate-400">{adminUser?.role === 'superadmin' ? 'Super administrator access' : 'Administrator access'}</p>
          </div>
          <button type="button" onClick={fetchStats} disabled={isLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60">
            <span aria-hidden="true" className={isLoading ? 'animate-spin' : ''}>↻</span>
            {isLoading ? 'Refreshing data' : 'Refresh overview'}
          </button>
        </div>
      </section>

      {error && (
        <section role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-rose-900">Dashboard data is unavailable</h3>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>
          <button type="button" onClick={fetchStats} className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Try again</button>
        </section>
      )}

      <section aria-label="Platform metrics">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">At a glance</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Platform overview</h3>
          </div>
          {lastUpdated && <p className="text-xs text-slate-400">Last updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {metricCards.filter((metric) => !metric.superadminOnly || adminUser?.role === 'superadmin').map((metric) => <StatCard key={metric.key} metric={metric} value={stats?.[metric.key]} loading={isLoading && !stats} />)}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Your workspace</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Jump back into work</h3>
          <p className="mt-1 text-sm text-slate-500">The tools you need to manage the DateMe platform.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {quickLinks.filter((item) => !item.superadminOnly || adminUser?.role === 'superadmin').map((item) => (
            <Link key={item.to} to={item.to} className="group flex min-h-[142px] items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ring-1 transition group-hover:scale-105 ${toneClasses[item.tone]}`} aria-hidden="true">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 transition group-hover:text-indigo-700">{item.title}</span>
                  <span aria-hidden="true" className="text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600">→</span>
                </span>
                <span className="mt-2 block text-sm leading-5 text-slate-500">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs leading-5 text-slate-400">
        Metrics are supplied by the admin API. Missing values are labelled as unavailable rather than shown as zero.
      </p>
    </div>
  );
};

export default AdminDashboardPage;
