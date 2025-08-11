const express = require('express');
const router = express.Router();

const adminUsersController = require('../controllers/adminUsersController');
const authMiddleware = require('../middleware/authentication');
const { requireRole } = require('../middleware/adminAuthMiddleware'); // Role-based authorization

// Prefix for these routes will be /api/admin/users (defined in server.js)

// GET /api/admin/users - List all users
router.get(
  '/',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminUsersController.listUsers
);

// POST /api/admin/users - Create a new user
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'superadmin']), // Or just ['superadmin'] if only they can create users
  adminUsersController.createUser
);

// GET /api/admin/users/:userId - Get a specific user by ID
router.get(
  '/:userId',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminUsersController.getUserById
);

// PUT /api/admin/users/:userId - Update a specific user by ID
router.put(
  '/:userId',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminUsersController.updateUserById
);

// DELETE /api/admin/users/:userId - Delete a specific user by ID
router.delete(
  '/:userId',
  authMiddleware,
  requireRole(['superadmin']), // Only superadmin can delete users
  adminUsersController.deleteUserById
);

module.exports = router;
