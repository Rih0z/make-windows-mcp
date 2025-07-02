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
process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\';
process.env.LOG_LEVEL = 'error';

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});