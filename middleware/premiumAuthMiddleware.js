const premiumAuthMiddleware = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const isPremium = user.plan === 'premium';
  const hasActiveTrial = user.trialExpires && user.trialExpires > new Date();

  if (isPremium || hasActiveTrial) {
    return next();
  }

  return res.status(403).json({
    error: 'Premium access required.',
    message: 'Upgrade your plan to access this feature.',
  });
};

module.exports = premiumAuthMiddleware;
