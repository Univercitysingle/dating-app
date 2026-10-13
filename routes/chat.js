const express = require("express");
const router = express.Router();
const { getChatHistory, getConversations, sendMessageHttp } = require('../controllers/chatController');

router.get("/history/:roomId", getChatHistory);
router.get("/conversations", getConversations);
router.post("/send", sendMessageHttp);

module.exports = { router };

