const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel =
  process.env.NODE_ENV === 'production' ? LOG_LEVEL.INFO : LOG_LEVEL.DEBUG;

const logger = {
  debug: (...args) => {
    if (currentLogLevel <= LOG_LEVEL.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args) => {
    if (currentLogLevel <= LOG_LEVEL.INFO) {
      console.log('[INFO]', ...args);
    }
  },
  warn: (...args) => {
    if (currentLogLevel <= LOG_LEVEL.WARN) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args) => {
    if (currentLogLevel <= LOG_LEVEL.ERROR) {
      console.error('[ERROR]', ...args);
    }
  },
};

export default logger;
