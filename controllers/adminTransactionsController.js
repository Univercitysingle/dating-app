const Purchase = require('../models/Purchase');
const Subscription = require('../models/Subscription');
const { convertKeysToCdnUrls } = require('../utils/cdnUtils');

const getAllTransactions = async (req, res) => {
    try {
        const purchases = await Purchase.find({})
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const subscriptions = await Subscription.find({})
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const formattedPurchases = purchases.map(p => ({
            ...p,
            type: 'Store Item',
            itemName: p.itemName,
            price: p.itemPrice,
        }));

        const formattedSubscriptions = subscriptions.map(s => ({
            ...s,
            type: 'Subscription',
            itemName: `${s.plan} Plan`,
            // Subscription model does not have a price, this could be added
            // For now, we'll leave it blank or derive it.
            price: s.plan === 'weekly' ? '800 LKR' : s.plan === 'monthly' ? '3000 LKR' : s.plan === 'yearly' ? '10000 LKR' : 'N/A',
        }));

        const allTransactions = [...formattedPurchases, ...formattedSubscriptions];

        // Sort all transactions by date
        allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(allTransactions);
    } catch (error) {
        req.log.error({
            message: 'Error fetching all transactions',
            errorMessage: error.message,
            errorStack: error.stack,
        });
        res.status(500).json({ error: 'An unexpected error occurred while fetching transactions.' });
    }
};

module.exports = {
    getAllTransactions,
};
