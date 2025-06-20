const express = require("express");
const router = express.Router();
const http = require("http");
const socketIo = require("socket.io");
const ChatMessage = require('../models/ChatMessage');

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
      console.log(`${socket.user.uid} joined room ${roomId}`);
    });

    socket.on("sendMessage", async ({ roomId, messageContent, receiverUid }) => { // Added receiverUid
      console.log(`Message received in room ${roomId} from ${socket.user.uid}: ${messageContent}`);
      if (!roomId || !messageContent || !receiverUid) {
        // Consider emitting an error back to the sender
        console.error("sendMessage: missing roomId, messageContent, or receiverUid");
        return;
      }

      const senderUid = socket.user.uid;

      try {
        const chatMessage = new ChatMessage({
          roomId,
          senderUid,
          receiverUid, // Assuming client sends this for clarity in 1-on-1
          messageContent,
          // timestamp is defaulted by schema
        });
        await chatMessage.save();

        // Emit the message to the room (original functionality)
        // It's good practice to emit the saved message, which includes the timestamp and _id
        io.to(roomId).emit("message", {
          _id: chatMessage._id, // Send the persisted message ID
          roomId: chatMessage.roomId,
          senderUid: chatMessage.senderUid,
          receiverUid: chatMessage.receiverUid,
          messageContent: chatMessage.messageContent,
          timestamp: chatMessage.timestamp,
        });
      } catch (error) {
        console.error("Failed to save chat message:", error);
        // Consider emitting an error back to the sender
        // socket.emit("messageError", { error: "Failed to send message" });
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

router.get("/history/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    // Basic pagination
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await ChatMessage.find({ roomId })
      .sort({ timestamp: 1 }) // Sort by oldest first
      .skip(skip)
      .limit(limit)
      .exec(); // .exec() is good practice for mongoose queries

    // Could also return total message count for better pagination UI on client
    // const totalMessages = await ChatMessage.countDocuments({ roomId });

    res.json({
      messages,
      // totalMessages,
      // limit,
      // skip
    });

  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
});

module.exports = { router, initSocket };
