import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import MainLayout from '../components/MainLayout';

const SubscriptionManagementPage = () => {
    const [subscription, setSubscription] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const fetchSubscriptionDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await apiClient.get('/api/payments/subscription-details');
                setSubscription(data);
            } catch (err) {
                setError(err.message || 'Failed to fetch subscription details.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSubscriptionDetails();
    }, []);

    const handleManageSubscription = async () => {
        setIsRedirecting(true);
        setError(null);
        try {
            const { url } = await apiClient.get('/api/payments/manage-subscription');
            window.location.href = url;
        } catch (err) {
            setError(err.message || 'Failed to open subscription management.');
            setIsRedirecting(false);
        }
    };

    const renderSubscriptionDetails = () => {
        if (isLoading) {
            return <p>Loading subscription details...</p>;
        }
        if (error) {
            return <p className="text-red-500">{error}</p>;
        }
        if (!subscription) {
            return <p>No subscription details found.</p>;
        }

        return (
            <div className="space-y-2">
                <p><strong>Plan:</strong> {subscription.plan}</p>
                <p><strong>Status:</strong> <span className="capitalize">{subscription.status}</span></p>
                <p><strong>Renews on:</strong> {new Date(subscription.renewalDate).toLocaleDateString()}</p>
            </div>
        );
    };

    return (
        <MainLayout>
            <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">Your Subscription</h1>
                <div className="bg-white p-6 rounded-lg shadow-md">
                    {renderSubscriptionDetails()}
                    <hr className="my-4" />
                    <p className="mb-4 text-sm text-gray-600">
                        To make changes to your subscription, please visit the Stripe customer portal.
                    </p>
                    <button
                        onClick={handleManageSubscription}
                        disabled={isRedirecting}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow-md disabled:bg-gray-400"
                    >
                        {isRedirecting ? 'Redirecting...' : 'Manage Subscription in Stripe'}
                    </button>
                </div>
            </div>
        </MainLayout>
    );
};

export default SubscriptionManagementPage;
