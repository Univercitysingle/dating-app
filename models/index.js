const fs = require('fs');
const path = require('path');
const { globalLogger } = require('../utils/logger');

const loadModels = () => {
  const logger = globalLogger;
  logger.info('Pre-loading all Mongoose models...');

  const files = fs.readdirSync(__dirname);

  files.forEach(file => {
    // We only want to load .js files, and we want to skip this index.js file.
    if (file.endsWith('.js') && file !== 'index.js') {
      const modelPath = path.join(__dirname, file);
      try {
        require(modelPath);
        logger.info(`  - Loaded model: ${file}`);
      } catch (error) {
        logger.error(`  - Failed to load model: ${file}`, { error });
      }
    }
  });

  logger.info('All models have been loaded.');
};

module.exports = loadModels;
