const crypto = require('crypto');

const correlationIdMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || crypto.randomBytes(16).toString('hex');
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
};

module.exports = correlationIdMiddleware;
