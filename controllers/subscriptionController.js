const Subscription = require('../models/Subscription');
const User = require('../models/User');
const mongoose = require('mongoose');
const NodeRSA = require('node-rsa');
const crypto = require('crypto');

// Server-side plan pricing - never trust client-supplied prices
const PLAN_PRICES = {
  weekly: 800,
  monthly: 3000,
  yearly: 10000,
};

// HTML-encode to prevent XSS
const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const createSubscriptionPayment = async (req, res) => {
    const { plan, currency = 'LKR' } = req.body || {};
    if (typeof plan !== 'string' || !Object.prototype.hasOwnProperty.call(PLAN_PRICES, plan)) {
        return res.status(400).json({ error: 'Invalid subscription plan.' });
    }
    if (typeof currency !== 'string' || currency !== 'LKR') {
        return res.status(400).json({ error: 'Unsupported payment currency.' });
    }

    const publicKey = process.env.WEBXPAY_PUBLIC_KEY;
    const secretKey = process.env.WEBXPAY_SECRET_KEY;
    const frontendUrl = process.env.FRONTEND_URL;
    if (!publicKey || !secretKey || !frontendUrl) {
        req.log.error('WebXPay is not fully configured. Please check environment variables.');
        return res.status(503).json({ error: 'Payment gateway is not configured.' });
    }
    try {
        const configuredFrontend = new URL(frontendUrl);
        if (configuredFrontend.protocol !== 'https:' || configuredFrontend.username || configuredFrontend.password) {
            return res.status(503).json({ error: 'Payment gateway return URL is invalid.' });
        }
    } catch (_) {
        return res.status(503).json({ error: 'Payment gateway return URL is invalid.' });
    }
    const userId = req.user.uid;

    // Resolve price exclusively from the server-side plan catalog.
    const price = PLAN_PRICES[plan];
    if (!price) {
        return res.status(400).json({ error: 'Invalid subscription plan.' });
    }

    try {
        const user = await User.findOne({ uid: userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Block creating a new subscription if one is already active
        const activeSubscription = await Subscription.findOne({ userId: user._id, status: 'active' });
        if (activeSubscription) {
            return res.status(400).json({ message: `You already have an active subscription.` });
        }

        const newSubscription = new Subscription({
            userId: user._id,
            plan: plan,
            status: 'pending',
        });
        await newSubscription.save();

        const order_id = newSubscription._id.toString();
        const text = `${order_id}|${price}`;

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

        const itemDescription = `${plan.charAt(0).toUpperCase() + plan.slice(1)} Subscription`;

        const form = `
            <form action="https://stagingxpay.info/index.php?route=checkout/billing" name="vote" id="vote" method="post" style="display:none;">
                <input type="text" name="first_name" value="${escapeHtml(userDetails.first_name)}" />
                <input type="text" name="last_name" value="${escapeHtml(userDetails.last_name)}" />
                <input type="text" name="email" value="${escapeHtml(userDetails.email)}" />
                <input type="text" name="contact_number" value="${escapeHtml(userDetails.contact_number)}" />
                <input type="text" name="address_line_one" value="N/A" />
                <input type="text" name="process_currency" value="${escapeHtml(currency || 'LKR')}" />
                <input type="hidden" name="secret_key" value="${escapeHtml(secretKey)}" />
                <input type="hidden" name="return_url" value="${escapeHtml(frontendUrl)}/premium?purchaseId=${escapeHtml(order_id)}" />
                <input type="text" name="custom_fields" value="" />
                <input type="text" name="payment" value="${escapeHtml(encrypted)}" />
                <input type="text" name="items" value="${escapeHtml(itemDescription)}" />
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
            message: 'Error creating subscription payment',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const getSubscriptionStatus = async (req, res) => {
    try {
        if (typeof req.params.id !== 'string' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid subscription ID.' });
        }
        const subscription = await Subscription.findById(req.params.id);

        if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        const user = await User.findOne({ uid: req.user.uid });
        if (!user || subscription.userId.toString() !== user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to view this subscription' });
        }

        res.json({
            status: subscription.status,
            plan: subscription.plan,
            endDate: subscription.endDate
        });

    } catch (error) {
        req.log.error({
            message: 'Error fetching subscription status',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
};

module.exports = {
    createSubscriptionPayment,
    getSubscriptionStatus,
};
