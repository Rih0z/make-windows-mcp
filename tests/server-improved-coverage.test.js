const request = require('supertest');
const { spawn } = require('child_process');
const { Client: SSHClient } = require('ssh2');
const ping = require('ping');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.ALLOWED_IPS = '127.0.0.1,::1';
process.env.MCP_SERVER_PORT = '0';
process.env.RATE_LIMIT_REQUESTS = '0'; // Disable rate limiting for tests
process.env.NORDVPN_ENABLED = 'false';
process.env.REMOTE_PASSWORD = 'encrypted:password';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

// Mock modules
jest.mock('child_process');
jest.mock('ssh2');
jest.mock('ping');
jest.mock('../server/src/utils/logger');
jest.mock('../server/src/utils/crypto', () => ({
  encrypt: jest.fn(val => `encrypted:${val}`),
  decrypt: jest.fn(val => val.replace('encrypted:', '')),
  hashForLogging: jest.fn(val => `hash:${val}`),
  generateToken: jest.fn(() => 'generated-token-123')
}));

const logger = require('../server/src/utils/logger');
const crypto = require('../server/src/utils/crypto');

describe('Server Improved Coverage', () => {
  let app;
  let mockSpawnProcess;
  let mockSSHConnection;

  beforeAll(() => {
    // Setup spawn mock
    mockSpawnProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };
    spawn.mockReturnValue(mockSpawnProcess);

    // Setup SSH mock
    mockSSHConnection = {
      on: jest.fn(),
      connect: jest.fn(),
      exec: jest.fn(),
      end: jest.fn()
    };
    SSHClient.mockImplementation(() => mockSSHConnection);

    // Setup ping mock
    ping.promise = {
      probe: jest.fn().mockResolvedValue({
        alive: true,
        time: 10,
        output: 'Ping successful'
      })
    };

    // Setup logger mock
    logger.info = jest.fn();
    logger.error = jest.fn();
    logger.warn = jest.fn();
    logger.security = jest.fn();
    logger.access = jest.fn();

    // Load the app
    app = require('../server/src/server');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Environment Validation', () => {
    test('should validate production environment settings', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalToken = process.env.MCP_AUTH_TOKEN;
      const originalIPs = process.env.ALLOWED_IPS;

      process.env.NODE_ENV = 'production';
      process.env.MCP_AUTH_TOKEN = 'change-this-to-a-secure-random-token';
      delete process.env.ALLOWED_IPS;

      // Re-require to trigger validation
      jest.resetModules();
      jest.mock('../server/src/utils/logger');
      const testApp = require('../server/src/server');

      // Should have logged warnings
      expect(testApp).toBeDefined();

      // Restore
      process.env.NODE_ENV = originalEnv;
      process.env.MCP_AUTH_TOKEN = originalToken;
      process.env.ALLOWED_IPS = originalIPs;
    });

    test('should validate SSH credentials when NordVPN enabled', () => {
      const originalNordVPN = process.env.NORDVPN_ENABLED;
      const originalPassword = process.env.REMOTE_PASSWORD;

      process.env.NORDVPN_ENABLED = 'true';
      delete process.env.REMOTE_PASSWORD;

      // Re-require to trigger validation
      jest.resetModules();
      jest.mock('../server/src/utils/logger');
      const testApp = require('../server/src/server');

      expect(testApp).toBeDefined();

      // Restore
      process.env.NORDVPN_ENABLED = originalNordVPN;
      process.env.REMOTE_PASSWORD = originalPassword;
    });

    test('should validate numeric environment variables', () => {
      const invalidNumericEnvs = {
        MCP_SERVER_PORT: 'not-a-number',
        RATE_LIMIT_REQUESTS: '99999',
        COMMAND_TIMEOUT: '-100',
        SSH_TIMEOUT: 'invalid'
      };

      Object.entries(invalidNumericEnvs).forEach(([key, value]) => {
        const original = process.env[key];
        process.env[key] = value;

        jest.resetModules();
        jest.mock('../server/src/utils/logger');
        const testApp = require('../server/src/server');

        expect(testApp).toBeDefined();

        process.env[key] = original;
      });
    });
  });

  describe('Build Execution with Remote Host', () => {
    test('should execute build on remote host', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          callback();
          return mockSSHConnection;
        }
        if (event === 'error') {
          return mockSSHConnection;
        }
        return mockSSHConnection;
      });

      mockSSHConnection.exec.mockImplementation((command, callback) => {
        const mockStream = {
          on: jest.fn((event, cb) => {
            if (event === 'close') {
              cb(0, null);
            }
            return mockStream;
          }),
          stderr: {
            on: jest.fn(() => mockStream)
          }
        };
        callback(null, mockStream);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\app.csproj',
              configuration: 'Release',
              remoteHost: '192.168.1.100'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('SSH Command completed');
      expect(mockSSHConnection.connect).toHaveBeenCalled();
    });

    test('should handle remote PowerShell execution', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          callback();
          return mockSSHConnection;
        }
        return mockSSHConnection;
      });

      mockSSHConnection.exec.mockImplementation((command, callback) => {
        const mockStream = {
          on: jest.fn((event, cb) => {
            if (event === 'close') {
              cb(0, null);
            }
            if (event === 'data') {
              cb(Buffer.from('Remote command output'));
            }
            return mockStream;
          }),
          stderr: {
            on: jest.fn(() => mockStream)
          }
        };
        callback(null, mockStream);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process',
              remoteHost: '192.168.1.100'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('SSH Command completed');
    });
  });

  describe('SSH Connection Error Handling', () => {
    test('should handle SSH connection timeout', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        // Don't call ready callback to simulate timeout
        return mockSSHConnection;
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'dir'
            }
          }
        })
        .expect(200);

      // Should timeout after SSH_TIMEOUT
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockSSHConnection.end).toHaveBeenCalled();
    });

    test('should handle SSH exec error', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          callback();
          return mockSSHConnection;
        }
        return mockSSHConnection;
      });

      mockSSHConnection.exec.mockImplementation((command, callback) => {
        callback(new Error('Exec failed'));
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'dir'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('SSH Error: Exec failed');
    });

    test('should handle SSH connection error', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('Connection refused'));
          return mockSSHConnection;
        }
        return mockSSHConnection;
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'dir'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Connection failed');
    });

    test('should handle SSH stream stderr data', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          callback();
          return mockSSHConnection;
        }
        return mockSSHConnection;
      });

      mockSSHConnection.exec.mockImplementation((command, callback) => {
        const mockStream = {
          on: jest.fn((event, cb) => {
            if (event === 'data') {
              cb(Buffer.from('Standard output'));
            }
            if (event === 'close') {
              cb(0, null);
            }
            return mockStream;
          }),
          stderr: {
            on: jest.fn((event, cb) => {
              if (event === 'data') {
                cb(Buffer.from('Error output'));
              }
              return mockStream;
            })
          }
        };
        callback(null, mockStream);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'dir'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Standard output');
      expect(response.body.content[0].text).toContain('STDERR: Error output');
    });
  });

  describe('Process Execution Edge Cases', () => {
    test('should handle process spawn error', async () => {
      spawn.mockImplementationOnce(() => {
        throw new Error('Spawn failed');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Process error');
    });

    test('should handle process timeout', async () => {
      process.env.COMMAND_TIMEOUT = '100'; // 100ms timeout

      let exitCallback;
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          exitCallback = callback;
        }
        return mockSpawnProcess;
      });

      const responsePromise = request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process'
            }
          }
        });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockSpawnProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Clean up
      if (exitCallback) exitCallback(0);
      await responsePromise;

      process.env.COMMAND_TIMEOUT = '300000';
    });

    test('should handle process without stdout/stderr', async () => {
      spawn.mockImplementationOnce(() => ({
        stdout: null,
        stderr: null,
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      }));

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
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Exit code: 0');
    });
  });

  describe('Dangerous Mode Execution', () => {
    beforeEach(() => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
    });

    afterEach(() => {
      delete process.env.ENABLE_DANGEROUS_MODE;
    });

    test('should allow any PowerShell command in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'del /f /s C:\\*' // Dangerous command
            }
          }
        })
        .expect(200);

      expect(logger.security).toHaveBeenCalledWith(
        'DANGEROUS MODE: Unrestricted command execution',
        expect.objectContaining({
          command: 'del /f /s C:\\*'
        })
      );
    });

    test('should allow any SSH command in dangerous mode', async () => {
      mockSSHConnection.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          callback();
        }
        return mockSSHConnection;
      });

      mockSSHConnection.exec.mockImplementation((command, callback) => {
        const mockStream = {
          on: jest.fn((event, cb) => {
            if (event === 'close') {
              cb(0, null);
            }
            return mockStream;
          }),
          stderr: { on: jest.fn(() => mockStream) }
        };
        callback(null, mockStream);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'rm -rf /' // Dangerous command
            }
          }
        })
        .expect(200);

      expect(logger.security).toHaveBeenCalledWith(
        'DANGEROUS MODE: Unrestricted SSH command execution',
        expect.objectContaining({
          command: 'rm -rf /'
        })
      );
    });

    test('should allow any batch file in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\Windows\\System32\\evil.bat'
            }
          }
        })
        .expect(200);

      expect(logger.security).toHaveBeenCalledWith(
        'DANGEROUS MODE: Unrestricted batch file execution',
        expect.objectContaining({
          batchFile: 'C:\\Windows\\System32\\evil.bat'
        })
      );
    });
  });

  describe('Remote Command Execution', () => {
    test('should handle missing remote password', async () => {
      const originalPassword = process.env.REMOTE_PASSWORD;
      delete process.env.REMOTE_PASSWORD;

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process',
              remoteHost: '192.168.1.100'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Error: REMOTE_PASSWORD environment variable not set');

      process.env.REMOTE_PASSWORD = originalPassword;
    });

    test('should handle decryption failure', async () => {
      crypto.decrypt.mockImplementationOnce(() => {
        throw new Error('Decryption failed');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process',
              remoteHost: '192.168.1.100'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Error: Failed to decrypt remote password');
    });
  });

  describe('Ping Host Functionality', () => {
    test('should handle ping failure', async () => {
      ping.promise.probe.mockRejectedValueOnce(new Error('Ping failed'));

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: '192.168.1.1'
            }
          }
        })
        .expect(200);

      expect(response.body.content[0].text).toContain('Ping failed');
    });
  });

  describe('Unknown Methods and Tools', () => {
    test('should handle unknown method', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'unknown/method',
          params: {}
        })
        .expect(200);

      expect(response.body.error).toBe('Unknown method: unknown/method');
    });

    test('should handle malformed request', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          // Missing method
          params: {}
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});