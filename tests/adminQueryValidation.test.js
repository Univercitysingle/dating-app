const express = require('express');
const request = require('supertest');
const { listReports } = require('../controllers/adminReportsController');
const { listUsers } = require('../controllers/adminUsersController');

const app = express();
app.get('/admin/reports', listReports);
app.get('/admin/users', listUsers);

describe('Admin query input validation', () => {
  it('rejects MongoDB operator objects in the report status filter', async () => {
    const response = await request(app)
      .get('/admin/reports')
      .query({ status: { $ne: 'pending_review' } });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid report status.');
  });

  it('rejects non-string report search values', async () => {
    const response = await request(app)
      .get('/admin/reports')
      .query({ search: { $ne: '' } });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Search must be a string/);
  });

  it('rejects MongoDB operator objects in the user role filter', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ role: { $ne: 'user' } });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid user role.');
  });

  it('rejects malformed admin pagination values', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ page: '1.5', limit: '1000' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid pagination/);
  });
});
