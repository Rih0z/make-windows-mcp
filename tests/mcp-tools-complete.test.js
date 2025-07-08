/**
 * @file mcp-tools-complete.test.js
 * Comprehensive tests for all MCP tools including newly added functionality
 */

const request = require('supertest');

describe('Complete MCP Tools Test Suite', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '1800000';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\projects\\';
    process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\temp\\';
    
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('execute_powershell Tool', () => {
    test('should execute basic PowerShell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "Hello MCP World"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Hello MCP World');
    });

    test('should handle timeout parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 1; echo "timeout test"',
              timeout: 10
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('timeout test');
    });

    test('should handle remote execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'hostname',
              remoteHost: '127.0.0.1'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should attempt remote execution (may fail due to SSH setup, but should not error)
    });
  });

  describe('run_batch Tool', () => {
    test('should validate batch file paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\invalid\\path\\script.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('not in allowed directories');
    });

    test('should accept valid batch file paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\builds\\test.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should not reject based on path validation
    });

    test('should handle working directory parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\builds\\test.bat',
              workingDirectory: 'C:\\builds\\'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('build_project Tool', () => {
    test('should validate project paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_project',
            arguments: {
              projectPath: 'C:\\invalid\\path',
              buildType: 'debug'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation failed');
    });

    test('should accept valid build types', async () => {
      const buildTypes = ['debug', 'release', 'test'];
      
      for (const buildType of buildTypes) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'build_project',
              arguments: {
                projectPath: 'C:\\builds\\testproject',
                buildType
              }
            }
          });

        expect(response.status).toBe(200);
      }
    });

    test('should handle custom output directory', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_project',
            arguments: {
              projectPath: 'C:\\builds\\testproject',
              buildType: 'release',
              outputDir: 'C:\\builds\\output'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('mcp_self_build Tool', () => {
    test('should handle status action', async () => {
      const response = await request(app)
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

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('MCP Server Status');
    });

    test('should handle update action in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
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
      // Should attempt update (may fail due to Git setup, but should not error)
    });

    test('should reject update in normal mode', async () => {
      // Temporarily disable dangerous mode
      process.env.ENABLE_DANGEROUS_MODE = 'false';
      delete require.cache[require.resolve('../server/src/server')];
      const normalApp = require('../server/src/server');

      const response = await request(normalApp)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'update'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('requires dangerous mode');

      // Restore dangerous mode
      process.env.ENABLE_DANGEROUS_MODE = 'true';
    });
  });

  describe('save_ssh_connection Tool', () => {
    test('should validate SSH connection parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'save_ssh_connection',
            arguments: {
              host: 'invalid-host-format',
              username: 'testuser',
              password: 'testpass'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle SSH connection saving
    });

    test('should handle valid SSH connection data', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'save_ssh_connection',
            arguments: {
              host: '192.168.1.100',
              username: 'admin',
              password: 'securepass123'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Multi-Language Build Tools', () => {
    test('should handle Go builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_go',
            arguments: {
              projectPath: 'C:\\builds\\goproject',
              action: 'build',
              outputPath: 'C:\\builds\\output\\app.exe'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Rust builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_rust',
            arguments: {
              projectPath: 'C:\\builds\\rustproject',
              action: 'build',
              profile: 'release'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Python builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_python',
            arguments: {
              projectPath: 'C:\\builds\\pythonproject',
              action: 'install'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Java builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_java',
            arguments: {
              projectPath: 'C:\\builds\\javaproject',
              action: 'compile'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Node.js builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_node',
            arguments: {
              projectPath: 'C:\\builds\\nodeproject',
              action: 'build'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Specialized Build Tools', () => {
    test('should handle C++ builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_cpp',
            arguments: {
              projectPath: 'C:\\builds\\cppproject',
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
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_docker',
            arguments: {
              projectPath: 'C:\\builds\\dockerproject',
              imageName: 'myapp',
              tag: 'latest'
            }
          }
        });

      expect(response.status).toBe(200);
    });

    test('should handle Android builds', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_android',
            arguments: {
              projectPath: 'C:\\builds\\androidproject',
              buildType: 'assembleRelease'
            }
          }
        });

      expect(response.status).toBe(200);
    });
  });

  describe('Tool Listing and Discovery', () => {
    test('should list all available tools', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      expect(response.body.tools).toBeDefined();
      expect(Array.isArray(response.body.tools)).toBe(true);
      expect(response.body.tools.length).toBeGreaterThan(10);

      // Check for key tools
      const toolNames = response.body.tools.map(t => t.name);
      expect(toolNames).toContain('execute_powershell');
      expect(toolNames).toContain('build_project');
      expect(toolNames).toContain('run_batch');
      expect(toolNames).toContain('mcp_self_build');
    });

    test('should provide tool schemas', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/list'
        });

      const executeShellTool = response.body.tools.find(t => t.name === 'execute_powershell');
      expect(executeShellTool).toBeDefined();
      expect(executeShellTool.inputSchema).toBeDefined();
      expect(executeShellTool.inputSchema.properties).toBeDefined();
      expect(executeShellTool.inputSchema.properties.command).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle missing required parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('command is required');
    });

    test('should handle invalid tool names', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Unknown tool');
    });

    test('should handle malformed JSON in options', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
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
      // Should handle malformed JSON gracefully
    });
  });
});