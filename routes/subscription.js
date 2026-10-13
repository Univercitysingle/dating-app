const express = require('express');
const router = express.Router();
const { createSubscriptionPayment, getSubscriptionStatus } = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/authentication');

router.post(
  '/',
  authMiddleware,
  createSubscriptionPayment
);

router.get(
    '/status/:id',
    authMiddleware,
    getSubscriptionStatus
);

module.exports = router;
