const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const supportTicketController = require('../controllers/supportTicketController');
const adminSupportTicketController = require('../controllers/adminSupportTicketController');
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

  // Admin routes
  app.get('/admin/tickets', adminAuthMiddleware, adminSupportTicketController.getAllTickets);
  app.get('/admin/tickets/:ticketId', adminAuthMiddleware, adminSupportTicketController.getTicketByIdForAdmin);
  app.post('/admin/tickets/:ticketId/messages', adminAuthMiddleware, adminSupportTicketController.addAdminMessageToTicket);
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

  it('should update a ticket status', async () => {
    const response = await request(app)
      .put(`/admin/tickets/${ticket._id}/status`)
      .send({ status: 'Closed' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Closed');
  });
});
