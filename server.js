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

app.use(correlationIdMiddleware);

const isProduction = process.env.NODE_ENV === "production";
const clientUrl = process.env.CLIENT_URL;

if (isProduction && !clientUrl) {
  logger.error("CLIENT_URL environment variable is not set in production.");
  process.exit(1);
}

const corsOptions = {
  origin: isProduction ? clientUrl : clientUrl || "http://localhost:3000",
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

logger.info(`CORS configured for origin: ${corsOptions.origin}`);

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://apis.google.com"],
      },
    },
  })
);
app.use(express.json());

// Static React build
app.use(express.static(path.join(__dirname, "public")));

// -------------------- REQUEST LOGGING --------------------

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

app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (msg) => logger.debug(msg.trim()) },
  })
);

// -------------------- DATABASE --------------------

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  logger.error("❌ Missing MONGO_URI!");
  process.exit(1);
}

mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info("✅ MongoDB connected successfully."))
  .catch((err) => {
    logger.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// -------------------- SOCKET.IO --------------------

if (initSocket) {
  try {
    initSocket(server);
    logger.info("✅ Socket.IO initialized.");
  } catch (socketError) {
    logger.error(
      `❌ Failed to initialize Socket.IO: ${socketError.message}`,
      { stack: socketError.stack }
    );
  }
}

// -------------------- ROUTES --------------------

// Health check
app.get("/health", (req, res) => res.status(200).send("OK"));

// Status page
app.get("/status", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "status.html"))
);

// API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", authMiddleware, require("./routes/users"));
app.use("/api/matches", authMiddleware, require("./routes/matches"));
app.use("/api/chat", authMiddleware, require("./routes/chat").router);
app.use("/api/video", authMiddleware, require("./routes/video"));
app.use("/api/reports", authMiddleware, require("./routes/reports"));
app.use("/api/status", require("./routes/status"));

// Admin routes
app.use("/api/admin/users", require("./routes/adminUsers"));

// -------------------- REACT FRONTEND FALLBACK --------------------
// Must come LAST — serves index.html for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

// -------------------- ERROR HANDLER --------------------

app.use((err, req, res, next) => {
  const statusCode = err.status || 500;

  let message =
    process.env.NODE_ENV === "production"
      ? err.isOperational
        ? err.message
        : "An internal server error occurred."
      : err.message || "Internal server error";

  const payload = { error: message };
  if (process.env.NODE_ENV !== "production" && err.details) {
    payload.details = err.details;
  }

  (req.log || logger).error(`Error ${statusCode}: ${message}`, {
    stack: err.stack,
  });

  if (!res.headersSent) res.status(statusCode).json(payload);
  else next(err);
});

// -------------------- START SERVER --------------------

const PORT = process.env.BACKEND_PORT || process.env.PORT || 7860;

server.listen(PORT, () => {
  logger.info(
    `🚀 Server running on port ${PORT} | NODE_ENV=${process.env.NODE_ENV}`
  );
});