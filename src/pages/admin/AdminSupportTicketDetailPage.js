import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';

const statuses = ['Open', 'In Progress', 'Waiting for Customer', 'Closed'];
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
};

const AdminSupportTicketDetailPage = () => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const fetchTicketDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/support-tickets/' + ticketId);
      setTicket(response.ticket);
      setMessages(Array.isArray(response.messages) ? response.messages : []);
      setNewStatus(response.ticket?.status || 'Open');
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to load this support ticket.');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicketDetails(); }, [fetchTicketDetails]);

  const handleAttachmentChange = (event) => {
    const selected = Array.from(event.target.files || []);
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (selected.length > 5) {
      setError('You can attach up to 5 files per message.');
      event.target.value = '';
      return;
    }
    const invalid = selected.find(file => !allowed.includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024);
    if (invalid) {
      setError('Attachments must be JPEG, PNG, GIF, WebP or PDF files no larger than 10 MB each.');
      event.target.value = '';
      return;
    }
    setError(null);
    setAttachments(selected);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!newMessage.trim() && !attachments.length) return;
    setIsSending(true);
    setError(null);
    setActionMessage(null);
    try {
      const uploaded = [];
      for (const file of attachments) {
        const form = new FormData();
        form.append('ticketId', ticketId);
        form.append('file', file);
        const result = await apiClient.post('/support-attachments', form);
        if (result?.attachment) uploaded.push(result.attachment);
      }
      const response = await apiClient.post('/admin/support-tickets/' + ticketId + '/messages', {
        message: newMessage.trim() || 'Attachments added.',
        attachments: uploaded,
        isInternalNote
      });
      setMessages(current => [...current, response]);
      setNewMessage('');
      setAttachments([]);
      setActionMessage(isInternalNote ? 'Internal note saved. It is visible to administrators only.' : 'Reply sent to the customer.');
      const input = document.getElementById('admin-ticket-attachments');
      if (input) input.value = '';
      if (!isInternalNote) {
        const refreshed = await apiClient.get('/admin/support-tickets/' + ticketId);
        setTicket(refreshed.ticket);
        setMessages(Array.isArray(refreshed.messages) ? refreshed.messages : []);
        setNewStatus(refreshed.ticket?.status || 'Waiting for Customer');
      }
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to send this message. Please retry.');
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === ticket?.status) return;
    setIsSavingStatus(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await apiClient.put('/admin/support-tickets/' + ticketId + '/status', { status: newStatus });
      setTicket(response);
      setActionMessage('Ticket status updated.');
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to update ticket status.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  if (isLoading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"><span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 align-middle" /> <span className="ml-2">Loading ticket details…</span></div>;
  }

  if (error && !ticket) {
    return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"><p>{error}</p><button type="button" onClick={fetchTicketDetails} className="mt-3 font-semibold underline">Try again</button></div>;
  }

  if (!ticket) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">Ticket not found.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/support-tickets" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">← Back to support inbox</Link>
        <button type="button" onClick={fetchTicketDetails} disabled={isLoading} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Refresh ticket</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {actionMessage && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionMessage}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Support request</p>
            <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900">{ticket.subject || 'No subject'}</h1>
            <p className="mt-2 text-sm text-slate-500">Ticket #{ticket.ticketNumber || ticket._id}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="text-slate-600"><strong className="text-slate-800">Customer:</strong> {ticket.userId?.name || 'Unknown user'}</span>
              {ticket.userId?.email && <span className="text-slate-600"><strong className="text-slate-800">Email:</strong> {ticket.userId.email}</span>}
              <span className="text-slate-500">Created {formatDate(ticket.createdAt)}</span>
              <span className="text-slate-500">Updated {formatDate(ticket.updatedAt)}</span>
            </div>
          </div>
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 lg:w-auto lg:min-w-[280px]">
            <label htmlFor="ticket-status" className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Ticket status</label>
            <div className="flex gap-2">
              <select id="ticket-status" value={newStatus} onChange={event => setNewStatus(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                {statuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="button" onClick={handleUpdateStatus} disabled={isSavingStatus || newStatus === ticket.status} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{isSavingStatus ? 'Saving…' : 'Save'}</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Changing status does not send a customer message.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Conversation history</h2>
          <p className="mt-1 text-xs text-slate-500">Customer replies and staff-only notes are shown in chronological order.</p>
        </div>
        <div className="space-y-4 bg-slate-50/70 p-4 sm:p-6">
          {messages.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p> : messages.map((msg) => (
            <div key={msg._id} className={`flex ${msg.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
              <article className={`w-full max-w-2xl rounded-2xl border p-4 shadow-sm ${msg.isInternalNote ? 'border-amber-300 bg-amber-50' : msg.isFromAdmin ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50'}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{msg.isInternalNote ? 'Staff note' : msg.isFromAdmin ? 'Support team' : (msg.senderId?.name || 'Customer')}</span>
                    {msg.isInternalNote && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">Private</span>}
                  </div>
                  <time className="text-xs text-slate-500">{formatDate(msg.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{msg.message}</p>
                {Array.isArray(msg.attachments) && msg.attachments.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3">
                  {msg.attachments.map((file) => <a key={file.key} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-sm font-medium text-indigo-700 underline"><span aria-hidden="true">{file.type?.startsWith('image/') ? '▧' : '↗'}</span>{file.name || 'Attachment'}</a>)}
                </div>}
              </article>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">Respond to ticket</h2><p className="mt-1 text-sm text-slate-500">Send a customer reply or record a private staff note.</p></div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setIsInternalNote(false)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!isInternalNote ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Customer reply</button>
            <button type="button" onClick={() => setIsInternalNote(true)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${isInternalNote ? 'bg-amber-100 text-amber-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Internal note</button>
          </div>
        </div>
        {isInternalNote && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Private note:</strong> The customer cannot see this message or its attachments.</div>}
        <form onSubmit={handleSendMessage} className="space-y-3">
          <label htmlFor="admin-ticket-message" className="sr-only">Message</label>
          <textarea id="admin-ticket-message" rows="5" maxLength={4000} value={newMessage} onChange={event => setNewMessage(event.target.value)} placeholder={isInternalNote ? 'Write a private note for other support staff…' : 'Write a clear reply to the customer…'} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor="admin-ticket-attachments" className="block text-xs font-semibold text-slate-600">Attachments: up to 5 files, 10 MB each</label>
              <input id="admin-ticket-attachments" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" onChange={handleAttachmentChange} className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700" />
              {attachments.length > 0 && <p className="mt-1 text-xs text-slate-500">{attachments.map(file => file.name).join(' · ')}</p>}
            </div>
            <button type="submit" disabled={isSending || (!newMessage.trim() && attachments.length === 0)} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${isInternalNote ? 'bg-amber-700 hover:bg-amber-800' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{isSending ? 'Sending…' : isInternalNote ? 'Save private note' : 'Send customer reply'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default AdminSupportTicketDetailPage;
