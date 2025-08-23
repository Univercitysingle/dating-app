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
  logger.info("✅ Firebase Admin initialized.");
} catch (err) {
  logger.warn(
    "⚠ Firebase Admin SDK not initialized (missing or invalid env vars). Running without Firebase."
  );
}

const app = express();
const server = http.createServer(app);

// -------------------- MIDDLEWARE --------------------
app.use(correlationIdMiddleware);

// CORS setup
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
    req.log.info(`Response Sent: ${req.method} ${req.originalUrl}`, {
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// Morgan logging → Winston
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (msg) => logger.debug(msg.trim()) },
  })
);

// Rate limiting
app.set("trust proxy", 1);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later." },
  })
);

// -------------------- DATABASE --------------------
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  logger.error(
    "❌ MongoDB connection string is missing! Set MONGO_URI in your environment."
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => logger.info("✅ MongoDB connected successfully."))
  .catch((err) => {
    logger.error("❌ MongoDB connection error", { error: err.message });
    process.exit(1);
  });

// -------------------- SOCKET.IO --------------------
if (initSocket) {
  try {
    initSocket(server);
    logger.info("✅ Socket.IO initialized.");
  } catch (err) {
    logger.error(`❌ Failed to initialize Socket.IO: ${err.message}`, {
      stack: err.stack,
    });
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
app.use("/api/admin/users", require("./routes/adminUsers"));

// React frontend fallback
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  let message = "An internal server error occurred. Please try again later.";

  if (process.env.NODE_ENV !== "production") {
    message = err.message || "Internal Server Error (no message provided)";
  } else if (err.isOperational) {
    message = err.message;
  }

  const errorPayload = { error: message };
  if (process.env.NODE_ENV !== "production" && err.details) {
    errorPayload.details = err.details;
  }

  const log = req.log || logger;
  log.error(
    `Global Error Handler: Status ${statusCode}, Message: ${err.message || "N/A"}`,
    { stack: err.stack, payload: errorPayload }
  );

  if (!res.headersSent) {
    res.status(statusCode).json(errorPayload);
  } else {
    log.error("Headers already sent. Delegating to Express default handler.");
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
