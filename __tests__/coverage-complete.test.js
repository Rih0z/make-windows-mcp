const request = require('supertest');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.MCP_SERVER_PORT = '0';

// Mock modules
jest.mock('child_process');
jest.mock('ssh2');
jest.mock('ping');
jest.mock('helmet', () => () => (req, res, next) => next());
jest.mock('fs');

const mockSpawn = spawn;
const mockSSH = require('ssh2');
const mockPing = require('ping');

describe('Complete Coverage Tests', () => {
  let app;
  let server;
  let mockProcess;
  let mockSSHClient;
  let logger;
  let security;
  let rateLimiter;

  beforeEach(() => {
    // Reset all mocks and modules
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup FS mocks
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.appendFileSync.mockImplementation(() => {});
    fs.statSync.mockReturnValue({ size: 1000 });
    fs.renameSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
    
    // Setup process mocks
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess);
    
    // Setup SSH mocks
    mockSSHClient = new EventEmitter();
    mockSSHClient.connect = jest.fn();
    mockSSHClient.exec = jest.fn();
    mockSSHClient.end = jest.fn();
    mockSSH.Client.mockImplementation(() => mockSSHClient);
    
    // Setup ping mocks
    mockPing.promise = {
      probe: jest.fn()
    };
    
    // Clear console mocks
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    
    // Require fresh modules
    logger = require('../utils/logger');
    security = require('../utils/security');
    rateLimiter = require('../utils/rate-limiter');
    app = require('../server.js');
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  describe('Server Error Handling', () => {
    test('should handle general server errors gracefully', async () => {
      // Force server to throw error
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: null // Invalid params
        });

      expect(response.status).toBe(500);
    });

    test('should handle ping failures', async () => {
      mockPing.promise.probe.mockRejectedValue(new Error('Network unreachable'));

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: '8.8.8.8'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Ping failed');
    });

    test('should handle SSH exec errors', async () => {
      mockSSHClient.exec.mockImplementation((cmd, callback) => {
        callback(new Error('Exec failed'));
      });
      
      setImmediate(() => {
        mockSSHClient.emit('ready');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.1',
              username: 'admin',
              password: 'password',
              command: 'echo test'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('SSH Error');
    });

    test('should handle SSH connection errors', async () => {
      setImmediate(() => {
        mockSSHClient.emit('error', new Error('Connection refused'));
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.1',
              username: 'admin',
              password: 'password',
              command: 'echo test'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Connection failed');
    });

    test('should handle SSH stream stderr', async () => {
      const mockStream = new EventEmitter();
      mockStream.stderr = new EventEmitter();
      
      mockSSHClient.exec.mockImplementation((cmd, callback) => {
        callback(null, mockStream);
        setImmediate(() => {
          mockStream.stderr.emit('data', Buffer.from('STDERR output'));
          mockStream.emit('close', 0);
        });
      });
      
      setImmediate(() => {
        mockSSHClient.emit('ready');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.1',
              username: 'admin',
              password: 'password',
              command: 'echo test'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('STDERR');
    });

    test('should handle remote execution without password', async () => {
      delete process.env.REMOTE_PASSWORD;

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\test.csproj',
              remoteHost: '192.168.1.1'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('REMOTE_PASSWORD environment variable not set');
      
      // Restore
      process.env.REMOTE_PASSWORD = 'testpass';
    });
  });

  describe('Logger Complete Coverage', () => {
    test('should handle all log levels correctly', () => {
      // Test debug level
      logger.logLevel = 'debug';
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      
      expect(console.log).toHaveBeenCalledTimes(2); // debug and info
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    test('should write to error.log for error messages', () => {
      logger.error('test error', { code: 500 });
      
      // Should write to both error.log and app.log
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('error.log'),
        expect.stringContaining('test error')
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('test error')
      );
    });

    test('should handle file write errors gracefully', () => {
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });
      
      // Should not throw
      expect(() => {
        logger.info('test message');
      }).not.toThrow();
      
      expect(console.error).toHaveBeenCalledWith(
        'Failed to write to log file:',
        expect.any(Error)
      );
    });

    test('should handle log directory creation', () => {
      fs.existsSync.mockReturnValue(false);
      
      // Re-require logger to trigger constructor
      delete require.cache[require.resolve('../utils/logger')];
      const newLogger = require('../utils/logger');
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    test('should rotate logs when file reaches max size', () => {
      fs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 }); // 11MB
      fs.existsSync.mockImplementation((path) => {
        if (path.includes('logs')) return true;
        if (path.endsWith('.log') && !path.includes('.1')) return true;
        return false;
      });
      
      logger.info('trigger rotation');
      
      expect(fs.renameSync).toHaveBeenCalled();
    });
  });

  describe('Security Complete Coverage', () => {
    test('should sanitize PowerShell commands', () => {
      const command = 'echo "test\x00\x01\x02"';
      const result = security.validatePowerShellCommand(command);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x01');
    });

    test('should handle empty command validation', () => {
      expect(() => security.validatePowerShellCommand('')).toThrow('Invalid command');
      expect(() => security.validatePowerShellCommand(null)).toThrow('Invalid command');
      expect(() => security.validatePowerShellCommand(123)).toThrow('Invalid command');
    });

    test('should handle long commands', () => {
      const longCommand = 'echo ' + 'x'.repeat(2050);
      expect(() => security.validatePowerShellCommand(longCommand)).toThrow('Command too long');
    });

    test('should validate IPv6 addresses', () => {
      const validIPv6 = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '::1',
        'fe80::1',
        '::ffff:192.0.2.1'
      ];
      
      validIPv6.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).not.toThrow();
      });
    });

    test('should validate complex SSH credentials', () => {
      const result = security.validateSSHCredentials(
        '192.168.1.1',
        'admin',
        'ComplexP@ssw0rd!'
      );
      
      expect(result).toEqual({
        host: '192.168.1.1',
        username: 'admin',
        password: 'ComplexP@ssw0rd!'
      });
    });
  });

  describe('Rate Limiter Complete Coverage', () => {
    test('should handle blocked clients correctly', () => {
      const clientIP = '192.168.1.100';
      
      // Block client
      rateLimiter.blockClient(clientIP, 1000);
      
      // Check status
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(true);
      
      // Try to make request
      const result = rateLimiter.checkLimit(clientIP);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('blocked');
    });

    test('should unblock clients', () => {
      const clientIP = '192.168.1.100';
      
      // Block then unblock
      rateLimiter.blockClient(clientIP);
      rateLimiter.unblockClient(clientIP);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(false);
    });

    test('should cleanup expired blocks', () => {
      const clientIP = '192.168.1.100';
      
      // Block with negative duration (already expired)
      rateLimiter.blockClient(clientIP, -1000);
      
      // Run cleanup
      rateLimiter.cleanup();
      
      // Should be removed
      expect(rateLimiter.clients.has(clientIP)).toBe(false);
    });

    test('should handle custom rate limit parameters', () => {
      const clientIP = '192.168.1.100';
      
      // Make 3 requests with limit of 2
      rateLimiter.checkLimit(clientIP, 2, 1000);
      rateLimiter.checkLimit(clientIP, 2, 1000);
      const result = rateLimiter.checkLimit(clientIP, 2, 1000);
      
      expect(result.allowed).toBe(false);
    });
  });

  describe('Access Logging Coverage', () => {
    test('should log access with all properties', () => {
      const req = {
        ip: '192.168.1.1',
        method: 'POST',
        originalUrl: '/mcp',
        get: jest.fn().mockReturnValue('Mozilla/5.0')
      };
      const res = {
        statusCode: 200
      };
      
      logger.access(req, res, 150);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.1')
      );
    });
  });

  describe('CIDR IP Matching', () => {
    test('should handle CIDR notation in allowed IPs', async () => {
      // Set CIDR allowed IPs
      process.env.ALLOWED_IPS = '10.0.0.0/8,192.168.0.0/16';
      
      // Re-require app to pick up new env var
      jest.resetModules();
      const testApp = require('../server.js');
      
      // Should allow 10.x.x.x
      await request(testApp)
        .get('/health')
        .set('X-Forwarded-For', '10.5.3.2')
        .expect(200);
        
      // Reset
      delete process.env.ALLOWED_IPS;
    });
  });
});