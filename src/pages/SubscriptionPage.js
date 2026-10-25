import React from 'react';
import StorePage from './StorePage';

// Keep /premium and /manage-subscription as compatible routes, while placing
// weekly, monthly, and annual subscriptions under the single "The store" page.
const SubscriptionPage = () => <StorePage />;

export default SubscriptionPage;
