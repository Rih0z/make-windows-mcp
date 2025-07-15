// Tests for new tools added in v1.0.6
const request = require('supertest');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');

// Mock security module
jest.mock('../server/src/utils/security', () => ({
  validateBuildPath: jest.fn().mockImplementation(path => path),
  validateIPAddress: jest.fn().mockImplementation(ip => ip),
  validatePowerShellCommand: jest.fn().mockImplementation(cmd => cmd),
  validateBatchFilePath: jest.fn().mockImplementation(path => path)
}));

// Mock logger
jest.mock('../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  security: jest.fn(),
  access: jest.fn()
}));

// Mock rate limiter
jest.mock('../server/src/utils/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true)
}));

// Mock crypto
jest.mock('../server/src/utils/crypto', () => ({
  initializeKey: jest.fn(),
  encryptionEnabled: false
}));

describe('New Tools Tests (v1.0.6)', () => {
  let app;
  let mockProcess;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.ENABLE_DANGEROUS_MODE = 'false';
    
    // Create mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { end: jest.fn() };
    mockProcess.kill = jest.fn();
    
    spawn.mockReturnValue(mockProcess);
    
    // Re-require server
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  describe('mcp_self_build tool', () => {
    test('should handle build action', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'build'
            }
          }
        });

      // Simulate successful build
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Building project...\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      
      // Log error for debugging
      if (response.status !== 200) {
        console.error('Error response:', response.body);
      }
      
      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Building project');
      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'build:all'], expect.any(Object));
    });

    test('should handle test action with skipTests option', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'test',
              options: { skipTests: true }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toBe('Tests skipped by option');
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should require dangerous mode for install action', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'install',
              targetPath: 'C:\\test-mcp'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toBe('Installation requires dangerous mode to be enabled');
    });

    test('should handle status action', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'status'
            }
          }
        });

      // Simulate tasklist output
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('"node.exe","1234","Console"\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('MCP Server status: Running');
    });
  });

  describe('process_manager tool', () => {
    test('should start a process', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'start',
              processName: 'notepad'
            }
          }
        });

      // Simulate process start
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Process started\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(spawn).toHaveBeenCalledWith('start', ['""', 'notepad'], { shell: true });
    });

    test('should stop a service', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'stop',
              processName: 'TestService',
              options: { asService: true }
            }
          }
        });

      // Simulate service stop
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Service stopped\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(spawn).toHaveBeenCalledWith('net', ['stop', 'TestService']);
    });

    test('should list all processes', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'list'
            }
          }
        });

      // Simulate process list
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('"Image Name","PID"\n"node.exe","1234"\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(spawn).toHaveBeenCalledWith('tasklist', ['/FO', 'CSV']);
    });
  });

  describe('file_sync tool', () => {
    test('should sync files with robocopy', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              source: 'C:\\source',
              destination: 'C:\\dest',
              options: {
                recursive: true,
                verify: true
              }
            }
          }
        });

      // Simulate successful robocopy
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Files copied successfully\n'));
        mockProcess.emit('close', 0);
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('File sync completed successfully');
      expect(spawn).toHaveBeenCalledWith(
        'robocopy',
        expect.arrayContaining(['C:\\source', 'C:\\dest', '*.*', '/E', '/V', '/R:3', '/W:10'])
      );
    });

    test('should handle robocopy error codes', async () => {
      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              source: 'C:\\source',
              destination: 'C:\\dest'
            }
          }
        });

      // Simulate robocopy error
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Error occurred\n'));
        mockProcess.emit('close', 8); // Error code 8+
      }, 50);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('File sync failed with code 8');
    });

    test('should apply file patterns', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              source: 'C:\\source',
              destination: 'C:\\dest',
              options: {
                pattern: '*.txt',
                excludePattern: '*.tmp'
              }
            }
          }
        });

      // Let the process complete
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 50);

      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(spawn).toHaveBeenCalledWith(
        'robocopy',
        expect.arrayContaining(['C:\\source', 'C:\\dest', '*.txt', '/XF', '*.tmp'])
      );
    });
  });

  describe('Tools list should include new tools', () => {
    test('should list all tools including new ones', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      const toolNames = response.body.result.tools.map(t => t.name);
      expect(toolNames).toContain('mcp_self_build');
      expect(toolNames).toContain('process_manager');
      expect(toolNames).toContain('file_sync');
    });
  });
});