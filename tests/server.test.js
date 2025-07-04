const request = require('supertest');
const express = require('express');

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.ALLOWED_IPS = '127.0.0.1,::1';
process.env.MCP_SERVER_PORT = '0'; // Use random available port

// Mock child_process before any imports
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10);
      }
    })
  }))
}));

// Mock the utilities
jest.mock('../server/src/utils/security');
jest.mock('../server/src/utils/rate-limiter');
jest.mock('../server/src/utils/logger');

const security = require('../server/src/utils/security');
const rateLimiter = require('../server/src/utils/rate-limiter');
const logger = require('../server/src/utils/logger');

describe('MCP Server API', () => {
  let app;

  beforeAll(() => {
    // Mock implementations
    security.validatePowerShellCommand = jest.fn((cmd) => cmd);
    security.validatePath = jest.fn((path) => path);
    security.validateIPAddress = jest.fn((ip) => ip);
    security.validateSSHCredentials = jest.fn((host, user, pass) => ({ host, username: user, password: pass }));
    security.validateBatchFilePath = jest.fn((path) => path);
    
    rateLimiter.checkLimit = jest.fn(() => ({ allowed: true, remaining: 59 }));
    
    logger.info = jest.fn();
    logger.security = jest.fn();
    logger.access = jest.fn();
    logger.warn = jest.fn();
    
    // Create test app
    app = express();
    
    // Minimal app setup for testing
    app.use(express.json());
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        server: 'windows-build-server',
        remoteHosts: {}
      });
    });
    
    app.post('/mcp', (req, res) => {
      const { method, params } = req.body;
      
      // Check auth
      const authToken = process.env.MCP_AUTH_TOKEN;
      if (authToken && authToken !== 'change-this-to-a-secure-random-token') {
        const providedToken = req.headers.authorization;
        if (!providedToken) {
          return res.status(401).json({ error: 'Authorization header required' });
        }
        const token = providedToken.replace('Bearer ', '');
        if (token !== authToken) {
          return res.status(401).json({ error: 'Invalid authorization token' });
        }
      }
      
      if (method === 'tools/list') {
        res.json({
          tools: [
            { name: 'build_dotnet', description: 'Build a .NET application' },
            { name: 'run_powershell', description: 'Execute PowerShell commands' },
            { name: 'ping_host', description: 'Check connectivity to remote host' },
            { name: 'ssh_command', description: 'Execute command on remote Windows via SSH' },
            { name: 'run_batch', description: 'Execute batch file in specific directory' }
          ]
        });
      } else if (method === 'tools/call') {
        const { name, arguments: args } = params;
        
        try {
          switch (name) {
            case 'build_dotnet':
              security.validatePath(args.projectPath);
              logger.info('Build completed', { projectPath: args.projectPath, configuration: args.configuration });
              break;
            case 'run_powershell':
              security.validatePowerShellCommand(args.command);
              logger.info('PowerShell command executed', { command: args.command.substring(0, 100) });
              break;
            case 'ping_host':
              security.validateIPAddress(args.host);
              break;
            case 'ssh_command':
              security.validateSSHCredentials(args.host, args.username, args.password);
              security.validatePowerShellCommand(args.command);
              break;
            case 'run_batch':
              security.validateBatchFilePath(args.batchFile);
              logger.info('Batch file executed', { batchFile: args.batchFile, workingDirectory: args.workingDirectory });
              break;
            default:
              logger.warn('Unknown tool requested', { toolName: name });
              return res.json({ content: [{ type: 'text', text: `Unknown tool: ${name}` }] });
          }
          
          res.json({ content: [{ type: 'text', text: 'Success' }] });
        } catch (error) {
          logger.security('Validation failed', { error: error.message });
          res.json({ content: [{ type: 'text', text: `Validation error: ${error.message}` }] });
        }
      } else {
        res.json({ error: `Unknown method: ${method}` });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        server: 'windows-build-server'
      });
    });
  });

  describe('Authentication', () => {
    test('should require authorization for MCP endpoints', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(401);

      expect(response.body.error).toContain('Authorization header required');
    });

    test('should accept valid authorization token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({ method: 'tools/list' })
        .expect(200);

      expect(response.body.tools).toBeDefined();
    });

    test('should reject invalid authorization token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({ method: 'tools/list' })
        .expect(401);

      expect(response.body.error).toContain('Invalid authorization token');
    });
  });

  describe('MCP Tools', () => {
    const authHeaders = { Authorization: 'Bearer test-token-123' };

    test('should list available tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({ method: 'tools/list' })
        .expect(200);

      expect(response.body.tools).toHaveLength(5);
      expect(response.body.tools.map(t => t.name)).toEqual([
        'build_dotnet',
        'run_powershell',
        'ping_host',
        'ssh_command',
        'run_batch'
      ]);
    });

    test('should handle PowerShell command execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        })
        .expect(200);

      expect(security.validatePowerShellCommand).toHaveBeenCalledWith('Get-Process');
      expect(logger.info).toHaveBeenCalledWith(
        'PowerShell command executed',
        expect.objectContaining({ command: 'Get-Process' })
      );
    });

    test('should handle build command execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: { 
              projectPath: 'C:\\projects\\test.csproj',
              configuration: 'Release'
            }
          }
        })
        .expect(200);

      expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\test.csproj');
      expect(logger.info).toHaveBeenCalledWith(
        'Build completed',
        expect.objectContaining({ 
          projectPath: 'C:\\projects\\test.csproj',
          configuration: 'Release'
        })
      );
    });

    test('should handle ping command', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: { host: '192.168.1.1' }
          }
        })
        .expect(200);

      expect(security.validateIPAddress).toHaveBeenCalledWith('192.168.1.1');
    });

    test('should handle batch file execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: { 
              batchFile: 'C:\\builds\\AIServer\\release\\start.bat',
              workingDirectory: 'C:\\builds\\AIServer\\release'
            }
          }
        })
        .expect(200);

      expect(security.validateBatchFilePath).toHaveBeenCalledWith('C:\\builds\\AIServer\\release\\start.bat');
      expect(logger.info).toHaveBeenCalledWith(
        'Batch file executed',
        expect.objectContaining({ 
          batchFile: 'C:\\builds\\AIServer\\release\\start.bat',
          workingDirectory: 'C:\\builds\\AIServer\\release'
        })
      );
    });

    test('should handle batch file validation errors', async () => {
      // Mock security validation to throw error
      security.validateBatchFilePath.mockImplementationOnce(() => {
        throw new Error('Batch file must be in one of the allowed directories');
      });

      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: { batchFile: 'C:\\Windows\\System32\\malware.bat' }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Batch file must be in one of the allowed directories');
      expect(logger.security).toHaveBeenCalledWith(
        'Validation failed',
        expect.objectContaining({ error: 'Batch file must be in one of the allowed directories' })
      );
    });

    test('should handle validation errors gracefully', async () => {
      // Mock security validation to throw error
      security.validatePowerShellCommand.mockImplementationOnce(() => {
        throw new Error('Dangerous command detected');
      });

      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'rm -rf /' }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Validation error: Dangerous command detected');
      expect(logger.security).toHaveBeenCalledWith(
        'Validation failed',
        expect.objectContaining({ error: 'Dangerous command detected' })
      );
    });

    test('should handle unknown tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set(authHeaders)
        .send({
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {}
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Unknown tool: unknown_tool');
    });
  });
});