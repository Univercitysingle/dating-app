const winston = require('winston');

const buildLogger = (correlationId) => {
  const logFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.errors({ stack: true }),
    winston.format.printf(
      (info) => {
        const { timestamp, level, message, stack } = info;
        const ts = timestamp.slice(0, 19).replace('T', ' ');
        const log = `${ts} [${correlationId}] ${level}: ${message}`;
        return stack ? `${log}\n${stack}` : log;
      }
    )
  );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
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
