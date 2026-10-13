import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
const AdminSupportTicketDetailPage = () => {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchTicketDetails();
  }, [ticketId]);

  const fetchTicketDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/admin/support-tickets/${ticketId}`);
      setTicket(response.ticket);
      setMessages(response.messages);
      setNewStatus(response.ticket.status);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while fetching ticket details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const response = await apiClient.post(`/admin/support-tickets/${ticketId}/messages`, { message: newMessage });
      setMessages([...messages, response]);
      setNewMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while sending the message.');
    }
  };

  const handleUpdateStatus = async () => {
    try {
      const response = await apiClient.put(`/admin/support-tickets/${ticketId}/status`, { status: newStatus });
      setTicket(response);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while updating the status.');
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
    <>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
            <p className="text-sm text-gray-600">Ticket #{ticket.ticketNumber}</p>
            <p className="text-sm text-gray-600">User: {ticket.userId.name} ({ticket.userId.email})</p>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="p-2 border border-gray-300 rounded-md"
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Closed">Closed</option>
            </select>
            <button
              onClick={handleUpdateStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Update Status
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-4 pt-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg._id} className={`flex ${msg.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`p-4 rounded-lg max-w-lg ${msg.isFromAdmin ? 'bg-gray-200' : 'bg-primary text-white'}`}>
                <p className="font-bold">{msg.isFromAdmin ? 'Admin' : 'User'}</p>
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
              Send Message
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default AdminSupportTicketDetailPage;
