const winston = require('winston');
require('winston-daily-rotate-file');
const util = require('util');

const buildLogger = (correlationId) => {
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format(info => {
      info.correlationId = correlationId;
      return info;
    })(),
    winston.format.json()
  );

  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.errors({ stack: true }),
    winston.format.printf(
      (info) => {
        const { timestamp, level, message, stack, ...meta } = info;
        const ts = timestamp.slice(0, 19).replace('T', ' ');

        // Correctly handle metadata and error objects
        const metaString = Object.keys(meta).length ? util.inspect(meta, { colors: true, depth: null }) : '';

        let log = `${ts} [${correlationId || 'GLOBAL'}] ${level}: ${message} ${metaString}`;

        if (stack) {
          log = `${log}\n${stack}`;
        }

        return log;
      }
    )
  );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: logFormat,
    transports: [
      new winston.transports.Console({
        format: consoleFormat
      }),
      new winston.transports.DailyRotateFile({
        filename: 'logs/error.%DATE%.log',
        level: 'error',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d'
      }),
      new winston.transports.DailyRotateFile({
        filename: 'logs/combined.%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d'
      })
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
