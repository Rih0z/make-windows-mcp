/**
 * Helpers and Logger - 100% Coverage Test Suite
 * Comprehensive testing for helper functions and logging utilities
 */

const fs = require('fs');
const path = require('path');

// Mock file system
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 1000 }),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    appendFile: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn()
  },
  constants: {
    F_OK: 0
  }
}));

describe('Helpers and Logger - 100% Coverage', () => {
  let helpers, logger;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    delete require.cache[require.resolve('../../server/src/utils/helpers')];
    delete require.cache[require.resolve('../../server/src/utils/logger')];
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock Date for consistent testing
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-01-01T00:00:00.000Z');
    
    helpers = require('../../server/src/utils/helpers');
    logger = require('../../server/src/utils/logger');
  });

  afterEach(() => {
    Date.prototype.toISOString.mockRestore();
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });

  describe('Helpers - executeCommand', () => {
    test('should execute command successfully', async () => {
      const mockSpawn = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => mockSpawn)
      }));

      // Simulate successful execution
      mockSpawn.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0); // Exit code 0 = success
        }
      });

      mockSpawn.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Command output'));
        }
      });

      const result = await helpers.executeCommand('echo test', [], {});
      
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Command output');
    });

    test('should handle command failure', async () => {
      const mockSpawn = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => mockSpawn)
      }));

      mockSpawn.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(1); // Exit code 1 = failure
        }
      });

      mockSpawn.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Error output'));
        }
      });

      const result = await helpers.executeCommand('failing-command', [], {});
      
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Error output');
    });

    test('should handle spawn errors', async () => {
      const mockSpawn = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => mockSpawn)
      }));

      mockSpawn.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Command not found'));
        }
      });

      const result = await helpers.executeCommand('nonexistent-command', [], {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    test('should handle timeout', async () => {
      const mockSpawn = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => mockSpawn)
      }));

      // Never call the close callback to simulate hanging
      mockSpawn.on.mockImplementation(() => {});

      const result = await helpers.executeCommand('hanging-command', [], { timeout: 100 });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(mockSpawn.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('Helpers - sanitizeOutput', () => {
    test('should remove ANSI escape codes', () => {
      const input = '\u001b[31mRed text\u001b[0m';
      const result = helpers.sanitizeOutput(input);
      expect(result).toBe('Red text');
    });

    test('should remove control characters', () => {
      const input = 'Text\x00with\x01control\x02chars';
      const result = helpers.sanitizeOutput(input);
      expect(result).toBe('Textwithcontrolchars');
    });

    test('should handle empty string', () => {
      const result = helpers.sanitizeOutput('');
      expect(result).toBe('');
    });

    test('should handle null input', () => {
      const result = helpers.sanitizeOutput(null);
      expect(result).toBe('');
    });

    test('should handle undefined input', () => {
      const result = helpers.sanitizeOutput(undefined);
      expect(result).toBe('');
    });

    test('should preserve normal text', () => {
      const input = 'Normal text with spaces and punctuation!';
      const result = helpers.sanitizeOutput(input);
      expect(result).toBe(input);
    });
  });

  describe('Helpers - validateEnvironment', () => {
    test('should validate required environment variables', () => {
      process.env.REQUIRED_VAR = 'value';
      
      const result = helpers.validateEnvironment(['REQUIRED_VAR']);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    test('should detect missing environment variables', () => {
      delete process.env.MISSING_VAR;
      
      const result = helpers.validateEnvironment(['MISSING_VAR']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['MISSING_VAR']);
    });

    test('should handle empty array', () => {
      const result = helpers.validateEnvironment([]);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    test('should handle mixed valid and invalid variables', () => {
      process.env.VALID_VAR = 'value';
      delete process.env.INVALID_VAR;
      
      const result = helpers.validateEnvironment(['VALID_VAR', 'INVALID_VAR']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['INVALID_VAR']);
    });
  });

  describe('Helpers - formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(helpers.formatBytes(0)).toBe('0 Bytes');
      expect(helpers.formatBytes(1024)).toBe('1 KB');
      expect(helpers.formatBytes(1048576)).toBe('1 MB');
      expect(helpers.formatBytes(1073741824)).toBe('1 GB');
    });

    test('should handle decimal places', () => {
      expect(helpers.formatBytes(1536)).toBe('1.5 KB');
      expect(helpers.formatBytes(1536, 0)).toBe('2 KB');
    });

    test('should handle negative numbers', () => {
      expect(helpers.formatBytes(-1024)).toBe('-1 KB');
    });
  });

  describe('Helpers - parseJSON', () => {
    test('should parse valid JSON', () => {
      const result = helpers.parseJSON('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    test('should return null for invalid JSON', () => {
      const result = helpers.parseJSON('invalid json');
      expect(result).toBeNull();
    });

    test('should return default value for invalid JSON', () => {
      const result = helpers.parseJSON('invalid json', { default: 'value' });
      expect(result).toEqual({ default: 'value' });
    });

    test('should handle empty string', () => {
      const result = helpers.parseJSON('');
      expect(result).toBeNull();
    });
  });

  describe('Helpers - createErrorResponse', () => {
    test('should create error response with message', () => {
      const result = helpers.createErrorResponse('Test error');
      expect(result).toEqual({
        success: false,
        error: 'Test error',
        timestamp: expect.any(String)
      });
    });

    test('should create error response with details', () => {
      const result = helpers.createErrorResponse('Test error', { code: 'E001' });
      expect(result).toEqual({
        success: false,
        error: 'Test error',
        details: { code: 'E001' },
        timestamp: expect.any(String)
      });
    });
  });

  describe('Helpers - createSuccessResponse', () => {
    test('should create success response with data', () => {
      const result = helpers.createSuccessResponse({ result: 'test' });
      expect(result).toEqual({
        success: true,
        data: { result: 'test' },
        timestamp: expect.any(String)
      });
    });

    test('should create success response without data', () => {
      const result = helpers.createSuccessResponse();
      expect(result).toEqual({
        success: true,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Logger - Basic Logging', () => {
    beforeEach(() => {
      fs.promises.mkdir.mockResolvedValue();
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
    });

    test('should log info messages', async () => {
      await logger.info('Test info message');
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('INFO'),
        'utf8'
      );
    });

    test('should log error messages', async () => {
      await logger.error('Test error message');
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.stringContaining('ERROR'),
        'utf8'
      );
    });

    test('should log warning messages', async () => {
      await logger.warn('Test warning message');
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });

    test('should log debug messages', async () => {
      await logger.debug('Test debug message');
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('DEBUG'),
        'utf8'
      );
    });

    test('should log security events', async () => {
      await logger.security('Security event');
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('security.log'),
        expect.stringContaining('SECURITY'),
        'utf8'
      );
    });

    test('should log access events', async () => {
      await logger.access('127.0.0.1', 'GET', '/api/test', 200);
      
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        expect.stringContaining('127.0.0.1'),
        'utf8'
      );
    });
  });

  describe('Logger - Directory Creation', () => {
    test('should create logs directory if it does not exist', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      fs.promises.mkdir.mockResolvedValue();
      
      await logger.info('Test message');
      
      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    test('should not create directory if it exists', async () => {
      fs.promises.access.mockResolvedValue();
      
      await logger.info('Test message');
      
      expect(fs.promises.mkdir).not.toHaveBeenCalled();
    });

    test('should handle directory creation errors', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      fs.promises.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      await logger.info('Test message');
      
      // Should still try to log to console
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Logger - File Writing', () => {
    test('should handle file write errors gracefully', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockRejectedValue(new Error('Disk full'));
      
      await logger.info('Test message');
      
      // Should fallback to console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test message'));
    });

    test('should format log entries correctly', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
      
      await logger.info('Test message', { extra: 'data' });
      
      const logCall = fs.promises.appendFile.mock.calls[0];
      const logEntry = logCall[1];
      
      expect(logEntry).toContain('2023-01-01T00:00:00.000Z');
      expect(logEntry).toContain('INFO');
      expect(logEntry).toContain('Test message');
      expect(logEntry).toContain('{"extra":"data"}');
    });
  });

  describe('Logger - Log Rotation', () => {
    test('should rotate logs when file is too large', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.stat.mockResolvedValue({ size: 10 * 1024 * 1024 + 1 }); // > 10MB
      fs.promises.readdir.mockResolvedValue(['app.log.1', 'app.log.2']);
      fs.promises.unlink.mockResolvedValue();
      
      await logger.info('Test message');
      
      expect(fs.promises.unlink).toHaveBeenCalled();
    });

    test('should handle rotation errors gracefully', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.stat.mockResolvedValue({ size: 10 * 1024 * 1024 + 1 });
      fs.promises.readdir.mockRejectedValue(new Error('Read error'));
      
      await logger.info('Test message');
      
      // Should continue despite rotation error
      expect(fs.promises.appendFile).toHaveBeenCalled();
    });

    test('should not rotate if file is small enough', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.stat.mockResolvedValue({ size: 1024 }); // Small file
      
      await logger.info('Test message');
      
      expect(fs.promises.readdir).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('Logger - Edge Cases', () => {
    test('should handle circular object references', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
      
      const circular = { name: 'test' };
      circular.self = circular;
      
      await logger.info('Test message', circular);
      
      const logCall = fs.promises.appendFile.mock.calls[0];
      const logEntry = logCall[1];
      
      expect(logEntry).toContain('[Circular]');
    });

    test('should handle very long messages', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
      
      const longMessage = 'a'.repeat(10000);
      
      await logger.info(longMessage);
      
      expect(fs.promises.appendFile).toHaveBeenCalled();
    });

    test('should handle special characters in messages', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
      
      const specialMessage = 'Test\n\t"message"\\with\x00special\x01chars';
      
      await logger.info(specialMessage);
      
      expect(fs.promises.appendFile).toHaveBeenCalled();
    });

    test('should handle undefined and null metadata', async () => {
      fs.promises.access.mockResolvedValue();
      fs.promises.appendFile.mockResolvedValue();
      
      await logger.info('Test message', null);
      await logger.info('Test message', undefined);
      
      expect(fs.promises.appendFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('Helpers - Additional Utilities', () => {
    test('should generate unique request IDs', () => {
      const id1 = helpers.generateRequestId();
      const id2 = helpers.generateRequestId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    test('should validate file extensions', () => {
      expect(helpers.isValidFileExtension('script.bat', ['.bat', '.cmd'])).toBe(true);
      expect(helpers.isValidFileExtension('script.exe', ['.bat', '.cmd'])).toBe(false);
      expect(helpers.isValidFileExtension('script', ['.bat', '.cmd'])).toBe(false);
    });

    test('should normalize paths correctly', () => {
      expect(helpers.normalizePath('C:/project\\folder')).toBe('C:\\project\\folder');
      expect(helpers.normalizePath('/unix/path')).toBe('/unix/path');
    });

    test('should escape shell arguments', () => {
      expect(helpers.escapeShellArg('simple')).toBe('simple');
      expect(helpers.escapeShellArg('arg with spaces')).toBe('"arg with spaces"');
      expect(helpers.escapeShellArg('arg"with"quotes')).toBe('"arg\\"with\\"quotes"');
    });

    test('should check if running on Windows', () => {
      const originalPlatform = process.platform;
      
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(helpers.isWindows()).toBe(true);
      
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(helpers.isWindows()).toBe(false);
      
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('should merge configuration objects', () => {
      const defaults = { a: 1, b: 2, c: { x: 1 } };
      const overrides = { b: 3, c: { y: 2 }, d: 4 };
      
      const result = helpers.mergeConfig(defaults, overrides);
      
      expect(result).toEqual({
        a: 1,
        b: 3,
        c: { x: 1, y: 2 },
        d: 4
      });
    });

    test('should retry operations with exponential backoff', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await helpers.retryWithBackoff(operation, 3, 10);
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should fail after max retries', async () => {
      const operation = async () => {
        throw new Error('Persistent failure');
      };

      await expect(helpers.retryWithBackoff(operation, 2, 10))
        .rejects.toThrow('Persistent failure');
    });
  });
});