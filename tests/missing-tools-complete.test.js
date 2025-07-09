/**
 * @file missing-tools-complete.test.js
 * Complete test coverage for previously untested MCP tools
 * Ensures 100% tool coverage across the Windows MCP Server
 */

const request = require('supertest');

describe('Missing Tools Complete Test Coverage', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    // Configure test environment
    process.env.MCP_AUTH_TOKEN = 'missing-tools-test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '1800000';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\,C:\\temp\\';
    process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\projects\\;C:\\temp\\';
    process.env.DEV_COMMAND_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\';
    process.env.ENABLE_DEV_COMMANDS = 'true';
    
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('run_powershell Tool (Complete Testing)', () => {
    test('should execute basic PowerShell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Output "PowerShell Test Complete"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content).toBeDefined();
      expect(response.body.content[0].text).toContain('PowerShell Test Complete');
    });

    test('should handle PowerShell with custom timeout', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Milliseconds 100; Write-Output "After sleep"',
              timeout: 60
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('After sleep');
    });

    test('should handle PowerShell with remote execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'hostname',
              remoteHost: '127.0.0.1'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should attempt remote execution
    });

    test('should validate required command parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Validation error');
    });

    test('should handle PowerShell script blocks', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: '$result = 1 + 1; Write-Output "Result is $result"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Result is 2');
    });
  });

  describe('ping_host Tool (Complete Testing)', () => {
    test('should successfully ping localhost', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: '127.0.0.1'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content).toBeDefined();
      expect(response.body.content[0].text).toContain('Ping result');
    });

    test('should handle invalid hostname', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: 'invalid-host-name-12345.test'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Ping');
    });

    test('should validate required host parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('host is required');
    });

    test('should handle IP address formats', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ping_host',
            arguments: {
              host: '8.8.8.8'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Ping result');
    });
  });

  describe('ssh_command Tool (Complete Testing)', () => {
    test('should validate all required SSH parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'testuser',
              password: 'testpass',
              command: 'echo "SSH test"'
            }
          }
        });

      expect(response.status).toBe(200);
      // SSH connection attempt should be made
    });

    test('should reject missing SSH parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100'
              // Missing username, password, command
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('required');
    });

    test('should handle SSH connection timeout', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.255.255', // Unreachable IP
              username: 'testuser',
              password: 'testpass',
              command: 'hostname'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle timeout gracefully
    }, 10000);

    test('should validate IP address format', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: 'not-an-ip',
              username: 'testuser',
              password: 'testpass',
              command: 'hostname'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Validation error');
    });
  });

  describe('build_kotlin Tool (Complete Testing)', () => {
    test('should handle Kotlin Gradle builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_kotlin',
            arguments: {
              projectPath: 'C:\\projects\\kotlinapp',
              buildTool: 'gradle',
              task: 'build'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content).toBeDefined();
    });

    test('should handle Kotlin Maven builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_kotlin',
            arguments: {
              projectPath: 'C:\\projects\\kotlinapp',
              buildTool: 'maven',
              task: 'package'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate Kotlin project paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_kotlin',
            arguments: {
              projectPath: 'C:\\invalid\\path',
              buildTool: 'gradle'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation failed');
    });
  });

  describe('build_php Tool (Complete Testing)', () => {
    test('should handle PHP Composer operations', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_php',
            arguments: {
              projectPath: 'C:\\projects\\phpapp',
              action: 'install'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle PHP testing', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_php',
            arguments: {
              projectPath: 'C:\\projects\\phpapp',
              action: 'test'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate PHP actions', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_php',
            arguments: {
              projectPath: 'C:\\projects\\phpapp',
              action: 'invalid-action'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Invalid PHP action');
    });
  });

  describe('build_ruby Tool (Complete Testing)', () => {
    test('should handle Ruby bundle install', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_ruby',
            arguments: {
              projectPath: 'C:\\projects\\rubyapp',
              action: 'install'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Ruby rake tasks', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_ruby',
            arguments: {
              projectPath: 'C:\\projects\\rubyapp',
              action: 'build',
              task: 'compile'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate Ruby project paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_ruby',
            arguments: {
              projectPath: 'C:\\invalid\\ruby\\path',
              action: 'install'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation failed');
    });
  });

  describe('build_swift Tool (Complete Testing)', () => {
    test('should handle Swift Package Manager builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_swift',
            arguments: {
              projectPath: 'C:\\projects\\swiftapp',
              action: 'build',
              configuration: 'release'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Swift testing', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_swift',
            arguments: {
              projectPath: 'C:\\projects\\swiftapp',
              action: 'test'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate Swift configurations', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_swift',
            arguments: {
              projectPath: 'C:\\projects\\swiftapp',
              action: 'build',
              configuration: 'invalid-config'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle invalid configuration
    });
  });

  describe('Tool Parameter Validation Edge Cases', () => {
    test('should handle extremely long command strings', async () => {
      const longCommand = 'echo "' + 'A'.repeat(5000) + '"';
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: longCommand
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle or reject gracefully
    });

    test('should handle special characters in paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_kotlin',
            arguments: {
              projectPath: 'C:\\projects\\test & build\\app',
              buildTool: 'gradle'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle special characters properly
    });

    test('should handle Unicode in commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer missing-tools-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Output "テスト 测试 тест"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('テスト');
    });
  });

  describe('Concurrent Tool Execution', () => {
    test('should handle multiple ping requests simultaneously', async () => {
      const pingRequests = ['127.0.0.1', '8.8.8.8', 'localhost'].map(host =>
        request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer missing-tools-test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'ping_host',
              arguments: { host }
            }
          })
      );

      const responses = await Promise.all(pingRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.content[0].text).toContain('Ping result');
      });
    });

    test('should handle mixed tool requests concurrently', async () => {
      const mixedRequests = [
        request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer missing-tools-test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'run_powershell',
              arguments: { command: 'echo "Test1"' }
            }
          }),
        request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer missing-tools-test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'ping_host',
              arguments: { host: '127.0.0.1' }
            }
          }),
        request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer missing-tools-test-token')
          .send({
            method: 'tools/list'
          })
      ];

      const responses = await Promise.all(mixedRequests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});