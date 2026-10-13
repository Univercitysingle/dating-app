export const auth = {
  onAuthStateChanged: jest.fn(),
  currentUser: {
    uid: 'test-uid',
  },
};

export const getAuth = jest.fn(() => auth);

const app = {};
export default app;
