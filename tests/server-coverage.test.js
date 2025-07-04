// Focused server.js coverage tests
const request = require('supertest');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('os');

// Mock the logger
jest.mock('../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  security: jest.fn(),
  access: jest.fn()
}));

// Mock the rate limiter
jest.mock('../server/src/utils/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true)
}));

// Mock security
jest.mock('../server/src/utils/security', () => ({
  validatePowerShellCommand: jest.fn().mockImplementation(cmd => cmd),
  validateBuildPath: jest.fn().mockImplementation(path => path),
  validateIPAddress: jest.fn().mockImplementation(ip => ip),
  validateBatchFilePath: jest.fn().mockImplementation(path => path)
}));

// Mock crypto
jest.mock('../server/src/utils/crypto', () => ({
  encrypt: jest.fn(text => text),
  decrypt: jest.fn(text => text),
  hashForLogging: jest.fn(() => 'hashed...'),
  initializeKey: jest.fn(),
  encryptionEnabled: true
}));

describe('Server Coverage Tests', () => {
  let app;
  let mockProcess;
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      MCP_AUTH_TOKEN: 'test-token',
      ENABLE_DANGEROUS_MODE: 'false',
      BUILD_OUTPUT_DIR: 'C:\\builds',
      WINDOWS_VM_IP: '192.168.1.100',
      ALLOWED_BUILD_PATHS: 'C:\\builds\\;C:\\projects\\',
      ALLOWED_BATCH_DIRS: 'C:\\builds\\;C:\\temp\\'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { end: jest.fn() };
    mockProcess.kill = jest.fn();
    
    spawn.mockReturnValue(mockProcess);
    
    // Re-require server to get fresh instance
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
    
    // Mock os.homedir
    os.homedir.mockReturnValue('C:\\Users\\testuser');
    
    // Mock fs functions
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('.ssh\\config')) {
        return 'Host testhost\n  HostName 192.168.1.100\n  User testuser';
      }
      return '';
    });
  });

  describe('SSH Command Tool Coverage', () => {
    test('should handle ssh command with saved connection', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'testuser@testhost',
              command: 'ls -la'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['testuser@testhost', 'ls -la']),
        expect.any(Object)
      );
    });

    test('should handle ssh command with password prompt', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'newuser@newhost',
              command: 'pwd',
              password: 'secretpass'
            }
          }
        });

      // Wait a bit for the request to be processed
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate password prompt
      mockProcess.stdout.emit('data', Buffer.from('password:'));
      
      // Wait for password to be sent
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Simulate command output
      mockProcess.stdout.emit('data', Buffer.from('/home/newuser\n'));
      mockProcess.emit('close', 0);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(mockProcess.stdin.end).toHaveBeenCalledWith('secretpass\n');
    });

    test('should handle ssh command with host key verification', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'user@newhost',
              command: 'echo test',
              acceptHostKey: true
            }
          }
        });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate host key verification prompt
      mockProcess.stdout.emit('data', Buffer.from('Are you sure you want to continue connecting (yes/no)?'));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Simulate success
      mockProcess.stdout.emit('data', Buffer.from('test\n'));
      mockProcess.emit('close', 0);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(mockProcess.stdin.end).toHaveBeenCalledWith('yes\n');
    });

    test('should handle ssh command timeout', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'user@host',
              command: 'sleep 100',
              timeout: 100 // 100ms timeout
            }
          }
        });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(response.status).toBe(200);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    test('should handle ssh process error', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'user@host',
              command: 'test'
            }
          }
        });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate process error
      mockProcess.emit('error', new Error('spawn ssh ENOENT'));

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('SSH error');
    });

    test('should save new SSH connection', async () => {
      fs.existsSync.mockImplementation(path => {
        if (path.includes('.ssh')) return false;
        return true;
      });
      
      fs.mkdirSync = jest.fn();
      fs.appendFileSync = jest.fn();

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              connection: 'newuser@192.168.1.200',
              command: 'ls',
              saveConnection: true
            }
          }
        });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.ssh'),
        { recursive: true }
      );
      expect(fs.appendFileSync).toHaveBeenCalled();
    });
  });

  describe('Run Batch Tool Coverage', () => {
    test('should execute batch file in dangerous mode', async () => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\any\\path\\script.bat',
              args: ['arg1', 'arg2']
            }
          }
        });

      expect(response.status).toBe(200);
      expect(spawn).toHaveBeenCalledWith(
        'C:\\any\\path\\script.bat',
        ['arg1', 'arg2'],
        expect.objectContaining({ shell: false })
      );
      
      process.env.ENABLE_DANGEROUS_MODE = 'false';
    });

    test('should handle batch file with output', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\builds\\test.bat'
            }
          }
        });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate batch output
      mockProcess.stdout.emit('data', Buffer.from('Batch output line 1\r\n'));
      mockProcess.stdout.emit('data', Buffer.from('Batch output line 2\r\n'));
      mockProcess.stderr.emit('data', Buffer.from('Warning: something\r\n'));
      mockProcess.emit('close', 0);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Batch output line 1');
      expect(response.body.content[0].text).toContain('Warning: something');
    });
  });

  describe('Error Handling Coverage', () => {
    test('should handle invalid tool name', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'invalid_tool',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toBe('Unknown tool: invalid_tool');
    });

    test('should handle missing arguments', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build',
            arguments: null
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
    });

    test('should handle rate limit exceeded', async () => {
      const rateLimiter = require('../server/src/utils/rate-limiter');
      rateLimiter.checkRateLimit.mockReturnValue(false);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/list'
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Rate limit exceeded');
    });
  });

  describe('Build Tool Edge Cases', () => {
    test('should handle spawn error in build', async () => {
      spawn.mockImplementation(() => {
        throw new Error('spawn ENOENT');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test.sln'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Failed to execute command');
    });

    test('should handle process crash', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test.sln'
            }
          }
        });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate process crash
      mockProcess.emit('close', null, 'SIGSEGV');

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('terminated by signal');
    });
  });

  describe('Tools List Coverage', () => {
    test('should list all tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      expect(response.body.tools).toBeDefined();
      expect(response.body.tools.length).toBeGreaterThan(0);
      expect(response.body.tools.map(t => t.name)).toContain('build_dotnet');
      expect(response.body.tools.map(t => t.name)).toContain('ssh_command');
      expect(response.body.tools.map(t => t.name)).toContain('run_batch');
    });
  });

  describe('Unknown Method Coverage', () => {
    test('should handle unknown method', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'unknown/method'
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toContain('Unknown method');
    });
  });
});