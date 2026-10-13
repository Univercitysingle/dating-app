module.exports = {
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: "test-user" }),
  }),
};
