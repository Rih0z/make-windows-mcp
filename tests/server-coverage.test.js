const request = require('supertest');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.MCP_SERVER_PORT = '0';
process.env.RATE_LIMIT_REQUESTS = '2';
process.env.RATE_LIMIT_WINDOW = '1000';

// Mock modules
jest.mock('child_process');
jest.mock('ssh2');
jest.mock('ping');
jest.mock('helmet', () => () => (req, res, next) => next());

const mockSpawn = spawn;
const mockSSH = require('ssh2');
const mockPing = require('ping');

describe('Server Coverage Tests', () => {
  let app;
  let mockProcess;
  let mockSSHClient;
  let rateLimiter;

  beforeEach(() => {
    // Reset all mocks and modules before each test
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup mocks
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    
    mockSpawn.mockReturnValue(mockProcess);
    
    mockSSHClient = new EventEmitter();
    mockSSHClient.connect = jest.fn();
    mockSSHClient.exec = jest.fn();
    mockSSHClient.end = jest.fn();
    mockSSH.Client.mockImplementation(() => mockSSHClient);
    
    mockPing.promise = {
      probe: jest.fn()
    };
    
    // Require fresh instances for each test
    rateLimiter = require('../src/utils/rate-limiter');
    rateLimiter.clear();
    app = require('../src/server.js');
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.clear();
    }
  });

  describe('Rate Limiting', () => {
    test('should block requests when rate limit exceeded', async () => {
      // First request should succeed
      await request(app)
        .get('/health')
        .expect(200);

      // Second request should succeed (limit is 2)
      await request(app)
        .get('/health')
        .expect(200);

      // Third request should be rate limited
      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.body.error).toContain('Rate limit exceeded');
      expect(response.body.retryAfter).toBe(300);
    });
  });

  describe('IP Whitelist', () => {
    test('should block requests from non-whitelisted IPs', async () => {
      // Set allowed IPs
      process.env.ALLOWED_IPS = '192.168.1.100,192.168.1.101';
      
      // Clear module cache and reload server
      jest.resetModules();
      app = require('../src/server.js');

      const response = await request(app)
        .get('/health')
        .set('X-Forwarded-For', '10.0.0.1')
        .expect(403);

      expect(response.body.error).toBe('Access denied from this IP address');
    });

    test('should allow requests from whitelisted IPs with CIDR notation', async () => {
      // Set allowed IPs with CIDR
      process.env.ALLOWED_IPS = '192.168.1.0/24';
      
      // Clear module cache and reload server
      jest.resetModules();
      app = require('../src/server.js');

      await request(app)
        .get('/health')
        .set('X-Forwarded-For', '192.168.1.50')
        .expect(200);
    });

    afterAll(() => {
      // Reset ALLOWED_IPS
      delete process.env.ALLOWED_IPS;
    });
  });

  describe('Authentication', () => {
    test('should require authorization header when token is set', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(401);

      expect(response.body.error).toBe('Authorization header required');
    });

    test('should reject invalid authorization token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({ method: 'tools/list' })
        .expect(401);

      expect(response.body.error).toBe('Invalid authorization token');
    });

    test('should skip auth for health check', async () => {
      await request(app)
        .get('/health')
        .expect(200);
    });
  });

  describe('Build Validation Errors', () => {
    test('should handle build path validation errors', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
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

      expect(response.body.content[0].text).toContain('Validation error');
    });

    test('should handle PowerShell validation errors', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
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

      expect(response.body.content[0].text).toContain('Validation error');
    });

    test('should handle ping validation errors', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: 'invalid-ip'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error');
    });

    test('should handle SSH validation errors', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '127.0.0.1',
              username: 'admin',
              password: 'pass',
              command: 'whoami'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error');
    });
  });

  describe('Unknown Methods and Tools', () => {
    test('should handle unknown tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Unknown tool');
    });

    test('should handle unknown methods', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'unknown/method',
          params: {}
        })
        .expect(200);

      expect(response.body.error).toContain('Unknown method');
    });
  });

  describe('Process Output Handling', () => {
    test('should handle stdout data', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Build output'));
        mockProcess.emit('close', 0);
      }, 10);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\test.csproj'
            }
          }
        });

      expect(response.body.content[0].text).toContain('Build output');
    });

    test('should handle stderr data', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Error output'));
        mockProcess.emit('close', 1);
      }, 10);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo test'
            }
          }
        });

      expect(response.body.content[0].text).toContain('Error output');
    });
  });

  describe('SSH Connection Handling', () => {
    test('should handle SSH connection ready and stream data', async () => {
      const mockStream = new EventEmitter();
      mockStream.stderr = new EventEmitter();
      
      mockSSHClient.exec.mockImplementation((cmd, callback) => {
        callback(null, mockStream);
        
        setTimeout(() => {
          mockStream.emit('data', Buffer.from('SSH output'));
          mockStream.stderr.emit('data', Buffer.from('SSH error'));
          mockStream.emit('close', 0);
        }, 10);
      });

      setTimeout(() => {
        mockSSHClient.emit('ready');
      }, 10);

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

      expect(response.body.content[0].text).toContain('SSH output');
      expect(response.body.content[0].text).toContain('STDERR: SSH error');
    });
  });

  describe('Error Handling', () => {
    test('should handle general errors', async () => {
      // Mock a method to throw an error
      jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.status).toBe(400);
    });
  });
});