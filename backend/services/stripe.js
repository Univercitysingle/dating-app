const Stripe = require('stripe');

// Initialize Stripe with your secret key from environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10', // Use the latest stable API version or the one you are targeting
});

// Example: Create a payment intent
async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  return await stripe.paymentIntents.create({
    amount, // amount in cents
    currency,
    metadata,
  });
}

// Example: Retrieve a payment intent
async function retrievePaymentIntent(paymentIntentId) {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

// Example: Handle webhook events (in your route, use the raw request body)
function constructEventFromWebhook(request) {
  const signature = request.headers['stripe-signature'];
  // STRIPE_WEBHOOK_SECRET must be set in your environment variables
  return stripe.webhooks.constructEvent(
    request.rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  stripe,
  createPaymentIntent,
  retrievePaymentIntent,
  constructEventFromWebhook,
};
