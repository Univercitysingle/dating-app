const httpMocks = require('node-mocks-http');
const { like, pass, superLike, undoSwipe } = require('../controllers/swipeController');
const Match = require('../models/Match');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getIO } = require('../services/socket');

jest.mock('../models/Match');
jest.mock('../models/User');
jest.mock('../models/Notification');
jest.mock('../services/socket', () => ({
    getIO: jest.fn(),
}));

describe('Swipe Controller', () => {
    let req, res, mockIO;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    User.findOneAndUpdate.mockClear();
    mockIO = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
    };
    getIO.mockReturnValue(mockIO);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('like', () => {
    it('should create a new match and a like notification', async () => {
      req.user = { uid: 'user1' };
      req.body = { userId: 'user2' };

      Match.findOne.mockResolvedValue(null);
      const saveMock = jest.fn().mockResolvedValue({});
      const mockMatchInstance = {
        likedBy: [],
        save: saveMock,
      };
      Match.mockImplementation(() => mockMatchInstance);
      Notification.create.mockResolvedValue({});

      await like(req, res);

      expect(Notification.create).toHaveBeenCalledWith({
        recipientUid: 'user2',
        senderUid: 'user1',
        type: 'like',
      });
      expect(getIO().to).toHaveBeenCalledWith('user2');
      expect(mockIO.emit).toHaveBeenCalledWith('new_notification', expect.any(Object));
      expect(res.statusCode).toBe(200);
    });

    it('should create a match notification on the second like', async () => {
        req.user = { uid: 'user1' };
        req.body = { userId: 'user2' };

        const existingMatch = {
          user1Uid: 'user1',
          user2Uid: 'user2',
          likedBy: ['user2'],
          save: jest.fn().mockResolvedValue({}),
        };
        existingMatch.likedBy.push = jest.fn().mockImplementation(function() {
            Array.prototype.push.apply(this, arguments);
        });

        Match.findOne.mockResolvedValue(existingMatch);
        Notification.create.mockResolvedValue({});
        Notification.findOneAndDelete.mockResolvedValue({});

        await like(req, res);

        expect(Notification.create).toHaveBeenCalledWith({
            recipientUid: 'user2',
            senderUid: 'user1',
            type: 'match',
        });
        expect(getIO().to).toHaveBeenCalledWith('user2');
        expect(mockIO.emit).toHaveBeenCalledWith('new_notification', expect.any(Object));
        expect(Notification.findOneAndDelete).toHaveBeenCalledWith({
            recipientUid: 'user1',
            senderUid: 'user2',
            type: { $in: ['like', 'superlike'] },
        });
        expect(res.statusCode).toBe(200);
      });
  });

  describe('pass', () => {
    it('should delete a like notification on pass', async () => {
        req.user = { uid: 'user1' };
        req.body = { userId: 'user2' };

        Match.findOne.mockResolvedValue(null);
        const saveMock = jest.fn().mockResolvedValue({});
        const mockMatchInstance = {
            likedBy: [],
            save: saveMock,
          };
        Match.mockImplementation(() => mockMatchInstance);
        Notification.findOneAndDelete.mockResolvedValue({});

        await pass(req, res);

        expect(Notification.findOneAndDelete).toHaveBeenCalledWith({
            recipientUid: 'user1',
            senderUid: 'user2',
            type: { $in: ['like', 'superlike'] },
        });
        expect(res.statusCode).toBe(200);
    });
  });

  describe('superLike', () => {
    it('should return 400 if no super likes are remaining', async () => {
        req.user = { uid: 'user1' };
        req.body = { userId: 'user2' };
        User.findOne.mockResolvedValue({ uid: 'user1', superLikes: { count: 0 } });

        await superLike(req, res);

        expect(res.statusCode).toBe(400);
    });

    it('should record a super like and decrement the count', async () => {
        req.user = { uid: 'user1' };
        req.body = { userId: 'user2' };
        const user = { uid: 'user1', superLikes: { count: 1 }, save: jest.fn().mockResolvedValue({}) };
        User.findOne.mockResolvedValue(user);

        const saveMock = jest.fn().mockResolvedValue({});
        const mockMatchInstance = {
            likedBy: [],
            save: saveMock,
          };
        Match.mockImplementation(() => mockMatchInstance);
        Match.findOne.mockResolvedValue(null);
        Notification.create.mockResolvedValue({});

        await superLike(req, res);

        expect(user.superLikes.count).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(saveMock).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });
  });

  describe('undoSwipe', () => {
    it('should return 404 if there is no swipe to undo', async () => {
        req.user = { uid: 'user1' };
        User.findOne.mockResolvedValue({ uid: 'user1', lastSwipe: null, undoSwipes: { count: 1 } });

        await undoSwipe(req, res);

        expect(res.statusCode).toBe(404);
    });

    it('should successfully undo a like', async () => {
        const user = {
            uid: 'user1',
            lastSwipe: { action: 'like', matchId: 'match1', targetUserId: 'user2' },
            undoSwipes: { count: 1 },
            save: jest.fn().mockResolvedValue({})
        };
        const undoneUser = { uid: 'user2' };
        User.findOne.mockImplementation((query) => {
            if (query.uid === 'user1') {
              return Promise.resolve(user);
            }
            if (query.uid === 'user2') {
              return { lean: () => Promise.resolve(undoneUser) };
            }
            return Promise.resolve(null);
          });


        const match = {
            _id: 'match1',
            likedBy: ['user1'],
            save: jest.fn().mockResolvedValue({})
        };
        Match.findById.mockResolvedValue(match);
        req.user = { uid: 'user1' };

        await undoSwipe(req, res);

        expect(match.likedBy.length).toBe(0);
        expect(match.status).toBe('pending');
        expect(user.undoSwipes.count).toBe(0);
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(match.save).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });
  });
});
