const express = require("express");
const router = express.Router();
const { handleStripeWebhook, createSubscription, manageSubscription, getSubscriptionDetails } = require('../controllers/paymentsController');
const authMiddleware = require('../middleware/authentication');

router.post('/create-subscription', authMiddleware, createSubscription);
router.get('/manage-subscription', authMiddleware, manageSubscription);
router.get('/subscription-details', authMiddleware, getSubscriptionDetails);
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
