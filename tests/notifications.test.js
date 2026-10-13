const httpMocks = require('node-mocks-http');
const { getNotifications } = require('../controllers/notificationController');
const Notification = require('../models/Notification');

jest.mock('../models/Notification');

describe('Notification Controller', () => {
  let req, res;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should fetch pending notifications for the current user', async () => {
      req.user = { uid: 'user1' };
      const notifications = [{ recipientUid: 'user1', senderUid: 'user2', type: 'like' }];
      Notification.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(notifications),
      });

      await getNotifications(req, res);

      expect(Notification.find).toHaveBeenCalledWith({ recipientUid: 'user1', status: 'pending' });
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual(notifications);
    });
  });
});
