const express = require("express");
const router = express.Router();
const http = require("http");
const socketIo = require("socket.io");
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { getChatHistory } = require('../controllers/chatController');

let io;

function initSocket(server, allowedOrigins, adminInstance) {
  const admin = adminInstance || require("../services/firebaseAdmin");
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  };

  io = socketIo(server, {
    cors: corsOptions,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication error"));
      const decoded = await admin.auth().verifyIdToken(token);

      const user = await User.findOne({ uid: decoded.uid });
      if (!user) {
        return next(new Error("User not found."));
      }
      socket.user = user;

      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.user.uid);
    socket.join(socket.user.uid);

    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
      console.log(`${socket.user.uid} joined room ${roomId}`);
    });

    socket.on("sendMessage", async ({ roomId, messageContent, receiverUid }) => {
      console.log(`Message received in room ${roomId} from ${socket.user.uid}: ${messageContent}`);
      if (!roomId || !messageContent || !receiverUid) {
        console.error("sendMessage: missing roomId, messageContent, or receiverUid");
        socket.emit("messageError", { error: "Missing required message data." });
        return;
      }

      const sender = socket.user;
      const senderUid = sender.uid;

      try {
        if (sender.role !== 'superadmin' && sender.plan === 'basic') {
          const messagesCount = await ChatMessage.countDocuments({ roomId, senderUid });
          if (messagesCount >= 2) {
            const thirdMessage = await ChatMessage.findOne({ roomId, senderUid }).sort({ timestamp: 1 }).skip(1);
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

            if (thirdMessage && thirdMessage.timestamp > twentyFourHoursAgo) {
              socket.emit("messageError", {
                error: "Free users are limited to 2 messages per 24 hours. Please subscribe or wait."
              });
              return;
            }
          }
        }

        const chatMessage = new ChatMessage({
          roomId,
          senderUid,
          receiverUid,
          messageContent,
        });
        await chatMessage.save();

        const messagePayload = {
          _id: chatMessage._id,
          roomId: chatMessage.roomId,
          senderUid: chatMessage.senderUid,
          receiverUid: chatMessage.receiverUid,
          messageContent: chatMessage.messageContent,
          timestamp: chatMessage.timestamp,
        };

        io.to(roomId).emit("message", messagePayload);
      } catch (error) {
        console.error("Failed to process or send chat message:", error);
        socket.emit("messageError", { error: "Failed to send message due to a server error." });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.uid);
    });
  });
}

router.get("/init-socket", (req, res) => {
  res.json({ message: "Socket endpoint placeholder" });
});

router.get("/history/:roomId", getChatHistory);

const getIO = () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  };

module.exports = { router, initSocket, getIO };
