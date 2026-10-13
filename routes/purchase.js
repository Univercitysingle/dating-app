const express = require('express');
const router = express.Router();
const { createPurchase, getPurchaseStatus } = require('../controllers/purchaseController');
const authMiddleware = require('../middleware/authentication');

router.post(
  '/store-item',
  authMiddleware,
  createPurchase
);

router.get(
    '/status/:id',
    authMiddleware,
    getPurchaseStatus
)

module.exports = router;
