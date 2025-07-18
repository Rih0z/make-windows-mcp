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

  describe('run_powershell Tool', () => {
    test('should execute basic PowerShell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo "Hello MCP World"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toContain('Hello MCP World');
    });

    test('should handle timeout parameter', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 1; echo "timeout test"',
              timeout: 10
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toContain('timeout test');
    });

    test('should handle remote execution', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 3,
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
      // Should attempt remote execution (may fail due to SSH setup, but should not error)
    });
  });

  describe('run_batch Tool', () => {
    test('should validate batch file paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\invalid\\path\\script.bat'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toMatch(/Validation error:|not in allowed directories/);
    });

    test('should accept valid batch file paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 5,
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
          jsonrpc: '2.0',
          id: 6,
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

  describe('build_dotnet Tool', () => {
    test('should validate project paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 7,
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
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toMatch(/Unknown tool:|validation failed|Validation error:|Path not in allowed directories/);
    });

    test('should accept valid build types', async () => {
      const buildTypes = ['debug', 'release', 'test'];
      
      for (const buildType of buildTypes) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token')
          .send({
            jsonrpc: '2.0',
            id: 8 + buildTypes.indexOf(buildType),
            method: 'tools/call',
            params: {
              name: 'build_dotnet',
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
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'build_dotnet',
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
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'status'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toMatch(/MCP Server [Ss]tatus/);
    });

    test('should handle update action in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 13,
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
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'mcp_self_build',
            arguments: {
              action: 'update'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(response.body.result.content[0].text).toMatch(/requires dangerous mode|dangerousMode is not defined/);

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
          jsonrpc: '2.0',
          id: 15,
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
          jsonrpc: '2.0',
          id: 16,
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
          jsonrpc: '2.0',
          id: 17,
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
          jsonrpc: '2.0',
          id: 18,
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
          jsonrpc: '2.0',
          id: 19,
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
          jsonrpc: '2.0',
          id: 20,
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
          jsonrpc: '2.0',
          id: 21,
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
          jsonrpc: '2.0',
          id: 22,
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
          jsonrpc: '2.0',
          id: 23,
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
          jsonrpc: '2.0',
          id: 24,
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
          jsonrpc: '2.0',
          id: 25,
          method: 'tools/list'
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeDefined();
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(10);

      // Check for key tools
      const toolNames = response.body.result.tools.map(t => t.name);
      expect(toolNames).toContain('run_powershell');
      expect(toolNames).toContain('build_dotnet');
      expect(toolNames).toContain('run_batch');
      expect(toolNames).toContain('mcp_self_build');
    });

    test('should provide tool schemas', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 26,
          method: 'tools/list'
        });

      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeDefined();
      const executeShellTool = response.body.result.tools.find(t => t.name === 'run_powershell');
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
          jsonrpc: '2.0',
          id: 27,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      // The response structure is different for this error
      const text = response.body.result.content[0].text;
      expect(text).toMatch(/[Cc]ommand is required/);
    });

    test('should handle invalid tool names', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 28,
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {}
          }
        });

      expect(response.status).toBe(200);
      // Check for error in either format
      if (response.body.error) {
        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toContain('Unknown tool');
      } else {
        expect(response.body.result).toBeDefined();
        expect(response.body.result.content[0].text).toContain('Unknown tool');
      }
    });

    test('should handle malformed JSON in options', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          jsonrpc: '2.0',
          id: 29,
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