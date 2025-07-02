const fs = require('fs');
const path = require('path');
const logger = require('../server/src/utils/logger');

// Mock fs module
jest.mock('fs');

describe('Logger', () => {
  const mockLogDir = path.join(__dirname, '..', 'server', 'src', 'logs');
  
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 1000 });
    fs.appendFileSync.mockImplementation();
    fs.mkdirSync.mockImplementation();
    fs.unlinkSync.mockImplementation();
    fs.renameSync.mockImplementation();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('Log Level Management', () => {
    test('should respect log levels', () => {
      // Set log level to warn
      logger.logLevel = 'warn';
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      expect(console.log).not.toHaveBeenCalled(); // debug and info should not log
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warn message'));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('error message'));
    });

    test('should log all levels when set to debug', () => {
      logger.logLevel = 'debug';
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      
      expect(console.log).toHaveBeenCalledTimes(2); // debug and info
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Directory Creation', () => {
    test('should create log directory if it does not exist', () => {
      // Reset fs mocks for this test
      jest.resetModules();
      jest.clearAllMocks();
      
      // Re-mock fs with existsSync returning false
      jest.mock('fs');
      const fsMock = require('fs');
      fsMock.existsSync = jest.fn().mockReturnValue(false);
      fsMock.mkdirSync = jest.fn();
      fsMock.appendFileSync = jest.fn();
      fsMock.statSync = jest.fn().mockReturnValue({ size: 0 });
      fsMock.readdirSync = jest.fn().mockReturnValue([]);
      
      // Now require logger which will call createLogDirectory
      require('../server/src/utils/logger');
      
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(mockLogDir, { recursive: true });
    });
  });

  describe('File Writing', () => {
    test('should write to log files', () => {
      logger.info('test message', { metadata: 'test' });
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('test message')
      );
    });

    test('should handle file write errors gracefully', () => {
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      // Should not throw
      expect(() => {
        logger.error('test error');
      }).not.toThrow();
      
      expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', expect.any(Error));
    });
  });

  describe('Log Rotation', () => {
    test('should rotate logs when file size exceeds limit', () => {
      fs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 }); // 11MB
      
      logger.info('large log message');
      
      expect(fs.renameSync).toHaveBeenCalled();
    });

    test('should delete oldest log file when rotating', () => {
      fs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 });
      fs.existsSync.mockImplementation((filePath) => {
        // Return true for the app.log file and rotated files up to .4
        if (filePath.includes('app.log') && !filePath.includes('.')) return true;
        if (filePath.includes('app.1.log')) return true;
        if (filePath.includes('app.2.log')) return true;
        if (filePath.includes('app.3.log')) return true;
        if (filePath.includes('app.4.log')) return true;
        return filePath.includes('logs'); // directory exists
      });
      
      logger.info('rotation test');
      
      expect(fs.unlinkSync).toHaveBeenCalled(); // Should delete oldest file
    });
  });

  describe('Security Logging', () => {
    test('should log security events', () => {
      logger.security('Failed login attempt', { ip: '192.168.1.100' });
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY EVENT: Failed login attempt')
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('security.log'),
        expect.stringContaining('Failed login attempt')
      );
    });
  });

  describe('Access Logging', () => {
    test('should log access requests', () => {
      const mockReq = {
        ip: '192.168.1.100',
        method: 'POST',
        originalUrl: '/mcp',
        get: jest.fn().mockReturnValue('test-agent')
      };
      const mockRes = {
        statusCode: 200
      };
      
      logger.access(mockReq, mockRes, 150);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        expect.stringContaining('192.168.1.100 - POST /mcp 200 150ms')
      );
    });

    test('should handle missing user agent', () => {
      const mockReq = {
        ip: '192.168.1.100',
        method: 'GET',
        originalUrl: '/health',
        get: jest.fn().mockReturnValue(undefined)
      };
      const mockRes = {
        statusCode: 200
      };
      
      logger.access(mockReq, mockRes, 50);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        expect.stringContaining('Unknown')
      );
    });
  });

  describe('Message Formatting', () => {
    test('should format messages with metadata', () => {
      const metadata = { userId: 123, action: 'login' };
      const formatted = logger.formatMessage('info', 'User action', metadata);
      
      expect(formatted).toContain('INFO: User action');
      expect(formatted).toContain(JSON.stringify(metadata));
      expect(formatted).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    test('should format messages without metadata', () => {
      const formatted = logger.formatMessage('error', 'Simple error');
      
      expect(formatted).toContain('ERROR: Simple error');
      expect(formatted).not.toContain('{}');
    });
  });

  describe('Different Log Methods', () => {
    test('should write error logs to both error.log and app.log', () => {
      logger.error('test error', { code: 500 });
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.anything()
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.anything()
      );
    });

    test('should write debug logs only to debug.log', () => {
      logger.logLevel = 'debug';
      logger.debug('debug message');
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('debug.log'),
        expect.anything()
      );
    });

    test('should write warn logs only to app.log', () => {
      logger.warn('warning message');
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.anything()
      );
      expect(fs.appendFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.anything()
      );
    });
  });
});