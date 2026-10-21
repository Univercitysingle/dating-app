require("dotenv").config();

// Pre-load all Mongoose models
require('./models')();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const http = require("http");
const cors = require("cors");
const os = require("os");
const { getRuntimeConfig } = require("./serverless/runtimeConfig");
const runtimeConfig = getRuntimeConfig(process.env);

const { initSocket } = require("./services/socket");
const { startTrialExpirationJob } = require("./services/trialManager");
const { startSubscriptionExpirationJob } = require("./services/subscriptionManager");
const authMiddleware = require("./middleware/authentication");
const geolocationMiddleware = require("./middleware/geolocation");
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
const isProduction = process.env.NODE_ENV === "production";

// Allowed origins
const allowedOrigins = [
  "https://universitysingle.duckdns.org",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://localhost:8080",
  "http://universityofsingles.local:3000",
  "http://192.168.1.144:3000",
  "http://192.168.8.177:3000",
];

// Add origins from the CORS_ALLOWED_ORIGINS environment variable
if (process.env.CORS_ALLOWED_ORIGINS) {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS.split(",").map((origin) =>
    origin.trim().replace(/^["']|["']$/g, "")
  );
  allowedOrigins.push(...envOrigins);
}

if (process.env.FRONTEND_URL) {
  const feUrl = process.env.FRONTEND_URL.trim().replace(/^["']|["']$/g, "");
  if (!allowedOrigins.includes(feUrl)) {
    allowedOrigins.push(feUrl);
  }
}

// In development, also add local network IPs for mobile testing
if (!isProduction) {
  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if ("IPv4" !== iface.family || iface.internal !== false) {
        return;
      }
      allowedOrigins.push(`http://${iface.address}:443`);
      allowedOrigins.push(`http://${iface.address}:3000`);
      allowedOrigins.push(`http://${iface.address}:3001`);
      allowedOrigins.push(`http://${iface.address}:5000`);
      allowedOrigins.push(`http://${iface.address}:8080`);
    });
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server health checks)
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = allowedOrigins.includes(origin);
    const isLocalDev = !isProduction && (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) || /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin));
    if (isExplicitlyAllowed || isLocalDev) {
      callback(null, true);
    } else {
      const msg = `The CORS policy for this site does not allow access from origin: ${origin}`;
      logger.warn(msg);
      callback(new Error(msg), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "x-cron-secret",
  ],
};

logger.info({ message: "CORS allowed origins configured", origins: allowedOrigins });

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Security headers & JSON parsing
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "wss://*.firebaseio.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://*.firebaseapp.com",
          "https://ipinfo.io",
          "https://stagingxpay.info",
          "https://api.ipify.org",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://apis.google.com",
          "https://www.gstatic.com",
          "https://*.firebaseapp.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.googleusercontent.com",
          "https://*.googleapis.com",
          "https://*.firebaseapp.com",
          "https://*.firebasestorage.app",
          "https://firebasestorage.googleapis.com",
          "https://s3.us-east-005.backblazeb2.com",
        ],
        frameSrc: [
          "'self'",
          "https://*.firebaseapp.com",
          "https://accounts.google.com",
          "https://stagingxpay.info",
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: false,
    strictTransportSecurity: false,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -------------------- REQUEST/RESPONSE LOGGING --------------------
app.use((req, res, next) => {
  req.log = buildLogger(req.correlationId || "GLOBAL");
  const startTime = Date.now();

  req.log.info(`Incoming Request: ${req.method} ${req.originalUrl}`);

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

// Trust proxy for rate limiting behind Cloud Run / App Runner / Reverse Proxy
app.set("trust proxy", 1);

// Rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// -------------------- SOCKET.IO --------------------
if (initSocket) {
  try {
    initSocket(server, allowedOrigins);
    logger.info("✅ Socket.IO initialized.");
  } catch (socketError) {
    logger.error(
      `❌ Failed to initialize Socket.IO: ${socketError.message || socketError}`,
      { stack: socketError.stack }
    );
  }
}

// -------------------- ROUTES (Mounted Synchronously) --------------------
app.get("/", (req, res) => res.send("API is running..."));

// Health endpoint for Cloud Run / App Runner container health checks
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1
      ? "connected"
      : dbState === 2
      ? "connecting"
      : "disconnected";

  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

app.get("/status", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "status.html"))
);

// Public API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/status", require("./routes/status"));
app.use("/api/webxpay", require("./routes/webxpay"));
app.use("/api/cron", require("./routes/cron"));

// Authenticated routes
const authenticatedRouter = express.Router();
authenticatedRouter.use(authMiddleware);

const { getGeolocationForCurrentUser } = require("./controllers/usersController");
authenticatedRouter.get("/geolocation", getGeolocationForCurrentUser);

authenticatedRouter.use(geolocationMiddleware);
authenticatedRouter.use("/users", require("./routes/users"));
authenticatedRouter.use("/swipe", require("./routes/swipe"));
authenticatedRouter.use("/matches", require("./routes/matches"));
authenticatedRouter.use("/chat", require("./routes/chat").router);
authenticatedRouter.use("/reports", require("./routes/reports"));
authenticatedRouter.use("/notifications", require("./routes/notifications"));
authenticatedRouter.use("/support-tickets", require("./routes/supportTickets"));
authenticatedRouter.use("/purchase", require("./routes/purchase"));
authenticatedRouter.use("/subscription", require("./routes/subscription"));

app.use("/api", authenticatedRouter);

// Admin routes
app.use("/api/admin", require("./routes/admin"));

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
  log.error({
    message: "Global error handler caught an error",
    statusCode,
    errorMessage: err.message,
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

// -------------------- DATABASE CONNECTION --------------------
const mongoUri = process.env.MONGO_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: runtimeConfig.mongoMaxPoolSize,
      serverSelectionTimeoutMS: 5000,
    })
    .then(() => {
      logger.info("✅ MongoDB connected successfully.");

      // In-process cron is disabled when SERVERLESS_RUNTIME=true or ENABLE_IN_PROCESS_CRON=false.
      if (runtimeConfig.enableInProcessCron) {
        startTrialExpirationJob();
        startSubscriptionExpirationJob();
      }
    })
    .catch((err) => {
      logger.error("❌ MongoDB connection error:", { error: err.message });
    });
} else {
  logger.warn("⚠ MONGO_URI is not set. Database not connected.");
}

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, async () => {
  logger.info(
    `🚀 Server running on port ${PORT} | NODE_ENV=${process.env.NODE_ENV || "development"}`
  );

  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if ("IPv4" !== iface.family || iface.internal !== false) {
        return;
      }
      logger.info(`  - Private IP: http://${iface.address}:${PORT}`);
    });
  });

  try {
    const { getGeolocation } = require("./services/ipinfoService");
    const publicIpInfo = await getGeolocation();
    if (publicIpInfo && publicIpInfo.ip) {
      logger.info(`  - Public IP:  http://${publicIpInfo.ip}:${PORT}`);
    }
  } catch (error) {
    // Ignore geolocation error during local/container startup
  }
});

// -------------------- GRACEFUL SHUTDOWN (Cloud Run & App Runner) --------------------
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info("HTTP server closed.");
    try {
      await mongoose.connection.close(false);
      logger.info("MongoDB connection closed.");
    } catch (dbErr) {
      logger.error("Error closing MongoDB connection:", dbErr);
    }
    process.exit(0);
  });

  // Force close after 10s if connections linger
  setTimeout(() => {
    logger.error("Forceful shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = { app, server };
