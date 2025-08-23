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
  interests: { type: [String], default: [] },
  profilePrompts: { type: [{ prompt: String, answer: String }], default: [] },
  audioBioUrl: { type: String, default: "" },
  videoBioUrl: { type: String, default: "" },
  personalityQuizResults: { type: mongoose.Schema.Types.Mixed, default: {} },
  socialMediaLinks: { type: Map, of: String, default: new Map() },
  education: { type: String, default: "" },
  relationshipGoals: { type: String, default: "" },
  lastActiveAt: { type: Date, default: Date.now },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
  },
  role: {
    type: String,
    enum: ['user', 'contributor', 'admin', 'superadmin'],
    default: 'user',
  },
  isProfileVisible: {
    type: Boolean,
    default: true,
  },
  mustSetPassword: {
    type: Boolean,
    default: false,
  },
  password: { // For locally managed passwords, e.g., for sadmin
    type: String,
    required: false, // Not all users (e.g., Firebase-only users) will have this
  },
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model("User", userSchema);
