import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

const AdminStorePurchasesPage = () => {
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const { user: adminUser } = useAuth();

  const fetchPurchases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/users/purchases', {
        params: { status: filter },
      });
      setPurchases(response || []);
    } catch (err) {
      setError(err.data?.message || err.message || 'An error occurred while fetching purchases.');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleView = (purchase) => {
    setSelectedPurchase(purchase);
  };

  const handleCloseModal = () => {
    setSelectedPurchase(null);
  };

  const handleApprove = async (purchaseId) => {
    try {
      await apiClient.post(`/admin/users/purchases/${purchaseId}/approve`);
      fetchPurchases();
      handleCloseModal();
    } catch (err) {
      setError(err.data?.message || err.message || 'An error occurred while approving the purchase.');
    }
  };

  const handleReject = async (purchaseId) => {
    const reason = prompt('Please enter the reason for rejecting this purchase:');
    if (!reason) {
      return; // Admin cancelled the prompt
    }
    try {
      await apiClient.post(`/admin/users/purchases/${purchaseId}/reject`, { reason });
      fetchPurchases();
      handleCloseModal();
    } catch (err) {
      setError(err.data?.message || err.message || 'An error occurred while rejecting the purchase.');
    }
  };

  const handleRecordRefund = async (transaction) => {
    if (!window.confirm('Only continue if the refund has already been completed and verified in the WebXPay merchant portal. This action records the refund and closes the review item.')) return;
    const refundReference = prompt('Enter the WebXPay refund reference:');
    if (!refundReference || refundReference.trim().length < 3) return;
    const note = prompt('Optional refund note (for example, merchant portal confirmation details):') || '';
    try {
      await apiClient.post(`/admin/users/purchases/${transaction._id}/record-refund`, {
        transactionType: transaction.transactionType,
        refundReference: refundReference.trim(),
        note,
      });
      await fetchPurchases();
      handleCloseModal();
    } catch (err) {
      setError(err.data?.message || err.message || 'Unable to record the refund.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-200 text-yellow-800';
      case 'completed':
        return 'bg-green-200 text-green-800';
      case 'rejected':
        return 'bg-red-200 text-red-800';
      case 'refund_required':
        return 'bg-orange-200 text-orange-900';
      case 'refunded':
        return 'bg-purple-200 text-purple-900';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const FilterButton = ({ status, children }) => (
    <button
      onClick={() => setFilter(status)}
      className={`px-4 py-2 text-sm font-medium rounded-md ${
        filter === status
          ? 'bg-primary text-white'
          : 'bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="container mx-auto px-4 sm:px-8">
        <div className="py-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold leading-tight">Payment Review & Store Purchases</h2>
            <button onClick={fetchPurchases} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                Refresh
            </button>
          </div>

          <div className="my-4 flex space-x-2">
            <FilterButton status="all">All</FilterButton>
            <FilterButton status="pending">Pending</FilterButton>
            <FilterButton status="completed">Completed</FilterButton>
            <FilterButton status="rejected">Rejected</FilterButton>
            <FilterButton status="refund_required">Refund review</FilterButton>
            <FilterButton status="refunded">Refunded</FilterButton>
          </div>

          {error && <p className="text-red-500">{error}</p>}
          <div className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-4 overflow-x-auto">
            <div className="inline-block min-w-full shadow rounded-lg overflow-hidden">
              <table className="min-w-full leading-normal">
                <thead>
                  <tr>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">User</th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type / Item</th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Submitted At</th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan="6" className="text-center py-4">Loading...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-4">No purchases found for this filter.</td></tr>
                  ) : (
                    purchases.map((purchase) => (
                      <tr key={purchase._id}>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                          <p className="text-gray-900 whitespace-no-wrap">{purchase.userId ? purchase.userId.name : 'Unknown User'}</p>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                          <p className="text-gray-900 whitespace-no-wrap">{purchase.transactionType === 'subscription' ? 'Subscription' : 'Store purchase'}</p><p className="text-gray-700 whitespace-no-wrap capitalize">{purchase.itemName || purchase.plan || purchase.itemId || 'Unknown item'}</p>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                          <p className="text-gray-900 whitespace-no-wrap">{purchase.itemPrice || purchase.amount || purchase.price || 'Not recorded'}</p>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                          <span className={`px-2 py-1 font-semibold leading-tight rounded-full text-xs ${getStatusColor(purchase.status)}`}>
                            {purchase.status}
                          </span>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                          <p className="text-gray-900 whitespace-no-wrap">{new Date(purchase.createdAt).toLocaleDateString()}</p>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
                          <button onClick={() => handleView(purchase)} className="text-indigo-600 hover:text-indigo-900">View</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-4">{selectedPurchase.transactionType === 'subscription' ? 'Review Subscription Payment' : 'Review Purchase'}</h2>
            <p><strong>User:</strong> {selectedPurchase.userId ? selectedPurchase.userId.name : 'Unknown User'}</p>
            <p><strong>Type:</strong> {selectedPurchase.transactionType === 'subscription' ? 'Subscription' : 'Store purchase'}</p>
            <p><strong>Item:</strong> {selectedPurchase.itemName || selectedPurchase.plan || selectedPurchase.itemId || 'Unknown item'}</p>
            <p><strong>Price:</strong> {selectedPurchase.itemPrice || selectedPurchase.amount || selectedPurchase.price || 'Not recorded'}</p>
            <p><strong>Status:</strong> <span className={`px-2 py-1 font-semibold leading-tight rounded-full text-xs ${getStatusColor(selectedPurchase.status)}`}>{selectedPurchase.status}</span></p>
            <p><strong>Submitted:</strong> {new Date(selectedPurchase.createdAt).toLocaleString()}</p>
            {selectedPurchase.bankSlipUrl && (
              <div className="my-4">
                <img src={selectedPurchase.bankSlipUrl} alt="Bank slip" className="max-h-96 w-full object-contain" />
              </div>
            )}
            {(selectedPurchase.status === 'refund_required' || selectedPurchase.status === 'refunded') && (
              <div className={`my-4 p-3 rounded ${selectedPurchase.status === 'refunded' ? 'bg-purple-100 text-purple-900' : 'bg-orange-100 text-orange-900'}`}>
                <strong>{selectedPurchase.status === 'refunded' ? 'Refund completion recorded.' : 'Payment requires refund review.'}</strong>
                <p>{selectedPurchase.status === 'refunded' ? 'A superadmin recorded the completed refund. Verify the merchant reference in WebXPay if further reconciliation is needed.' : 'Do not approve or reject this transaction. Confirm the payment with WebXPay and process any refund through the merchant portal.'}</p>
                {selectedPurchase.refundReason && <p><strong>Reason:</strong> {selectedPurchase.refundReason}</p>}
                {selectedPurchase.paymentReference && <p><strong>Payment reference:</strong> {selectedPurchase.paymentReference}</p>}
                {selectedPurchase.paidLateAt && <p><strong>Payment received:</strong> {new Date(selectedPurchase.paidLateAt).toLocaleString()}</p>}
                {selectedPurchase.refundReference && <p><strong>Refund reference:</strong> {selectedPurchase.refundReference}</p>}
                {selectedPurchase.refundProcessedAt && <p><strong>Refund recorded:</strong> {new Date(selectedPurchase.refundProcessedAt).toLocaleString()}</p>}
                {selectedPurchase.refundNote && <p><strong>Refund note:</strong> {selectedPurchase.refundNote}</p>}
              </div>
            )}
            {selectedPurchase.status === 'rejected' && selectedPurchase.rejectionReason && (
              <div className="my-4 p-2 bg-red-100 text-red-700 rounded">
                  <strong>Rejection Reason:</strong> {selectedPurchase.rejectionReason}
              </div>
            )}
            <div className="flex justify-end space-x-4">
              <button onClick={handleCloseModal} className="px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300">Cancel</button>
              {selectedPurchase.status === 'pending' && (
                <>
                  <button onClick={() => handleReject(selectedPurchase._id)} className="px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700">Reject</button>
                  <button onClick={() => handleApprove(selectedPurchase._id)} className="px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700">Approve</button>
                </>
              )}
              {adminUser?.role === 'superadmin' && selectedPurchase.status === 'refund_required' && (
                <button
                  onClick={() => handleRecordRefund(selectedPurchase)}
                  className="px-4 py-2 rounded-md text-white bg-purple-700 hover:bg-purple-800"
                >
                  Record completed refund
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminStorePurchasesPage;
