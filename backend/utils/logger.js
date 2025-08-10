const winston = require('winston');

// Define the format for the logs
const logFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.align(),
  winston.format.printf(
    info => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create a new logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console()
  ]
});

// Create a stream object with a 'write' function that will be used by morgan
logger.stream = {
  write: function(message, encoding) {
    // use the 'info' log level so the output will be picked up by the logger
    logger.info(message.trim());
  },
};

module.exports = logger;
