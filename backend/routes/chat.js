const express = require("express");
const router = express.Router();
const http = require("http");
const socketIo = require("socket.io");

let io;

function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication error"));
      // Verify token logic here (Firebase)
      const admin = require("../services/firebaseAdmin");
      const decoded = await admin.auth().verifyIdToken(token);
      socket.user = decoded;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.user.uid);

    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
    });

    socket.on("sendMessage", ({ roomId, message }) => {
      io.to(roomId).emit("message", {
        user: socket.user.uid,
        message,
        timestamp: new Date(),
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.uid);
    });
  });
}

router.get("/init-socket", (req, res) => {
  res.json({ message: "Socket endpoint placeholder" });
});

module.exports = { router, initSocket };
