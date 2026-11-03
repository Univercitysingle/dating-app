import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import { getUserFriendlyError } from '../utils/apiErrors';

const storeItems = [
  { id: 'super-like-5', name: '5 Super Likes', price: 500, description: 'Get noticed with 5 Super Likes.' },
  { id: 'undo-swipes-5', name: '5 Undo Swipes', price: 500, description: 'Go back and reconsider your last swipe.' },
  { id: 'profile-boost-1', name: 'Profile Boost', price: 100, description: 'Increase your profile visibility for 30 minutes.' },
];

const subscriptionPlans = [
  { name: 'Weekly', plan: 'weekly', price: 800, duration: '1 week', description: 'A full week of premium features.', features: ['Unlimited Swipes', 'See who likes you', '5 Super Likes per week'] },
  { name: 'Monthly', plan: 'monthly', price: 3000, duration: '1 month', description: 'More time to make meaningful connections.', features: ['All Weekly features', '1 Free Boost per month', 'Advanced Filters'] },
  { name: 'Annual', plan: 'yearly', price: 10000, duration: '1 year', description: 'Best value for long-term premium access.', features: ['All Monthly features', 'Profile highlighted', 'Read receipts'] },
];

const StorePage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [currentSubscription, setCurrentSubscription] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadSubscription = async () => {
      if (!user) {
        setCurrentSubscription(null);
        return;
      }
      try {
        const subscriptions = await apiClient.get('/users/me/subscriptions');
        if (!cancelled) setCurrentSubscription(subscriptions.find((s) => s.status === 'active') || null);
      } catch (error) {
        if (!cancelled) {
          setNotification({ show: true, message: 'Could not fetch subscription status. You can still browse the store.', type: 'error' });
        }
      }
    };
    loadSubscription();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const purchaseId = query.get('purchaseId');
    if (!purchaseId) return undefined;

    let attempts = 0;
    const verify = async () => {
      try {
        const result = await apiClient.get(`/purchase/status/${encodeURIComponent(purchaseId)}`);
        if (result?.status === 'completed') {
          setNotification({ show: true, message: 'Your purchase was successful!', type: 'success' });
          const url = new URL(window.location.href);
          url.searchParams.delete('purchaseId');
          window.history.replaceState({}, '', url);
          return true;
        }
        if (result?.status === 'failed') {
          setNotification({ show: true, message: 'Your purchase failed. Please try again.', type: 'error' });
          return true;
        }
      } catch (error) {
        // The return URL can belong to a subscription checkout instead; try that route too.
        try {
          const result = await apiClient.get(`/subscription/status/${encodeURIComponent(purchaseId)}`);
          if (result?.status === 'active') {
            setCurrentSubscription(result);
            setNotification({ show: true, message: 'Your subscription is now active!', type: 'success' });
            const url = new URL(window.location.href);
            url.searchParams.delete('purchaseId');
            window.history.replaceState({}, '', url);
            return true;
          }
        } catch (subscriptionError) {
          // Payment provider callbacks can take time to update the status.
        }
      }
      return false;
    };

    const timer = setInterval(async () => {
      attempts += 1;
      if (await verify() || attempts >= 20) clearInterval(timer);
    }, 3000);
    return () => { clearInterval(timer); };
  }, [location.search]);


  const startCheckout = async ({ kind, item, plan }) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setNotification({ show: false, message: '', type: 'info' });
    try {
      const response = kind === 'subscription'
        ? await apiClient.post('/subscription', { plan: plan.plan, currency: 'LKR' })
        : await apiClient.post('/purchase/store-item', { itemId: item.id });
      if (typeof response !== 'string' || !response.trim()) {
        throw new Error('The payment gateway did not return a checkout form. Please try again.');
      }

      // WebXPay blocks iframe embedding, so submit its server-generated form
      // as a top-level POST in the current tab.
      const parsed = new DOMParser().parseFromString(response, 'text/html');
      const gatewayForm = parsed.querySelector('form');
      if (!gatewayForm || !gatewayForm.action) throw new Error('Invalid payment gateway form returned.');
      const gatewayUrl = new URL(gatewayForm.action);
      if (gatewayUrl.protocol !== 'https:' || !['stagingxpay.info', 'govpay.webxpay.com'].includes(gatewayUrl.hostname)) {
        throw new Error('Unapproved payment gateway URL.');
      }
      const form = document.createElement('form');
      form.method = (gatewayForm.method || 'POST').toUpperCase();
      form.action = gatewayUrl.href;
      form.target = '_self';
      form.hidden = true;
      gatewayForm.querySelectorAll('input[name]').forEach((source) => {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = source.name;
        field.value = source.value;
        form.appendChild(field);
      });
      if (!form.querySelector('input[name="payment"]')) throw new Error('Payment payload is missing.');
      document.body.appendChild(form);
      form.requestSubmit();
    } catch (error) {
      setNotification({ show: true, message: getUserFriendlyError(error, 'We could not start checkout. Please try again.'), type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price) => `${price.toLocaleString('en-US')} LKR`;

  return (
    <div className="page-container store-page mx-auto w-full max-w-6xl p-4 sm:p-6">
      <header className="mb-8">
        <p className="page-eyebrow">MAKE YOUR MOMENT</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">The store</h1>
        <p className="mt-2 text-sm text-gray-500">Premium subscriptions and extras, with one secure checkout experience.</p>
      </header>

      {notification.show && (
        <div className={`mb-6 rounded-lg border-l-4 p-4 ${notification.type === 'success' ? 'border-green-500 bg-green-50 text-green-800' : notification.type === 'error' ? 'border-red-500 bg-red-50 text-red-800' : 'border-blue-500 bg-blue-50 text-blue-800'}`} role="status">
          <p className="font-semibold">{notification.message}</p>
        </div>
      )}

      <section aria-labelledby="subscription-plans-heading" className="mb-12">
        <div className="mb-5">
          <h2 id="subscription-plans-heading" className="text-2xl font-bold text-gray-900">Premium subscriptions</h2>
          <p className="mt-1 text-sm text-gray-500">Choose weekly, monthly, or annual access. All plans use the same secure IPG checkout in this browser tab.</p>
        </div>
        {currentSubscription?.status === 'active' && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Your {currentSubscription.plan} subscription is active{currentSubscription.endDate ? ` until ${new Date(currentSubscription.endDate).toLocaleDateString()}` : ''}.
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {subscriptionPlans.map((plan) => (
            <article key={plan.plan} className="store-card flex flex-col rounded-2xl p-6">
              <div className="flex-1">
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-dark">{plan.duration}</p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">{plan.name}</h3>
                <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                <p className="my-5 text-3xl font-extrabold text-gray-900">{formatPrice(plan.price)}</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="text-green-600">✓</span><span>{feature}</span></li>)}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => startCheckout({ kind: 'subscription', plan })}
                disabled={isProcessing || currentSubscription?.status === 'active'}
                className="app-primary-button mt-6 w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? 'Preparing checkout…' : currentSubscription?.status === 'active' ? 'Subscription active' : `Choose ${plan.name}`}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="store-items-heading">
        <div className="mb-5">
          <h2 id="store-items-heading" className="text-2xl font-bold text-gray-900">Store items</h2>
          <p className="mt-1 text-sm text-gray-500">Purchase extras through the same secure IPG checkout in this browser tab.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {storeItems.map((item) => (
            <article key={item.id} className="store-card flex flex-col justify-between rounded-2xl p-6 text-center">
              <div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-gray-900">{item.name}</h3>
                <p className="mb-4 text-sm leading-6 text-gray-500">{item.description}</p>
                <p className="mb-4 text-lg font-bold text-gray-900">{formatPrice(item.price)}</p>
              </div>
              <button
                type="button"
                onClick={() => startCheckout({ kind: 'purchase', item })}
                disabled={isProcessing}
                className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? 'Preparing checkout…' : 'Purchase'}
              </button>
            </article>
          ))}
        </div>
      </section>

   </div>
  );
};

export default StorePage;
