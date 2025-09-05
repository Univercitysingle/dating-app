import React, { useState } from 'react';
import apiClient from '../api/apiClient';
import MainLayout from '../components/MainLayout';

const SubscriptionManagementPage = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleManageSubscription = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { url } = await apiClient.get('/api/payments/manage-subscription');
            window.location.href = url;
        } catch (err) {
            setError(err.message || 'Failed to open subscription management.');
            setIsLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">Manage Your Subscription</h1>
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <p className="mb-4">
                        Click the button below to manage your subscription, update your payment method,
                        or view your invoice history.
                    </p>
                    <button
                        onClick={handleManageSubscription}
                        disabled={isLoading}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow-md disabled:bg-gray-400"
                    >
                        {isLoading ? 'Loading...' : 'Manage Subscription'}
                    </button>
                    {error && <p className="text-red-500 mt-4">{error}</p>}
                </div>
            </div>
        </MainLayout>
    );
};

export default SubscriptionManagementPage;
