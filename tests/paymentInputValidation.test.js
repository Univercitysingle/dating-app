const express = require('express');
const request = require('supertest');
const purchaseController = require('../controllers/purchaseController');
const subscriptionController = require('../controllers/subscriptionController');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { uid: 'test-user' };
  req.log = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  next();
});

app.post('/purchase', purchaseController.createPurchase);
app.get('/purchase/:id', purchaseController.getPurchaseStatus);
app.post('/subscription', subscriptionController.createSubscriptionPayment);
app.get('/subscription/:id', subscriptionController.getSubscriptionStatus);

describe('Payment request validation', () => {
  it('rejects object-valued store item identifiers', async () => {
    const response = await request(app).post('/purchase').send({ itemId: { $ne: '' } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid item ID.');
  });

  it('rejects malformed purchase IDs before database lookup', async () => {
    const response = await request(app).get('/purchase/not-an-object-id');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid purchase ID.');
  });

  it('rejects unsupported subscription plans', async () => {
    const response = await request(app).post('/subscription').send({ plan: { $ne: '' } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid subscription plan.');
  });

  it('rejects currencies outside the configured LKR payment catalog', async () => {
    const response = await request(app).post('/subscription').send({ plan: 'monthly', currency: 'USD' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported payment currency.');
  });

  it('rejects malformed subscription IDs before database lookup', async () => {
    const response = await request(app).get('/subscription/not-an-object-id');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid subscription ID.');
  });
});
