// Jest setup file
process.env.NODE_ENV = 'test';

// Suppress console output during tests unless explicitly testing logging
if (process.env.JEST_SILENT !== 'false') {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Set default test environment variables
process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\,C:\\build\\';
process.env.LOG_LEVEL = 'error';
process.env.COMMAND_TIMEOUT = '30000';
process.env.SSH_TIMEOUT = '5000';

// Setup child_process mock globally
jest.mock('child_process', () => {
  const { createSpawnMock } = require('./tests/helpers/mock-process');
  return {
    spawn: createSpawnMock()
  };
});

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
  
  // Reset rate limiter between tests
  try {
    const rateLimiter = require('./server/src/utils/rate-limiter');
    if (rateLimiter && rateLimiter.clear) {
      rateLimiter.clear();
    }
  } catch (e) {
    // Ignore if module not found
  }
});