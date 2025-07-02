const path = require('path');

// Set test environment first
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token';
process.env.MCP_SERVER_PORT = '0';
process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\';

describe('Complete 100% Coverage', () => {
  let originalConsole;
  let server;
  let logger;
  let security;
  let rateLimiter;

  beforeAll(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
  });

  afterAll(() => {
    // Restore console
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  beforeEach(() => {
    // Clear all caches
    jest.clearAllMocks();
    jest.resetModules();
    
    // Mock console
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('Server 100% Coverage', () => {
    beforeEach(() => {
      jest.resetModules();
      
      // Mock all dependencies
      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        appendFileSync: jest.fn(),
        statSync: jest.fn().mockReturnValue({ size: 1000 }),
        renameSync: jest.fn(),
        unlinkSync: jest.fn()
      }));
      
      jest.doMock('child_process', () => {
        const EventEmitter = require('events').EventEmitter;
        const mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        
        return {
          spawn: jest.fn().mockImplementation(() => {
            // Emit data after a tick
            process.nextTick(() => {
              mockProcess.stdout.emit('data', Buffer.from('stdout output'));
              mockProcess.stderr.emit('data', Buffer.from('stderr output'));
              mockProcess.emit('close', 0);
            });
            return mockProcess;
          })
        };
      });
      
      jest.doMock('ssh2', () => {
        const EventEmitter = require('events').EventEmitter;
        return {
          Client: jest.fn().mockImplementation(() => {
            const client = new EventEmitter();
            client.connect = jest.fn().mockImplementation(function() {
              process.nextTick(() => this.emit('ready'));
            }.bind(client));
            client.exec = jest.fn().mockImplementation((cmd, callback) => {
              const stream = new EventEmitter();
              stream.stderr = new EventEmitter();
              callback(null, stream);
              process.nextTick(() => {
                stream.emit('data', Buffer.from('SSH output'));
                stream.stderr.emit('data', Buffer.from('SSH stderr'));
                stream.emit('close', 0);
              });
            });
            client.end = jest.fn();
            
            // Also handle error event
            process.nextTick(() => {
              if (client.listenerCount('error') > 0 && !client._emittedReady) {
                client.emit('error', new Error('Connection failed'));
              }
            });
            
            return client;
          })
        };
      });
      
      jest.doMock('ping', () => ({
        promise: {
          probe: jest.fn().mockImplementation((host) => {
            if (host === 'fail.test') {
              return Promise.reject(new Error('Ping failed'));
            }
            return Promise.resolve({
              alive: true,
              time: 10,
              output: `Reply from ${host}`
            });
          })
        }
      }));
      
      jest.doMock('helmet', () => () => (req, res, next) => next());
    });

    test('should start server successfully', (done) => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      request(app)
        .get('/health')
        .expect(200)
        .end((err, res) => {
          expect(res.body.status).toBe('ok');
          done();
        });
    });

    test('should handle all MCP endpoints', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Test tools/list
      const listRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({ method: 'tools/list' })
        .expect(200);
      
      expect(listRes.body.tools).toBeDefined();
      expect(listRes.body.tools.length).toBeGreaterThan(0);
      
      // Test unknown method
      const unknownRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({ method: 'unknown/method' })
        .expect(200);
      
      expect(unknownRes.body.error).toContain('Unknown method');
    });

    test('should handle authentication scenarios', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Missing auth header
      await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(401);
      
      // Invalid token
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer wrong-token')
        .send({ method: 'tools/list' })
        .expect(401);
      
      // Valid token
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({ method: 'tools/list' })
        .expect(200);
    });

    test('should handle rate limiting', async () => {
      // Set rate limit env vars
      process.env.RATE_LIMIT_REQUESTS = '2';
      process.env.RATE_LIMIT_WINDOW = '1000';
      
      jest.resetModules();
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // First 2 requests should pass
      await request(app).get('/health').expect(200);
      await request(app).get('/health').expect(200);
      
      // Third should be rate limited
      await request(app).get('/health').expect(429);
    });

    test('should handle IP whitelisting', async () => {
      // Set allowed IPs
      process.env.ALLOWED_IPS = '192.168.1.100';
      
      jest.resetModules();
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Request from non-whitelisted IP
      await request(app)
        .get('/health')
        .set('X-Forwarded-For', '10.0.0.1')
        .expect(403);
      
      // Cleanup
      delete process.env.ALLOWED_IPS;
    });

    test('should execute all tool commands', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Test build_dotnet
      const buildRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\test.csproj'
            }
          }
        })
        .expect(200);
      
      expect(buildRes.body.content[0].text).toContain('stdout output');
      
      // Test run_powershell
      const psRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo test'
            }
          }
        })
        .expect(200);
      
      expect(psRes.body.content[0].text).toContain('output');
      
      // Test ping_host
      const pingRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: '8.8.8.8'
            }
          }
        })
        .expect(200);
      
      expect(pingRes.body.content[0].text).toContain('Alive: true');
      
      // Test ping failure
      const pingFailRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: 'fail.test'
            }
          }
        })
        .expect(200);
      
      expect(pingFailRes.body.content[0].text).toContain('Ping failed');
    });

    test('should handle SSH commands', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      const sshRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
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
        })
        .expect(200);
      
      expect(sshRes.body.content[0].text).toContain('SSH output');
    });

    test('should handle remote execution', async () => {
      process.env.REMOTE_PASSWORD = 'test123';
      
      const app = require('../src/server.js');
      const request = require('supertest');
      
      const remoteRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\test.csproj',
              remoteHost: '192.168.1.100'
            }
          }
        })
        .expect(200);
      
      expect(remoteRes.body.content[0].text).toBeDefined();
    });

    test('should handle validation errors', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Invalid path
      const pathRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: '../../../etc/passwd'
            }
          }
        })
        .expect(200);
      
      expect(pathRes.body.content[0].text).toContain('Validation error');
      
      // Invalid command
      const cmdRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'rm -rf /'
            }
          }
        })
        .expect(200);
      
      expect(cmdRes.body.content[0].text).toContain('Validation error');
      
      // Invalid IP
      const ipRes = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: 'not-an-ip'
            }
          }
        })
        .expect(200);
      
      expect(ipRes.body.content[0].text).toContain('Validation error');
    });

    test('should handle unknown tool', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
        .expect(200);
      
      expect(res.body.content[0].text).toContain('Unknown tool');
    });

    test('should handle general errors', async () => {
      const app = require('../src/server.js');
      const request = require('supertest');
      
      // Send invalid params structure
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: null
        })
        .expect(500);
      
      expect(res.body.error).toBeDefined();
    });
  });

  describe('Logger 100% Coverage', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        appendFileSync: jest.fn(),
        statSync: jest.fn(),
        renameSync: jest.fn(),
        unlinkSync: jest.fn()
      }));
    });

    test('should cover all logger functionality', () => {
      const fs = require('fs');
      
      // Test directory creation
      fs.existsSync.mockReturnValue(false);
      logger = require('../src/utils/logger');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
      
      // Test all log levels
      logger.logLevel = 'debug';
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.security('security event', { ip: '192.168.1.1' });
      
      // Test access logging
      const req = {
        ip: '192.168.1.1',
        method: 'GET',
        originalUrl: '/test',
        get: jest.fn().mockReturnValue('Chrome'),
        connection: { remoteAddress: '192.168.1.2' }
      };
      const res = { statusCode: 200 };
      logger.access(req, res, 100);
      
      // Test file rotation
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 });
      logger.info('trigger rotation');
      
      // Test write error handling
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      logger.error('should handle error');
      expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', expect.any(Error));
    });
  });

  describe('Security 100% Coverage', () => {
    beforeEach(() => {
      jest.resetModules();
      security = require('../src/utils/security');
    });

    test('should cover all security validation', () => {
      // PowerShell command validation
      expect(() => security.validatePowerShellCommand('')).toThrow();
      expect(() => security.validatePowerShellCommand(null)).toThrow();
      expect(() => security.validatePowerShellCommand('x'.repeat(2050))).toThrow();
      expect(() => security.validatePowerShellCommand('rm -rf /')).toThrow();
      
      const sanitized = security.validatePowerShellCommand('echo test\x00\x01');
      expect(sanitized).toBe('echo test');
      
      // Path validation
      expect(() => security.validatePath(null)).toThrow();
      expect(() => security.validatePath('../etc/passwd')).toThrow();
      expect(() => security.validatePath('C:\\valid\\path~')).toThrow();
      
      const validPath = security.validatePath('C:\\projects\\test.cs');
      expect(validPath).toBe('C:\\projects\\test.cs');
      
      // IP validation
      expect(() => security.validateIPAddress(null)).toThrow();
      expect(() => security.validateIPAddress('invalid')).toThrow();
      expect(() => security.validateIPAddress('127.0.0.1')).toThrow();
      
      const validIP = security.validateIPAddress('192.168.1.1');
      expect(validIP).toBe('192.168.1.1');
      
      // IPv6 validation
      const validIPv6 = security.validateIPAddress('2001:db8::1');
      expect(validIPv6).toBe('2001:db8::1');
      
      // SSH credentials validation
      expect(() => security.validateSSHCredentials('invalid-ip', 'user', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', '', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', '')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'a'.repeat(65), 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', 'a'.repeat(129))).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user;rm -rf', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', 'pass OR 1=1')).toThrow();
      
      const validCreds = security.validateSSHCredentials('192.168.1.1', 'admin', 'password123');
      expect(validCreds).toEqual({
        host: '192.168.1.1',
        username: 'admin',
        password: 'password123'
      });
    });
  });

  describe('Rate Limiter 100% Coverage', () => {
    beforeEach(() => {
      jest.resetModules();
      rateLimiter = require('../src/utils/rate-limiter');
    });

    test('should cover all rate limiter functionality', () => {
      const ip = '192.168.1.1';
      
      // Test normal flow
      let result = rateLimiter.checkLimit(ip, 2, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      
      result = rateLimiter.checkLimit(ip, 2, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
      
      result = rateLimiter.checkLimit(ip, 2, 1000);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      
      // Test blocking
      rateLimiter.clear();
      rateLimiter.blockClient(ip, 5000);
      result = rateLimiter.checkLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('blocked');
      
      // Test status
      let status = rateLimiter.getStatus(ip);
      expect(status.blocked).toBe(true);
      
      // Test unblock
      rateLimiter.unblockClient(ip);
      status = rateLimiter.getStatus(ip);
      expect(status.blocked).toBe(false);
      
      // Test cleanup
      const oldIp = '10.0.0.1';
      rateLimiter.clients.set(oldIp, {
        requests: [Date.now() - 65 * 60 * 1000],
        blocked: false,
        blockExpiry: 0
      });
      rateLimiter.cleanup();
      expect(rateLimiter.clients.has(oldIp)).toBe(false);
      
      // Test expired block cleanup
      const blockedIp = '10.0.0.2';
      rateLimiter.blockClient(blockedIp, -1000);
      rateLimiter.cleanup();
      expect(rateLimiter.clients.has(blockedIp)).toBe(false);
      
      // Test non-existent client
      status = rateLimiter.getStatus('1.2.3.4');
      expect(status.requests).toBe(0);
      
      // Test unblock non-existent
      expect(() => rateLimiter.unblockClient('1.2.3.4')).not.toThrow();
      
      // Test client without requests array
      rateLimiter.clients.set('no-requests', { blocked: false, blockExpiry: 0 });
      status = rateLimiter.getStatus('no-requests');
      expect(status.requests).toBe(0);
    });
  });
});