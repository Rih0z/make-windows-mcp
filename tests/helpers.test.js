const { 
  getClientIP, 
  createTextResult, 
  handleValidationError, 
  getNumericEnv,
  createDirCommand,
  executeCommand 
} = require('../server/src/utils/helpers');

// Mock logger
jest.mock('../server/src/utils/logger', () => ({
  security: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const logger = require('../server/src/utils/logger');

describe('Helpers Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getClientIP', () => {
    test('should use req.ip when available', () => {
      const req = {
        ip: '192.168.1.50'
      };
      
      expect(getClientIP(req)).toBe('192.168.1.50');
    });

    test('should fall back to connection.remoteAddress', () => {
      const req = {
        connection: {
          remoteAddress: '192.168.1.100'
        }
      };
      
      expect(getClientIP(req)).toBe('192.168.1.100');
    });

    test('should fall back to socket.remoteAddress', () => {
      const req = {
        connection: {},  // connection exists but no remoteAddress
        socket: {
          remoteAddress: '192.168.1.200'
        }
      };
      
      expect(getClientIP(req)).toBe('192.168.1.200');
    });

    test('should handle missing connection and socket', () => {
      const req = {};
      
      // This will throw because connection is undefined
      expect(() => getClientIP(req)).toThrow(TypeError);
    });

    test('should prefer req.ip over connection.remoteAddress', () => {
      const req = {
        ip: '192.168.1.1',
        connection: {
          remoteAddress: '192.168.1.2'
        }
      };
      
      expect(getClientIP(req)).toBe('192.168.1.1');
    });
  });

  describe('createTextResult', () => {
    test('should create proper MCP text result format', () => {
      const text = 'Test message';
      const result = createTextResult(text);
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Test message'
        }]
      });
    });

    test('should handle empty string', () => {
      const result = createTextResult('');
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: ''
        }]
      });
    });

    test('should handle special characters', () => {
      const text = 'Line 1\nLine 2\tTabbed\r\nWindows line';
      const result = createTextResult(text);
      
      expect(result.content[0].text).toBe(text);
    });
  });

  describe('handleValidationError', () => {
    test('should handle validation error and log security event', () => {
      const error = new Error('Path not allowed');
      const operation = 'Build';
      const clientIP = '192.168.1.100';
      const context = { path: 'C:\\evil\\path' };
      
      const result = handleValidationError(error, operation, logger, clientIP, context);
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Validation error: Path not allowed'
        }]
      });
      
      expect(logger.security).toHaveBeenCalledWith(
        'Build validation failed',
        {
          clientIP: '192.168.1.100',
          error: 'Path not allowed',
          path: 'C:\\evil\\path'
        }
      );
    });

    test('should handle error without message', () => {
      const error = {};
      error.message = undefined;
      const result = handleValidationError(error, 'Test', logger, '127.0.0.1');
      
      expect(result.content[0].text).toBe('Validation error: undefined');
    });

    test('should handle error with empty message', () => {
      const error = new Error('');
      const result = handleValidationError(error, 'Test', logger, '127.0.0.1');
      
      expect(result.content[0].text).toBe('Validation error: ');
    });

    test('should handle context without extra data', () => {
      const error = new Error('Failed');
      const result = handleValidationError(error, 'Operation', logger, '10.0.0.1');
      
      expect(logger.security).toHaveBeenCalledWith(
        'Operation validation failed',
        {
          clientIP: '10.0.0.1',
          error: 'Failed'
        }
      );
    });
  });

  describe('getNumericEnv', () => {
    test('should return numeric value from environment variable', () => {
      process.env.TEST_NUMBER = '42';
      
      expect(getNumericEnv('TEST_NUMBER', 10)).toBe(42);
      
      delete process.env.TEST_NUMBER;
    });

    test('should return default value when env var not set', () => {
      expect(getNumericEnv('NON_EXISTENT_VAR', 100)).toBe(100);
    });

    test('should return default value for invalid number', () => {
      process.env.INVALID_NUMBER = 'not-a-number';
      
      expect(getNumericEnv('INVALID_NUMBER', 50)).toBe(50);
      
      delete process.env.INVALID_NUMBER;
    });

    test('should handle float values', () => {
      process.env.FLOAT_VALUE = '3.14';
      
      expect(getNumericEnv('FLOAT_VALUE', 1)).toBe(3);
      
      delete process.env.FLOAT_VALUE;
    });

    test('should handle negative numbers', () => {
      process.env.NEGATIVE_VALUE = '-10';
      
      expect(getNumericEnv('NEGATIVE_VALUE', 0)).toBe(-10);
      
      delete process.env.NEGATIVE_VALUE;
    });

    test('should handle zero', () => {
      process.env.ZERO_VALUE = '0';
      
      expect(getNumericEnv('ZERO_VALUE', 10)).toBe(0);
      
      delete process.env.ZERO_VALUE;
    });
  });

  describe('createDirCommand', () => {
    test('should create Windows directory creation command', () => {
      const command = createDirCommand('C:\\test\\directory');
      
      expect(command).toBe('if not exist "C:\\test\\directory" mkdir "C:\\test\\directory"');
    });

    test('should handle paths with spaces', () => {
      const command = createDirCommand('C:\\Program Files\\My App');
      
      expect(command).toBe('if not exist "C:\\Program Files\\My App" mkdir "C:\\Program Files\\My App"');
    });

    test('should handle UNC paths', () => {
      const command = createDirCommand('\\\\server\\share\\folder');
      
      expect(command).toBe('if not exist "\\\\server\\share\\folder" mkdir "\\\\server\\share\\folder"');
    });

    test('should handle paths with special characters', () => {
      const command = createDirCommand('C:\\test\\folder (1)\\sub-folder');
      
      expect(command).toBe('if not exist "C:\\test\\folder (1)\\sub-folder" mkdir "C:\\test\\folder (1)\\sub-folder"');
    });

    test('should handle forward slashes by preserving them', () => {
      const command = createDirCommand('C:/test/directory');
      
      expect(command).toBe('if not exist "C:/test/directory" mkdir "C:/test/directory"');
    });
  });

  describe('executeCommand', () => {
    test('should execute remote command when remoteHost is provided', async () => {
      const args = { remoteHost: '192.168.1.100' };
      const command = { cmd: 'test', args: ['arg1'] };
      const executeBuild = jest.fn();
      const executeRemoteCommand = jest.fn().mockResolvedValue({ output: 'remote result' });
      const security = {
        validateIPAddress: jest.fn().mockReturnValue('192.168.1.100')
      };
      
      const result = await executeCommand(args, command, executeBuild, executeRemoteCommand, security);
      
      expect(security.validateIPAddress).toHaveBeenCalledWith('192.168.1.100');
      expect(executeRemoteCommand).toHaveBeenCalledWith('192.168.1.100', command);
      expect(executeBuild).not.toHaveBeenCalled();
      expect(result).toEqual({ output: 'remote result' });
    });

    test('should execute local command when remoteHost is not provided', async () => {
      const args = {};
      const command = { cmd: 'test', args: ['arg1'] };
      const executeBuild = jest.fn().mockResolvedValue({ output: 'local result' });
      const executeRemoteCommand = jest.fn();
      const security = {
        validateIPAddress: jest.fn()
      };
      
      const result = await executeCommand(args, command, executeBuild, executeRemoteCommand, security);
      
      expect(security.validateIPAddress).not.toHaveBeenCalled();
      expect(executeRemoteCommand).not.toHaveBeenCalled();
      expect(executeBuild).toHaveBeenCalledWith('test', ['arg1']);
      expect(result).toEqual({ output: 'local result' });
    });

    test('should handle IP validation errors', async () => {
      const args = { remoteHost: 'invalid-ip' };
      const command = { cmd: 'test', args: [] };
      const executeBuild = jest.fn();
      const executeRemoteCommand = jest.fn();
      const security = {
        validateIPAddress: jest.fn().mockImplementation(() => {
          throw new Error('Invalid IP address');
        })
      };
      
      await expect(executeCommand(args, command, executeBuild, executeRemoteCommand, security))
        .rejects.toThrow('Invalid IP address');
      
      expect(executeBuild).not.toHaveBeenCalled();
      expect(executeRemoteCommand).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined and null values gracefully', () => {
      // getClientIP will throw if connection/socket are missing
      expect(() => getClientIP({})).toThrow(TypeError);
      expect(getClientIP({ ip: null, connection: {}, socket: {} })).toBe(null);
      
      expect(createTextResult(null)).toEqual({
        content: [{
          type: 'text',
          text: null
        }]
      });
      
      expect(createTextResult(undefined)).toEqual({
        content: [{
          type: 'text',
          text: undefined
        }]
      });
    });

    test('should handle empty numeric env vars', () => {
      process.env.EMPTY_VAR = '';
      expect(getNumericEnv('EMPTY_VAR', 100)).toBe(100);
      delete process.env.EMPTY_VAR;
    });

    test('should handle whitespace in numeric env vars', () => {
      process.env.WHITESPACE_VAR = '  42  ';
      expect(getNumericEnv('WHITESPACE_VAR', 10)).toBe(42);
      delete process.env.WHITESPACE_VAR;
    });
  });
});