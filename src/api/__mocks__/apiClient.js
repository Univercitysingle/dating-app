export default {
  delete: jest.fn(() => Promise.resolve({ photos: [] })),
  put: jest.fn(() => Promise.resolve({ photos: [] })),
};
