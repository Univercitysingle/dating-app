require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const http = require('http'); // Import http module
const { initSocket } = require('./routes/chat'); // Import initSocket
const authMiddleware = require("./middleware/authMiddleware");
const subscriptionCheck = require("./middleware/subscriptionCheck");
// const stripeWebhook = require("./routes/stripeWebhook"); // COMMENTED OUT
const admin = require("./services/firebaseAdmin");

const app = express();
const server = http.createServer(app); // Create HTTP server with Express app

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error", err);
    process.exit(1);
  });

// Initialize Socket.IO and pass the server instance
initSocket(server);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", authMiddleware, require("./routes/users"));
app.use("/api/matches", authMiddleware, require("./routes/matches"));
app.use("/api/chat", authMiddleware, require("./routes/chat").router);
app.use("/api/video", authMiddleware, require("./routes/video"));
app.use("/api/reports", authMiddleware, require("./routes/reports")); // Add this line

// Admin routes
const adminUsersRouter = require('./routes/adminUsers');
app.use('/api/admin/users', adminUsersRouter); // adminUsersRouter already includes its own specific auth chain

// app.use("/api/stripe-webhook", stripeWebhook); // Stripe webhook without auth (special handling) -- COMMENTED OUT

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack); // Log stack trace to server console regardless of environment

  const statusCode = err.status || 500;
  let responseErrorMessage = "An internal server error occurred. Please try again later."; // Default generic message for production

  if (process.env.NODE_ENV !== 'production') {
    responseErrorMessage = err.message || "Internal Server Error";
    // In non-production, we could also add err.stack to the response if desired for easier debugging by API consumers,
    // but for now, keeping the response structure simple with just a message.
    // e.g., responseError.stack = err.stack; (if responseError was an object)
  }

  // Ensure response is only sent if headers haven't already been sent
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: responseErrorMessage
    });
  } else {
    // If headers already sent, delegate to the default Express error handler
    // which will close the connection and fail the request.
    next(err);
  }
});

const PORT = process.env.PORT || 5000;
// Use server.listen instead of app.listen
server.listen(PORT, () => console.log(`Server running on port ${PORT} and Sockets initialized`));
