module.exports = (req, res, next) => {
  if (req.user.plan === "premium") return next();
  return res.status(403).json({ error: "Upgrade to premium required for this feature." });
};
