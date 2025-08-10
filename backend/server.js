require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan"); // For request logging
const http = require('http');
const { initSocket } = require('./routes/chat'); // Assuming this is correctly set up
const authMiddleware = require("./middleware/authMiddleware");
const admin = require("./services/firebaseAdmin"); // Firebase Admin SDK
const logger = require('./utils/logger'); // Import the new logger

const app = express();
const server = http.createServer(app);

// Security, JSON, basic logging, rate limiting
app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Morgan for HTTP request logging, integrated with Winston
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: logger.stream }));

// Before rateLimit, tell Express it's behind a proxy.
// This is important for express-rate-limit to get the correct client IP.
// Adjust '1' if you have more than one layer of proxy.
app.set('trust proxy', 1);

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  logger.error("MongoDB connection string is missing! Set MONGO_URI in your environment.");
  process.exit(1);
}
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => logger.info("MongoDB connected successfully."))
.catch(err => {
  logger.error("MongoDB connection error:", err);
  process.exit(1);
});

// Initialize Socket.IO (if used)
if (initSocket) { // Check if initSocket is defined, in case chat.js is complex
    try {
        initSocket(server);
        logger.info("Socket.IO initialized.");
    } catch (socketError) {
        logger.error("Failed to initialize Socket.IO:", socketError);
    }
}


// Routes
app.get('/', (req, res) => res.send('API is running...')); // Basic health check route

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", authMiddleware, require("./routes/users")); // authMiddleware applied here
app.use("/api/matches", authMiddleware, require("./routes/matches"));
app.use("/api/chat", authMiddleware, require("./routes/chat").router); // Ensure chat.js exports router
app.use("/api/video", authMiddleware, require("./routes/video"));
app.use("/api/reports", authMiddleware, require("./routes/reports"));

// Admin routes
const adminUsersRouter = require('./routes/adminUsers'); // Ensure this file exists and exports a router
app.use('/api/admin/users', adminUsersRouter); // Consider adding admin-specific auth here

// Serve frontend for any route that is not an API route
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// Global Error Handling Middleware (must be the last app.use call)
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  let responseErrorMessage = "An internal server error occurred. Please try again later.";

  // For non-production, use the actual error message.
  // For production, use a generic message unless it's a specific, safe-to-expose error.
  if (process.env.NODE_ENV !== 'production') {
    responseErrorMessage = err.message || "Internal Server Error (No specific message)";
  } else {
    // You might have specific error types you want to expose in production
    if (err.isOperational) { // Hypothetical property for operational errors
        responseErrorMessage = err.message;
    }
  }

  const errorPayload = { error: responseErrorMessage };
  if (process.env.NODE_ENV !== 'production' && err.details) { // Add details if present (e.g. validation errors)
    errorPayload.details = err.details;
  }

  // Detailed logging
  logger.error(`Global Error Handler Caught: Status ${statusCode}, Message: ${err.message || 'N/A'}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.error("Responding with payload:", JSON.stringify(errorPayload, null, 2));
    logger.error("Error Stack:", err.stack || 'N/A');
  } else {
    // In production, log essential info without overwhelming logs; full stack might go to a dedicated logging service
    logger.error(`Prod Error: Status ${statusCode}, Path: ${req.path}, UID: ${req.user ? req.user.uid : 'N/A'}, Error: ${err.message}`);
  }

  if (!res.headersSent) {
    res.status(statusCode).json(errorPayload);
  } else {
    logger.error("Global Error Handler: Headers already sent. Delegating to default Express error handler.");
    next(err); // Essential for Express to handle if headers are sent
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}. NODE_ENV=${process.env.NODE_ENV || 'development'}`);
});
