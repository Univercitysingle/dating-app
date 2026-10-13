import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import StoreItemPurchaseModal from '../components/StoreItemPurchaseModal';
import apiClient from '../api/apiClient';

const storeItems = [
  { id: 'super-like-5', name: '5 Super Likes', price: '500 LKR', description: 'Get noticed with 5 Super Likes.' },
  { id: 'undo-swipes-5', name: '5 Undo Swipes', price: '500 LKR', description: 'Go back and reconsider your last swipe.' },
  { id: 'profile-boost-1', name: 'Profile Boost', price: '100 LKR', description: 'Increase your profile visibility for 30 minutes.' },
];

const StorePage = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const purchaseId = query.get('purchaseId');
    if (purchaseId) {
      // Poll for purchase status
      const interval = setInterval(async () => {
        try {
          const data = await apiClient.get(`/purchase/status/${purchaseId}`);
          if (data && data.status === 'completed') {
            setNotification({ show: true, message: 'Your purchase was successful!', type: 'success' });
            clearInterval(interval);
          } else if (data && data.status === 'failed') {
            setNotification({ show: true, message: 'Your purchase failed. Please try again.', type: 'error' });
            clearInterval(interval);
          }
        } catch (error) {
          setNotification({ show: true, message: 'Could not verify purchase status.', type: 'error' });
          clearInterval(interval);
        }
      }, 3000);

      // Clear interval after some time to avoid infinite polling
      setTimeout(() => clearInterval(interval), 60000);
    }
  }, [location]);


  const handlePurchaseClick = (item) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
  };

  const handlePaymentInitiated = () => {
    setNotification({ show: true, message: 'Redirecting to payment gateway... Your purchase will be processed shortly.', type: 'info' });
    setTimeout(() => setNotification({ show: false, message: '', type: 'info' }), 5000);
  };

  return (
    <>
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">Store</h1>

        {notification.show && (
          <div className={`border-l-4 p-4 mb-6 ${notification.type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : notification.type === 'error' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-blue-100 border-blue-500 text-blue-700'}`} role="alert">
            <p className="font-bold">{notification.type === 'success' ? 'Success!' : notification.type === 'error' ? 'Error!' : 'Info'}</p>
            <p>{notification.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {storeItems.map((item) => (
            <div key={item.id} className="bg-white p-6 shadow rounded-lg text-center flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold mb-2">{item.name}</h2>
                <p className="text-gray-600 mb-4">{item.description}</p>
                <p className="text-lg text-gray-800 font-bold mb-4">{item.price}</p>
              </div>
              <button
                onClick={() => handlePurchaseClick(item)}
                className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
              >
                Purchase
              </button>
            </div>
          ))}
        </div>
      </div>
      {isModalOpen && selectedItem && (
        <StoreItemPurchaseModal
          item={selectedItem}
          onClose={handleCloseModal}
          onPaymentInitiated={handlePaymentInitiated}
        />
      )}
    </>
  );
};

export default StorePage;
