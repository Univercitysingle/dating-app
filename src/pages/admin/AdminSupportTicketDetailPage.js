import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';

const statuses = ['Open', 'In Progress', 'Waiting for Customer', 'Closed'];
const priorities = ['Urgent', 'High', 'Normal', 'Low'];
const categories = ['Account', 'Payments', 'Profile', 'Verification', 'Safety', 'Technical', 'Other'];
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
};

const AdminSupportTicketDetailPage = () => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newPriority, setNewPriority] = useState('Normal');
  const [newCategory, setNewCategory] = useState('Other');
  const [staff, setStaff] = useState([]);
  const [assignedToUid, setAssignedToUid] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const fetchTicketDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/support-tickets/' + ticketId);
      setTicket(response.ticket);
      setMessages(Array.isArray(response.messages) ? response.messages : []);
      setHistory(Array.isArray(response.history) ? response.history : []);
      setNewStatus(response.ticket?.status || 'Open');
      setNewPriority(response.ticket?.priority || 'Normal');
      setNewCategory(response.ticket?.category || 'Other');
      setStaff(Array.isArray(response.staff) ? response.staff : []);
      setAssignedToUid(response.ticket?.assignedToUid || '');
      setResolutionSummary(response.ticket?.resolutionSummary || '');
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
        setHistory(Array.isArray(refreshed.history) ? refreshed.history : []);
        setNewStatus(refreshed.ticket?.status || 'Waiting for Customer');
      }
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to send this message. Please retry.');
    } finally {
      setIsSending(false);
    }
  };

  const handleEditMessage = async (msg) => {
    const nextMessage = window.prompt('Edit support message', msg.message || '');
    if (nextMessage === null || !nextMessage.trim() || nextMessage.trim() === msg.message) return;
    try {
      await apiClient.patch('/admin/support-tickets/' + ticketId + '/messages/' + msg._id, { message: nextMessage.trim() });
      await fetchTicketDetails();
      setActionMessage('Message updated.');
      setError(null);
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to edit this message.');
    }
  };

  const handleDeleteMessage = async (msg) => {
    if (!window.confirm('Delete this message? Its content will be retained in restricted audit history.')) return;
    try {
      await apiClient.delete('/admin/support-tickets/' + ticketId + '/messages/' + msg._id);
      await fetchTicketDetails();
      setActionMessage('Message deleted.');
      setError(null);
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to delete this message.');
    }
  };

  const handleUpdateStatus = async () => {
    const changes = {};
    if (newStatus && newStatus !== ticket?.status) changes.status = newStatus;
    if (newPriority !== (ticket?.priority || 'Normal')) changes.priority = newPriority;
    if (newCategory !== (ticket?.category || 'Other')) changes.category = newCategory;
    if (assignedToUid !== (ticket?.assignedToUid || '')) changes.assignedToUid = assignedToUid || null;
    if (newStatus === 'Closed' && resolutionSummary.trim() !== (ticket?.resolutionSummary || '')) {
      changes.resolutionSummary = resolutionSummary.trim();
    }
    if (newStatus === 'Closed' && !resolutionSummary.trim()) {
      setError('Add a resolution summary before closing this ticket.');
      return;
    }
    if (!Object.keys(changes).length) return;
    setIsSavingStatus(true);
    setError(null);
    setActionMessage(null);
    try {
      await apiClient.put('/admin/support-tickets/' + ticketId + '/status', changes);
      await fetchTicketDetails();
      setActionMessage('Ticket details updated.');
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
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                <select id="ticket-status" value={newStatus} onChange={event => setNewStatus(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Priority</span>
                <select value={newPriority} onChange={event => setNewPriority(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{priorities.map(value => <option key={value}>{value}</option>)}</select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Category</span>
                <select value={newCategory} onChange={event => setNewCategory(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{categories.map(value => <option key={value}>{value}</option>)}</select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Assigned to</span>
                <select value={assignedToUid} onChange={event => setAssignedToUid(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">Unassigned</option>{staff.map(person => <option key={person.uid} value={person.uid}>{person.name} ({person.role})</option>)}
                </select>
              </label>
              {newStatus === 'Closed' && <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Resolution summary <span className="text-rose-600">*</span></span>
                <textarea rows="4" maxLength={2000} value={resolutionSummary} onChange={event => setResolutionSummary(event.target.value)} placeholder="Summarize the issue, action taken, and outcome for the customer." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5" />
                <span className="mt-1 block text-[11px] text-slate-500">Required to close. Up to 2,000 characters.</span>
              </label>}
              <button type="button" onClick={handleUpdateStatus} disabled={isSavingStatus || (newStatus === ticket.status && newPriority === (ticket.priority || 'Normal') && newCategory === (ticket.category || 'Other') && assignedToUid === (ticket.assignedToUid || '') && (newStatus !== 'Closed' || resolutionSummary.trim() === (ticket.resolutionSummary || '')))} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{isSavingStatus ? 'Saving…' : ticket.status === 'Closed' && newStatus !== 'Closed' ? 'Reopen ticket' : newStatus === 'Closed' && ticket.status !== 'Closed' ? 'Close ticket' : 'Save changes'}</button>
            </div>
            <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">SLA deadline:</span> {ticket.slaDueAt ? formatDate(ticket.slaDueAt) : 'Set when ticket is updated'}{ticket.slaDueAt && new Date(ticket.slaDueAt).getTime() < Date.now() && ticket.status !== 'Closed' && <span className="ml-1 font-bold text-rose-700">Overdue</span>}<br />Metadata changes do not send a customer message.</p>
          </div>
        </div>
      </section>

      {ticket.status === 'Closed' && ticket.resolutionSummary && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-sm font-bold text-emerald-900">Resolution summary</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{ticket.resolutionSummary}</p>
        {ticket.resolvedAt && <p className="mt-2 text-xs text-emerald-700">Resolved {formatDate(ticket.resolvedAt)}</p>}
      </section>}

      {ticket.customerFeedback && <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <h2 className="text-sm font-bold text-indigo-950">Customer satisfaction feedback</h2>
        <p className="mt-2 text-lg font-semibold text-indigo-900">{ticket.customerFeedback.rating} / 5</p>
        {ticket.customerFeedback.comment ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-indigo-900">{ticket.customerFeedback.comment}</p> : <p className="mt-2 text-sm text-indigo-800">No additional comment provided.</p>}
        {ticket.customerFeedback.submittedAt && <p className="mt-2 text-xs text-indigo-700">Submitted {formatDate(ticket.customerFeedback.submittedAt)}</p>}
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Ticket audit history</h2>
          <p className="mt-1 text-xs text-slate-500">Administrative changes, newest first.</p>
        </div>
        <div className="divide-y divide-slate-100 px-5">
          {history.length === 0 ? <p className="py-4 text-sm text-slate-500">No administrative changes recorded yet.</p> : history.map((entry, index) => (
            <div key={entry._id || index} className="py-3">
              <p className="text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
              <ul className="mt-1 space-y-1">{(Array.isArray(entry.changes) ? entry.changes : []).map((change, changeIndex) => (
                <li key={changeIndex} className="text-sm text-slate-700"><strong>{change.field}</strong>: {change.from === null ? 'Not set' : String(change.from)} <span aria-hidden="true">→</span> {change.to === null ? 'Unassigned' : String(change.to)}</li>
              ))}</ul>
            </div>
          ))}
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
                <p className={`whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 ${msg.deletedAt ? 'italic opacity-70' : ''}`}>{msg.deletedAt ? 'This message was deleted.' : msg.message}</p>
                {msg.editedAt && !msg.deletedAt && <span className="mt-1 block text-[11px] text-slate-500">Edited {formatDate(msg.editedAt)}</span>}
                {!msg.deletedAt && <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" onClick={() => handleEditMessage(msg)} className="font-semibold text-indigo-700 underline">Edit</button>
                  <button type="button" onClick={() => handleDeleteMessage(msg)} className="font-semibold text-rose-700 underline">Delete</button>
                </div>}
                {!msg.deletedAt && Array.isArray(msg.attachments) && msg.attachments.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3">
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
