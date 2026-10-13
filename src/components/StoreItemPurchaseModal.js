import React, { useState } from 'react';
import apiClient from '../api/apiClient';

const StoreItemPurchaseModal = ({ item, onClose, onPaymentInitiated }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const response = await apiClient.post('/purchase/store-item', {
        itemId: item.id,
        itemName: item.name,
        itemPrice: parseFloat(item.price.replace(' LKR', '')),
      });

      const paymentWindow = window.open('', '_blank');
      if (paymentWindow) {
        paymentWindow.document.write(response);
        paymentWindow.document.close();
      } else {
        throw new Error('Could not open payment window. Please disable your pop-up blocker and try again.');
      }

      onPaymentInitiated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'An error occurred during payment initiation.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Confirm Purchase</h2>
        <p className="mb-4">You are about to purchase <strong>{item.name}</strong> for <strong>{item.price}</strong>.</p>
        <p className="mb-6">You will be redirected to our secure payment partner, WebXPay, to complete your purchase.</p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-md text-white bg-primary hover:bg-primary-dark disabled:bg-gray-400"
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Proceed to Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoreItemPurchaseModal;
