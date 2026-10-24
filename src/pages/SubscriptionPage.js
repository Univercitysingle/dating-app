import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';
import StorePage from './StorePage';

const SubscriptionPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const subs = await apiClient.get('/users/me/subscriptions');
        const relevantSub = subs.find(s => s.status === 'active');
        setCurrentSubscription(relevantSub);
      } catch (error) {
        console.error('Failed to fetch subscription status:', error);
        setNotification({ show: true, message: 'Could not fetch subscription status.', type: 'error' });
      }
      setIsLoading(false);
    };

    const query = new URLSearchParams(location.search);
    const purchaseId = query.get('purchaseId');
    if (!purchaseId) {
      fetchSubscriptionStatus();
    }
  }, [user, location.search]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const purchaseId = query.get('purchaseId');

    if (purchaseId && user) {
      setIsVerifyingPayment(true);
      setNotification({ show: true, message: 'Your subscription purchase is being processed. Please wait...', type: 'info' });

      const pollingInterval = setInterval(async () => {
        try {
          const { data } = await apiClient.get(`/subscription/status/${purchaseId}`);
          if (data && data.status === 'active') {
            clearInterval(pollingInterval);
            setIsVerifyingPayment(false);
            setCurrentSubscription(data);
            setNotification({ show: true, message: 'Your subscription is now active!', type: 'success' });
            const url = new URL(window.location);
            url.searchParams.delete('purchaseId');
            window.history.replaceState({}, '', url);
          }
        } catch (error) {
          console.error('Polling for subscription status failed:', error);
        }
      }, 3000); // Poll every 3 seconds

      const pollingTimeout = setTimeout(() => {
        clearInterval(pollingInterval);
        setIsVerifyingPayment(false);
        setNotification({
          show: true,
          message: 'We are still processing your subscription. Please refresh the page in a moment or contact support if this message persists.',
          type: 'info',
        });
      }, 60000); // Stop polling after 1 minute

      return () => {
        clearInterval(pollingInterval);
        clearTimeout(pollingTimeout);
      };
    }
  }, [location, user]);


  const plans = [
    {
      name: 'Weekly',
      price: 800,
      currency: 'LKR',
      plan: 'weekly',
      items: '1 Week Premium Subscription',
      isSubscription: true,
      features: ['Unlimited Swipes', 'See who likes you', '5 Super Likes per week'],
    },
    {
      name: 'Monthly',
      price: 3000,
      currency: 'LKR',
      plan: 'monthly',
      items: '1 Month Premium Subscription',
      isSubscription: true,
      features: ['All Weekly features', '1 Free Boost per month', 'Advanced Filters'],
    },
    {
      name: 'Yearly',
      price: 10000,
      currency: 'LKR',
      plan: 'yearly',
      items: '1 Year Premium Subscription',
      isSubscription: true,
      features: ['All Monthly features', 'Profile highlighted', 'Read receipts'],
    },
  ];

  const handleSelectPlan = (plan) => {
    if (currentSubscription?.status === 'active' && !isVerifyingPayment) return;
    setSelectedPlan(plan);
  };

  const handleContinue = async () => {
    if (!selectedPlan || isProcessing) {
      if (!selectedPlan) {
        setNotification({ show: true, message: 'Select Weekly, Monthly, or Yearly before continuing.', type: 'error' });
      }
      return;
    }

    // Open the window synchronously during the click gesture so browser popup
    // blockers do not prevent the IPG checkout after the API request completes.
    const paymentWindow = window.open('', '_blank');
    if (!paymentWindow) {
      setNotification({ show: true, message: 'The payment window was blocked. Allow pop-ups for this site and try again.', type: 'error' });
      return;
    }
    paymentWindow.document.title = 'Connecting to payment gateway';
    paymentWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px">Connecting securely to the payment gateway…</p>';

    setIsProcessing(true);
    setNotification({ show: false, message: '', type: 'info' });

    try {
      const response = await apiClient.post('/subscription', selectedPlan);
      if (typeof response !== 'string' || !response.trim()) {
        throw new Error('The payment gateway did not return a checkout form. Please try again.');
      }
      paymentWindow.document.open();
      paymentWindow.document.write(response);
      paymentWindow.document.close();
      setNotification({ show: true, message: 'Redirecting to payment gateway...', type: 'info' });
    } catch (err) {
      if (!paymentWindow.closed) paymentWindow.close();
      setNotification({
        show: true,
        message: err.data?.error || err.data?.message || err.message || 'Could not start your subscription. Please try again.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStatusMessage = () => {
    if (isLoading) {
      return <p className="text-center text-neutral-600">Loading your subscription status...</p>;
    }
    if (currentSubscription) {
      if (currentSubscription.status === 'active') {
        return (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert">
            <p className="font-bold">Subscription Active</p>
            <p>You are currently on the {currentSubscription.plan} plan. It will expire on {new Date(currentSubscription.endDate).toLocaleDateString()}.</p>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <div className="bg-neutral-50 min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-primary-dark mb-2">Choose Your Plan</h1>
        <p className="text-center text-neutral-600 mb-8">Unlock exclusive features and find your match faster.</p>

        {notification.show && (
            <div className={`border-l-4 p-4 mb-6 ${notification.type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : notification.type === 'error' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-blue-100 border-blue-500 text-blue-700'}`} role="alert">
                <p className="font-bold">{notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}</p>
                <p>{notification.message}</p>
            </div>
        )}

        {renderStatusMessage()}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <button
              type="button"
              key={plan.name}
              onClick={() => handleSelectPlan(plan)}
              aria-pressed={selectedPlan?.name === plan.name}
              disabled={currentSubscription?.status === 'active' && !isVerifyingPayment}
              className={`w-full text-left rounded-lg p-6 shadow-card transition-transform duration-300
                ${(currentSubscription?.status === 'active' && !isVerifyingPayment) ? 'cursor-not-allowed bg-gray-200' : 'cursor-pointer hover:scale-105'}
                ${selectedPlan?.name === plan.name ? 'border-4 border-primary' : 'border-2 border-transparent'}
              `}
            >
              <h2 className="text-2xl font-bold text-primary-dark">{plan.name}</h2>
              <p className="text-4xl font-extrabold my-4">
                {plan.price} <span className="text-lg font-medium">{plan.currency}</span>
              </p>
              <ul className="text-sm text-neutral-700 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <span className="block mt-4 text-sm font-semibold text-primary-dark">
                {selectedPlan?.name === plan.name ? 'Selected' : 'Choose this plan'}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={handleContinue}
            disabled={!selectedPlan || (currentSubscription?.status === 'active' && !isVerifyingPayment) || isProcessing}
            className="w-full max-w-xs mx-auto bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-full shadow-button disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors duration-300"
          >
            {isProcessing ? 'Processing...' : 'Continue to Payment'}
          </button>
        </div>
        <div className="mt-12">
          <hr className="my-8 border-neutral-300" />
          <StorePage />
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
