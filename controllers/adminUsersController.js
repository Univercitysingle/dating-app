const mongoose = require('mongoose');
const User = require('../models/User');
const Report = require('../models/Report'); // Import the Report model
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const { sanitizeUser } = require('../utils/userUtils');
const { CDN_HOSTNAME, convertKeysToCdnUrls } = require('../utils/cdnUtils');

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalUsers, newUsers, activeUsers, pendingReports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
      User.countDocuments({ lastActiveAt: { $gte: twentyFourHoursAgo } }),
      Report.countDocuments({ status: 'pending_review' })
    ]);

    res.json({
      totalUsers,
      newUsers,
      activeUsers,
      pendingReports
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics', error: error.message });
  }
};

// List all users with pagination, search, and filtering
const listUsers = async (req, res) => {
  try {
    const { page: rawPage, limit: rawLimit, search, role, sortBy, sortOrder } = req.query;
    const page = rawPage === undefined ? 1 : Number(rawPage);
    const limit = rawLimit === undefined ? 10 : Number(rawLimit);
    if ((rawPage !== undefined && (typeof rawPage !== 'string' || !/^\d{1,6}$/.test(rawPage))) ||
        (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\d{1,3}$/.test(rawLimit))) ||
        !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Invalid pagination. Page must be 1-100000 and limit must be 1-100.' });
    }
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ message: 'Search must be a string of at most 100 characters.' });
    }
    const validRoles = User.schema.path('role').enumValues;
    if (role !== undefined && (typeof role !== 'string' || !validRoles.includes(role))) {
      return res.status(400).json({ message: 'Invalid user role.' });
    }
    const allowedSortFields = new Set(['createdAt', 'name', 'email', 'role', 'lastActiveAt', 'isProfileVisible', 'plan']);
    if (sortBy !== undefined && (typeof sortBy !== 'string' || !allowedSortFields.has(sortBy))) {
      return res.status(400).json({ message: 'Invalid sort field.' });
    }
    if (sortOrder !== undefined && (typeof sortOrder !== 'string' || !['asc', 'desc'].includes(sortOrder))) {
      return res.status(400).json({ message: 'Invalid sort order.' });
    }
    const skip = (page - 1) * limit;

    let query = {};

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i'); // Case-insensitive search
      query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    if (role) {
      query.role = role;
    }

    const sortOptions = {};
    const safeSortBy = typeof sortBy === 'string' && allowedSortFields.has(sortBy) ? sortBy : 'createdAt';
    sortOptions[safeSortBy] = safeSortBy === 'createdAt' && !sortBy ? -1 : (sortOrder === 'desc' ? -1 : 1);

    const users = await User.find(query)
      .select('-password')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalUsers = await User.countDocuments(query);

    const usersWithCdnUrls = users.map(user => convertKeysToCdnUrls(user));
    const sanitizedUsers = usersWithCdnUrls.map(user => sanitizeUser(user, req.user));

    res.json({
      users: sanitizedUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      totalUsers,
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ message: 'Error listing users', error: error.message });
  }
};

// Create a new user
const createUser = async (req, res) => {
  try {
    const { email, name, password, role, isProfileVisible, mustSetPassword, uid } = req.body;

    // Basic validation
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    // Further validation for email format, password strength, role validity can be added
    const validRoles = User.schema.path('role').enumValues;
    if (role && !validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    // Check if user with this email or UID already exists
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }
    if (uid) { // If UID is provided (e.g., for pre-creating a Firebase user)
        existingUser = await User.findOne({ uid });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this UID already exists.' });
        }
    }


    const newUserPayload = {
      email,
      name: name || '',
      role: role || 'user',
      isProfileVisible: isProfileVisible !== undefined ? isProfileVisible : true,
      mustSetPassword: mustSetPassword !== undefined ? mustSetPassword : false,
    };

    if (uid) {
        newUserPayload.uid = uid;
    }

    if (!uid && !password && !mustSetPassword) {
        // If no UID and no password and not mustSetPassword, this user can't login.
        // This case might need more thought based on product requirements.
        // For now, let's assume an admin might create a user this way and set password later.
        // Or, if a password is required for non-Firebase users, validate that here.
        // Forcing mustSetPassword if no password and no UID.
        newUserPayload.mustSetPassword = true;
        console.warn(`User created without explicit UID or password. 'mustSetPassword' forced to true for email: ${email}`);
    }


    if (password) {
      const salt = await bcrypt.genSalt(10);
      newUserPayload.password = await bcrypt.hash(password, salt);
      newUserPayload.mustSetPassword = false; // Password is being set now
    }

    const user = new User(newUserPayload);
    await user.save();

    let userResponse = user.toObject();
    delete userResponse.password; // Ensure password is not returned
    userResponse = convertKeysToCdnUrls(userResponse);

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 11000) { // Duplicate key error (e.g. if UID was not checked but is unique)
        return res.status(400).json({ message: 'Duplicate key error. User with this UID or other unique field might already exist.', error: error.message });
    }
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

// Get a single user by ID
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    let user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    user = convertKeysToCdnUrls(user);
    res.json(sanitizeUser(user, req.user));
  } catch (error) {
    console.error('Error getting user by ID:', error);
    res.status(500).json({ message: 'Error getting user', error: error.message });
  }
};

// Update a user by ID
const updateUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    // First, check if the user being updated is a superadmin
    const userToUpdate = await User.findById(userId).lean();
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (userToUpdate.role === 'superadmin') {
      return res.status(403).json({ message: 'Superadmin accounts cannot be modified.' });
    }

    const updates = req.body;
    const requestingUserRole = req.user.role; // Populated by populateUser and checked by requireRole

    // Fields that can be updated. Admins might have restrictions on role changes.
    const allowedUpdates = [
      'name', 'email', 'age', 'gender', 'preference', 'bio', 'photos',
      'interests', 'profilePrompts', 'audioBioUrl', 'videoBioUrl',
      'personalityQuizResults', 'socialMediaLinks', 'education',
      'relationshipGoals', 'isProfileVisible', 'plan', 'faceVerified', 'isVerified',
      'mustSetPassword', 'role', 'location', 'lastActiveAt'
      // Note: 'password' should be handled via a separate reset/change password flow.
      // UID should generally not be updatable.
    ];

    const finalUpdates = {};
    for (const key of Object.keys(updates)) {
      if (allowedUpdates.includes(key)) {
        // Role change restriction logic
        if (key === 'role') {
          const targetRole = updates.role;
          const validRoles = User.schema.path('role').enumValues;
          if (!validRoles.includes(targetRole)) {
            return res.status(400).json({ message: `Invalid target role. Must be one of: ${validRoles.join(', ')}` });
          }

          if (requestingUserRole === 'admin') {
            if (targetRole === 'superadmin') {
              return res.status(403).json({ message: 'Admins cannot assign superadmin role.' });
            }
            // Admins can assign 'user', 'contributor', 'admin'
          } else if (requestingUserRole !== 'superadmin') {
            // If not superadmin, and trying to change role (covered by admin case, but as a general rule)
             return res.status(403).json({ message: 'You do not have permission to change roles to this level.' });
          }
          // Superadmins can change to any role (no explicit block here)
        }
        finalUpdates[key] = updates[key];
      }
    }

    if (updates.password) {
        // Do not allow direct password update here. Should be a separate flow.
        // Forcing password reset could set mustSetPassword = true, for example.
        console.warn(`Attempt to update password directly for user ${userId} blocked. Use dedicated password reset flow.`);
        delete finalUpdates.password; // Ensure password is not updated this way
    }


    const originalUser = await User.findById(userId).lean();

    let updatedUser = await User.findByIdAndUpdate(userId, finalUpdates, { new: true }).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const changes = Object.fromEntries(
      Object.keys(finalUpdates)
        .filter(key => originalUser[key] !== updatedUser[key])
        .map(key => [key, {
          old: originalUser[key],
          new: updatedUser[key],
        }])
    );

    if (Object.keys(changes).length > 0) {
      const auditLog = new AuditLog({
        adminId: req.user._id,
        action: 'update_user',
        targetType: 'User',
        targetId: updatedUser._id,
        changes,
      });
      await auditLog.save();
    }

    updatedUser = updatedUser.toObject();
    res.json(sanitizeUser(updatedUser, req.user));
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Update failed due to duplicate key (e.g. email or UID).', error: error.message });
    }
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// Delete a user by ID
const deleteUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const userToDelete = await User.findById(userId).lean();
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (userToDelete.role === 'superadmin') {
      return res.status(403).json({ message: 'Superadmin accounts cannot be deleted.' });
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found during deletion.' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

// Update a user's subscription plan
const updateUserSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;

    // Validate plan
    const validPlans = User.schema.path('plan').enumValues;
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ message: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { plan: plan },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(sanitizeUser(updatedUser.toObject(), req.user));
  } catch (error) {
    console.error('Error updating user subscription:', error);
    res.status(500).json({ message: 'Error updating user subscription', error: error.message });
  }
};

const Subscription = require('../models/Subscription');



const Purchase = require('../models/Purchase');

const getPurchases = async (req, res) => {
  try {
    const { status } = req.query;
    const validStatuses = Purchase.schema.path('status').enumValues;
    if (status !== undefined && (typeof status !== 'string' || (status !== 'all' && !validStatuses.includes(status)))) {
      return res.status(400).json({ message: 'Invalid purchase status.' });
    }
    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    let purchases = await Purchase.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    purchases = purchases.map(purchase => ({
      ...purchase,
      bankSlipUrl: `https://${CDN_HOSTNAME}/${purchase.bankSlipUrl}`,
    }));

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ message: 'Error fetching purchases', error: error.message });
  }
};

const approvePurchase = async (req, res) => {
  try {
    const purchaseId = req.params.purchaseId || req.params.id;
    if (typeof purchaseId !== 'string' || !mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({ message: 'Invalid purchase ID.' });
    }
    const purchase = await Purchase.findOneAndUpdate(
      { _id: purchaseId, status: 'pending' },
      { $set: { status: 'completed' } },
      { new: true }
    );

    if (!purchase) {
      return res.status(404).json({ message: 'Pending purchase not found' });
    }

    if (purchase.itemId === 'super-like-5') {
      await User.updateOne({ _id: purchase.userId }, { $inc: { purchasedSuperLikes: 5 } });
    } else if (purchase.itemId === 'undo-swipes-5') {
      await User.updateOne({ _id: purchase.userId }, { $inc: { purchasedUndoSwipes: 5 } });
    } else if (purchase.itemId === 'profile-boost-1') {
      await User.updateOne(
        { _id: purchase.userId },
        { $set: { boostExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } }
      );
    }

    res.json({ message: 'Purchase approved successfully' });
  } catch (error) {
    console.error('Error approving purchase:', error);
    res.status(500).json({ message: 'Error approving purchase', error: error.message });
  }
};

const rejectPurchase = async (req, res) => {
  try {
    const purchaseId = req.params.purchaseId || req.params.id;
    const { reason } = req.body || {};
    if (typeof purchaseId !== 'string' || !mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({ message: 'Invalid purchase ID.' });
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) {
      return res.status(400).json({ message: 'A rejection reason of 1-500 characters is required.' });
    }

    const purchase = await Purchase.findOneAndUpdate(
      { _id: purchaseId, status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: reason.trim() } },
      { new: true }
    );

    if (!purchase) {
      return res.status(404).json({ message: 'Pending purchase not found' });
    }

    res.json({ message: 'Purchase rejected successfully' });
  } catch (error) {
    console.error('Error rejecting purchase:', error);
    res.status(500).json({ message: 'Error rejecting purchase', error: error.message });
  }
};

module.exports = {
  getDashboardStats,
  listUsers,
  createUser,
  getUserById,
  updateUserById,
  deleteUserById,
  updateUserSubscription,
  getPurchases,
  approvePurchase,
  rejectPurchase,
};
