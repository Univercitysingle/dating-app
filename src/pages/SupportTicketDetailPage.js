import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/apiClient';
import LoadingState from '../components/LoadingState';
import { getUserFriendlyError } from '../utils/apiErrors';

const SupportTicketDetailPage = () => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  const fetchTicketDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/support-tickets/${ticketId}`);
      setTicket(response.ticket);
      setMessages(response.messages);
    } catch (err) {
      if (err.status === 404) {
        setError('We could not find this ticket or you do not have permission to view it.');
      } else {
        setError(getUserFriendlyError(err, 'We could not load this ticket. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTicketDetails();
  }, [ticketId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachments.length) return;

    setActionError(null);
    setIsSending(true);
    try {
      const uploaded = [];
      for (const file of attachments) {
        const form = new FormData();
        form.append('ticketId', ticketId);
        form.append('file', file);
        const result = await apiClient.post('/support-attachments', form);
        uploaded.push(result.attachment);
      }
      const response = await apiClient.post('/support-tickets/' + ticketId + '/messages', {
        message: newMessage || 'Attachments added.',
        attachments: uploaded
      });
      const refreshed = await apiClient.get(`/support-tickets/${ticketId}`);
      setTicket(refreshed.ticket);
      setMessages(Array.isArray(refreshed.messages) ? refreshed.messages : []);
      setNewMessage('');
      setAttachments([]);
    } catch (err) {
      setActionError(getUserFriendlyError(err, 'Your reply could not be sent. Please try again.'));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    if (!feedbackRating || isSubmittingFeedback || ticket?.status !== 'Closed' || ticket?.customerFeedback) return;
    setFeedbackError(null);
    setIsSubmittingFeedback(true);
    try {
      await apiClient.post('/support-tickets/' + ticketId + '/feedback', {
        rating: feedbackRating,
        comment: feedbackComment.trim()
      });
      await fetchTicketDetails();
    } catch (err) {
      setFeedbackError(getUserFriendlyError(err, 'Your feedback could not be submitted. Please try again.'));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (isLoading) {
    return <LoadingState spinnerOnly />;
  }

  if (error) {
    return <div className="mx-auto max-w-2xl p-6 text-center" role="alert"><p className="text-red-600">{error}</p><button type="button" onClick={fetchTicketDetails} className="mt-4 rounded-full bg-primary px-5 py-2 text-white">Try again</button></div>;
  }

  if (!ticket) {
    return <p>Ticket not found.</p>;
  }

  return (
    <div className="container mx-auto px-4 sm:px-8 py-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
            <p className="text-sm text-gray-600">Ticket #{ticket.ticketNumber}</p>
          </div>
          <span className={`px-3 py-1 text-sm rounded-full ${
            ticket.status === 'Open' ? 'bg-green-200 text-green-800' :
            ticket.status === 'In Progress' ? 'bg-yellow-200 text-yellow-800' :
            'bg-gray-200 text-gray-800'
          }`}>
            {ticket.status}
          </span>
        </div>

        {ticket.status === 'Closed' && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This ticket is closed. Sending a new reply will reopen it and notify the support team.
          {ticket.resolutionSummary && <p className="mt-2"><strong>Previous resolution:</strong> {ticket.resolutionSummary}</p>}
        </div>}

        {ticket.status === 'Closed' && <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5" aria-labelledby="ticket-feedback-heading">
          <h2 id="ticket-feedback-heading" className="text-lg font-semibold text-slate-900">How was your support experience?</h2>
          {ticket.customerFeedback ? <div className="mt-3" role="status">
            <p className="font-medium text-emerald-700">Thank you for your feedback.</p>
            <p className="mt-1 text-sm text-slate-700">Your rating: {ticket.customerFeedback.rating} out of 5</p>
            {ticket.customerFeedback.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{ticket.customerFeedback.comment}</p>}
          </div> : <form onSubmit={handleSubmitFeedback} className="mt-3 space-y-3">
            <fieldset>
              <legend className="mb-2 text-sm text-slate-700">Choose a rating from 1 to 5</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map(value => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${feedbackRating === value ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                  <input type="radio" name="ticket-feedback-rating" value={value} checked={feedbackRating === value} onChange={() => setFeedbackRating(value)} required />
                  {value} {value === 1 ? 'Poor' : value === 5 ? 'Excellent' : ''}
                </label>)}
              </div>
            </fieldset>
            <label className="block text-sm font-medium text-slate-700">Additional comments (optional)
              <textarea rows="3" maxLength={1000} value={feedbackComment} onChange={event => setFeedbackComment(event.target.value)} placeholder="Tell us what went well or what we could improve." className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" />
            </label>
            {feedbackError && <p role="alert" className="text-sm text-red-600">{feedbackError}</p>}
            <button type="submit" disabled={!feedbackRating || isSubmittingFeedback} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmittingFeedback ? 'Submitting...' : 'Submit feedback'}
            </button>
            <p className="text-xs text-slate-500">You can submit feedback once for this ticket. Your comment is visible to the support team.</p>
          </form>}
        </section>}

        <div className="border-t border-gray-200 mt-4 pt-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg._id} className={`flex ${msg.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`p-4 rounded-lg max-w-lg ${msg.isFromAdmin ? 'bg-gray-200' : 'bg-primary text-white'}`}>
                <p className="font-bold">{msg.isFromAdmin ? 'Admin' : 'You'}</p>
                <p>{msg.message}</p>
                {Array.isArray(msg.attachments) && msg.attachments.length > 0 && <div className="mt-3 space-y-2">
                  {msg.attachments.map((file) => <a key={file.key} href={file.url} target="_blank" rel="noreferrer" className="block underline break-all text-sm">
                    {file.type && file.type.startsWith('image/') ? 'Image: ' : 'File: '}{file.name}
                  </a>)}
                </div>}
                <p className="text-xs mt-2 opacity-75">{new Date(msg.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
          <form onSubmit={handleSendMessage}>
            <textarea
              rows="4"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-2 border border-gray-300 rounded-md"
            ></textarea>
            <label htmlFor="ticket-reply-attachments" className="block mt-3 text-sm font-medium text-gray-700">Attach images or PDF (up to 5 files, 10 MB each)</label>
            <input id="ticket-reply-attachments" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" onChange={(e) => setAttachments(Array.from(e.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm" />
            {attachments.length > 0 && <p className="text-sm text-gray-500 mt-1">{attachments.map(file => file.name).join(', ')}</p>}
            <button
              type="submit"
              disabled={isSending}
              className="mt-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-60"
            >
              {isSending ? "Sending..." : ticket.status === 'Closed' ? "Reply and reopen ticket" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SupportTicketDetailPage;
