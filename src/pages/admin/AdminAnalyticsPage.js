import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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

const formatDate = date => date instanceof Date && !Number.isNaN(date.getTime())
  ? date.toISOString()
  : '';

const AdminAnalyticsPage = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [endDate, setEndDate] = useState(() => new Date());

  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      setError('Choose a valid date range.');
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    const fetchAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      const queryParams = new URLSearchParams({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      });
      try {
        const data = await apiClient.get(
          `/admin/analytics/summary?${queryParams.toString()}`,
          { signal: controller.signal }
        );
        if (!active) return;
        setAnalyticsData(data && typeof data === 'object' ? data : {});
        logger.info('Fetched analytics summary.');
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to load analytics.');
        logger.error('Failed to fetch analytics summary:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchAnalytics();
    return () => {
      active = false;
      controller.abort();
    };
  }, [startDate, endDate]);

  const exportAnalytics = useCallback(async () => {
    if (!startDate || !endDate || startDate > endDate) return;
    setIsExporting(true);
    setError(null);
    const queryParams = new URLSearchParams({
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    });
    try {
      // Use apiClient so the Firebase ID token is attached. A plain anchor
      // request to /api bypasses the authenticated API client.
      const csv = await apiClient.get(`/admin/analytics/export?${queryParams.toString()}`);
      if (typeof csv !== 'string' || !csv.trim()) {
        throw new Error('The analytics export did not return a CSV file.');
      }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'analytics_export.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err?.message || 'Unable to export analytics.');
      logger.error('Failed to export analytics:', err);
    } finally {
      setIsExporting(false);
    }
  }, [startDate, endDate]);

  const signups = Array.isArray(analyticsData?.signupsPerDay)
    ? analyticsData.signupsPerDay
    : [];
  const userStats = analyticsData?.userStats || {};
  const recentAdminActivity = Array.isArray(analyticsData?.recentAdminActivity)
    ? analyticsData.recentAdminActivity
    : [];
  const revenueByCurrency = Array.isArray(analyticsData?.revenueByCurrency)
    ? analyticsData.revenueByCurrency.filter(item => /^[A-Z]{3}$/.test(item?.currency || ""))
    : [];
  const formatRevenue = item => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: item.currency,
        maximumFractionDigits: 2
      }).format(Number(item.amount) || 0);
    } catch {
      return `${(Number(item.amount) || 0).toLocaleString()} ${item.currency}`;
    }
  };
  const activityLabel = event => {
    const labels = {
      moderation_action: "Moderation action",
      support_ticket_updated: "Support ticket updated",
      support_ticket_message_edited: "Support message edited",
      support_ticket_message_deleted: "Support message deleted",
      admin_account_lifecycle: "Account status changed",
      support_ticket_feedback_submitted: "Support feedback submitted"
    };
    return labels[event] || "Administrative action";
  };

  const lineChartData = {
    labels: signups.map(day => day?._id || ''),
    datasets: [{
      label: 'New user sign-ups',
      data: signups.map(day => Number(day?.count) || 0),
      borderColor: 'rgb(75, 192, 192)',
      backgroundColor: 'rgba(75, 192, 192, 0.5)',
    }],
  };

  const pieChartData = {
    labels: ['Paid users', 'Unpaid users'],
    datasets: [{
      label: 'Users',
      data: [Number(userStats.paid) || 0, Number(userStats.unpaid) || 0],
      backgroundColor: ['rgba(75, 192, 192, 0.2)', 'rgba(255, 99, 132, 0.2)'],
      borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
      borderWidth: 1,
    }],
  };

  if (isLoading && !analyticsData) {
    return <p className="p-4 text-center" role="status">Loading analytics data...</p>;
  }

  return (
    <main className="container mx-auto space-y-8 p-4">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Analytics dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Platform metrics for the selected reporting period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Start date
            <DatePicker
              selected={startDate}
              onChange={date => {
                if (!date) return;
                setStartDate(date);
                if (endDate && date > endDate) setEndDate(date);
              }}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              maxDate={endDate || undefined}
              dateFormat="yyyy-MM-dd"
              ariaLabelledBy="analytics-start-date"
              className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            End date
            <DatePicker
              selected={endDate}
              onChange={date => {
                if (!date) return;
                setEndDate(date);
                if (startDate && date < startDate) setStartDate(date);
              }}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate || undefined}
              maxDate={new Date()}
              dateFormat="yyyy-MM-dd"
              ariaLabelledBy="analytics-end-date"
              className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={exportAnalytics}
            disabled={isExporting || isLoading || !analyticsData}
            className="self-end rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </header>

      {error && (
        <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </section>
      )}

      {isLoading && analyticsData && (
        <p className="text-sm text-gray-500" role="status">Refreshing analytics...</p>
      )}

      {!analyticsData && !isLoading && !error && (
        <p className="rounded-lg bg-white p-6 text-center text-gray-600">No analytics data found for this period.</p>
      )}

      {analyticsData && (
        <>
          <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['Total users', userStats.total],
              ['Paid users', userStats.paid],
              ['Reported users', analyticsData.reportedUsersCount],
            ].map(([label, value]) => (
              <article key={label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{label}</h2>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {Number.isFinite(Number(value)) ? Number(value).toLocaleString() : 'Unavailable'}
                </p>
              </article>
            ))}
          </section>

          <section aria-label="Verified payment revenue" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Verified payment revenue</h2>
              <p className="mt-1 text-sm text-gray-500">Settled purchases and active subscriptions with a recorded provider reference. Amounts remain separated by currency.</p>
            </div>
            {revenueByCurrency.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {revenueByCurrency.map(item => (
                  <article key={item.currency} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.currency} revenue</h3>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">{formatRevenue(item)}</p>
                    <p className="mt-1 text-xs text-gray-500">{Number(item.payments) || 0} verified payments</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">No verified payment revenue was recorded in this date range.</p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <article className="min-w-0 rounded-lg bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">User subscription status</h2>
              <Pie data={pieChartData} />
            </article>
            <article className="min-w-0 rounded-lg bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">New user sign-ups</h2>
              {signups.length ? <Line data={lineChartData} /> : (
                <p className="py-12 text-center text-sm text-gray-500">No sign-ups recorded in this date range.</p>
              )}
            </article>
          </section>

          <section className="rounded-lg bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent administrator activity</h2>
                <p className="mt-1 text-sm text-gray-500">Latest recorded administrative actions. Sensitive message content and private payloads are excluded.</p>
              </div>
              <span className="shrink-0 text-xs text-gray-500">Latest 8</span>
            </div>
            {recentAdminActivity.length ? (
              <ol className="divide-y divide-gray-100">
                {recentAdminActivity.map((event, index) => (
                  <li key={event.id || `${event.eventType || 'event'}-${index}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{activityLabel(event.eventType)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {event.action ? event.action.replace(/_/g, ' ') : event.category || event.status || 'Recorded'}
                        {event.outcome ? ` · ${event.outcome.replace(/_/g, ' ')}` : ''}
                        {event.ticketId ? ` · Ticket ${event.ticketId.slice(-6)}` : ''}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-gray-400" dateTime={event.createdAt && !Number.isNaN(new Date(event.createdAt).getTime()) ? new Date(event.createdAt).toISOString() : undefined}>
                      {event.createdAt && !Number.isNaN(new Date(event.createdAt).getTime())
                        ? new Date(event.createdAt).toLocaleString()
                        : 'Time unavailable'}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">No administrator activity has been recorded yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
};

export default AdminAnalyticsPage;
