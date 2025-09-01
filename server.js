require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const http = require("http");
const cors = require("cors");
const os = require('os');

const { initSocket } = require("./routes/chat");
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
const isProduction = process.env.NODE_ENV === 'production';

let allowedOrigins = [];

if (process.env.CORS_ALLOWED_ORIGINS) {
  allowedOrigins = process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
}

if (!isProduction) {
  // Add localhost for development
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080');

  // Add local network IP
  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }
      allowedOrigins.push(`http://${iface.address}:3000`);
      allowedOrigins.push(`http://${iface.address}:3001`);
      allowedOrigins.push(`http://${iface.address}:8080`);
    });
  });
}


const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
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
  ],
};

logger.info({ message: "CORS allowed origins configured", origins: allowedOrigins });

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Security headers & JSON parsing
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginResourcePolicy: false,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    initSocket(server, allowedOrigins);
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
app.use("/api/payments", require("./routes/payments"));
app.use("/api/status", require("./routes/status"));

// Authenticated routes
const authenticatedRouter = express.Router();
authenticatedRouter.use(authMiddleware);
authenticatedRouter.use(geolocationMiddleware);

authenticatedRouter.use("/users", require("./routes/users"));
authenticatedRouter.use("/swipe", require("./routes/swipe"));
authenticatedRouter.use("/matches", require("./routes/matches"));
authenticatedRouter.use("/chat", require("./routes/chat").router);
authenticatedRouter.use("/reports", require("./routes/reports"));
authenticatedRouter.use("/notifications", require("./routes/notifications"));

app.use("/api", authenticatedRouter);

// Admin routes
const adminUsersRouter = require("./routes/adminUsers");
const adminReportsRouter = require("./routes/adminReports");
const adminAnalyticsRouter = require("./routes/adminAnalytics");
app.use("/api/admin/users", adminUsersRouter);
app.use("/api/admin/reports", adminReportsRouter);
app.use("/api/admin/analytics", adminAnalyticsRouter);

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
server.listen(PORT, async () => {
  logger.info(
    `🚀 Server running on port ${PORT} | NODE_ENV=${process.env.NODE_ENV || "development"}`
  );

  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        return;
      }
      logger.info(`  - Private IP: http://${iface.address}:${PORT}`);
    });
  });

  try {
    const { getGeolocation } = require('./services/ipinfoService');
    const publicIpInfo = await getGeolocation();
    if (publicIpInfo && publicIpInfo.ip) {
      logger.info(`  - Public IP:  http://${publicIpInfo.ip}:${PORT}`);
    }
  } catch (error) {
    logger.warn('Could not determine public IP address.', error);
  }
});
