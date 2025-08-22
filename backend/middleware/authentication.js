const admin = require("../services/firebaseAdmin");
const User = require('../models/User');
const Subscription = require('../models/Subscription');

const findAndUpdateUserByTokenDetails = async (decodedToken) => {
  // This function is now part of the middleware
  let user = await User.findOne({ uid: decodedToken.uid });

  if (user) {
    return user;
  }

  if (!decodedToken.email || !decodedToken.email_verified) {
    return null;
  }

  user = await User.findOne({ email: decodedToken.email });

  if (user) {
    user.uid = decodedToken.uid;
    await user.save();
    return user;
  }

  const newUser = new User({
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name || '',
  });
  await newUser.save();
  return newUser;
};

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No auth token provided or malformed header" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: "Invalid auth header format: Token is missing" });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const dbUser = await findAndUpdateUserByTokenDetails(decodedToken);

    if (!dbUser) {
      return res.status(403).json({ error: "User provisioning failed. Email may not be verified or token details are insufficient." });
    }

    const userObject = dbUser.toObject();

    const activeSubscription = await Subscription.findOne({
      userId: userObject._id,
      status: 'active',
    });

    userObject.isPremium = !!activeSubscription;
    req.user = userObject;

    next();
  } catch (error) {
    if (error.code && error.code.startsWith('auth/')) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired Firebase token.", details: error.message });
    }

    return res.status(500).json({ error: "Server error during authentication." });
  }
};
