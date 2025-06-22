require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const http = require('http');
const { initSocket } = require('./routes/chat');
const authMiddleware = require("./middleware/authMiddleware");
// const subscriptionCheck = require("./middleware/subscriptionCheck"); // Uncomment if you use it
// const stripeWebhook = require("./routes/stripeWebhook"); // Uncomment if you use it
const admin = require("./services/firebaseAdmin");

const app = express();
const server = http.createServer(app);

// Security, CORS, JSON, logging, rate limiting
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ---- MONGO_URI is the only supported variable ----
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("MongoDB connection string is missing! Set MONGO_URI in your environment.");
  process.exit(1);
}
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
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
app.use("/api/reports", authMiddleware, require("./routes/reports"));

// Admin routes
const adminUsersRouter = require('./routes/adminUsers');
app.use('/api/admin/users', adminUsersRouter);

// app.use("/api/stripe-webhook", stripeWebhook); // Stripe webhook without auth (special handling) -- Uncomment if needed

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.status || 500;
  let responseErrorMessage = "An internal server error occurred. Please try again later.";
  if (process.env.NODE_ENV !== 'production') {
    responseErrorMessage = err.message || "Internal Server Error";
  }
  const errorPayload = { error: responseErrorMessage };

  if (process.env.NODE_ENV !== 'production') {
    console.error("Global Error Handler: Responding with:", errorPayload, "Original error stack:", err.stack);
  } else {
    console.error("Global Error Handler: An error occurred. Status:", statusCode, "Responding with basic error message.");
  }

  if (!res.headersSent) {
    res.status(statusCode).json(errorPayload);
  } else {
    // If headers already sent, delegate to the default Express error handler
    // but still log that we couldn't send our JSON response.
    console.error("Global Error Handler: Headers already sent, could not send JSON response. Delegating.");
    next(err);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} and Sockets initialized`));
