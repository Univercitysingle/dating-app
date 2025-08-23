require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const http = require("http");
const cors = require("cors");

const { initSocket } = require("./routes/chat");
const authMiddleware = require("./middleware/authentication");
const { globalLogger: logger, buildLogger } = require("./utils/logger");
const correlationIdMiddleware = require("./middleware/correlationId");

// Firebase Admin (safe import)
let admin;
try {
  admin = require("./services/firebaseAdmin");
} catch (err) {
  logger.warn(
    "⚠ Firebase Admin SDK not initialized (missing env vars). Running without Firebase."
  );
}

const app = express();
const server = http.createServer(app);

// -------------------- MIDDLEWARE --------------------

// Add correlation ID to all requests
app.use(correlationIdMiddleware);

// CORS setup with preflight handling
const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Security headers & JSON parsing
app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// -------------------- REQUEST/RESPONSE LOGGING --------------------
app.use((req, res, next) => {
  req.log = buildLogger(req.correlationId || "GLOBAL");
  const startTime = Date.now();

  req.log.info(`Incoming Request: ${req.method} ${req.originalUrl}`, {
    headers: req.headers,
    body: req.body,
  });

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    req.log.info(`Response: ${req.method} ${req.originalUrl}`, {
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// Morgan logging via Winston
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (msg) => logger.debug(msg.trim()) },
  })
);

// Trust proxy for rate limiting
app.set("trust proxy", 1);

// Rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// -------------------- DATABASE --------------------
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  logger.error(
    "❌ MongoDB connection string is missing! Set MONGO_URI in your environment."
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info("✅ MongoDB connected successfully."))
  .catch((err) => {
    logger.error("❌ MongoDB connection error:", { error: err });
    process.exit(1);
  });

// -------------------- SOCKET.IO --------------------
if (initSocket) {
  try {
    initSocket(server);
    logger.info("✅ Socket.IO initialized.");
  } catch (socketError) {
    logger.error(
      `❌ Failed to initialize Socket.IO: ${socketError.message || socketError}`,
      { stack: socketError.stack }
    );
  }
}

// -------------------- ROUTES --------------------
app.get("/", (req, res) => res.send("API is running..."));
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/status", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "status.html"))
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", authMiddleware, require("./routes/users"));
app.use("/api/matches", authMiddleware, require("./routes/matches"));
app.use("/api/chat", authMiddleware, require("./routes/chat").router);
app.use("/api/video", authMiddleware, require("./routes/video"));
app.use("/api/reports", authMiddleware, require("./routes/reports"));
app.use("/api/status", require("./routes/status"));

// Admin routes
const adminUsersRouter = require("./routes/adminUsers");
app.use("/api/admin/users", adminUsersRouter);

// React frontend fallback for non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  let responseErrorMessage = "An internal server error occurred. Please try again later.";

  if (process.env.NODE_ENV !== "production") {
    responseErrorMessage = err.message || "Internal Server Error (No specific message)";
  } else if (err.isOperational) {
    responseErrorMessage = err.message;
  }

  const errorPayload = { error: responseErrorMessage };
  if (process.env.NODE_ENV !== "production" && err.details) {
    errorPayload.details = err.details;
  }

  const log = req.log || logger;
  log.error(`Global Error Handler: Status ${statusCode}, Message: ${err.message || "N/A"}`, {
    stack: err.stack,
    payload: errorPayload,
  });

  if (!res.headersSent) {
    res.status(statusCode).json(errorPayload);
  } else {
    log.error("Headers already sent. Delegating to default Express handler.");
    next(err);
  }
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(
    `🚀 Server running on port ${PORT} | NODE_ENV=${process.env.NODE_ENV || "development"}`
  );
});
