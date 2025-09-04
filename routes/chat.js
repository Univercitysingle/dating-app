const express = require("express");
const router = express.Router();
const { getChatHistory, getConversations } = require('../controllers/chatController');

router.get("/history/:roomId", getChatHistory);
router.get("/conversations", getConversations);

module.exports = { router };
