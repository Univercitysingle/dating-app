const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const httpMocks = require('node-mocks-http');
const { getGeolocationForCurrentUser } = require('../controllers/usersController');
const ipinfoService = require('../services/ipinfoService');

jest.mock('../services/ipinfoService');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Geolocation Controller', () => {
  const mockLog = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  it('should return geolocation data for a public IP', async () => {
    const req = httpMocks.createRequest({
      method: 'GET',
      url: '/api/geolocation',
      ip: '8.8.8.8',
      log: mockLog,
    });
    const res = httpMocks.createResponse();

    const mockGeo = {
      ip: '8.8.8.8',
      city: 'Mountain View',
      country: 'US',
    };
    ipinfoService.getGeolocation.mockResolvedValue(mockGeo);

    await getGeolocationForCurrentUser(req, res);

    const responseData = res._getJSONData();
    expect(res.statusCode).toBe(200);
    expect(responseData).toEqual(mockGeo);
  });

  it('should return "Private Network" for a private IP', async () => {
    const req = httpMocks.createRequest({
      method: 'GET',
      url: '/api/geolocation',
      ip: '127.0.0.1',
      log: mockLog,
    });
    const res = httpMocks.createResponse();

    await getGeolocationForCurrentUser(req, res);

    const responseData = res._getJSONData();
    expect(res.statusCode).toBe(200);
    expect(responseData).toEqual({
      ip: '127.0.0.1',
      city: 'Private Network',
      country: 'N/A',
    });
  });

  it('should handle geolocation service failure gracefully', async () => {
    const req = httpMocks.createRequest({
        method: 'GET',
        url: '/api/geolocation',
        ip: '8.8.8.8',
        log: mockLog,
    });
    const res = httpMocks.createResponse();

    ipinfoService.getGeolocation.mockResolvedValue(null);

    await getGeolocationForCurrentUser(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Geolocation data not found.' });
  });
});
