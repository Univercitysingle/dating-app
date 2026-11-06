const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, unique: true, sparse: true }, // Firebase UID, not required for all users
  email: { type: String, required: true, unique:true },
  name: { type: String },
  birthday: { type: Date },
  gender: { type: String, enum: ["Male", "Female", "Other"] },
  preference: { type: String, enum: ["Male", "Female", "everyone"], default: "everyone" },
  mobileNumber: { type: String },
  sexualOrientation: {
    type: String,
    enum: [
      'Straight / Heterosexual',
      'Gay (Homosexual - Male)',
      'Lesbian (Homosexual - Female)',
      'Bisexual (Bi)',
      'Pansexual',
      'Asexual',
      'Queer',
      'Prefer Not to Say',
    ],
  },
  bio: String,
  photos: [{
    url: String,
    order: Number,
    size: Number, // size in bytes
  }],
  totalPhotoSize: {
    type: Number,
    default: 0
  },
  blocked: [String],
  isVerified: { type: Boolean, default: false },
  plan: { type: String, enum: ["basic", "premium", "weekly", "monthly", "yearly"], default: "basic" },
  faceVerified: { type: Boolean, default: false },
  trialExpires: { type: Date },
  purchasedSuperLikes: { type: Number, default: 0 },
  purchasedUndoSwipes: { type: Number, default: 0 },
  boostExpiresAt: { type: Date },
  interests: { type: [String], default: [] },
  profilePrompts: { type: [{ prompt: String, answer: String }], default: [] },
  audioBioUrl: { type: String, default: "" },
  personalityType: {
    type: String,
    enum: [
      'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
      'ISTP', 'ISFP', 'INFP', 'INTP',
      'ESTP', 'ESFP', 'ENFP', 'ENTP',
      'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
    ],
  },
  education: { type: String, default: "" },
  relationshipGoals: {
    type: String,
    enum: [
      'Long-term relationship',
      'Long-term, open to short',
      'Short-term, open to long',
      'Short-term fun',
      'New friends',
      'Figuring it out',
    ],
    default: 'Figuring it out',
  },
  lifestyle: {
    pets: { type: String, enum: ['Dog person', 'Cat person', 'No pets', 'All the pets'] },
    lookingFor: { type: String, enum: ['Relationship', 'Casual (FWB)', 'Friendship', 'Don\'t know yet'] },
    religion: String,
    politicalLeaning: String,
  },
  familyStatus: {
    type: String,
    enum: [
      'Lower Class Family',
      'Lower-Middle Class Family',
      'Middle Class Family',
      'Upper-Middle Class Family',
      'Upper Class / Elite Family',
    ],
  },
  siblings: { type: String },
  badges: {
    height: { type: Number }, // in cm
    zodiac: String,
    workout: { type: String, enum: ['Every day', 'Often', 'Sometimes', 'Never'] },
    drinking: { type: String, enum: ['Frequently', 'Socially', 'Rarely', 'Never'] },
    smoking: { type: String, enum: ['Socially', 'Sometimes', 'Never'] },
  },
  lastActiveAt: { type: Date, default: Date.now },
  lastLoginDevice: { type: String },
  lastLoginIp: { type: String },
  suspendedUntil: { type: Date, default: null },
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
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    country: { type: String, default: "" },
    locationLastUpdatedAt: { type: Date },
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
  superLikes: {
    count: { type: Number, default: 1 },
    refreshesAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  },
  undoSwipes: {
    count: { type: Number, default: 3 },
    refreshesAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  },
  password: { // For locally managed passwords, e.g., for sadmin
    type: String,
    required: false, // Not all users (e.g., Firebase-only users) will have this
  },
  isOnboardingComplete: {
    type: Boolean,
    default: false,
  },
  lastSwipe: {
    action: { type: String, enum: ['like', 'pass', 'superlike'] },
    targetUserId: { type: String },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    timestamp: { type: Date }
  },
}, { toJSON: { virtuals: true }, toObject: { virtuals: true }, timestamps: true });

userSchema.virtual('age').get(function() {
  if (!this.birthday) {
    return undefined;
  }
  const today = new Date();
  const birthDate = new Date(this.birthday);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

userSchema.index({ location: '2dsphere' });
userSchema.index({ lastActiveAt: -1 });

module.exports = mongoose.model("User", userSchema);
