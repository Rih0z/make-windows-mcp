const request = require('supertest');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = '';
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

describe('Final Coverage Tests', () => {
  let app;
  let mockProcess;
  let mockSSHClient;
  let logger;
  let security;
  let rateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Clear console mocks first
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    
    // Setup FS mocks before requiring modules
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      appendFileSync: jest.fn(),
      statSync: jest.fn().mockReturnValue({ size: 1000 }),
      renameSync: jest.fn(),
      unlinkSync: jest.fn(),
      readdirSync: jest.fn().mockReturnValue([])
    }));
    
    // Setup process mocks
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    
    jest.doMock('child_process', () => ({
      spawn: jest.fn().mockReturnValue(mockProcess)
    }));
    
    // Setup SSH mocks
    mockSSHClient = new EventEmitter();
    mockSSHClient.connect = jest.fn();
    mockSSHClient.exec = jest.fn();
    mockSSHClient.end = jest.fn();
    
    jest.doMock('ssh2', () => ({
      Client: jest.fn().mockImplementation(() => mockSSHClient)
    }));
    
    // Setup ping mocks
    jest.doMock('ping', () => ({
      promise: {
        probe: jest.fn().mockResolvedValue({ alive: true, time: 10, output: 'Reply from host' })
      }
    }));
    
    // Now require modules
    logger = require('../src/utils/logger');
    security = require('../src/utils/security');
    rateLimiter = require('../src/utils/rate-limiter');
    app = require('../src/server.js');
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  describe('100% Server Coverage', () => {
    test('should handle missing authorization header without token', async () => {
      // No auth token set
      await request(app)
        .get('/health')
        .expect(200);
    });

    test('should handle tools/list request', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(200);

      expect(response.body.tools).toBeDefined();
      expect(response.body.tools.length).toBeGreaterThan(0);
    });

    test('should handle remote command execution with password', async () => {
      process.env.REMOTE_PASSWORD = 'test123';
      
      // Setup SSH mock to emit ready immediately when connect is called
      mockSSHClient.connect.mockImplementation(function() {
        setImmediate(() => {
          this.emit('ready');
        });
      }.bind(mockSSHClient));
      
      // Mock successful SSH execution
      mockSSHClient.exec.mockImplementation((cmd, cb) => {
        const stream = new EventEmitter();
        stream.stderr = new EventEmitter();
        cb(null, stream);
        setImmediate(() => {
          stream.emit('data', Buffer.from('output'));
          stream.emit('close', 0);
        });
      });

      const response = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo test',
              remoteHost: '192.168.1.1'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('SSH Command completed');
      expect(response.body.content[0].text).toContain('output');
    });

    test('should handle spawn process with both stdout and stderr', async () => {
      // Use a promise to properly wait for async events
      const processPromise = new Promise((resolve) => {
        const { spawn } = require('child_process');
        spawn.mockImplementation(() => {
          setImmediate(() => {
            mockProcess.stdout.emit('data', Buffer.from('stdout data'));
            mockProcess.stderr.emit('data', Buffer.from('stderr data'));
            mockProcess.emit('close', 0);
            resolve();
          });
          return mockProcess;
        });
      });

      const responsePromise = request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\test.csproj',
              configuration: 'Release'
            }
          }
        });

      await processPromise;
      const response = await responsePromise;
      
      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('stdout data');
      expect(response.body.content[0].text).toContain('stderr data');
    });

    test('should log request info correctly', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: { host: '8.8.8.8' }
          }
        });

      expect(response.status).toBe(200);
      // Logger info method should have been called
      const fs = require('fs');
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining('Received MCP request')
      );
    });
  });

  describe('100% Logger Coverage', () => {
    test('should create log directory when not exists', () => {
      // Reset modules and setup mock
      jest.resetModules();
      
      const fsMock = {
        existsSync: jest.fn().mockReturnValue(false),
        mkdirSync: jest.fn(),
        appendFileSync: jest.fn(),
        statSync: jest.fn().mockReturnValue({ size: 1000 }),
        renameSync: jest.fn(),
        unlinkSync: jest.fn()
      };
      
      jest.doMock('fs', () => fsMock);
      
      // Now require logger which should create directory
      const newLogger = require('../src/utils/logger');
      
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    test('should rotate all log files correctly', () => {
      const fs = require('fs');
      
      // Mock large file
      fs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 });
      
      // Mock existing rotated files
      fs.existsSync.mockImplementation((path) => {
        if (path.includes('logs')) return true;
        if (path.endsWith('.log')) return true;
        if (path.endsWith('.1.log')) return true;
        if (path.endsWith('.2.log')) return true;
        if (path.endsWith('.3.log')) return true;
        if (path.endsWith('.4.log')) return true;
        return false;
      });
      
      logger.info('trigger rotation');
      
      // Should delete oldest
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.4.log')
      );
      
      // Should rename others
      expect(fs.renameSync).toHaveBeenCalled();
    });

    test('should handle write errors for all log methods', () => {
      const fs = require('fs');
      
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      // Should not throw for any log level
      expect(() => logger.debug('test')).not.toThrow();
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.warn('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
      expect(() => logger.security('test')).not.toThrow();
      
      // Should log the error
      expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', expect.any(Error));
    });

    test('should format access log correctly', () => {
      const fs = require('fs');
      
      const req = {
        ip: '127.0.0.1',
        method: 'POST',
        originalUrl: '/test',
        get: jest.fn().mockReturnValue('Chrome'),
        connection: { remoteAddress: '127.0.0.1' }
      };
      const res = { statusCode: 200 };
      
      logger.access(req, res, 150);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        expect.stringContaining('127.0.0.1')
      );
    });
  });

  describe('100% Security Coverage', () => {
    test('should handle all invalid command types', () => {
      expect(() => security.validatePowerShellCommand(null)).toThrow();
      expect(() => security.validatePowerShellCommand(undefined)).toThrow();
      expect(() => security.validatePowerShellCommand(123)).toThrow();
      expect(() => security.validatePowerShellCommand([])).toThrow();
      expect(() => security.validatePowerShellCommand({})).toThrow();
    });

    test('should handle all invalid path types', () => {
      expect(() => security.validatePath(null)).toThrow();
      expect(() => security.validatePath(undefined)).toThrow();
      expect(() => security.validatePath(123)).toThrow();
      expect(() => security.validatePath('')).toThrow();
    });

    test('should handle all invalid IP types', () => {
      expect(() => security.validateIPAddress(null)).toThrow();
      expect(() => security.validateIPAddress(undefined)).toThrow();
      expect(() => security.validateIPAddress(123)).toThrow();
      expect(() => security.validateIPAddress('')).toThrow();
    });

    test('should sanitize control characters', () => {
      const cmd = 'echo test\x00\x01\x02\x03\x04\x05';
      const result = security.validatePowerShellCommand(cmd);
      expect(result).toBe('echo test');
    });

    test('should validate all IPv6 formats', () => {
      const validIPv6 = [
        '::',
        '::1',
        '::ffff:192.0.2.1',
        'fe80::',
        '2001:db8::8a2e:370:7334'
      ];
      
      validIPv6.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).not.toThrow();
      });
    });

    test('should handle SSH validation edge cases', () => {
      // Invalid host
      expect(() => security.validateSSHCredentials('invalid', 'user', 'pass')).toThrow();
      
      // Empty username
      expect(() => security.validateSSHCredentials('192.168.1.1', '', 'pass')).toThrow();
      
      // Long username
      expect(() => security.validateSSHCredentials('192.168.1.1', 'a'.repeat(65), 'pass')).toThrow();
      
      // Long password
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', 'a'.repeat(129))).toThrow();
    });
  });

  describe('100% Rate Limiter Coverage', () => {
    test('should handle client without requests array', () => {
      const ip = '192.168.1.1';
      rateLimiter.clients.set(ip, { 
        blocked: false,
        blockExpiry: 0
        // No requests array
      });
      
      const status = rateLimiter.getStatus(ip);
      expect(status.requests).toBe(0);
      expect(status.blocked).toBe(false);
    });

    test('should cleanup old clients correctly', () => {
      const ip = '192.168.1.1';
      const oldTime = Date.now() - (61 * 60 * 1000); // 61 minutes ago
      
      rateLimiter.clients.set(ip, {
        requests: [oldTime],
        blocked: false,
        blockExpiry: 0
      });
      
      rateLimiter.cleanup();
      
      expect(rateLimiter.clients.has(ip)).toBe(false);
    });

    test('should handle unblock for non-existent client', () => {
      // Should not throw
      expect(() => rateLimiter.unblockClient('1.2.3.4')).not.toThrow();
    });

    test('should return correct status for non-existent client', () => {
      const status = rateLimiter.getStatus('1.2.3.4');
      expect(status.requests).toBe(0);
      expect(status.blocked).toBe(false);
    });
  });

  describe('Edge Cases and Error Paths', () => {
    test('should handle malformed JSON gracefully', async () => {
      // Express will handle malformed JSON and return 400
      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    test('should handle missing method in request', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ params: {} })
        .expect(200);

      expect(response.body.error).toContain('Unknown method');
    });

    test('should handle missing params in tools/call', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/call' })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});