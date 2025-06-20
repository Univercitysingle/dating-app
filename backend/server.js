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
const stripeWebhook = require("./routes/stripeWebhook");
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
app.use("/api/stripe-webhook", stripeWebhook); // Stripe webhook without auth (special handling)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
// Use server.listen instead of app.listen
server.listen(PORT, () => console.log(`Server running on port ${PORT} and Sockets initialized`));
