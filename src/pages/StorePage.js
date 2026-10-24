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
      <div className="page-container store-page mx-auto w-full max-w-5xl p-4 sm:p-6">
        <div className="mb-6"><p className="page-eyebrow">MAKE YOUR MOMENT</p><h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">The store</h1><p className="mt-2 text-sm text-gray-500">A few extra ways to make a connection.</p></div>

        {notification.show && (
          <div className={`border-l-4 p-4 mb-6 ${notification.type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : notification.type === 'error' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-blue-100 border-blue-500 text-blue-700'}`} role="alert">
            <p className="font-bold">{notification.type === 'success' ? 'Success!' : notification.type === 'error' ? 'Error!' : 'Info'}</p>
            <p>{notification.message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {storeItems.map((item) => (
            <div key={item.id} className="store-card flex flex-col justify-between rounded-2xl p-6 text-center">
              <div>
                <h2 className="mb-2 text-xl font-bold tracking-tight text-gray-900">{item.name}</h2>
                <p className="mb-4 text-sm leading-6 text-gray-500">{item.description}</p>
                <p className="mb-4 text-lg font-bold text-gray-900">{item.price}</p>
              </div>
              <button
                onClick={() => handlePurchaseClick(item)}
                className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white"
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
