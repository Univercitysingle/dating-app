const Stripe = require('stripe');
const { buildLogger } = require('../utils/logger');
const log = buildLogger('stripe-service');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  try {
    log.info({
        message: 'Creating Stripe PaymentIntent',
        amount,
        currency,
        metadata
    });
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
    });
    log.info({
        message: 'Stripe PaymentIntent created successfully',
        paymentIntentId: paymentIntent.id
    });
    return paymentIntent;
  } catch (error) {
    log.error({
        message: 'Error creating Stripe PaymentIntent',
        error: error.message,
        stack: error.stack
    });
    throw error;
  }
}

async function retrievePaymentIntent(paymentIntentId) {
  try {
    log.info({
        message: 'Retrieving Stripe PaymentIntent',
        paymentIntentId
    });
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    log.info({
        message: 'Stripe PaymentIntent retrieved successfully',
        paymentIntentId: paymentIntent.id
    });
    return paymentIntent;
  } catch (error) {
    log.error({
        message: 'Error retrieving Stripe PaymentIntent',
        paymentIntentId,
        error: error.message,
        stack: error.stack
    });
    throw error;
  }
}

function constructEventFromWebhook(request) {
  try {
    log.info({
        message: 'Constructing Stripe webhook event',
        headers: request.headers
    });
    const signature = request.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      request.rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    log.info({
        message: 'Stripe webhook event constructed successfully',
        eventType: event.type
    });
    return event;
  } catch (error) {
    log.error({
        message: 'Error constructing Stripe webhook event',
        error: error.message,
        stack: error.stack
    });
    throw error;
  }
}

async function createCheckoutSession(priceId, customerId, successUrl, cancelUrl) {
    try {
        log.info({
            message: 'Creating Stripe checkout session',
            priceId,
            customerId
        });
        const session = await stripe.checkout.sessions.create({
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
        log.info({
            message: 'Stripe checkout session created successfully',
            sessionId: session.id
        });
        return session;
    } catch (error) {
        log.error({
            message: 'Error creating Stripe checkout session',
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function createCustomerPortalSession(customerId, returnUrl) {
    try {
        log.info({
            message: 'Creating Stripe customer portal session',
            customerId
        });
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        log.info({
            message: 'Stripe customer portal session created successfully',
            sessionId: session.id
        });
        return session;
    } catch (error) {
        log.error({
            message: 'Error creating Stripe customer portal session',
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = {
  stripe,
  createPaymentIntent,
  retrievePaymentIntent,
  constructEventFromWebhook,
  createCheckoutSession,
  createCustomerPortalSession,
};
