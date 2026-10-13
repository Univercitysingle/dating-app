const Purchase = require('../models/Purchase');
const User = require('../models/User');
const NodeRSA = require('node-rsa');
const crypto = require('crypto');

// Server-side price catalog - never trust client-supplied prices
const CATALOG_PRICES = {
  'super-like-5': 500,
  'undo-swipes-5': 500,
  'profile-boost-1': 100,
};

const CATALOG_NAMES = {
  'super-like-5': '5 Super Likes',
  'undo-swipes-5': '5 Undo Swipes',
  'profile-boost-1': '1 Profile Boost',
};

// HTML-encode to prevent XSS in form fields
const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const createPurchase = async (req, res) => {
    const { itemId } = req.body;
    const userId = req.user.uid;

    // Validate item exists in catalog
    const itemPrice = CATALOG_PRICES[itemId];
    if (!itemPrice) {
        return res.status(400).json({ error: 'Invalid item ID.' });
    }
    const itemName = CATALOG_NAMES[itemId];

    try {
        const user = await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newPurchase = new Purchase({
            userId: user._id,
            itemId,
            itemName,
            itemPrice,
            status: 'pending',
        });
        await newPurchase.save();

        const order_id = newPurchase._id.toString();
        const text = order_id + '|' + itemPrice;

        const publicKey = process.env.WEBXPAY_PUBLIC_KEY;
        const secretKey = process.env.WEBXPAY_SECRET_KEY;
        const frontendUrl = process.env.FRONTEND_URL;

        if (!publicKey || !secretKey || !frontendUrl) {
            req.log.error('WebXPay is not fully configured. Please check environment variables.');
            return res.status(500).json({ error: 'Payment gateway is not configured.' });
        }

        let keyString = publicKey;
        if (keyString.startsWith('"') && keyString.endsWith('"')) {
            keyString = keyString.slice(1, -1);
        }
        const formattedPublicKey = keyString.replace(/\\n/g, '\n');
        const key = new NodeRSA(formattedPublicKey);
        const encrypted = key.encrypt(text, 'base64');

        const names = (user.name || 'User').split(' ');
        const userDetails = {
            first_name: names[0] || 'User',
            last_name: names[1] || names[0] || 'User',
            email: user.email || '',
            contact_number: user.mobileNumber || user.phoneNumber || '0711234567',
        };

        const nonce = crypto.randomBytes(16).toString('base64');
        res.setHeader('Content-Security-Policy', `script-src 'self' 'nonce-${nonce}'`);

        const form = `
            <form action="https://stagingxpay.info/index.php?route=checkout/billing" name="vote" id="vote" method="post" style="display:none;">
                <input type="text" name="first_name" value="${escapeHtml(userDetails.first_name)}" />
                <input type="text" name="last_name" value="${escapeHtml(userDetails.last_name)}" />
                <input type="text" name="email" value="${escapeHtml(userDetails.email)}" />
                <input type="text" name="contact_number" value="${escapeHtml(userDetails.contact_number)}" />
                <input type="text" name="address_line_one" value="N/A" />
                <input type="text" name="process_currency" value="LKR" />
                <input type="hidden" name="secret_key" value="${escapeHtml(secretKey)}" />
                <input type="hidden" name="return_url" value="${escapeHtml(frontendUrl)}/store?purchaseId=${escapeHtml(order_id)}" />
                <input type="text" name="custom_fields" value="" />
                <input type="text" name="payment" value="${escapeHtml(encrypted)}" />
            </form>
            <script nonce="${nonce}">
                document.addEventListener("DOMContentLoaded", function() {
                    document.getElementById("vote").submit();
                });
            </script>
        `;
        res.send(form);
    } catch (error) {
        req.log.error({
            message: 'Error creating purchase',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getPendingPurchases = async (req, res) => {
  const log = req.log;
  log.info('Fetching all pending purchases for admin review.');
  try {
    const purchases = await Purchase.find({ status: 'pending' }).populate('userId', 'name uid');
    res.json(purchases);
  } catch (error) {
    log.error({
        message: 'Error fetching pending purchases',
        errorMessage: error.message,
        errorStack: error.stack,
    });
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

const getPurchaseStatus = async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        // Verify the purchase belongs to the requesting user
        const user = await User.findOne({ uid: req.user.uid });
        if (!user || !purchase.userId.equals(user._id)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        res.json({ status: purchase.status });
    } catch (error) {
        req.log.error({
            message: 'Error fetching purchase status',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
}

module.exports = {
  createPurchase,
  getPendingPurchases,
  getPurchaseStatus
};
