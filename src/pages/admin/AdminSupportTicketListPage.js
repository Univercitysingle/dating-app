import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';

const statusStyle = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'open') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/15';
  if (value === 'in progress') return 'bg-amber-50 text-amber-700 ring-amber-600/15';
  if (value === 'waiting for customer') return 'bg-sky-50 text-sky-700 ring-sky-600/15';
  if (value === 'closed') return 'bg-slate-100 text-slate-600 ring-slate-500/15';
  return 'bg-indigo-50 text-indigo-700 ring-indigo-600/15';
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not available';
};

const AdminSupportTicketListPage = () => {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const response = await apiClient.get('/admin/support-tickets?' + params.toString());
      setTickets(Array.isArray(response?.tickets) ? response.tickets : []);
      setTotal(Number(response?.total) || 0);
      setTotalPages(Math.max(1, Number(response?.totalPages) || 1));
    } catch (err) {
      setError(err.data?.message || err.message || 'An error occurred while fetching tickets.');
    } finally {
      setIsLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleStatusChange = (value) => {
    setPage(1);
    setStatus(value);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Customer care</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Support inbox</h2>
          <p className="mt-2 text-sm text-slate-500">Search, prioritise your queue and keep customer conversations moving.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">{total} {total === 1 ? 'ticket' : 'tickets'}</span>
          <button type="button" onClick={fetchTickets} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50">
            <span className={isLoading ? 'animate-spin' : ''} aria-hidden="true">↻</span>{isLoading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <form onSubmit={handleSearch} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search tickets</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ticket number, subject or customer" maxLength={100} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select value={status} onChange={(event) => handleStatusChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
              <option value="">All statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In progress</option>
              <option value="Waiting for Customer">Waiting for customer</option>
              <option value="Closed">Closed</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 md:w-auto">Search</button>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={clearFilters} disabled={!search && !searchInput && !status} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto">Clear</button>
          </div>
        </form>
      </section>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={fetchTickets} className="font-semibold underline">Try again</button></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div><h3 className="font-bold text-slate-900">Support requests</h3><p className="mt-1 text-xs text-slate-500">Sorted by most recently updated</p></div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Page {page} of {totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead><tr><th>Ticket</th><th>Customer</th><th>Subject</th><th>Status</th><th>Last updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="py-12 text-center"><span className="inline-flex items-center gap-3 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />Loading support inbox…</span></td></tr>
              ) : error ? (
                <tr><td colSpan="6" className="py-10 text-center text-sm text-slate-500">The queue could not be loaded. Use the retry action above.</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan="6" className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-emerald-600">✓</div><p className="mt-3 font-semibold text-slate-800">No matching tickets</p><p className="mt-1 text-sm text-slate-500">Try another search or clear the filters.</p></td></tr>
              ) : tickets.map((ticket) => (
                <tr key={ticket._id}>
                  <td><span className="font-semibold text-slate-800">{ticket.ticketNumber || 'Ticket'}</span></td>
                  <td><span className="font-medium text-slate-800">{ticket.userId?.name || 'Unknown user'}</span>{ticket.userId?.email && <span className="mt-0.5 block text-xs text-slate-400">{ticket.userId.email}</span>}</td>
                  <td><span className="block max-w-[280px] truncate font-medium text-slate-700" title={ticket.subject}>{ticket.subject || 'No subject'}</span></td>
                  <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(ticket.status)}`}>{ticket.status || 'Unknown'}</span></td>
                  <td><span className="whitespace-nowrap text-xs text-slate-500">{formatDate(ticket.updatedAt)}</span></td>
                  <td className="text-right"><Link to={`/admin/support-tickets/${ticket._id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50">Open <span aria-hidden="true">→</span></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Showing {tickets.length ? (page - 1) * 10 + 1 : 0} to {(page - 1) * 10 + tickets.length} of {total} tickets</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={isLoading || page <= 1} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={isLoading || page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminSupportTicketListPage;
