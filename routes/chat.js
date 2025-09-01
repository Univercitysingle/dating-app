const express = require("express");
const router = express.Router();
const http = require("http");
const socketIo = require("socket.io");
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { getChatHistory } = require('../controllers/chatController');
const si = require('systeminformation');
const mongoose = require('mongoose');

let io;

const getMonitoringDataForSocket = async () => {
  const cpuData = await si.cpu();
  const memData = await si.mem();
  const fsSizeData = await si.fsSize();
  const dbStats = await mongoose.connection.db.stats();

  const data = {
    cpu: {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      speed: cpuData.speed,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
      load: await si.currentLoad(),
    },
    memory: {
      total: memData.total,
      free: memData.free,
      used: memData.used,
      active: memData.active,
      available: memData.available,
    },
    storage: fsSizeData.map(disk => ({
      fs: disk.fs,
      type: disk.type,
      size: disk.size,
      used: disk.used,
      available: disk.available,
      use: disk.use,
      mount: disk.mount,
    })),
    database: {
      db: dbStats.db,
      collections: dbStats.collections,
      objects: dbStats.objects,
      avgObjSize: dbStats.avgObjSize,
      dataSize: dbStats.dataSize,
      storageSize: dbStats.storageSize,
      totalSize: dbStats.totalSize,
      indexes: dbStats.indexes,
      indexSize: dbStats.indexSize,
    },
    s3: {
      // Placeholder for S3 data
      bucketName: process.env.AWS_S3_BUCKET_NAME,
      totalSize: 'N/A',
      usedCapacity: 'N/A',
      dailyDownload: 'N/A',
    }
  };

  return data;
};

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
      socket.user = decoded;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.user.uid);
    socket.join(socket.user.uid); // Join a room with the user's UID

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

      const senderUid = socket.user.uid;

      try {
        const sender = await User.findOne({ uid: senderUid });
        if (!sender) {
          socket.emit("messageError", { error: "Sender not found." });
          return;
        }

        if (sender.plan === 'basic') {
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

        io.to(roomId).emit("message", {
          _id: chatMessage._id,
          roomId: chatMessage.roomId,
          senderUid: chatMessage.senderUid,
          receiverUid: chatMessage.receiverUid,
          messageContent: chatMessage.messageContent,
          timestamp: chatMessage.timestamp,
        });
      } catch (error) {
        console.error("Failed to process or send chat message:", error);
        socket.emit("messageError", { error: "Failed to send message due to a server error." });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.uid);
    });
  });

  const monitoringNamespace = io.of("/monitoring");
  monitoringNamespace.on("connection", (socket) => {
    console.log("Client connected to monitoring namespace");
    socket.on("disconnect", () => {
      console.log("Client disconnected from monitoring namespace");
    });
  });

  setInterval(async () => {
    try {
      const data = await getMonitoringDataForSocket();
      monitoringNamespace.emit("monitoring-data", data);
    } catch (error) {
      console.error("Failed to fetch and emit monitoring data:", error);
    }
  }, 5000);
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
