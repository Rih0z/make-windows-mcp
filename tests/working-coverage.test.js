// Working coverage test to improve test coverage without server startup issues
const security = require('../server/src/utils/security');
const helpers = require('../server/src/utils/helpers');
const logger = require('../server/src/utils/logger');
const crypto = require('../server/src/utils/crypto');
const rateLimiter = require('../server/src/utils/rate-limiter');

describe('Working Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Utils Coverage', () => {
    test('should validate batch file paths correctly', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\temp\\';
      
      // Valid paths
      expect(() => security.validateBatchFilePath('C:\\builds\\test.bat')).not.toThrow();
      expect(() => security.validateBatchFilePath('C:\\temp\\script.cmd')).not.toThrow();
      
      // Invalid paths
      expect(() => security.validateBatchFilePath('C:\\system32\\evil.bat')).toThrow();
      expect(() => security.validateBatchFilePath('C:\\builds\\..\\..\\evil.bat')).toThrow();
      expect(() => security.validateBatchFilePath('C:\\builds\\test.exe')).toThrow();
    });

    test('should validate PowerShell commands in different modes', () => {
      // Test allowed commands
      expect(() => security.validatePowerShellCommand('echo hello')).not.toThrow();
      expect(() => security.validatePowerShellCommand('Get-Process')).not.toThrow();
      
      // Test dangerous commands
      expect(() => security.validatePowerShellCommand('rm -rf /')).toThrow();
      expect(() => security.validatePowerShellCommand('del /f /s /q *')).toThrow();
    });

    test('should validate IP addresses', () => {
      expect(() => security.validateIPAddress('192.168.1.100')).not.toThrow();
      expect(() => security.validateIPAddress('192.168.1.1')).not.toThrow();
      
      expect(() => security.validateIPAddress('999.999.999.999')).toThrow();
      expect(() => security.validateIPAddress('not-an-ip')).toThrow();
    });

    test('should validate build paths', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\;D:\\projects\\';
      
      expect(() => security.validateBuildPath('C:\\builds\\myapp')).not.toThrow();
      expect(() => security.validateBuildPath('D:\\projects\\test')).not.toThrow();
      
      expect(() => security.validateBuildPath('C:\\system32')).toThrow();
      expect(() => security.validateBuildPath('C:\\builds\\..\\..\\system32')).toThrow();
    });
  });

  describe('Helper Functions Coverage', () => {
    test('should create text results', () => {
      const result = helpers.createTextResult('test message');
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'test message'
        }]
      });
    });

    test('should get client IP from various sources', () => {
      const req1 = { ip: '192.168.1.1' };
      expect(helpers.getClientIP(req1)).toBe('192.168.1.1');

      const req2 = { connection: { remoteAddress: '192.168.1.2' } };
      expect(helpers.getClientIP(req2)).toBe('192.168.1.2');

      const req3 = { socket: { remoteAddress: '192.168.1.3' } };
      expect(helpers.getClientIP(req3)).toBe('192.168.1.3');
    });

    test('should handle validation errors', () => {
      const mockLogger = {
        security: jest.fn()
      };
      
      const error = new Error('Test error');
      const result = helpers.handleValidationError(error, 'test operation', mockLogger, '127.0.0.1');
      
      expect(result.content[0].text).toContain('Validation error: Test error');
      expect(mockLogger.security).toHaveBeenCalled();
    });

    test('should get numeric environment variables', () => {
      process.env.TEST_NUM = '123';
      expect(helpers.getNumericEnv('TEST_NUM', 100)).toBe(123);
      expect(helpers.getNumericEnv('NONEXISTENT', 100)).toBe(100);
      
      process.env.TEST_INVALID = 'not-a-number';
      expect(helpers.getNumericEnv('TEST_INVALID', 100)).toBe(100);
    });

    test('should create directory commands', () => {
      const cmd = helpers.createDirCommand('C:\\test\\path');
      expect(cmd).toContain('mkdir');
      expect(cmd).toContain('C:\\test\\path');
    });
  });

  describe('Logger Coverage', () => {
    test('should log different levels', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      logger.info('test info');
      logger.error('test error');
      logger.warn('test warning');
      logger.security('test security event');

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test('should handle access logging', () => {
      const mockReq = {
        ip: '127.0.0.1',
        method: 'POST',
        originalUrl: '/mcp',
        get: jest.fn().mockReturnValue('Test-Agent')
      };
      
      const mockRes = {
        statusCode: 200
      };

      expect(() => {
        logger.access(mockReq, mockRes, 100);
      }).not.toThrow();
    });
  });

  describe('Crypto Coverage', () => {
    test('should initialize encryption key', () => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      expect(() => {
        crypto.initializeKey();
      }).not.toThrow();
    });

    test('should handle missing encryption key', () => {
      const oldToken = process.env.MCP_AUTH_TOKEN;
      const oldEncKey = process.env.ENCRYPTION_KEY;
      
      delete process.env.MCP_AUTH_TOKEN;
      delete process.env.ENCRYPTION_KEY;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      crypto.initializeKey();
      expect(crypto.encryptionEnabled).toBe(false);
      
      consoleSpy.mockRestore();
      process.env.MCP_AUTH_TOKEN = oldToken;
      if (oldEncKey) process.env.ENCRYPTION_KEY = oldEncKey;
    });
  });

  describe('Rate Limiter Coverage', () => {
    test('should check rate limits', () => {
      const result = rateLimiter.checkRateLimit('127.0.0.1');
      expect(typeof result).toBe('boolean');
    });

    test('should handle dangerous mode', () => {
      const oldMode = process.env.ENABLE_DANGEROUS_MODE;
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      
      const result = rateLimiter.checkRateLimit('127.0.0.1');
      expect(result).toBe(true); // Should always return true in dangerous mode
      
      process.env.ENABLE_DANGEROUS_MODE = oldMode;
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed paths', () => {
      expect(() => security.validateBuildPath(null)).toThrow();
      expect(() => security.validateBuildPath('')).toThrow();
      expect(() => security.validateBuildPath(123)).toThrow();
    });

    test('should handle malformed IP addresses', () => {
      expect(() => security.validateIPAddress(null)).toThrow();
      expect(() => security.validateIPAddress('')).toThrow();
      expect(() => security.validateIPAddress('192.168.1')).toThrow();
    });

    test('should handle long commands', () => {
      const longCommand = 'a'.repeat(3000);
      expect(() => security.validatePowerShellCommand(longCommand)).toThrow();
    });

    test('should handle directory traversal attempts', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\';
      
      expect(() => security.validateBuildPath('C:\\builds\\..\\system32')).toThrow();
      expect(() => security.validateBuildPath('C:\\builds\\..\\..\\windows')).toThrow();
      expect(() => security.validateBuildPath('C:\\builds\\subdir\\..\\..\\system32')).toThrow();
    });
  });

  describe('Environment Variable Handling', () => {
    test('should handle missing environment variables', () => {
      const oldPaths = process.env.ALLOWED_BUILD_PATHS;
      delete process.env.ALLOWED_BUILD_PATHS;
      
      expect(() => security.validateBuildPath('C:\\test')).toThrow();
      
      if (oldPaths) process.env.ALLOWED_BUILD_PATHS = oldPaths;
    });

    test('should handle malformed environment variables', () => {
      process.env.ALLOWED_BUILD_PATHS = ';;;';
      
      expect(() => security.validateBuildPath('C:\\test')).toThrow();
    });
  });
});