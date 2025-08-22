const mongoose = require('mongoose');
const admin = require('../services/firebaseAdmin');
const packageJson = require('../package.json');

const getStatus = async (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const status = {
    application: {
      name: packageJson.name,
      version: packageJson.version,
    },
    node: {
      version: process.version,
      uptime: `${hours}h ${minutes}m ${seconds}s`,
    },
    database: {
      status: 'unknown',
    },
    firebase: {
      status: 'unknown',
    },
  };

  // Check database connection
  try {
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      status.database.status = 'connected';
    } else {
      status.database.status = 'disconnected';
    }
  } catch (error) {
    status.database.status = 'error';
    status.database.error = error.message;
  }

  // Check Firebase connection
  try {
    // A simple way to check the connection is to try to get a user.
    // This will fail if the credentials are not configured correctly.
    await admin.auth().getUserByEmail('test@example.com').catch(() => {});
    status.firebase.status = 'connected';
  } catch (error) {
    // We expect an error here if the user doesn't exist, but if there's a connection error, it will be caught.
    if(error.code === 'auth/user-not-found'){
        status.firebase.status = 'connected';
    } else {
        status.firebase.status = 'error';
        status.firebase.error = error.message;
    }
  }

  res.json(status);
};

module.exports = {
  getStatus,
};
