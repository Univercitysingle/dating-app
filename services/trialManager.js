const cron = require('node-cron');
const User = require('../models/User');
const { globalLogger } = require('../utils/logger');

const runTrialExpirationCheck = async () => {
  const logger = globalLogger;
  logger.info('Running trial expiration check...');
  try {
    const now = new Date();
    const expiredUsers = await User.find({
      trialExpires: { $lt: now },
      plan: 'premium', // We only want to downgrade users who are on a trial premium plan
    });

    if (expiredUsers.length > 0) {
      logger.info(`Found ${expiredUsers.length} users with expired trials.`);
      for (const user of expiredUsers) {
        user.plan = 'basic';
        user.trialExpires = null; // Clear the trial expiration date
        await user.save();
        logger.info(`User ${user.uid} downgraded to basic plan.`);
      }
    } else {
      logger.info('No users with expired trials found.');
    }
    return { success: true, count: expiredUsers.length };
  } catch (error) {
    logger.error('Error in trial expiration check:', { error });
    throw error;
  }
};

const startTrialExpirationJob = () => {
  // Schedule a job to run every hour to check for expired trials
  cron.schedule('0 * * * *', async () => {
    try {
      await runTrialExpirationCheck();
    } catch (err) {
      // Handled in runTrialExpirationCheck
    }
  });
};

module.exports = { startTrialExpirationJob, runTrialExpirationCheck };
