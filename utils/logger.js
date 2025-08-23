const winston = require('winston');

const createLogger = (correlationId) => {
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

const globalLogger = createLogger('GLOBAL');

globalLogger.stream = {
  write: function(message, encoding) {
    globalLogger.info(message.trim());
  },
};

module.exports = {
  createLogger,
  logger: globalLogger,
};
