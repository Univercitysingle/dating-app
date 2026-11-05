const adminUsersController = require('../controllers/adminUsersController');
const adminReportsController = require('../controllers/adminReportsController');
const User = require('../models/User');

const makeResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('Admin endpoint input validation', () => {
  it('prevents an admin from creating a superadmin account', async () => {
    const res = makeResponse();
    await adminUsersController.createUser({
      user: { role: 'admin' },
      body: { email: 'new-admin@example.com', role: 'superadmin' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Only a superadmin can create a superadmin account.',
    });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('rejects MongoDB operator objects in user role filters', async () => {
    const res = makeResponse();
    await adminUsersController.listUsers({ query: { role: { $ne: 'user' } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid user role.' });
  });

  it('rejects unsupported user sort fields', async () => {
    const res = makeResponse();
    await adminUsersController.listUsers({ query: { sortBy: 'password' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid sort field.' });
  });

  it('rejects malformed admin user pagination', async () => {
    const res = makeResponse();
    await adminUsersController.listUsers({ query: { page: '1abc' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects MongoDB operator objects in purchase status filters', async () => {
    const res = makeResponse();
    await adminUsersController.getPurchases({ query: { status: { $ne: 'rejected' } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid purchase status.' });
  });

  it('rejects invalid report status filters', async () => {
    const res = makeResponse();
    await adminReportsController.listReports({ query: { status: { $ne: 'pending_review' } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid report status.' });
  });

  it('rejects malformed report pagination', async () => {
    const res = makeResponse();
    await adminReportsController.listReports({ query: { limit: '101' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects invalid report IDs before moderation lookup', async () => {
    const res = makeResponse();
    await adminReportsController.performModerationAction({
      params: { reportId: 'not-an-object-id' },
      body: { action: 'dismiss' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid report ID.' });
  });

  it('rejects invalid moderation durations', async () => {
    const res = makeResponse();
    await adminReportsController.performModerationAction({
      params: { reportId: '507f1f77bcf86cd799439011' },
      body: { action: 'suspend_user', durationDays: '10days' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Suspension duration must be a whole number between 1 and 3650 days.',
    });
  });

  it('rejects non-string rejection reasons before purchase lookup', async () => {
    const res = makeResponse();
    await adminUsersController.rejectPurchase({
      params: { purchaseId: '507f1f77bcf86cd799439011' },
      body: { reason: { $ne: '' } },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'A rejection reason of 1-500 characters is required.',
    });
  });
});
