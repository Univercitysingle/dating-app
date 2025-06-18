const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    const status = subscription.status;

    // Update user plan based on subscription status
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (user) {
      if (status === "active") user.plan = "premium";
      else user.plan = "basic";
      await user.save();
    }
  }

  res.json({ received: true });
});

module.exports = router;
