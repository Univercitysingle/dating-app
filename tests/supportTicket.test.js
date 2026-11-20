const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const supportTicketController = require('../controllers/supportTicketController');
const adminSupportTicketController = require('../controllers/adminSupportTicketController');
const ticketMessageController = require('../controllers/ticketMessageController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authentication');
const { v4: uuidv4 } = require('uuid');

let mongoServer;
const app = express();
app.use(express.json());

// Mock middlewares
jest.mock('../middleware/adminAuthMiddleware', () => (req, res, next) => {
    const mongoose = require('mongoose');
  req.user = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
  next();
});
let mockUserId;

jest.mock('../middleware/authentication', () => (req, res, next) => {
  req.user = { _id: mockUserId, uid: 'test-uid' };
  next();
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Support Ticket Flow', () => {
  jest.setTimeout(10000);
  let user;
  let admin;
  let ticket;

  // User routes
  app.post('/tickets', authMiddleware, supportTicketController.createTicket);
  app.get('/tickets', authMiddleware, supportTicketController.getTicketsForUser);
  app.get('/tickets/:ticketId', authMiddleware, supportTicketController.getTicketByIdForUser);
  app.post('/tickets/:ticketId/messages', authMiddleware, supportTicketController.addMessageToTicket);
  app.patch('/tickets/:ticketId/messages/:messageId', authMiddleware, ticketMessageController.editUserMessage);
  app.delete('/tickets/:ticketId/messages/:messageId', authMiddleware, ticketMessageController.deleteUserMessage);

  // Admin routes
  app.get('/admin/tickets', adminAuthMiddleware, adminSupportTicketController.getAllTickets);
  app.get('/admin/tickets/:ticketId', adminAuthMiddleware, adminSupportTicketController.getTicketByIdForAdmin);
  app.post('/admin/tickets/:ticketId/messages', adminAuthMiddleware, adminSupportTicketController.addAdminMessageToTicket);
  app.patch('/admin/tickets/:ticketId/messages/:messageId', adminAuthMiddleware, ticketMessageController.editAdminMessage);
  app.delete('/admin/tickets/:ticketId/messages/:messageId', adminAuthMiddleware, ticketMessageController.deleteAdminMessage);
  app.put('/admin/tickets/:ticketId/status', adminAuthMiddleware, adminSupportTicketController.updateTicketStatus);

  beforeEach(async () => {
    mockUserId = new mongoose.Types.ObjectId();
    user = new User({
      _id: mockUserId,
      uid: 'test-uid',
      email: 'test@example.com',
      name: 'Test User',
    });
    await user.save();

    admin = new User({
        _id: new mongoose.Types.ObjectId(),
        uid: 'admin-uid',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
    });
    await admin.save();

    ticket = new SupportTicket({
      userId: user._id,
      subject: 'Test Ticket',
      ticketNumber: uuidv4(),
    });
    await ticket.save();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await SupportTicket.deleteMany({});
    await TicketMessage.deleteMany({});
  });

  it('rejects malformed ticket IDs before querying ticket ownership', async () => {
    const response = await request(app).get('/tickets/not-an-object-id');
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid ticket ID.');
  });

  it('rejects malformed ticket IDs on admin detail and status routes', async () => {
    const detail = await request(app).get('/admin/tickets/not-an-object-id');
    const status = await request(app)
      .put('/admin/tickets/not-an-object-id/status')
      .send({ status: 'Closed' });

    expect(detail.status).toBe(400);
    expect(status.status).toBe(400);
    expect(detail.body.message).toBe('Invalid ticket ID.');
    expect(status.body.message).toBe('Invalid ticket ID.');
  });

  it('rejects invalid and oversized support messages', async () => {
    const empty = await request(app)
      .post(`/tickets/${ticket._id}/messages`)
      .send({ message: '   ' });
    const oversized = await request(app)
      .post(`/admin/tickets/${ticket._id}/messages`)
      .send({ message: 'x'.repeat(5001) });

    expect(empty.status).toBe(400);
    expect(oversized.status).toBe(400);
  });

  it('rejects invalid ticket creation fields', async () => {
    const response = await request(app)
      .post('/tickets')
      .send({ subject: { $ne: '' }, message: 'Initial message' });

    expect(response.status).toBe(400);
  });

  it('should create a new support ticket', async () => {
    const response = await request(app)
      .post('/tickets')
      .send({ subject: 'New Ticket', message: 'This is a test message.' });
    expect(response.status).toBe(201);
    expect(response.body.subject).toBe('New Ticket');
  });

  it('should get all tickets for a user', async () => {
    const response = await request(app).get('/tickets');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
  });

  it('should add a message to a ticket', async () => {
    const response = await request(app)
      .post(`/tickets/${ticket._id}/messages`)
      .send({ message: 'Another message' });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Another message');
  });

  it('should get all tickets for an admin', async () => {
    const response = await request(app).get('/admin/tickets');
    expect(response.status).toBe(200);
    expect(response.body.tickets.length).toBe(1);
  });

  it('rejects MongoDB operator objects in the admin ticket status filter', async () => {
    const response = await request(app)
      .get('/admin/tickets')
      .query({ status: { $ne: 'Closed' } });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid ticket status.');
  });

  it('rejects MongoDB operator objects when an admin updates ticket status', async () => {
    const response = await request(app)
      .put(`/admin/tickets/${ticket._id}/status`)
      .send({ status: { $ne: 'Closed' } });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid ticket status.');
    const unchangedTicket = await SupportTicket.findById(ticket._id);
    expect(unchangedTicket.status).toBe('Open');
  });

  it('should add an admin message to a ticket', async () => {
    const response = await request(app)
      .post(`/admin/tickets/${ticket._id}/messages`)
      .send({ message: 'Admin reply' });
    expect(response.status).toBe(201);
    expect(response.body.isFromAdmin).toBe(true);
  });


  it('allows customers to edit only their own support messages', async () => {
    const own = await TicketMessage.create({ ticketId: ticket._id, senderId: user._id, message: 'Original customer reply' });
    const response = await request(app).patch(`/tickets/${ticket._id}/messages/${own._id}`).send({ message: 'Updated customer reply' });
    expect(response.status).toBe(200);
    expect((await TicketMessage.findById(own._id)).message).toBe('Updated customer reply');
  });

  it('soft-deletes customer messages while retaining restricted original content', async () => {
    const own = await TicketMessage.create({ ticketId: ticket._id, senderId: user._id, message: 'Sensitive original text' });
    const response = await request(app).delete(`/tickets/${ticket._id}/messages/${own._id}`);
    expect(response.status).toBe(200);
    const deleted = await TicketMessage.findById(own._id).select('+originalMessage');
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.message).toBe('');
    expect(deleted.originalMessage).toBe('Sensitive original text');
  });

  it('prevents customers from editing administrator messages', async () => {
    const adminMessage = await TicketMessage.create({ ticketId: ticket._id, senderId: admin._id, message: 'Administrator reply', isFromAdmin: true });
    const response = await request(app).patch(`/tickets/${ticket._id}/messages/${adminMessage._id}`).send({ message: 'Tampered reply' });
    expect(response.status).toBe(404);
    expect((await TicketMessage.findById(adminMessage._id)).message).toBe('Administrator reply');
  });

  it('should update a ticket status', async () => {
    const response = await request(app)
      .put(`/admin/tickets/${ticket._id}/status`)
      .send({ status: 'Closed' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Closed');
  });
});
