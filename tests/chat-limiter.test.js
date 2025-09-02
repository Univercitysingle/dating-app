const { createServer } = require("http");
const Client = require("socket.io-client");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { initSocket } = require("../routes/chat");
const User = require("../models/User");
const ChatMessage = require("../models/ChatMessage");

describe("Chat Socket", () => {
  let clientSocket, httpServer, mongoServer;

  jest.setTimeout(30000);

  beforeAll(async () => {
    const mockAdmin = {
      auth: () => ({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: "test-user" }),
      }),
    };

    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    httpServer = createServer();
    initSocket(httpServer, ["*"], mockAdmin);
    await new Promise((resolve) => {
      httpServer.listen(() => {
        const port = httpServer.address().port;
        clientSocket = new Client(`http://localhost:${port}`, {
          auth: { token: "test-token" },
        });
        clientSocket.on("connect", resolve);
      });
    });
  });

  afterAll(async () => {
    if (httpServer) httpServer.close();
    if (clientSocket) clientSocket.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await ChatMessage.deleteMany({});
  });

  const setupUser = async (uid, plan) => {
    const user = new User({ uid, plan, email: `${uid}@test.com`, mobileNumber: '1234567890' });
    await user.save();
    return user;
  };

  test("should allow premium users to send more than 2 messages", (done) => {
    const senderUid = "premiumUser";
    const receiverUid = "receiver";
    const roomId = "testRoomPremium";

    setupUser(senderUid, "premium").then(() => {
      clientSocket.emit("joinRoom", roomId);

      let messageCount = 0;
      clientSocket.on("message", (msg) => {
        messageCount++;
        if (messageCount === 3) {
          expect(msg.messageContent).toBe("third message");
          done();
        }
      });

      clientSocket.emit("sendMessage", { roomId, messageContent: "first message", receiverUid });
      clientSocket.emit("sendMessage", { roomId, messageContent: "second message", receiverUid });
      clientSocket.emit("sendMessage", { roomId, messageContent: "third message", receiverUid });
    });
  });

  test("should not allow basic users to send more than 2 messages within 24 hours", (done) => {
    const senderUid = "basicUser";
    const receiverUid = "receiver";
    const roomId = "testRoomBasic";

    setupUser(senderUid, "basic").then(async () => {
      await new ChatMessage({ roomId, senderUid, receiverUid, messageContent: "first" }).save();
      await new ChatMessage({ roomId, senderUid, receiverUid, messageContent: "second" }).save();

      clientSocket.emit("joinRoom", roomId);

      clientSocket.on("messageError", (error) => {
        expect(error.error).toBe("Free users are limited to 2 messages per 24 hours. Please subscribe or wait.");
        done();
      });

      clientSocket.emit("sendMessage", { roomId, messageContent: "third message", receiverUid });
    });
  });

  test("should allow basic users to send a third message after 24 hours", (done) => {
    const senderUid = "basicUser24h";
    const receiverUid = "receiver";
    const roomId = "testRoomBasic24h";

    setupUser(senderUid, "basic").then(async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await new ChatMessage({ roomId, senderUid, receiverUid, messageContent: "first", timestamp: twentyFiveHoursAgo }).save();
      await new ChatMessage({ roomId, senderUid, receiverUid, messageContent: "second", timestamp: twentyFiveHoursAgo }).save();

      clientSocket.emit("joinRoom", roomId);

      clientSocket.on("message", (msg) => {
        expect(msg.messageContent).toBe("third message");
        done();
      });

      clientSocket.emit("sendMessage", { roomId, messageContent: "third message", receiverUid });
    });
  });
});
