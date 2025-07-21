/**
 * Simple Helpers Test - Actual Functions Coverage
 */

const helpers = require('../../server/src/utils/helpers');

describe('Helpers Simple Coverage', () => {
  describe('getClientIP', () => {
    test('should extract IP from req.ip', () => {
      const req = { ip: '192.168.1.1' };
      expect(helpers.getClientIP(req)).toBe('192.168.1.1');
    });

    test('should extract IP from connection.remoteAddress', () => {
      const req = { connection: { remoteAddress: '192.168.1.2' } };
      expect(helpers.getClientIP(req)).toBe('192.168.1.2');
    });

    test('should extract IP from socket.remoteAddress', () => {
      const req = { connection: {}, socket: { remoteAddress: '192.168.1.3' } };
      expect(helpers.getClientIP(req)).toBe('192.168.1.3');
    });

    test('should return undefined if no IP found', () => {
      const req = { connection: {}, socket: {} };
      expect(helpers.getClientIP(req)).toBeUndefined();
    });
  });

  describe('createTextResult', () => {
    test('should create MCP text result format', () => {
      const result = helpers.createTextResult('test message');
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'test message'
        }]
      });
    });

    test('should handle empty message', () => {
      const result = helpers.createTextResult('');
      expect(result.content[0].text).toBe('');
    });
  });

  describe('handleValidationError', () => {
    test('should handle validation errors with logger', () => {
      const mockLogger = { security: jest.fn() };
      const error = new Error('Test validation error');
      const result = helpers.handleValidationError(error, 'test_operation', mockLogger, '192.168.1.1');
      
      expect(mockLogger.security).toHaveBeenCalledWith(
        'test_operation validation failed',
        expect.objectContaining({
          clientIP: '192.168.1.1',
          error: 'Test validation error'
        })
      );
      expect(result.content[0].text).toContain('Validation error: Test validation error');
    });

    test('should handle validation errors with context', () => {
      const mockLogger = { security: jest.fn() };
      const error = new Error('Context test error');
      const context = { userId: '123', action: 'build' };
      
      helpers.handleValidationError(error, 'build_operation', mockLogger, '192.168.1.1', context);
      
      expect(mockLogger.security).toHaveBeenCalledWith(
        'build_operation validation failed',
        expect.objectContaining({
          clientIP: '192.168.1.1',
          error: 'Context test error',
          userId: '123',
          action: 'build'
        })
      );
    });
  });

  describe('getNumericEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should return numeric value from environment', () => {
      process.env.TEST_VAR = '42';
      expect(helpers.getNumericEnv('TEST_VAR', 10)).toBe(42);
    });

    test('should return default value when env var not set', () => {
      delete process.env.TEST_VAR;
      expect(helpers.getNumericEnv('TEST_VAR', 10)).toBe(10);
    });

    test('should return default value for invalid number', () => {
      process.env.TEST_VAR = 'not-a-number';
      expect(helpers.getNumericEnv('TEST_VAR', 10)).toBe(10);
    });

    test('should handle zero value', () => {
      process.env.TEST_VAR = '0';
      expect(helpers.getNumericEnv('TEST_VAR', 10)).toBe(0);
    });

    test('should handle negative numbers', () => {
      process.env.TEST_VAR = '-5';
      expect(helpers.getNumericEnv('TEST_VAR', 10)).toBe(-5);
    });
  });

  describe('createDirCommand', () => {
    test('should create Windows directory creation command', () => {
      const command = helpers.createDirCommand('C:\\test\\path');
      expect(command).toBe('if not exist "C:\\test\\path" mkdir "C:\\test\\path"');
    });

    test('should handle paths with spaces', () => {
      const command = helpers.createDirCommand('C:\\path with spaces');
      expect(command).toBe('if not exist "C:\\path with spaces" mkdir "C:\\path with spaces"');
    });

    test('should handle forward slashes', () => {
      const command = helpers.createDirCommand('C:/forward/slash/path');
      expect(command).toBe('if not exist "C:/forward/slash/path" mkdir "C:/forward/slash/path"');
    });
  });

  describe('executeCommand', () => {
    test('should call executeRemoteCommand when remoteHost provided', async () => {
      const mockExecuteBuild = jest.fn();
      const mockExecuteRemoteCommand = jest.fn().mockResolvedValue('remote result');
      const mockSecurity = {
        validateIPAddress: jest.fn().mockReturnValue('validated-ip')
      };
      
      const args = { remoteHost: '192.168.1.1' };
      const command = { cmd: 'test', args: [] };
      
      const result = await helpers.executeCommand(
        args, 
        command, 
        mockExecuteBuild, 
        mockExecuteRemoteCommand, 
        mockSecurity
      );
      
      expect(mockSecurity.validateIPAddress).toHaveBeenCalledWith('192.168.1.1');
      expect(mockExecuteRemoteCommand).toHaveBeenCalledWith('validated-ip', command);
      expect(mockExecuteBuild).not.toHaveBeenCalled();
      expect(result).toBe('remote result');
    });

    test('should call executeBuild when no remoteHost provided', async () => {
      const mockExecuteBuild = jest.fn().mockResolvedValue('local result');
      const mockExecuteRemoteCommand = jest.fn();
      const mockSecurity = {
        validateIPAddress: jest.fn()
      };
      
      const args = {};
      const command = { cmd: 'test', args: ['arg1', 'arg2'] };
      
      const result = await helpers.executeCommand(
        args, 
        command, 
        mockExecuteBuild, 
        mockExecuteRemoteCommand, 
        mockSecurity
      );
      
      expect(mockSecurity.validateIPAddress).not.toHaveBeenCalled();
      expect(mockExecuteRemoteCommand).not.toHaveBeenCalled();
      expect(mockExecuteBuild).toHaveBeenCalledWith('test', ['arg1', 'arg2']);
      expect(result).toBe('local result');
    });
  });
});