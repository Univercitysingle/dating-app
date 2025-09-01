const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`, { headers: req.headers, bodyRaw: req.body.toString('utf-8').substring(0, 500) }); // Log more details for sig verification failure
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe webhook event: ${event.id}, Type: ${event.type}`);

  try {
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;

      const user = await User.findOne({ stripeCustomerId: customerId });
      if (user) {
        const oldPlan = user.plan;
        if (status === "active") {
          user.plan = "premium";
        } else {
          user.plan = "basic";
        }
        await user.save();
        console.log(`User plan updated for Stripe customer ID: ${customerId}, UID: ${user.uid}, Old plan: ${oldPlan}, New plan: ${user.plan}, Subscription ID: ${subscription.id}, Status: ${status}`);
      } else {
        console.warn(`No user found with Stripe customer ID: ${customerId} for event ID ${event.id}`);
      }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      console.log(`Invoice payment_failed for customer: ${customerId}, Subscription: ${invoice.subscription}, Invoice ID: ${invoice.id}, Event ID: ${event.id}`);
      // Additional logic for payment failure might be needed here, e.g., notifying the user.
    } else {
      console.log(`Unhandled Stripe event type: ${event.type}, Event ID: ${event.id}`);
    }
    res.json({ received: true });
  } catch (error) {
    console.error(`Error processing Stripe webhook event ${event.id} (Type: ${event.type}):`, error);
    // Send 500 but Stripe might retry if it doesn't get a 2xx.
    // Depending on the error, you might want to return 200 to prevent retries for non-recoverable errors.
    // For now, return 500 to indicate a server-side processing issue.
    res.status(500).json({ error: "Internal server error processing webhook." });
  }
};

const { createCheckoutSession, createCustomerPortalSession } = require('../services/stripe');

const createSubscription = async (req, res) => {
    const { priceId } = req.body;
    const { uid } = req.user;

    try {
        const user = await User.findOne({ uid });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { userId: uid },
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        const session = await createCheckoutSession(
            priceId,
            customerId,
            `${process.env.CLIENT_URL}/profile`,
            `${process.env.CLIENT_URL}/premium`
        );

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

const manageSubscription = async (req, res) => {
    const { uid } = req.user;

    try {
        const user = await User.findOne({ uid });
        if (!user || !user.stripeCustomerId) {
            return res.status(404).json({ error: 'User or subscription not found' });
        }

        const session = await createCustomerPortalSession(
            user.stripeCustomerId,
            `${process.env.CLIENT_URL}/profile`
        );

        res.json({ url: session.url });
    } catch (error) {
        console.error('Error creating customer portal session:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
};

module.exports = {
  handleStripeWebhook,
  createSubscription,
  manageSubscription,
};
