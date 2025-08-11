const crypto = require('crypto');
const { createLogger } = require('../utils/logger');

const correlationIdMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || crypto.randomBytes(16).toString('hex');
  req.correlationId = correlationId;
  req.log = createLogger(correlationId);
  res.setHeader('x-correlation-id', correlationId);
  next();
};

module.exports = correlationIdMiddleware;
