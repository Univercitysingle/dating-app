import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/apiClient';

const SupportTicketDetailPage = () => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState('');

  const fetchTicketDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/support-tickets/${ticketId}`);
      setTicket(response.ticket);
      setMessages(response.messages);
    } catch (err) {
      if (err.status === 404) {
        setError('Ticket not found or you do not have permission to view it.');
      } else {
        setError(err.response?.data?.message || 'An error occurred while fetching ticket details.');
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
    if (!newMessage.trim()) return;

    try {
      const response = await apiClient.post(`/support-tickets/${ticketId}/messages`, { message: newMessage });
      setMessages([...messages, response]);
      setNewMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while sending the message.');
    }
  };

  if (isLoading) {
    return <p>Loading ticket details...</p>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
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

        <div className="border-t border-gray-200 mt-4 pt-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg._id} className={`flex ${msg.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`p-4 rounded-lg max-w-lg ${msg.isFromAdmin ? 'bg-gray-200' : 'bg-primary text-white'}`}>
                <p className="font-bold">{msg.isFromAdmin ? 'Admin' : 'You'}</p>
                <p>{msg.message}</p>
                <p className="text-xs mt-2 opacity-75">{new Date(msg.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <form onSubmit={handleSendMessage}>
            <textarea
              rows="4"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            ></textarea>
            <button
              type="submit"
              className="mt-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SupportTicketDetailPage;
