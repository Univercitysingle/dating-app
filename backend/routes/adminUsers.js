const express = require('express');
const router = express.Router();

const adminUsersController = require('../controllers/adminUsersController');
const firebaseAuthMiddleware = require('../middleware/authMiddleware'); // Standard Firebase token auth
const populateUser = require('../middleware/populateUserMiddleware'); // Populates req.user from DB
const { requireRole } = require('../middleware/adminAuthMiddleware'); // Role-based authorization

// Prefix for these routes will be /api/admin/users (defined in server.js)

// GET /api/admin/users - List all users
router.get(
  '/',
  firebaseAuthMiddleware,
  populateUser,
  requireRole(['admin', 'superadmin']),
  adminUsersController.listUsers
);

// POST /api/admin/users - Create a new user
router.post(
  '/',
  firebaseAuthMiddleware,
  populateUser,
  requireRole(['admin', 'superadmin']), // Or just ['superadmin'] if only they can create users
  adminUsersController.createUser
);

// GET /api/admin/users/:userId - Get a specific user by ID
router.get(
  '/:userId',
  firebaseAuthMiddleware,
  populateUser,
  requireRole(['admin', 'superadmin']),
  adminUsersController.getUserById
);

// PUT /api/admin/users/:userId - Update a specific user by ID
router.put(
  '/:userId',
  firebaseAuthMiddleware,
  populateUser,
  requireRole(['admin', 'superadmin']),
  adminUsersController.updateUserById
);

// DELETE /api/admin/users/:userId - Delete a specific user by ID
router.delete(
  '/:userId',
  firebaseAuthMiddleware,
  populateUser,
  requireRole(['superadmin']), // Only superadmin can delete users
  adminUsersController.deleteUserById
);

module.exports = router;
