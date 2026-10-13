import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/apiClient';

const SupportPage = () => {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/support-tickets');
      setTickets(response);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while fetching tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post('/support-tickets', { subject, message });
      setShowCreateForm(false);
      setSubject('');
      setMessage('');
      fetchTickets();
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while creating the ticket.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-8 py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
        >
          {showCreateForm ? 'Cancel' : 'Create New Ticket'}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <form onSubmit={handleCreateTicket}>
            <div className="mb-4">
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700">Subject</label>
              <input
                type="text"
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="message" className="block text-sm font-medium text-gray-700">Message</label>
              <textarea
                id="message"
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                required
              ></textarea>
            </div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
              disabled={isLoading}
            >
              {isLoading ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </form>
        </div>
      )}

      {isLoading && <p>Loading tickets...</p>}
      {!isLoading && !error && tickets.length === 0 && <p>You have no support tickets.</p>}

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <Link to={`/support/tickets/${ticket._id}`} key={ticket._id} className="block bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold text-primary-dark">{ticket.subject}</h2>
              <span className={`px-3 py-1 text-sm rounded-full ${
                ticket.status === 'Open' ? 'bg-green-200 text-green-800' :
                ticket.status === 'In Progress' ? 'bg-yellow-200 text-yellow-800' :
                'bg-gray-200 text-gray-800'
              }`}>
                {ticket.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-2">Ticket #{ticket.ticketNumber}</p>
            <p className="text-sm text-gray-500 mt-1">Last updated: {new Date(ticket.updatedAt).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SupportPage;
