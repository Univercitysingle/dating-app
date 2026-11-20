module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/src/', 'tests/sidebar.spec.js', 'tests/firebase-rules.test.js'],
  testTimeout: 60000,
};

