const request = require('supertest');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_AUTH_TOKEN = ''; // Disable auth for testing
process.env.MCP_SERVER_PORT = '0';
process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\,C:\\build\\';
process.env.ALLOWED_IPS = ''; // Allow all IPs for testing
process.env.COMMAND_TIMEOUT = '30000';
process.env.SSH_TIMEOUT = '5000';

// Mock dependencies
jest.mock('ssh2');
jest.mock('ping');
jest.mock('fs');
jest.mock('helmet', () => () => (req, res, next) => next());

const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const { createSpawnMock, MockProcess } = require('./helpers/mock-process');

describe('Enhanced Integration Tests', () => {
  let app;

  beforeEach(() => {
    // Clear all caches and reset modules
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup comprehensive mocks
    setupMocks();
    
    // Clear rate limiter
    const rateLimiter = require('../server/src/utils/rate-limiter');
    rateLimiter.clear();
    
    // Fresh app instance
    app = require('../server/src/server.js');
  });

  function setupMocks() {
    // Enhanced FS mocks
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.appendFileSync.mockImplementation(() => {});
    fs.statSync.mockReturnValue({ size: 1000 });
    fs.renameSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
    
    // Setup child_process mock with proper responses
    const spawn = createSpawnMock({
      'cmd.exe /c if not exist': { exitCode: 0, stdout: '' },
      'cmd.exe /c mkdir': { exitCode: 0, stdout: '' },
      'xcopy.exe': { exitCode: 0, stdout: '10 File(s) copied' },
      'dotnet.exe build': { 
        exitCode: 0, 
        stdout: 'Build successful\nBuild succeeded.', 
        stderr: 'Warning: deprecated API' 
      },
      'powershell.exe': { 
        exitCode: 0, 
        stdout: 'Command executed successfully' 
      },
      'invalid-project': { 
        exitCode: 1, 
        stdout: '', 
        stderr: 'Build failed' 
      }
    });
    
    // Override the child_process module
    jest.doMock('child_process', () => ({
      spawn
    }));
    
    // Enhanced SSH mock
    jest.doMock('ssh2', () => {
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
              stream.emit('data', Buffer.from('Remote execution result'));
              stream.emit('close', 0);
            });
          });
          client.end = jest.fn();
          return client;
        })
      };
    });
    
    // Enhanced ping mock
    jest.doMock('ping', () => ({
      promise: {
        probe: jest.fn().mockResolvedValue({
          alive: true,
          time: 15,
          output: 'PING 8.8.8.8: 56 data bytes\\n64 bytes from 8.8.8.8: icmp_seq=0 time=15ms'
        })
      }
    }));
  }

  describe('End-to-End Workflow Tests', () => {
    test('should handle complete .NET build workflow', async () => {
      // Step 1: List available tools
      const toolsRes = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/list'
        })
        .expect(200);
      
      expect(toolsRes.body.tools).toHaveLength(4);
      expect(toolsRes.body.tools.map(t => t.name)).toContain('build_dotnet');
      
      // Step 2: Execute build
      const buildRes = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\MyApp.csproj',
              configuration: 'Release'
            }
          }
        })
        .expect(200);
      
      expect(buildRes.body.content[0].text).toContain('Build successful');
      expect(buildRes.body.content[0].text).toContain('Exit code: 0');
    });

    test('should handle PowerShell command chain', async () => {
      const commands = [
        'Get-Process | Select-Object -First 5',
        'Get-Service | Where-Object {$_.Status -eq "Running"}',
        'Get-ChildItem C:\\ -Directory'
      ];
      
      for (const command of commands) {
        const res = await request(app)
          .post('/mcp')
            .send({
            method: 'tools/call',
            params: {
              name: 'run_powershell',
              arguments: { command }
            }
          })
          .expect(200);
        
        expect(res.body.content[0].text).toContain('Exit code: 0');
      }
    });

    test('should handle SSH remote operations', async () => {
      const sshRes = await request(app)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'securepassword',
              command: 'dotnet --version'
            }
          }
        })
        .expect(200);
      
      expect(sshRes.body.content[0].text).toContain('SSH Command completed');
    });
  });

  describe('Security Integration Tests', () => {
    test('should enforce authentication consistently', async () => {
      // Test with auth enabled
      jest.resetModules();
      process.env.MCP_AUTH_TOKEN = 'test-auth-token';
      
      // Clear rate limiter
      jest.doMock('../server/src/utils/rate-limiter', () => {
        const original = jest.requireActual('../server/src/utils/rate-limiter');
        original.clear();
        return original;
      });
      
      const authApp = require('../server/src/server.js');
      
      // No auth header
      await request(authApp)
        .post('/mcp')
        .send({ method: 'tools/list' })
        .expect(401);
      
      // Invalid token
      await request(authApp)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({ method: 'tools/list' })
        .expect(401);
      
      // Valid token should work
      await request(authApp)
        .post('/mcp')
        .set('Authorization', 'Bearer test-auth-token')
        .send({ method: 'tools/list' })
        .expect(200);
        
      // Reset for other tests
      process.env.MCP_AUTH_TOKEN = '';
    });

    test('should handle rate limiting across different endpoints', async () => {
      const requests = [];
      
      // Generate multiple requests rapidly
      for (let i = 0; i < 65; i++) {
        requests.push(
          request(app)
            .post('/mcp')
                .send({ method: 'tools/list' })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses
      const rateLimitedCount = responses.filter(res => res.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    test('should validate all input parameters consistently', async () => {
      const invalidInputs = [
        {
          name: 'build_dotnet',
          arguments: { projectPath: '../../../etc/passwd' }
        },
        {
          name: 'run_powershell',
          arguments: { command: 'shutdown /s /t 0' }
        },
        {
          name: 'ping_host',
          arguments: { host: 'invalid-ip-address' }
        },
        {
          name: 'ssh_command',
          arguments: {
            host: '192.168.1.1',
            username: 'admin\x00',
            password: 'test',
            command: 'echo test'
          }
        }
      ];
      
      for (const input of invalidInputs) {
        const res = await request(app)
          .post('/mcp')
            .send({
            method: 'tools/call',
            params: input
          })
          .expect(200);
        
        expect(res.body.content[0].text).toContain('Validation error');
      }
    });
  });

  describe('Error Handling Integration Tests', () => {
    test('should handle process failures gracefully', async () => {
      // Create a custom spawn mock for this test
      const failingSpawn = jest.fn((command, args) => {
        const mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();
        
        process.nextTick(() => {
          if (mockProcess.stderr) {
            mockProcess.stderr.emit('data', Buffer.from('Build failed: Missing dependencies'));
          }
          mockProcess.emit('close', 1);
        });
        
        return mockProcess;
      });
      
      // Mock child_process for this specific test
      jest.doMock('child_process', () => ({
        spawn: failingSpawn
      }));
      
      // Clear module cache and reload
      jest.resetModules();
      const testApp = require('../server/src/server.js');
      
      const res = await request(testApp)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\FailingApp.csproj'
            }
          }
        })
        .expect(200);
      
      expect(res.body.content[0].text).toContain('Exit code: 1');
      expect(res.body.content[0].text).toContain('Build failed');
    });

    test('should handle network failures in SSH', async () => {
      // Mock SSH connection failure
      jest.doMock('ssh2', () => {
        return {
          Client: jest.fn().mockImplementation(() => {
            const client = new EventEmitter();
            client.connect = jest.fn().mockImplementation(function() {
              process.nextTick(() => this.emit('error', new Error('Connection timeout')));
            }.bind(client));
            client.end = jest.fn();
            return client;
          })
        };
      });
      
      // Re-require the module to get the new mock
      delete require.cache[require.resolve('../server/src/server.js')];
      const newApp = require('../server/src/server.js');
      
      const res = await request(newApp)
        .post('/mcp')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'password',
              command: 'echo test'
            }
          }
        })
        .expect(200);
      
      expect(res.body.content[0].text).toContain('Connection failed');
    });
  });

  describe('Performance and Concurrency Tests', () => {
    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const requests = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .post('/mcp')
                .send({
              method: 'tools/call',
              params: {
                name: 'ping_host',
                arguments: { host: '8.8.8.8' }
              }
            })
        );
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      // All requests should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.content[0].text).toContain('Alive: true');
      });
      
      // Should complete within reasonable time (10 seconds)
      expect(endTime - startTime).toBeLessThan(10000);
    });

    test('should handle multiple build processes', async () => {
      const projects = [
        'C:\\projects\\App1.csproj',
        'C:\\projects\\App2.csproj',
        'C:\\projects\\App3.csproj'
      ];
      
      const buildPromises = projects.map(project =>
        request(app)
          .post('/mcp')
            .send({
            method: 'tools/call',
            params: {
              name: 'build_dotnet',
              arguments: { projectPath: project }
            }
          })
      );
      
      const responses = await Promise.all(buildPromises);
      
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.content[0].text).toContain('Build successful');
      });
    });
  });

  describe('Health and Status Tests', () => {
    test('should provide health status without authentication', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body.status).toBe('ok');
      expect(res.body.server).toBe('windows-build-server');
      expect(res.body.remoteHosts).toBeDefined();
    });

    test('should handle unknown methods gracefully', async () => {
      const res = await request(app)
        .post('/mcp')
        .send({
          method: 'unknown/method'
        })
        .expect(200);
      
      expect(res.body.error).toContain('Unknown method');
    });

    test('should handle unknown tools gracefully', async () => {
      const res = await request(app)
        .post('/mcp')
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
  });
});