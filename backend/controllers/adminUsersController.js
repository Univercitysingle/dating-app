const User = require('../models/User');
const bcrypt = require('bcryptjs');

// List all users with pagination
const listUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password') // Exclude password
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean for performance if not modifying docs

    const totalUsers = await User.countDocuments();

    res.json({
      users,
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

    if (uid) { // If admin provides a UID (e.g. from Firebase)
        newUserPayload.uid = uid;
    } else if (!password && !mustSetPassword) {
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

    const userResponse = user.toObject();
    delete userResponse.password; // Ensure password is not returned

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
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error getting user by ID:', error);
    res.status(500).json({ message: 'Error getting user', error: error.message });
  }
};

// Update a user by ID
const updateUserById = async (req, res) => {
  try {
    const { userId } = req.params;
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


    const updatedUser = await User.findByIdAndUpdate(userId, finalUpdates, { new: true }).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(updatedUser);
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
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUserById,
  deleteUserById,
};
