const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  return await stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
  });
}

async function retrievePaymentIntent(paymentIntentId) {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

function constructEventFromWebhook(request) {
  const signature = request.headers['stripe-signature'];
  return stripe.webhooks.constructEvent(
    request.rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

async function createCheckoutSession(priceId, customerId, successUrl, cancelUrl) {
    return await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        customer: customerId,
        success_url: successUrl,
        cancel_url: cancelUrl,
    });
}

async function createCustomerPortalSession(customerId, returnUrl) {
    return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
}

module.exports = {
  stripe,
  createPaymentIntent,
  retrievePaymentIntent,
  constructEventFromWebhook,
  createCheckoutSession,
  createCustomerPortalSession,
};
