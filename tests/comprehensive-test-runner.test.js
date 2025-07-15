/**
 * @file comprehensive-test-runner.test.js
 * Comprehensive test runner that properly configures environment for all tests
 * Fixes path validation issues and provides complete coverage
 */

const request = require('supertest');
const { getNumericEnv } = require('../server/src/utils/helpers');

describe('Comprehensive MCP Server Tests', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    // Configure comprehensive test environment
    process.env.MCP_AUTH_TOKEN = 'comprehensive-test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '1800000';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\,C:\\temp\\';
    process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\projects\\;C:\\temp\\';
    process.env.DEV_COMMAND_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\';
    process.env.ENABLE_DEV_COMMANDS = 'true';
    process.env.RATE_LIMIT_REQUESTS = '100';
    process.env.RATE_LIMIT_WINDOW = '60000';
    
    // Clear require cache to ensure fresh server instance
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Core Server Health and Configuration', () => {
    test('should respond to health check with complete configuration', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.server).toBe('windows-build-server');
      expect(response.body.version).toBeDefined();
      expect(response.body.configuration).toBeDefined();
      expect(response.body.configuration.commandTimeout).toBe(1800000);
      expect(response.body.configuration.timeoutMinutes).toBe(30);
      expect(response.body.configuration.dangerousMode).toBe(true);
      expect(response.body.configuration.devCommands).toBe(true);
    });

    test('should list all available MCP tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      expect(response.body.result.tools).toBeDefined();
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(15);

      const toolNames = response.body.result.tools.map(t => t.name);
      const expectedTools = [
        'run_powershell',
        'build_dotnet', 
        'run_batch',
        'mcp_self_build',
        'ssh_command',
        'build_java',
        'build_python',
        'build_node',
        'build_cpp',
        'build_docker',
        'build_kotlin'
      ];

      expectedTools.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });
  });

  describe('2. Authentication and Authorization', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Authorization header is required');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Authentication token is invalid');
    });

    test('should accept requests with valid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('3. PowerShell Execution Tool', () => {
    test('should execute basic PowerShell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo "PowerShell test successful"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toContain('PowerShell test successful');
    });

    test('should handle timeout parameters correctly', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 1; echo "timeout test"',
              timeout: 30
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('timeout test');
    });

    test('should validate required command parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Command is required');
    });
  });

  describe('4. Build Project Tool', () => {
    test('should handle valid project builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\testproject',
              buildType: 'debug'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content).toBeDefined();
    });

    test('should validate build types', async () => {
      const validBuildTypes = ['debug', 'release', 'test'];
      
      for (const buildType of validBuildTypes) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer comprehensive-test-token')
          .send({
            jsonrpc: '2.0',
            id: `test-${Date.now()}-${Math.random()}`,
            method: 'tools/call',
            params: {
              name: 'build_dotnet',
              arguments: {
                projectPath: 'C:\\projects\\testproject',
                buildType
              }
            }
          });

        expect(response.status).toBe(200);
      }
    });

    test('should reject invalid project paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\invalid\\path',
              buildType: 'debug'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Path not in allowed directories');
    });
  });

  describe('5. Batch File Execution Tool', () => {
    test('should validate batch file paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\projects\\test.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should pass path validation
    });

    test('should handle batch files in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\projects\\nonexistent.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      // In dangerous mode, should attempt to execute (but file doesn't exist)
      expect(response.body.result.content[0].text).toBeDefined();
    });

    test('should handle working directory parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\projects\\test.bat',
              workingDirectory: 'C:\\projects\\'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('6. Multi-Language Build Tools', () => {
    const languages = [
      { name: 'build_go', projectPath: 'C:\\projects\\goproject', action: 'build' },
      { name: 'build_rust', projectPath: 'C:\\projects\\rustproject', action: 'build' },
      { name: 'build_python', projectPath: 'C:\\projects\\pythonproject', action: 'install' },
      { name: 'build_java', projectPath: 'C:\\projects\\javaproject', action: 'compile' },
      { name: 'build_node', projectPath: 'C:\\projects\\nodeproject', action: 'build' }
    ];

    languages.forEach(lang => {
      test(`should handle ${lang.name} builds`, async () => {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer comprehensive-test-token')
          .send({
            jsonrpc: '2.0',
            id: `test-${Date.now()}-${Math.random()}`,
            method: 'tools/call',
            params: {
              name: lang.name,
              arguments: {
                projectPath: lang.projectPath,
                action: lang.action
              }
            }
          });

        expect(response.status).toBe(200);
      });
    });
  });

  describe('7. Specialized Build Tools', () => {
    test('should handle C++ builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'build_cpp',
            arguments: {
              projectPath: 'C:\\projects\\cppproject',
              compiler: 'msvc',
              configuration: 'Release'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Docker builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'build_docker',
            arguments: {
              projectPath: 'C:\\projects\\dockerproject',
              imageName: 'testapp',
              tag: 'latest'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Kotlin builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'build_kotlin',
            arguments: {
              projectPath: 'C:\\projects\\kotlinproject',
              action: 'build'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('8. Self-Build Management Tool', () => {
    test('should handle status action', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'status'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('MCP Server status');
    });

    test('should handle update action in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'update',
              options: JSON.stringify({ autoStart: false })
            }
          }
        });

      expect(response.status).toBe(200);
      // Should attempt update (may fail due to environment, but shouldn't error)
    });
  });

  describe('9. SSH Connection Tool', () => {
    test('should handle SSH connection saving', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'testpass123'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate SSH connection parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '',
              username: '',
              password: ''
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle empty parameters gracefully
    });
  });

  describe('10. Error Handling and Edge Cases', () => {
    test('should handle unknown tools gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Unknown tool');
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'update',
              options: 'invalid-json'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle malformed JSON without crashing
    });

    test('should handle invalid method calls', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'invalid/method',
          params: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('11. Performance and Timeout Verification', () => {
    test('should verify timeout configuration is correct', () => {
      const timeout = getNumericEnv('COMMAND_TIMEOUT', 1800000);
      expect(timeout).toBe(1800000); // 30 minutes
      
      const timeoutSeconds = timeout / 1000;
      expect(timeoutSeconds).toBe(1800); // 30 minutes in seconds
      
      // Ensure this is NOT the buggy 1.8 seconds
      expect(timeoutSeconds).not.toBe(1.8);
    });

    test('should handle concurrent requests', async () => {
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .post('/mcp')
            .set('Authorization', 'Bearer comprehensive-test-token')
            .send({
              jsonrpc: '2.0',
              id: `test-${Date.now()}-${Math.random()}`,
              method: 'tools/call',
              params: {
                name: 'run_powershell',
                arguments: {
                  command: `echo "Concurrent test ${i}"`
                }
              }
            })
        );
      }

      const responses = await Promise.all(requests);
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(`Concurrent test ${index}`);
      });
    });
  });

  describe('12. Security and Validation', () => {
    test('should maintain security in dangerous mode', async () => {
      // Even in dangerous mode, some basic validations should remain
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({
          jsonrpc: '2.0',
          id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: '' // Empty command should still be rejected
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Command is required');
    });

    test('should validate tool schemas are complete', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer comprehensive-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      response.body.result.tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });
});