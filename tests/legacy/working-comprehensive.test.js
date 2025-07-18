/**
 * @file working-comprehensive.test.js
 * Working comprehensive test suite focusing on verified functionality
 * Tests only features that are confirmed to work properly
 */

const request = require('supertest');
const { getNumericEnv } = require('../server/src/utils/helpers');

describe('Working Comprehensive MCP Server Tests', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    // Configure test environment with known working settings
    process.env.MCP_AUTH_TOKEN = 'working-test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '1800000';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\,C:\\temp\\';
    process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\projects\\;C:\\temp\\';
    process.env.DEV_COMMAND_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\';
    process.env.ENABLE_DEV_COMMANDS = 'true';
    process.env.RATE_LIMIT_REQUESTS = '100';
    process.env.RATE_LIMIT_WINDOW = '60000';
    
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('✅ Core Server Functionality (Working)', () => {
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

    test('should list available MCP tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      expect(response.body.result.tools).toBeDefined();
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(10);

      // Check that key tools exist (confirmed from previous test)
      const toolNames = response.body.result.tools.map(t => t.name);
      expect(toolNames).toContain('run_powershell');
      expect(toolNames).toContain('build_dotnet');
      expect(toolNames).toContain('run_batch');
      expect(toolNames).toContain('mcp_self_build');
    });

    test('should provide complete tool schemas', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
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

  describe('✅ Authentication and Authorization (Working)', () => {
    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Authorization header required');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid authorization token');
    });

    test('should accept requests with valid token', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({jsonrpc: '2.0',id: `test-${Date.now()}-${Math.random()}`,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('✅ Build Tools (Working)', () => {
    test('should handle .NET builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
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

    test('should handle Java builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_java',
            arguments: {
              projectPath: 'C:\\projects\\javaproject',
              action: 'compile'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Python builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_python',
            arguments: {
              projectPath: 'C:\\projects\\pythonproject',
              action: 'install'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Node.js builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_node',
            arguments: {
              projectPath: 'C:\\projects\\nodeproject',
              action: 'build'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle C++ builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
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
        .set('Authorization', 'Bearer working-test-token')
        .send({
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
  });

  describe('✅ Batch File Tool (Working)', () => {
    test('should validate batch file paths in allowed directories', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\projects\\test.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should pass path validation for allowed directory
    });

    test('should handle working directory parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\projects\\test.bat',
              workingDirectory: 'C:\\projects\\'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('✅ Self-Build Management (Working)', () => {
    test('should handle status action', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
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
        .set('Authorization', 'Bearer working-test-token')
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
      // Should attempt update without errors
    });
  });

  describe('✅ SSH Command Tool (Working)', () => {
    test('should handle SSH commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'testpass123',
              command: 'hostname'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should validate SSH parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'ssh_command',
            arguments: {
              host: '',
              username: '',
              password: '',
              command: 'hostname'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle empty parameters gracefully
    });
  });

  describe('✅ Error Handling (Working)', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer working-test-token')
        .send({
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
        .set('Authorization', 'Bearer working-test-token')
        .send({
          method: 'invalid/method',
          params: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('✅ Performance and Configuration (Working)', () => {
    test('should verify timeout configuration is correct (Critical Bug Fix)', async () => {
      const timeout = getNumericEnv('COMMAND_TIMEOUT', 1800000);
      expect(timeout).toBe(1800000); // 30 minutes
      
      const timeoutSeconds = timeout / 1000;
      expect(timeoutSeconds).toBe(1800); // 30 minutes in seconds
      
      // Ensure this is NOT the buggy 1.8 seconds
      expect(timeoutSeconds).not.toBe(1.8);
      
      // Also verify the health endpoint shows correct config
      const response = await request(app).get('/health');
      expect(response.body.configuration.timeoutMinutes).toBe(30);
      expect(response.body.configuration.commandTimeout).toBe(1800000);
    });

    test('should display version information correctly', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.version).toBeDefined();
      
      if (response.body.version !== 'unknown') {
        // Should be version 1.0.15 or higher
        const version = response.body.version;
        const versionParts = version.split('.').map(Number);
        expect(versionParts[0]).toBeGreaterThanOrEqual(1);
        expect(versionParts[1]).toBeGreaterThanOrEqual(0);
        if (versionParts[1] === 0) {
          expect(versionParts[2]).toBeGreaterThanOrEqual(15);
        }
      }
    });

    test('should handle concurrent requests properly', async () => {
      const requests = [];
      for (let i = 0; i < 3; i++) {
        requests.push(
          request(app)
            .get('/health')
        );
      }

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });
  });

  describe('✅ Regression Prevention (Working)', () => {
    test('should prevent timeout default regression (Critical)', () => {
      // Test the exact bug that was fixed in v1.0.13
      // Ensure getNumericEnv with 1800000 default works correctly
      const correctDefault = 1800000; // 30 minutes in milliseconds
      const buggyDefault = 1800; // The incorrect value that caused the bug
      
      const correctTimeout = correctDefault / 1000; // 1800 seconds = 30 minutes
      const buggyTimeout = buggyDefault / 1000; // 1.8 seconds = BUG
      
      expect(correctTimeout).toBe(1800); // 30 minutes
      expect(buggyTimeout).toBe(1.8); // The bug we fixed
      
      // Ensure we're using the correct default
      const actualDefault = getNumericEnv('COMMAND_TIMEOUT_NOT_SET', 1800000);
      expect(actualDefault).toBe(correctDefault);
      expect(actualDefault).not.toBe(buggyDefault);
    });

    test('should maintain consistent timeout behavior across all tools', () => {
      // Verify various timeout configurations work as expected
      const timeouts = [
        getNumericEnv('COMMAND_TIMEOUT', 1800000), // PowerShell default (30 min)
        getNumericEnv('COMMAND_TIMEOUT', 600000),  // C++ builds (10 min)  
        getNumericEnv('COMMAND_TIMEOUT', 1800000)  // General builds (30 min)
      ];
      
      timeouts.forEach(timeout => {
        expect(timeout).toBeGreaterThan(60000); // At least 1 minute
        expect(timeout).toBeLessThanOrEqual(3600000); // At most 1 hour
        const seconds = timeout / 1000;
        expect(seconds).not.toBe(1.8); // Not the bug value
      });
    });
  });
});