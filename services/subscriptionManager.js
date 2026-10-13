const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { globalLogger } = require('../utils/logger');

const runSubscriptionExpirationCheck = async () => {
  const logger = globalLogger;
  logger.info('Running subscription expiration check...');
  try {
    const now = new Date();
    const expiredSubscriptions = await Subscription.find({
      endDate: { $lt: now },
      status: 'active',
    });

    if (expiredSubscriptions.length > 0) {
      logger.info(`Found ${expiredSubscriptions.length} expired subscriptions.`);
      for (const sub of expiredSubscriptions) {
        sub.status = 'inactive';
        await sub.save();

        const user = await User.findById(sub.userId);
        if (user) {
          user.plan = 'basic';
          await user.save();
          logger.info(`User ${user.uid} downgraded to basic plan due to expired subscription.`);
        }
      }
    } else {
      logger.info('No expired subscriptions found.');
    }
    return { success: true, count: expiredSubscriptions.length };
  } catch (error) {
    logger.error('Error in subscription expiration check:', { error });
    throw error;
  }
};

const startSubscriptionExpirationJob = () => {
  // Schedule a job to run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      await runSubscriptionExpirationCheck();
    } catch (err) {
      // Handled in runSubscriptionExpirationCheck
    }
  });
};

module.exports = { startSubscriptionExpirationJob, runSubscriptionExpirationCheck };
