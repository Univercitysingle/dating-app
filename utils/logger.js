const winston = require('winston');

const buildLogger = (correlationId) => {
  const logFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf(
      info => `${info.timestamp} [${correlationId}] ${info.level}: ${info.message}`
    )
  );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
      new winston.transports.Console()
    ]
  });
};

const globalLogger = buildLogger('GLOBAL');

globalLogger.stream = {
  write: function(message, encoding) {
    globalLogger.info(message.trim());
  },
};

module.exports = {
  buildLogger,
  globalLogger,
};
