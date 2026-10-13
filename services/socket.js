const socketIo = require("socket.io");
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { buildLogger } = require('../utils/logger');
const log = buildLogger('socket-service');

let io;
const onlineUsers = new Map();

function initSocket(server, allowedOrigins, adminInstance) {
  const admin = adminInstance || require("./firebaseAdmin");
  const corsOptions = {
    origin: (origin, callback) => {
      if (allowedOrigins.includes('*') || !origin || allowedOrigins.indexOf(origin) !== -1) {
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
    onlineUsers.set(socket.user.uid, socket.id);
    socket.join(socket.user.uid);

    socket.on("joinRoom", async (roomId, callback) => {
      socket.join(roomId);
      console.log(`${socket.user.uid} joined room ${roomId}`);

      try {
        const messages = await ChatMessage.find({ roomId }).sort({ timestamp: 1 }).limit(50).exec();
        socket.emit("chatHistory", { roomId, messages });
      } catch (error) {
        console.error(`Error fetching chat history for room ${roomId}:`, error);
      }

      if (callback) {
        callback({ status: "ok" });
      }
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

      // Rate limit: basic plan users can send max 2 messages per 24 hours
      if (sender.plan === 'basic') {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const messageCount = await ChatMessage.countDocuments({
          roomId,
          senderUid,
          timestamp: { $gte: twentyFourHoursAgo },
        });

        if (messageCount >= 2) {
          socket.emit("messageError", {
            error: "Free users are limited to 2 messages per 24 hours. Please subscribe or wait.",
          });
          return;
        }
      }

      try {
        const chatMessage = new ChatMessage({
          roomId,
          senderUid,
          receiverUid,
          messageContent,
        });
        console.log("Saving chat message to database...");
        await chatMessage.save();
        console.log("Chat message saved successfully.");

        const messagePayload = {
          _id: chatMessage._id,
          roomId: chatMessage.roomId,
          senderUid: chatMessage.senderUid,
          receiverUid: chatMessage.receiverUid,
          messageContent: chatMessage.messageContent,
          timestamp: chatMessage.timestamp,
          status: chatMessage.status,
        };

        // Sync to Firebase Realtime Database for serverless/multi-instance clients
        try {
          const { syncChatMessageToFirebase } = require('./firebaseRealtimeService');
          await syncChatMessageToFirebase(roomId, messagePayload);
        } catch (firebaseErr) {
          log.warn('Firebase RTDB sync skipped or failed:', firebaseErr.message);
        }

        console.log(`Emitting 'message' to room: ${roomId}`);
        io.to(roomId).emit("message", messagePayload);
        console.log(`'message' emitted to room: ${roomId}`);

        const receiverSocketId = onlineUsers.get(receiverUid);
        if (receiverSocketId) {
          console.log(`Emitting 'message' to user: ${receiverUid}`);
          io.to(receiverSocketId).emit("message", messagePayload);
          io.to(receiverSocketId).emit("new_message_notification", {
            roomId: chatMessage.roomId,
            senderUid: chatMessage.senderUid,
            messageContent: chatMessage.messageContent,
          });
        log.info({
          message: 'Message sent',
          senderId: senderUid,
          receiverId: receiverUid,
          roomId: roomId
        });
          console.log(`'message' and 'new_message_notification' emitted to user: ${receiverUid}`);
        }
      } catch (error) {
        log.error({ err: error }, "Failed to process or send chat message");
        socket.emit("messageError", { error: "Failed to send message due to a server error." });
      }
    });

    socket.on('typing', ({ roomId, receiverUid }) => {
      const receiverSocketId = onlineUsers.get(receiverUid);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('userTyping', { roomId, typerUid: socket.user.uid });
      }
    });

    socket.on('stopTyping', ({ roomId, receiverUid }) => {
      const receiverSocketId = onlineUsers.get(receiverUid);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('userStoppedTyping', { roomId, typerUid: socket.user.uid });
      }
    });

    socket.on('messageDelivered', async ({ messageId, senderUid }) => {
        try {
            await ChatMessage.findByIdAndUpdate(messageId, { status: 'delivered' });
            const senderSocketId = onlineUsers.get(senderUid);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messageStatusUpdate', { messageId, status: 'delivered' });
            }
        } catch (error) {
            log.error({ err: error }, `Failed to update message ${messageId} to delivered`);
        }
    });

    socket.on('messagesRead', async ({ roomId, readerUid }) => {
        try {
            await ChatMessage.updateMany(
                { roomId, receiverUid: socket.user.uid, status: { $ne: 'read' } },
                { status: 'read' }
            );
            const readerSocketId = onlineUsers.get(readerUid);
            if (readerSocketId) {
                io.to(readerSocketId).emit('messagesReadUpdate', { roomId, readerUid: socket.user.uid });
            }
        } catch (error) {
            log.error({ err: error }, `Failed to update messages in room ${roomId} to read`);
        }
    });

    socket.on("subscribeToProfile", (profileId) => {
      socket.join(`profile-${profileId}`);
      log.info({
        message: 'Socket subscribed to profile updates',
        viewerUid: socket.user.uid,
        profileUid: profileId
      });
    });

    socket.on("unsubscribeFromProfile", (profileId) => {
      socket.leave(`profile-${profileId}`);
      log.info({
        message: 'Socket unsubscribed from profile updates',
        viewerUid: socket.user.uid,
        profileUid: profileId
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.uid);
      onlineUsers.delete(socket.user.uid);
    });
  });
}

const fallbackEmitter = {
  to: () => fallbackEmitter,
  emit: () => {},
};

const getIO = () => {
  return io || fallbackEmitter;
};

module.exports = { initSocket, getIO };

