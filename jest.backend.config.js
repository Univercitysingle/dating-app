module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/src/'],
};
