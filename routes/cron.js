const express = require('express');
const router = express.Router();
const { runTrialExpirationCheck } = require('../services/trialManager');
const { runSubscriptionExpirationCheck } = require('../services/subscriptionManager');
const { globalLogger: logger } = require('../utils/logger');

// Middleware to authenticate cron requests
const authenticateCron = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If no secret configured in environment (e.g. local dev), allow with warning
    logger.warn('No CRON_SECRET configured; executing unauthenticated cron request.');
    return next();
  }

  const providedSecret = req.headers['x-cron-secret'] || req.query.secret;
  if (providedSecret !== cronSecret) {
    logger.warn('Unauthorized cron trigger attempt.');
    return res.status(401).json({ error: 'Unauthorized: Invalid cron secret.' });
  }

  next();
};

router.use(authenticateCron);

// Trigger trial expiration check
router.post('/trials', async (req, res) => {
  try {
    const result = await runTrialExpirationCheck();
    res.json({ message: 'Trial expiration check completed.', ...result });
  } catch (error) {
    res.status(500).json({ error: 'Trial expiration check failed.', details: error.message });
  }
});

// Trigger subscription expiration check
router.post('/subscriptions', async (req, res) => {
  try {
    const result = await runSubscriptionExpirationCheck();
    res.json({ message: 'Subscription expiration check completed.', ...result });
  } catch (error) {
    res.status(500).json({ error: 'Subscription expiration check failed.', details: error.message });
  }
});

module.exports = router;
