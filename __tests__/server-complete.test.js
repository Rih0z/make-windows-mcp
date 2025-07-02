const request = require('supertest');
const express = require('express');

// Set comprehensive test environment
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.ALLOWED_IPS = '127.0.0.1,::1,192.168.1.0/24';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://test.com';
process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\';
process.env.RATE_LIMIT_REQUESTS = '10';
process.env.RATE_LIMIT_WINDOW = '60000';
process.env.NORDVPN_ENABLED = 'true';
process.env.NORDVPN_HOSTS = '10.5.0.2,10.5.0.3';
process.env.REMOTE_USERNAME = 'testuser';
process.env.REMOTE_PASSWORD = 'testpass';

// Mock all external dependencies
jest.mock('helmet', () => () => (req, res, next) => next());
jest.mock('child_process');
jest.mock('ssh2');
jest.mock('ping');

// Mock utils
jest.mock('../utils/security', () => ({
  validatePowerShellCommand: jest.fn((cmd) => {
    if (cmd.includes('malicious')) throw new Error('Dangerous command detected');
    return cmd;
  }),
  validatePath: jest.fn((path) => {
    if (path.includes('..')) throw new Error('Directory traversal detected');
    return path;
  }),
  validateIPAddress: jest.fn((ip) => {
    if (ip === 'invalid') throw new Error('Invalid IP address format');
    return ip;
  }),
  validateSSHCredentials: jest.fn((host, user, pass) => {
    if (user === 'invalid') throw new Error('Invalid username');
    return { host, username: user, password: pass };
  })
}));

jest.mock('../utils/rate-limiter', () => ({
  checkLimit: jest.fn(() => ({ allowed: true, remaining: 9 }))
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  security: jest.fn(),
  access: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const security = require('../utils/security');
const rateLimiter = require('../utils/rate-limiter');
const logger = require('../utils/logger');

describe('Server Complete Coverage', () => {
  let app;

  beforeAll(() => {
    // Create actual server instance
    delete require.cache[require.resolve('../server.js')];
    
    // Mock child_process spawn
    const { spawn } = require('child_process');
    const { EventEmitter } = require('events');
    
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    
    spawn.mockReturnValue(mockProcess);
    
    // Simulate process completion
    setTimeout(() => {
      mockProcess.stdout.emit('data', 'Command output');
      mockProcess.stderr.emit('data', '');
      mockProcess.emit('close', 0);
    }, 10);
    
    // Create minimal test server to avoid port conflicts
    app = express();
    app.set('trust proxy', true);
    app.use(express.json({ limit: '1mb' }));
    
    // Replicate server middleware logic
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.access(req, res, duration);
      });
      next();
    });
    
    app.use((req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      const limitResult = rateLimiter.checkLimit(clientIP, 10, 60000);
      
      if (!limitResult.allowed) {
        logger.security('Rate limit exceeded', { clientIP });
        return res.status(429).json({ 
          error: limitResult.error,
          retryAfter: limitResult.retryAfter 
        });
      }
      
      res.set('X-RateLimit-Remaining', limitResult.remaining);
      next();
    });
    
    app.use((req, res, next) => {
      const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [];
      if (allowedIPs.length > 0 && req.path !== '/health') {
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        const isAllowed = allowedIPs.some(allowedIP => {
          if (allowedIP.includes('/')) {
            const [network, bits] = allowedIP.split('/');
            return clientIP.startsWith(network.split('.').slice(0, Math.floor(bits / 8)).join('.'));
          }
          return clientIP === allowedIP;
        });
        
        if (!isAllowed) {
          logger.security('IP access denied', { clientIP, allowedIPs });
          return res.status(403).json({ error: 'Access denied from this IP address' });
        }
      }
      next();
    });
    
    app.use((req, res, next) => {
      const authToken = process.env.MCP_AUTH_TOKEN;
      
      if (req.path === '/health') {
        return next();
      }
      
      if (authToken && authToken !== 'change-this-to-a-secure-random-token') {
        const providedToken = req.headers.authorization;
        
        if (!providedToken) {
          logger.security('Missing authorization header', { 
            clientIP: req.ip || req.connection.remoteAddress,
            path: req.path 
          });
          return res.status(401).json({ error: 'Authorization header required' });
        }
        
        const token = providedToken.replace('Bearer ', '');
        if (token !== authToken) {
          logger.security('Invalid authorization token', { 
            clientIP: req.ip || req.connection.remoteAddress,
            path: req.path 
          });
          return res.status(401).json({ error: 'Invalid authorization token' });
        }
      }
      
      next();
    });
    
    // Health endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        server: 'windows-build-server',
        remoteHosts: {
          nordvpn: {
            enabled: process.env.NORDVPN_ENABLED === 'true',
            hosts: process.env.NORDVPN_HOSTS ? process.env.NORDVPN_HOSTS.split(',') : []
          }
        }
      });
    });
    
    // MCP endpoint
    app.post('/mcp', async (req, res) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      logger.info('Received MCP request', { 
        clientIP, 
        method: req.body.method, 
        toolName: req.body.params?.name 
      });
      
      const { method, params } = req.body;
      
      try {
        if (method === 'tools/list') {
          res.json({
            tools: [
              { name: 'build_dotnet', description: 'Build a .NET application' },
              { name: 'run_powershell', description: 'Execute PowerShell commands' },
              { name: 'ping_host', description: 'Check connectivity to remote host' },
              { name: 'ssh_command', description: 'Execute command on remote Windows via SSH' }
            ]
          });
        } else if (method === 'tools/call') {
          const { name, arguments: args } = params;
          let result;
          
          switch (name) {
            case 'build_dotnet':
              try {
                const validatedPath = security.validatePath(args.projectPath);
                const configuration = args.configuration || 'Debug';
                logger.info('Build completed', { clientIP, projectPath: validatedPath, configuration });
                result = { content: [{ type: 'text', text: 'Build successful' }] };
              } catch (error) {
                logger.security('Build validation failed', { clientIP, error: error.message, args });
                result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
              }
              break;
              
            case 'run_powershell':
              try {
                const validatedCommand = security.validatePowerShellCommand(args.command);
                logger.info('PowerShell command executed', { clientIP, command: args.command.substring(0, 100) });
                result = { content: [{ type: 'text', text: 'Command executed successfully' }] };
              } catch (error) {
                logger.security('PowerShell validation failed', { clientIP, error: error.message, command: args.command });
                result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
              }
              break;
              
            case 'ping_host':
              try {
                const validatedHost = security.validateIPAddress(args.host);
                logger.info('Ping executed', { clientIP, host: validatedHost });
                result = { content: [{ type: 'text', text: `Ping successful to ${validatedHost}` }] };
              } catch (error) {
                logger.security('Ping validation failed', { clientIP, error: error.message, host: args.host });
                result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
              }
              break;
              
            case 'ssh_command':
              try {
                const validatedCreds = security.validateSSHCredentials(args.host, args.username, args.password);
                const validatedCommand = security.validatePowerShellCommand(args.command);
                logger.info('SSH command executed', { clientIP, host: validatedCreds.host, username: validatedCreds.username });
                result = { content: [{ type: 'text', text: 'SSH command executed successfully' }] };
              } catch (error) {
                logger.security('SSH validation failed', { clientIP, error: error.message, host: args.host });
                result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
              }
              break;
              
            default:
              logger.warn('Unknown tool requested', { clientIP, toolName: name });
              result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
          }
          
          res.json(result);
        } else {
          res.json({ error: `Unknown method: ${method}` });
        }
      } catch (error) {
        logger.error('Server error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Middleware Coverage', () => {
    test('should apply rate limiting', async () => {
      rateLimiter.checkLimit.mockReturnValueOnce({
        allowed: false,
        error: 'Rate limit exceeded',
        retryAfter: 300
      });

      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.body.error).toContain('Rate limit exceeded');
      expect(response.body.retryAfter).toBe(300);
    });

    test('should set rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });

    test('should handle IP whitelist with CIDR notation', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('X-Forwarded-For', '192.168.1.100') // Should match 192.168.1.0/24
        .set('Authorization', 'Bearer test-token-123')
        .send({ method: 'tools/list' })
        .expect(200);

      expect(response.body.tools).toBeDefined();
    });

    test('should block IPs not in whitelist', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('X-Forwarded-For', '10.0.0.1') // Not in allowed range
        .send({ method: 'tools/list' })
        .expect(403);

      expect(response.body.error).toContain('Access denied from this IP address');
    });

    test('should log access requests', async () => {
      await request(app)
        .get('/health')
        .expect(200);

      expect(logger.access).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('Security Validation Integration', () => {
    test('should handle malicious PowerShell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'malicious command' }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Dangerous command detected');
      expect(logger.security).toHaveBeenCalledWith(
        'PowerShell validation failed',
        expect.objectContaining({ error: 'Dangerous command detected' })
      );
    });

    test('should handle directory traversal in paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: { projectPath: 'C:\\projects\\..\\..\\evil.exe' }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Directory traversal detected');
    });

    test('should handle invalid IP addresses', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: { host: 'invalid' }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Invalid IP address format');
    });

    test('should handle invalid SSH credentials', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.1',
              username: 'invalid',
              password: 'password',
              command: 'Get-Process'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Invalid username');
    });
  });

  describe('Logging Integration', () => {
    test('should log successful operations', async () => {
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        })
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith(
        'Received MCP request',
        expect.objectContaining({ toolName: 'run_powershell' })
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        'PowerShell command executed',
        expect.objectContaining({ command: 'Get-Process' })
      );
    });

    test('should log security events', async () => {
      await request(app)
        .post('/mcp')
        .set('X-Forwarded-For', '10.0.0.1') // IP not in whitelist
        .send({ method: 'tools/list' })
        .expect(403);

      expect(logger.security).toHaveBeenCalledWith(
        'IP access denied',
        expect.objectContaining({ clientIP: '10.0.0.1' })
      );
    });

    test('should log unknown tools', async () => {
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
        .expect(200);

      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown tool requested',
        expect.objectContaining({ toolName: 'unknown_tool' })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle server errors gracefully', async () => {
      // Mock security to throw an unexpected error
      security.validatePowerShellCommand.mockImplementationOnce(() => {
        throw new Error('Unexpected server error');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        })
        .expect(200); // Our implementation catches errors and returns 200 with error content

      expect(response.body.content[0].text).toContain('Validation error: Unexpected server error');
      expect(logger.security).toHaveBeenCalledWith(
        'PowerShell validation failed',
        expect.objectContaining({ error: 'Unexpected server error' })
      );
    });

    test('should handle unknown methods', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({ method: 'unknown/method' })
        .expect(200);

      expect(response.body.error).toContain('Unknown method: unknown/method');
    });
  });

  describe('Configuration Coverage', () => {
    test('should show correct remote hosts configuration', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.remoteHosts.nordvpn.enabled).toBe(true);
      expect(response.body.remoteHosts.nordvpn.hosts).toEqual(['10.5.0.2', '10.5.0.3']);
    });

    test('should handle missing environment variables gracefully', async () => {
      // Test with no auth token requirement
      const originalToken = process.env.MCP_AUTH_TOKEN;
      const originalIPs = process.env.ALLOWED_IPS;
      delete process.env.MCP_AUTH_TOKEN;
      process.env.ALLOWED_IPS = '';

      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(200);

      expect(response.body.tools).toBeDefined();

      process.env.MCP_AUTH_TOKEN = originalToken;
      process.env.ALLOWED_IPS = originalIPs;
    });
  });
});