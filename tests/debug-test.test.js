// Debug test to identify server initialization issues
const request = require('supertest');

// Mock all external dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('ssh2');
jest.mock('ping');

// Mock server utils
jest.mock('../server/src/utils/security', () => ({
  validateBuildPath: jest.fn().mockImplementation(path => path),
  validateIPAddress: jest.fn().mockImplementation(ip => ip),
  validatePowerShellCommand: jest.fn().mockImplementation(cmd => cmd),
  validateBatchFilePath: jest.fn().mockImplementation(path => path)
}));

jest.mock('../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  security: jest.fn(),
  access: jest.fn()
}));

jest.mock('../server/src/utils/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true)
}));

jest.mock('../server/src/utils/crypto', () => ({
  initializeKey: jest.fn(),
  encryptionEnabled: false
}));

jest.mock('../server/src/utils/helpers', () => ({
  getClientIP: jest.fn().mockReturnValue('127.0.0.1'),
  createTextResult: jest.fn().mockImplementation(text => ({
    content: [{ type: 'text', text }]
  })),
  handleValidationError: jest.fn().mockImplementation((error, operation, logger, clientIP) => ({
    content: [{ type: 'text', text: `Validation error: ${error.message}` }]
  })),
  getNumericEnv: jest.fn().mockImplementation((envVar, defaultVal) => defaultVal),
  createDirCommand: jest.fn().mockImplementation(path => `mkdir "${path}"`)
}));

describe('Debug Server Test', () => {
  let app;
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.ENABLE_DANGEROUS_MODE = 'false';
    
    try {
      // Clear require cache
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
      console.log('Server loaded successfully');
    } catch (error) {
      console.error('Server loading error:', error);
      throw error;
    }
  });

  test('should respond to health check', async () => {
    try {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      console.log('Health check response:', response.body);
      expect(response.body.status).toBe('healthy');
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  });

  test('should handle basic MCP request', async () => {
    try {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });
      
      console.log('MCP response status:', response.status);
      console.log('MCP response body:', response.body);
      
      if (response.status !== 200) {
        console.error('Response error:', response.error);
        console.error('Response text:', response.text);
      }
      
      expect(response.status).toBe(200);
    } catch (error) {
      console.error('MCP request failed:', error);
      throw error;
    }
  });
});