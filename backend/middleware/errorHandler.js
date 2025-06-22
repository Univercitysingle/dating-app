/**
 * Centralized error handling middleware for Express.
 * Responds with JSON error messages and status codes.
 * Always use after all other middleware/routes.
 */
module.exports = (err, req, res, next) => {
  // Log error details in development
  if (process.env.NODE_ENV !== "production") {
    console.error("ErrorHandler caught error:", err);
  }

  // Default to 500 Internal Server Error if status not set
  const status = err.status || 500;

  res.status(status).json({
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
};
