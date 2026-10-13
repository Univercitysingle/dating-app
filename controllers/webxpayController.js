const Purchase = require('../models/Purchase');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const NodeRSA = require('node-rsa');

const handleResponse = async (req, res) => {
    const { payment, signature } = req.body;

    if (!payment || !signature) {
        return res.status(400).json({ error: 'Payment or signature missing.' });
    }

    try {
        const publicKey = process.env.WEBXPAY_PUBLIC_KEY;
        if (!publicKey) {
            req.log.error('WebXPay public key is not configured.');
            return res.status(500).json({ error: 'Payment gateway is not configured.' });
        }

        let keyString = publicKey;
        if (keyString.startsWith('"') && keyString.endsWith('"')) {
            keyString = keyString.slice(1, -1);
        }
        const formattedPublicKey = keyString.replace(/\\n/g, '\n');
        const decryptionKey = new NodeRSA(formattedPublicKey);
        decryptionKey.setOptions({ signingScheme: 'pss-sha1' });

        const isVerified = decryptionKey.verify(Buffer.from(payment, 'base64'), Buffer.from(signature, 'base64'));

        if (isVerified) {
            const decodedPayment = Buffer.from(payment, 'base64').toString('utf-8');
            const paymentDetails = decodedPayment.split('|');
            const orderId = paymentDetails[1].startsWith('T') ? paymentDetails[1] : paymentDetails[0];

            let purchase = await Purchase.findById(orderId);
            let subscription = null;

            if (!purchase) {
                subscription = await Subscription.findById(orderId);
            }

            if (!purchase && !subscription) {
                return res.status(404).json({ error: 'Transaction not found.' });
            }

            const user = await User.findById(purchase ? purchase.userId : subscription.userId);
            if (!user) {
                return res.status(404).json({ error: 'User associated with transaction not found.' });
            }

            if (purchase) {
                if (purchase.status === 'completed') {
                    return res.status(200).json({ success: true, message: 'Purchase already processed.' });
                }
                purchase.status = 'completed';
                await purchase.save();
                // Logic to grant store item benefits
                if (purchase.itemId === 'super-like-5') {
                    user.purchasedSuperLikes = (user.purchasedSuperLikes || 0) + 5;
                } else if (purchase.itemId === 'undo-swipes-5') {
                    user.purchasedUndoSwipes = (user.purchasedUndoSwipes || 0) + 5;
                }
                // ... other item types
            }

            if (subscription) {
                if (subscription.status === 'active') {
                    return res.status(200).json({ success: true, message: 'Subscription already processed.' });
                }
                subscription.status = 'active';
                const now = new Date();
                if (subscription.plan === 'weekly') {
                    subscription.endDate = new Date(now.setDate(now.getDate() + 7));
                } else if (subscription.plan === 'monthly') {
                    subscription.endDate = new Date(now.setMonth(now.getMonth() + 1));
                } else if (subscription.plan === 'yearly') {
                    subscription.endDate = new Date(now.setFullYear(now.getFullYear() + 1));
                }
                await subscription.save();
                user.plan = 'premium';
            }

            await user.save();
            return res.status(200).json({ success: true, message: 'Payment verified and processed successfully.' });
        } else {
            res.status(400).json({ error: 'Signature verification failed.' });
        }
    } catch (error) {
        req.log.error({
            message: 'Error handling WebXPay response',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

module.exports = {
    handleResponse,
};
