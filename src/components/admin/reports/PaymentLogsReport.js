import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../api/apiClient';

const PaymentLogsReport = () => {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPaymentLogs = useCallback(async (search) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) {
        params.search = search;
      }
      const response = await apiClient.get('/admin/payment-logs', { params });
      setPayments(response || []);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while fetching payment logs.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPaymentLogs(searchQuery);
    }, 500); // Debounce search
    return () => clearTimeout(timer);
  }, [searchQuery, fetchPaymentLogs]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan="5" className="text-center py-4">Loading...</td>
        </tr>
      );
    }

    if (error) {
        return (
          <tr>
            <td colSpan="5" className="text-center py-4 text-red-500">{error}</td>
          </tr>
        );
    }

    if (!payments || payments.length === 0) {
      return (
        <tr>
          <td colSpan="5" className="text-center py-4">No payment logs found.</td>
        </tr>
      );
    }

    return payments.map((payment) => (
      <tr key={payment._id}>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{payment.userId ? payment.userId.name : 'Unknown User'}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">{payment.userId ? payment.userId.email : 'Unknown Email'}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap capitalize">{payment.plan}</p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
          <p className="text-gray-900 whitespace-no-wrap">
            {new Date(payment.createdAt).toLocaleString()}
          </p>
        </td>
        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
            <span className={`px-2 py-1 font-semibold leading-tight rounded-full text-xs ${
                payment.status === 'active' ? 'bg-green-200 text-green-800' :
                payment.status === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                'bg-red-200 text-red-800'
            }`}>
                {payment.status}
            </span>
        </td>
      </tr>
    ));
  };

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm w-full"
          placeholder="Search by User Name or Email..."
        />
      </div>
      <div className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-4 overflow-x-auto">
        <div className="inline-block min-w-full shadow rounded-lg overflow-hidden">
          <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                User
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Email
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Payment Date
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
              </th>
            </tr>
          </thead>
          <tbody>
            {renderContent()}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
};

export default PaymentLogsReport;
