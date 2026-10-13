export default {
  get: jest.fn(() => Promise.resolve({})),
  post: jest.fn(() => Promise.resolve({})),
  put: jest.fn(() => Promise.resolve({ photos: [] })),
  delete: jest.fn(() => Promise.resolve({ photos: [] })),
};
