import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import { getUserFriendlyError } from '../utils/apiErrors';

const subscriptionPlans = [
  {
    name: 'Free', plan: 'free', monthlyPrice: 0, annualPrice: 0, description: 'The essentials to meet people and start conversations.',
    features: ['25 likes per UTC day', 'Basic discovery filters', 'Matching and messaging', 'Profile and safety controls'],
  },
  {
    name: 'Plus', plan: 'plus', monthlyPrice: 3.99, annualPrice: 28.99, description: 'More freedom and control over your discovery experience.',
    features: ['Everything in Free', 'Unlimited likes', 'Unlimited undo swipes', 'Advanced discovery filters'],
  },
  {
    name: 'Gold', plan: 'gold', monthlyPrice: 7.99, annualPrice: 57.99, popular: true, description: 'The complete experience for people serious about meeting someone.',
    features: ['Everything in Plus', 'See everyone who likes you', 'Read receipts'],
  },
  {
    name: 'Platinum', plan: 'platinum', monthlyPrice: 11.99, annualPrice: 86.99, description: 'Gold benefits, with additional priority and privacy features planned for a future release.',
    features: ['Everything in Gold'],
  },
];

const optionalPasses = [
  { id: 'travel-pass-7d', name: 'Travel Pass', description: 'Explore matches in another city for 7 days.', price: 2.99, duration: '7 days' },
  { id: 'privacy-pass-30d', name: 'Privacy Pass', description: 'Additional profile visibility and online-status controls for 30 days.', price: 2.99, duration: '30 days' },
  { id: 'visibility-pass-7d', name: 'Visibility Pass', description: 'A time-limited profile visibility enhancement for 7 days.', price: 4.99, duration: '7 days' },
];

const storeItems = [
  { id: 'super-like-5', name: '5 Super Likes', description: 'Get noticed with 5 Super Likes.', price: 2.49 },
  { id: 'undo-swipes-5', name: '5 Undo Swipes', description: 'Go back and reconsider your last swipe.', price: 1.49 },
  { id: 'profile-boost-1', name: 'Profile Boost', description: 'Increase your profile visibility for 30 minutes.', price: 1.99 },
];

const StorePage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [currentEntitlements, setCurrentEntitlements] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadSubscription = async () => {
      if (!user) {
        setCurrentSubscription(null);
        setCurrentEntitlements(null);
        return;
      }
      try {
        const [subscriptionsResult, entitlementsResult] = await Promise.allSettled([
          apiClient.get('/users/me/subscriptions'),
          apiClient.get('/users/me/entitlements')
        ]);
        if (cancelled) return;
        if (subscriptionsResult.status === 'fulfilled') {
          setCurrentSubscription(subscriptionsResult.value.find((s) => s.status === 'active') || null);
        }
        if (entitlementsResult.status === 'fulfilled') setCurrentEntitlements(entitlementsResult.value);
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
    let timer = null;
    let stopped = false;
    const clearReturnParameter = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('purchaseId');
      window.history.replaceState({}, '', url);
    };
    const verify = async () => {
      try {
        const result = await apiClient.get(`/purchase/status/${encodeURIComponent(purchaseId)}`);
        if (result?.status === 'completed') {
          setNotification({ show: true, message: 'Your purchase was successful!', type: 'success' });
          clearReturnParameter();
          return true;
        }
        if (['rejected', 'failed', 'cancelled', 'expired'].includes(result?.status)) {
          setNotification({ show: true, message: 'Your payment was declined or cancelled. No purchase was completed. You can try again.', type: 'error' });
          clearReturnParameter();
          return true;
        }
        if (result?.status === 'refund_required') {
          setNotification({ show: true, message: 'Payment was received, but the purchase needs manual refund review. Please contact support and do not pay again.', type: 'error' });
          clearReturnParameter();
          return true;
        }
      } catch (error) {
        // A subscription return is not a purchase. Check its status separately.
        try {
          const result = await apiClient.get(`/subscription/status/${encodeURIComponent(purchaseId)}`);
          if (result?.status === 'active') {
            setCurrentSubscription(result);
            try {
              const entitlements = await apiClient.get('/users/me/entitlements');
              setCurrentEntitlements(entitlements);
            } catch {
              // The subscription status remains visible if entitlement refresh is delayed.
            }
            setNotification({ show: true, message: 'Your subscription is now active!', type: 'success' });
            clearReturnParameter();
            return true;
          }
          if (['cancelled', 'inactive', 'expired'].includes(result?.status)) {
            setNotification({ show: true, message: 'Your subscription payment was declined or cancelled. Your checkout is released, so you can safely try again.', type: 'error' });
            clearReturnParameter();
            return true;
          }
          if (result?.status === 'refund_required') {
            setNotification({ show: true, message: 'Payment was received after checkout cancellation and has been flagged for refund review. Please contact support and do not pay again.', type: 'error' });
            clearReturnParameter();
            return true;
          }
        } catch (subscriptionError) {
          // Provider callbacks and database settlement can take time to complete.
        }
      }
      return false;
    };

    const poll = async () => {
      if (stopped) return;
      attempts += 1;
      const finished = await verify();
      if (stopped || finished) return;
      if (attempts >= 20) {
        setNotification({ show: true, message: 'Your payment is still being confirmed. Refresh this page later to check the final status. Do not submit another payment while it is pending.', type: 'info' });
        return;
      }
      timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [location.search]);


  const startCheckout = async ({ kind, item, plan }) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setNotification({ show: false, message: '', type: 'info' });
    let checkoutOrderId = null;
    let cspViolationHandler = null;
    const releaseFailedCheckout = async () => {
      if (kind !== 'subscription' || !checkoutOrderId) return;
      try {
        await apiClient.post('/subscription/abandon', { orderId: checkoutOrderId });
      } catch (releaseError) {
        // Keep the reservation if the backend cannot prove cancellation is safe.
      }
    };
    try {
      const response = kind === 'subscription'
        ? await apiClient.post('/subscription', { plan: plan.plan, currency: 'USD' })
        : await apiClient.post('/purchase/store-item', { itemId: item.id });
      if (typeof response !== 'string' || !response.trim()) {
        throw new Error('The payment gateway did not return a checkout form. Please try again.');
      }

      // WebXPay blocks iframe embedding, so submit its server-generated form
      // as a top-level POST in the current tab.
      const parsed = new DOMParser().parseFromString(response, 'text/html');
      const gatewayForm = parsed.querySelector('form');
      if (!gatewayForm || !gatewayForm.action) throw new Error('Invalid payment gateway form returned.');
      checkoutOrderId = gatewayForm.dataset.orderId || null;
      if (!checkoutOrderId) {
        const returnField = gatewayForm.querySelector('input[name="return_url"]');
        if (returnField?.value) {
          try { checkoutOrderId = new URL(returnField.value).searchParams.get('purchaseId'); } catch {}
        }
      }
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
      if (kind === 'subscription' && checkoutOrderId) {
        cspViolationHandler = (event) => {
          if (event.effectiveDirective !== 'form-action' ||
              !String(event.blockedURI || '').includes(gatewayUrl.hostname)) return;
          document.removeEventListener('securitypolicyviolation', cspViolationHandler);
          cspViolationHandler = null;
          releaseFailedCheckout().then(() => {
            setNotification({ show: true, message: 'The payment page was blocked by the browser. Your checkout was released. Please try subscribing again.', type: 'error' });
          });
        };
        document.addEventListener('securitypolicyviolation', cspViolationHandler);
      }
      form.requestSubmit();
    } catch (error) {
      if (cspViolationHandler) document.removeEventListener('securitypolicyviolation', cspViolationHandler);
      await releaseFailedCheckout();
      setNotification({ show: true, message: getUserFriendlyError(error, 'We could not start checkout. Please try again.'), type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price) => price === 0 ? 'Free' : `${price.toFixed(2)} USD`;

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
          <h2 id="subscription-plans-heading" className="text-2xl font-bold text-gray-900">Choose your membership</h2>
          <p className="mt-1 text-sm text-gray-500">Four clear membership levels. Gold is our recommended balance of features and value. Only benefits currently enforced by the backend are listed. Prices are proposed USD launch prices; checkout remains disabled until gateway settlement and all advertised features are verified.</p>
        </div>
        {currentEntitlements && (
          <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-900">Your current membership: <span className="capitalize">{currentEntitlements.tier || 'free'}</span></p>
              <span className="text-xs text-gray-500">Status: {currentEntitlements.status || 'inactive'}</span>
            </div>
            <p className="mt-2 text-gray-600">
              {currentEntitlements.features?.unlimitedLikes
                ? 'Unlimited likes are enabled.'
                : `${currentEntitlements.limits?.dailyLikes ?? 25} likes per UTC day on Free.`}
              {currentEntitlements.features?.unlimitedUndo ? ' Unlimited undo is enabled.' : ''}
              {currentEntitlements.features?.seeLikes ? ' See Who Likes You is enabled.' : ''}
              {currentEntitlements.features?.advancedFilters ? ' Advanced discovery filters are enabled.' : ''}
            </p>
            {currentEntitlements.expiresAt && <p className="mt-1 text-xs text-gray-500">Access ends {new Date(currentEntitlements.expiresAt).toLocaleDateString()}.</p>}
          </div>
        )}
        {currentSubscription?.status === 'active' && (
          <p className="mb-4 text-xs text-gray-500">Subscription record: {currentSubscription.plan}{currentSubscription.endDate ? ` · renews or ends ${new Date(currentSubscription.endDate).toLocaleDateString()}` : ''}</p>
        )}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {subscriptionPlans.map((plan) => (
            <article key={plan.plan} className={`store-card relative flex flex-col rounded-2xl p-6 ${plan.popular ? 'border-2 border-primary' : ''}`}>
              {plan.popular && <span className="mb-3 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-dark">Most popular</span>}
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                <p className="mt-2 min-h-10 text-sm text-gray-500">{plan.description}</p>
                <p className="my-5 text-3xl font-extrabold text-gray-900">{formatPrice(plan.monthlyPrice)}<span className="ml-1 text-sm font-normal text-gray-500">{plan.monthlyPrice > 0 ? '/ month' : ''}</span></p>
                {plan.annualPrice > 0 && <p className="mb-4 text-xs text-gray-500">Annual option: {formatPrice(plan.annualPrice)} / year, approximately 40% less than monthly billing.</p>}
                <ul className="space-y-2 text-sm text-gray-700">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="text-green-600">✓</span><span>{feature}</span></li>)}
                </ul>
              </div>
              <button
                type="button"
                disabled={true}
                className="app-primary-button mt-6 w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {plan.plan === 'free' ? 'Included' : 'Coming soon'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="passes-heading" className="mb-12">
        <div className="mb-5">
          <h2 id="passes-heading" className="text-2xl font-bold text-gray-900">Optional passes</h2>
          <p className="mt-1 text-sm text-gray-500">Optional one-off add-ons are planned. They are not active or purchasable yet, and do not renew automatically.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {optionalPasses.map((pass) => (
            <article key={pass.id} className="store-card flex flex-col rounded-2xl p-6">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-dark">{pass.duration}</p>
                <h3 className="mt-2 text-xl font-bold text-gray-900">{pass.name}</h3>
                <p className="mt-2 text-sm text-gray-500">{pass.description}</p>
                <p className="my-5 text-2xl font-extrabold text-gray-900">{formatPrice(pass.price)}</p>
              </div>
              <button type="button" disabled={true} className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Coming soon</button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="store-items-heading">
        <div className="mb-5">
          <h2 id="store-items-heading" className="text-2xl font-bold text-gray-900">One-time extras</h2>
          <p className="mt-1 text-sm text-gray-500">Top up selected features without changing your membership.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {storeItems.map((item) => (
            <article key={item.id} className="store-card flex flex-col justify-between rounded-2xl p-6 text-center">
              <div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-gray-900">{item.name}</h3>
                <p className="mb-4 text-sm leading-6 text-gray-500">{item.description}</p>
                <p className="mb-4 text-lg font-bold text-gray-900">{formatPrice(item.price)}</p>
              </div>
              <button type="button" disabled={true} className="app-primary-button w-full rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Coming soon</button>
            </article>
          ))}
        </div>
      </section>
   </div>
  );
};

export default StorePage;
