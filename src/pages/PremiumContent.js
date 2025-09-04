import React from 'react';
import apiClient from '../api/apiClient';
import { loadStripe } from '@stripe/stripe-js';

function PremiumContent() {
    const handleSubscribe = async () => {
        try {
            const stripe = await loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
            const { data: { sessionId } } = await apiClient.post('/api/payments/create-subscription', {
                priceId: 'YOUR_STRIPE_PRICE_ID', // Replace with your actual Price ID
            });

            const { error } = await stripe.redirectToCheckout({ sessionId });

            if (error) {
                console.error('Error redirecting to checkout:', error);
            }
        } catch (error) {
            console.error('Error creating subscription:', error);
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Go Premium</h2>
            <p className="mb-4">Unlock exclusive features by subscribing to our premium plan.</p>
            <button
                onClick={handleSubscribe}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
                Subscribe Now
            </button>
        </div>
    );
}

export default PremiumContent;
