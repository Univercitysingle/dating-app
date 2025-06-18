const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // Firebase UID
  email: { type: String, required: true, unique: true },
  name: { type: String, default: "" },
  age: Number,
  gender: String,
  preference: String,
  bio: String,
  photos: [String],
  blocked: [String],
  isVerified: { type: Boolean, default: false },
  plan: { type: String, enum: ["basic", "premium"], default: "basic" },
  faceVerified: { type: Boolean, default: false },
  videoProfile: { type: String, default: null },
  stripeCustomerId: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
