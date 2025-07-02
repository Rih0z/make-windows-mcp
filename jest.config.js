module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'server/src/**/*.js',
    'client/src/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};