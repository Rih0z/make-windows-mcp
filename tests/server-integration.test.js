const request = require('supertest');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = 'test-token-123';
process.env.ALLOWED_IPS = '';
process.env.MCP_SERVER_PORT = '0';
process.env.NORDVPN_ENABLED = 'true';
process.env.NORDVPN_HOSTS = '10.5.0.2,10.5.0.3';
process.env.REMOTE_USERNAME = 'testuser';
process.env.REMOTE_PASSWORD = 'testpass';

// Mock modules
jest.mock('child_process');
jest.mock('ssh2');
jest.mock('ping');
jest.mock('helmet', () => () => (req, res, next) => next());

const mockSpawn = spawn;
const mockSSH = require('ssh2');
const mockPing = require('ping');

describe('Server Integration Tests', () => {
  jest.setTimeout(30000); // Increase timeout to 30 seconds
  let app;
  let mockProcess;
  let mockSSHClient;

  beforeAll(() => {
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
      probe: jest.fn().mockResolvedValue({
        alive: true,
        time: 15,
        output: 'Reply from 192.168.1.1: bytes=32 time=15ms TTL=64'
      })
    };
    
    // Import server after mocking
    app = require('../server/src/server.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Execution', () => {
    test('should execute PowerShell commands successfully', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        });

      // Simulate successful command execution
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Process output');
        mockProcess.stderr.emit('data', '');
        mockProcess.emit('close', 0);
      }, 10);

      expect(mockSpawn).toHaveBeenCalledWith('powershell', ['-Command', 'Get-Process'], { shell: true });
    });

    test('should handle command execution errors', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        });

      // Simulate command failure
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Command failed');
        mockProcess.emit('close', 1);
      }, 10);

      expect(response.status).toBe(200);
    });

    test('should execute dotnet build commands', async () => {
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
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

      expect(mockSpawn).toHaveBeenCalledWith(
        'dotnet', 
        ['build', 'C:\\projects\\test.csproj', '-c', 'Release'], 
        { shell: true }
      );
    });

    test('should default to Debug configuration when not specified', async () => {
      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: { projectPath: 'C:\\projects\\test.csproj' }
          }
        });

      expect(mockSpawn).toHaveBeenCalledWith(
        'dotnet', 
        ['build', 'C:\\projects\\test.csproj', '-c', 'Debug'], 
        { shell: true }
      );
    });
  });

  describe('SSH Remote Execution', () => {
    test('should execute commands on remote host via SSH', async () => {
      const mockStream = new EventEmitter();
      mockStream.stderr = new EventEmitter();
      
      mockSSHClient.exec.mockImplementation((command, callback) => {
        callback(null, mockStream);
        setImmediate(() => {
          mockStream.emit('data', 'Remote command output');
          mockStream.emit('close', 0);
        });
      });
      
      setImmediate(() => {
        mockSSHClient.emit('ready');
      });

      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '10.5.0.2',
              username: 'admin',
              password: 'password',
              command: 'Get-Service'
            }
          }
        });

      expect(mockSSHClient.connect).toHaveBeenCalledWith({
        host: '10.5.0.2',
        username: 'admin',
        password: 'password',
        port: 22
      });
    });

    test('should handle SSH connection errors', async () => {
      mockSSHClient.connect.mockImplementation(() => {
        setTimeout(() => {
          mockSSHClient.emit('error', new Error('Connection failed'));
        }, 10);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '10.5.0.2',
              username: 'admin',
              password: 'password',
              command: 'Get-Service'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Connection failed');
    });

    test('should handle SSH exec errors', async () => {
      mockSSHClient.exec.mockImplementation((command, callback) => {
        callback(new Error('Exec failed'), null);
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '10.5.0.2',
              username: 'admin',
              password: 'password',
              command: 'Get-Service'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Connection failed');
    });
  });

  describe('Remote Host Execution', () => {
    test('should execute PowerShell on remote host', async () => {
      const mockStream = new EventEmitter();
      mockStream.stderr = new EventEmitter();
      
      mockSSHClient.exec.mockImplementation((command, callback) => {
        callback(null, mockStream);
        setTimeout(() => {
          mockStream.emit('data', 'Remote PowerShell output');
          mockStream.emit('close', 0);
        }, 10);
      });

      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { 
              command: 'Get-Process',
              remoteHost: '10.5.0.2'
            }
          }
        });

      expect(mockSSHClient.connect).toHaveBeenCalled();
    });

    test('should execute dotnet build on remote host', async () => {
      const mockStream = new EventEmitter();
      mockStream.stderr = new EventEmitter();
      
      mockSSHClient.exec.mockImplementation((command, callback) => {
        expect(command).toContain('dotnet build');
        callback(null, mockStream);
        setTimeout(() => {
          mockStream.emit('data', 'Build successful');
          mockStream.emit('close', 0);
        }, 10);
      });

      await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: { 
              projectPath: 'C:\\projects\\remote.csproj',
              remoteHost: '10.5.0.2'
            }
          }
        });

      expect(mockSSHClient.connect).toHaveBeenCalled();
    });

    test('should handle missing remote password', async () => {
      // Temporarily remove remote password
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
              remoteHost: '10.5.0.2'
            }
          }
        });

      expect(response.body.result.content[0].text).toContain('REMOTE_PASSWORD environment variable not set');
      
      // Restore password
      process.env.REMOTE_PASSWORD = originalPassword;
    });
  });

  describe('Ping Host Functionality', () => {
    test('should ping host successfully', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: { host: '192.168.1.1' }
          }
        });

      expect(mockPing.promise.probe).toHaveBeenCalledWith('192.168.1.1');
      expect(response.body.result.content[0].text).toContain('Ping result for 192.168.1.1');
      expect(response.body.result.content[0].text).toContain('Alive: true');
    });

    test('should handle ping failures', async () => {
      mockPing.promise.probe.mockRejectedValueOnce(new Error('Network unreachable'));

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: { host: '192.168.1.1' }
          }
        });

      expect(response.body.result.content[0].text).toContain('Ping failed for 192.168.1.1');
    });
  });

  describe('Health Check with Remote Hosts', () => {
    test('should return health status with NordVPN configuration', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.remoteHosts.nordvpn.enabled).toBe(true);
      expect(response.body.remoteHosts.nordvpn.hosts).toEqual(['10.5.0.2', '10.5.0.3']);
    });
  });

  describe('Error Handling', () => {
    test('should handle server errors gracefully', async () => {
      // Force an error by mocking a function to throw
      const originalSpawn = mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token-123')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: { command: 'Get-Process' }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Validation error');
    });
  });
});