const Redis = require('ioredis');
const { redisURL } = require('../config');

let redis;
let connected = false;

if (redisURL) {
  redis = new Redis(redisURL, {
    // Options to retry connection
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    console.log('Successfully connected to Redis.');
    connected = true;
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
    connected = false;
  });
} else {
  console.warn('REDIS_URL not found in environment variables. Redis caching will be disabled.');
  // Mock Redis client so the app doesn't crash if Redis is not configured
  redis = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(1),
    on: () => {}, // No-op for event listeners
  };
}

const get = async (key) => {
  if (!connected) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error(`Error getting data from Redis for key ${key}:`, err);
    return null;
  }
};

const set = async (key, value, ttl) => {
  if (!connected) return;
  try {
    const stringValue = JSON.stringify(value);
    if (ttl) {
      // ttl is in seconds
      await redis.set(key, stringValue, 'EX', ttl);
    } else {
      await redis.set(key, stringValue);
    }
  } catch (err) {
    console.error(`Error setting data in Redis for key ${key}:`, err);
  }
};

const del = async (key) => {
  if (!connected) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`Error deleting data from Redis for key ${key}:`, err);
  }
};

module.exports = {
  redis,
  get,
  set,
  del,
  isConnected: () => connected,
};