import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

const getStatusStyle = (status) => {
  const value = String(status || '').toLowerCase();
  if (['completed', 'active', 'succeeded', 'paid'].includes(value)) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/15';
  if (['pending', 'processing', 'initiated'].includes(value)) return 'bg-amber-50 text-amber-700 ring-amber-600/15';
  if (['rejected', 'failed', 'cancelled', 'refunded'].includes(value)) return 'bg-rose-50 text-rose-700 ring-rose-600/15';
  return 'bg-slate-100 text-slate-600 ring-slate-500/15';
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
};

const AdminTransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const [reconciliation, setReconciliation] = useState(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState(null);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/transactions');
      setTransactions(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.data?.message || err.message || 'An error occurred while fetching transactions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchReconciliation = useCallback(async () => {
    setReconciliationLoading(true);
    setReconciliationError(null);
    try {
      const response = await apiClient.get('/admin/payment-reconciliation');
      setReconciliation(response);
    } catch (err) {
      setReconciliationError(err.data?.message || err.message || 'Payment reconciliation report could not be loaded.');
    } finally {
      setReconciliationLoading(false);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const completedCount = transactions.filter((tx) => ['completed', 'active', 'succeeded', 'paid'].includes(String(tx.status || '').toLowerCase())).length;
  const pendingCount = transactions.filter((tx) => ['pending', 'processing', 'initiated'].includes(String(tx.status || '').toLowerCase())).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Finance operations</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Transaction ledger</h2><p className="mt-2 text-sm text-slate-500">Review recorded purchases and subscription activity.</p></div>
        <button type="button" onClick={fetchTransactions} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"><span className={isLoading ? 'animate-spin' : ''} aria-hidden="true">↻</span>{isLoading ? 'Refreshing' : 'Refresh ledger'}</button>
      </header>

      {user?.role === 'superadmin' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="payment-reconciliation-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="payment-reconciliation-title" className="font-bold text-slate-900">Payment reconciliation</h3>
              <p className="mt-1 text-sm text-slate-500">Checks local records for stale checkouts, missing gateway metadata, refund reviews and duplicate references.</p>
            </div>
            <button type="button" onClick={fetchReconciliation} disabled={reconciliationLoading} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
              {reconciliationLoading ? 'Checking…' : 'Run reconciliation'}
            </button>
          </div>
          {reconciliationError && <p role="alert" className="mt-3 text-sm text-rose-700">{reconciliationError}</p>}
          {reconciliation && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">Scanned {reconciliation.counts?.totalScanned ?? 0} local records. Provider status was not queried. Compare flagged transactions with the WebXPay merchant portal before changing entitlements or recording refunds.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Pending</p><p className="text-xl font-bold">{reconciliation.counts?.pending ?? 0}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Completed / active</p><p className="text-xl font-bold">{reconciliation.counts?.completed ?? 0}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Refund review</p><p className="text-xl font-bold">{reconciliation.counts?.refundRequired ?? 0}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Flags</p><p className="text-xl font-bold">{reconciliation.counts?.anomalies ?? 0}</p></div>
              </div>
              {reconciliation.anomalies?.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {reconciliation.anomalies.map((item, index) => (
                    <li key={item.transactionId || item.duplicateValue || index} className="py-3 text-sm">
                      <p className="font-semibold text-slate-800">{String(item.reason || 'Review required').replace(/_/g, ' ')}</p>
                      {item.transactionId && <p className="mt-1 text-xs text-slate-500">Transaction: {item.transactionId} · Status: {item.status}</p>}
                      {item.transactions && <p className="mt-1 text-xs text-slate-500">{item.transactions.length} records share the same gateway identifier or reference.</p>}
                      <p className="mt-1 text-xs text-slate-600">{item.recommendedAction}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-emerald-700">No local reconciliation flags were found in the scanned records.</p>}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total records loaded</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{transactions.length.toLocaleString()}</p></article>
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Completed / active</p><p className="mt-2 text-3xl font-bold tracking-tight text-emerald-800">{completedCount.toLocaleString()}</p></article>
        <article className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending / processing</p><p className="mt-2 text-3xl font-bold tracking-tight text-amber-800">{pendingCount.toLocaleString()}</p></article>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={fetchTransactions} className="font-semibold underline">Try again</button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">All transactions</h3><p className="mt-1 text-xs text-slate-500">Transaction values are displayed as returned by the payment records.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead><tr><th>User</th><th>Type</th><th>Item / plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan="6" className="py-12 text-center"><span className="inline-flex items-center gap-3 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />Loading transactions…</span></td></tr>
                : error ? <tr><td colSpan="6" className="py-10 text-center text-sm text-slate-500">Transaction records could not be loaded. Retry to try again.</td></tr>
                : transactions.length === 0 ? <tr><td colSpan="6" className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">◇</div><p className="mt-3 font-semibold text-slate-800">No transactions found</p><p className="mt-1 text-sm text-slate-500">New payment records will appear here.</p></td></tr>
                : transactions.map((tx) => {
                  const user = tx.user || tx.userId;
                  return <tr key={tx._id}>
                    <td><span className="block font-semibold text-slate-800">{user?.name || 'Unknown user'}</span><span className="mt-1 block max-w-[220px] truncate text-xs text-slate-400" title={user?.email || ''}>{user?.email || 'Email unavailable'}</span></td>
                    <td><span className="capitalize text-slate-600">{String(tx.type || 'Payment').replace(/[_-]/g, ' ')}</span></td>
                    <td><span className="font-medium text-slate-700">{tx.itemName || 'Not specified'}</span></td>
                    <td><span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{tx.price ?? 'Not available'}</span></td>
                    <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusStyle(tx.status)}`}>{tx.status || 'Unknown'}</span></td>
                    <td><span className="whitespace-nowrap text-xs text-slate-500">{formatDate(tx.createdAt)}</span></td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminTransactionsPage;
