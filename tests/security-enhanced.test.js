/**
 * @file security-enhanced.test.js
 * Enhanced security tests for Windows MCP Server
 * Tests security validation, dangerous mode, and command restrictions
 */

const request = require('supertest');
const security = require('../server/src/utils/security');

describe('Enhanced Security Tests', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Clean up require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('server/src/server')) {
        delete require.cache[key];
      }
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Command Validation Security', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      process.env.ALLOWED_IPS = '';
      process.env.ENABLE_DANGEROUS_MODE = 'false';
      process.env.ENABLE_DEV_COMMANDS = 'false';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should block dangerous commands in normal mode', async () => {
      const dangerousCommands = [
        'format C:',
        'del /f /s /q C:\\*',
        'rm -rf /',
        'shutdown /s /t 0',
        'net user malicious password123 /add'
      ];

      for (const cmd of dangerousCommands) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'execute_powershell',
              arguments: {
                command: cmd
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.content[0].text).toContain('Security validation failed');
      }
    });

    test('should allow safe commands in normal mode', async () => {
      const safeCommands = [
        'Get-Date',
        'Get-Process',
        'dir C:\\builds',
        'echo "Hello World"',
        'Get-ChildItem'
      ];

      for (const cmd of safeCommands) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'execute_powershell',
              arguments: {
                command: cmd
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.content[0].text).not.toContain('Security validation failed');
      }
    });

    test('should validate path restrictions', async () => {
      const restrictedPaths = [
        'C:\\Windows\\System32',
        'C:\\Program Files',
        '/etc/passwd',
        '..\\..\\..\\sensitive'
      ];

      for (const path of restrictedPaths) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'build_project',
              arguments: {
                projectPath: path,
                buildType: 'debug'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.content[0].text).toContain('validation failed');
      }
    });
  });

  describe('Dangerous Mode Security', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      process.env.ALLOWED_IPS = '';
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should display warning when dangerous mode is enabled', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.dangerousMode).toBe(true);
      expect(response.body.warnings).toContain('DANGEROUS MODE ENABLED');
    });

    test('should allow previously restricted commands in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "dangerous mode test"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).not.toContain('Security validation failed');
    });
  });

  describe('Development Commands Security', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      process.env.ALLOWED_IPS = '';
      process.env.ENABLE_DANGEROUS_MODE = 'false';
      process.env.ENABLE_DEV_COMMANDS = 'true';
      process.env.DEV_COMMAND_PATHS = 'C:\\dev\\,C:\\projects\\';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should allow dev commands in allowed paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'node --version'
            }
          }
        });

      expect(response.status).toBe(200);
      // Dev commands should be allowed
    });
  });

  describe('Authentication Security', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'secure-test-token-123';
      process.env.ALLOWED_IPS = '';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "test"'
            }
          }
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authentication');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "test"'
            }
          }
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid authorization token');
    });

    test('should accept requests with valid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer secure-test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "valid token test"'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('IP Address Restrictions', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      process.env.ALLOWED_IPS = '127.0.0.1,192.168.1.100';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should allow requests from allowed IPs', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "allowed IP test"'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Security Utility Functions', () => {
    test('should validate IP addresses correctly', () => {
      expect(() => security.validateIPAddress('127.0.0.1')).not.toThrow();
      expect(() => security.validateIPAddress('192.168.1.100')).not.toThrow();
      expect(() => security.validateIPAddress('invalid-ip')).toThrow();
      expect(() => security.validateIPAddress('999.999.999.999')).toThrow();
    });

    test('should validate paths correctly', () => {
      expect(() => security.validatePath('C:\\builds\\project')).not.toThrow();
      expect(() => security.validatePath('C:\\projects\\myapp')).not.toThrow();
      expect(() => security.validatePath('..\\..\\sensitive')).toThrow();
      expect(() => security.validatePath('/etc/passwd')).toThrow();
    });

    test('should detect dangerous patterns', () => {
      const dangerousCommands = [
        'format c:',
        'del /f /s /q',
        'rm -rf /',
        'shutdown',
        'net user'
      ];

      dangerousCommands.forEach(cmd => {
        expect(() => security.validateCommand(cmd)).toThrow();
      });
    });

    test('should allow safe commands', () => {
      const safeCommands = [
        'Get-Date',
        'dir',
        'echo hello',
        'npm install',
        'git status'
      ];

      safeCommands.forEach(cmd => {
        expect(() => security.validateCommand(cmd)).not.toThrow();
      });
    });
  });

  describe('Rate Limiting Security', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token';
      process.env.ALLOWED_IPS = '';
      process.env.RATE_LIMIT_REQUESTS = '5';
      process.env.RATE_LIMIT_WINDOW = '60000';
      
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    test('should apply rate limiting after threshold', async () => {
      // Make multiple requests quickly
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/mcp')
            .set('Authorization', 'Bearer test-token')
            .send({
              method: 'tools/call',
              params: {
                name: 'execute_powershell',
                arguments: {
                  command: 'echo "rate limit test"'
                }
              }
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
  });
});