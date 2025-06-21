const { Server } = require("socket.io");

// This function initializes Socket.IO with your HTTP server
// and handles authentication and event listeners as needed.
function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*", // Set your frontend URL for production
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Middleware for authentication, if needed
  io.use((socket, next) => {
    // Example: token-based authentication
    // const token = socket.handshake.auth.token;
    // if (isValidToken(token)) {
    //   return next();
    // }
    // return next(new Error("Authentication error"));
    next();
  });

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Example: Listen for a custom event
    socket.on("chat message", (msg) => {
      // Broadcast message to all clients
      io.emit("chat message", msg);
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      console.log("User disconnected:", socket.id, reason);
    });
  });

  return io;
}

module.exports = initializeSocket;
