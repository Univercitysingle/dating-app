import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';
const AdminSupportTicketListPage = () => {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/support-tickets');
      setTickets(response.tickets || []);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while fetching tickets.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan="6" className="text-center py-4">Loading...</td>
        </tr>
      );
    }

    if (error) {
        return (
          <tr>
            <td colSpan="6" className="text-center py-4 text-red-500">{error}</td>
          </tr>
        );
    }

    if (!tickets || tickets.length === 0) {
      return (
        <tr>
          <td colSpan="6" className="text-center py-4">No support tickets found.</td>
        </tr>
      );
    }

    return tickets.map((ticket) => (
      <tr key={ticket._id}>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{ticket.ticketNumber}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{ticket.userId ? ticket.userId.name : 'Unknown User'}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{ticket.subject}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <span className={`px-3 py-1 text-sm rounded-full ${
            ticket.status === 'Open' ? 'bg-green-200 text-green-800' :
            ticket.status === 'In Progress' ? 'bg-yellow-200 text-yellow-800' :
            'bg-gray-200 text-gray-800'
          }`}>
            {ticket.status}
          </span>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">
            {new Date(ticket.updatedAt).toLocaleString()}
          </p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
          <Link
            to={`/admin/support-tickets/${ticket._id}`}
            className="text-indigo-600 hover:text-indigo-900"
          >
            View
          </Link>
        </td>
      </tr>
    ));
  };

  return (
    <>
      <div className="container mx-auto px-4 sm:px-8">
        <div className="py-8">
          <div>
            <h2 className="text-2xl font-semibold leading-tight">Support Tickets</h2>
          </div>
          <div className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-4 overflow-x-auto">
            <div className="inline-block min-w-full shadow rounded-lg overflow-hidden">
              <table className="min-w-full leading-normal">
                <thead>
                  <tr>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Ticket Number
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
                  </tr>
                </thead>
                <tbody>
                  {renderContent()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminSupportTicketListPage;
