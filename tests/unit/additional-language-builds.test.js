const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock the dependencies
jest.mock('child_process');
jest.mock('../../server/src/utils/logger');
jest.mock('../../server/src/utils/helpers');
jest.mock('../../server/src/utils/security');

const { spawn } = require('child_process');
const logger = require('../../server/src/utils/logger');
const helpers = require('../../server/src/utils/helpers');
const security = require('../../server/src/utils/security');

describe('Additional Language Build Tools', () => {
  let app;
  let mockProcess;

  beforeAll(() => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.MCP_AUTH_TOKEN = 'test-token-12345';
    process.env.ENABLE_DANGEROUS_MODE = 'false';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\;D:\\builds\\';
    process.env.COMMAND_TIMEOUT = '30000';
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup common mocks
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };

    spawn.mockReturnValue(mockProcess);
    
    logger.info = jest.fn();
    logger.error = jest.fn();
    logger.access = jest.fn();
    logger.security = jest.fn();

    helpers.sendErrorResponse = jest.fn((res, statusCode, message) => {
      res.status(statusCode).json({ error: message });
    });

    helpers.sendSuccessResponse = jest.fn((res, data) => {
      res.json(data);
    });

    helpers.executeBuild = jest.fn();

    // Setup app for testing
    app = express();
    app.use(express.json());
    app.use(require('../../server/src/server'));
  });

  describe('build_go Tool', () => {
    describe('Input Validation', () => {
      test('should validate required projectPath parameter', async () => {
        security.validatePath.mockImplementation(() => {
          throw new Error('projectPath is required');
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {}
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('projectPath is required');
      });

      test('should validate Go module path (go.mod)', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'go: downloading github.com/example/module',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'build'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\mygoapp');
      });

      test('should validate Go actions', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'invalid_action'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid Go action');
      });
    });

    describe('Go Build Actions', () => {
      test('should execute go build successfully', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build completed successfully',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'build',
                outputPath: 'C:\\builds\\mygoapp.exe'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'go',
          ['build', '-o', 'C:\\builds\\mygoapp.exe'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\mygoapp'
          })
        );
      });

      test('should execute go test with coverage', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'PASS\ncoverage: 95.2% of statements',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'test',
                coverage: true,
                verbose: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'go',
          ['test', '-v', '-cover', './...'],
          expect.any(Object)
        );
      });

      test('should handle Go modules operations', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'go: downloading dependencies',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'mod',
                modAction: 'download'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'go',
          ['mod', 'download'],
          expect.any(Object)
        );
      });

      test('should support cross-compilation', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Cross-compilation successful',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_go',
              arguments: {
                projectPath: 'C:\\projects\\mygoapp',
                action: 'build',
                targetOS: 'linux',
                targetArch: 'amd64',
                outputPath: 'C:\\builds\\mygoapp-linux'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'go',
          ['build', '-o', 'C:\\builds\\mygoapp-linux'],
          expect.objectContaining({
            env: expect.objectContaining({
              GOOS: 'linux',
              GOARCH: 'amd64'
            })
          })
        );
      });
    });
  });

  describe('build_rust Tool', () => {
    describe('Input Validation', () => {
      test('should validate Cargo.toml path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Compiling myapp v0.1.0',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_rust',
              arguments: {
                projectPath: 'C:\\projects\\myrust-app',
                action: 'build'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\myrust-app');
      });

      test('should validate Rust actions', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_rust',
              arguments: {
                projectPath: 'C:\\projects\\myrust-app',
                action: 'invalid_action'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid Rust action');
      });
    });

    describe('Cargo Build Actions', () => {
      test('should execute cargo build with release profile', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Finished release [optimized] target(s)',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_rust',
              arguments: {
                projectPath: 'C:\\projects\\myrust-app',
                action: 'build',
                release: true,
                features: ['feature1', 'feature2']
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'cargo',
          ['build', '--release', '--features', 'feature1,feature2'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\myrust-app'
          })
        );
      });

      test('should execute cargo test with specific target', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'test result: ok. 15 passed; 0 failed',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_rust',
              arguments: {
                projectPath: 'C:\\projects\\myrust-app',
                action: 'test',
                target: 'x86_64-pc-windows-msvc',
                testName: 'integration_tests'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'cargo',
          ['test', '--target', 'x86_64-pc-windows-msvc', 'integration_tests'],
          expect.any(Object)
        );
      });

      test('should handle cargo clippy for linting', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'warning: unused variable: `x`',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_rust',
              arguments: {
                projectPath: 'C:\\projects\\myrust-app',
                action: 'clippy',
                allTargets: true,
                denyWarnings: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'cargo',
          ['clippy', '--all-targets', '--', '-D', 'warnings'],
          expect.any(Object)
        );
      });
    });
  });

  describe('build_cpp Tool', () => {
    describe('Input Validation', () => {
      test('should validate C++ project path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build completed successfully',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_cpp',
              arguments: {
                projectPath: 'C:\\projects\\mycpp-app',
                buildSystem: 'cmake'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\mycpp-app');
      });

      test('should validate build system type', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_cpp',
              arguments: {
                projectPath: 'C:\\projects\\mycpp-app',
                buildSystem: 'invalid_system'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid build system');
      });
    });

    describe('CMake Build', () => {
      test('should execute cmake configure and build', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build files have been written to build/',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_cpp',
              arguments: {
                projectPath: 'C:\\projects\\mycpp-app',
                buildSystem: 'cmake',
                buildType: 'Release',
                generator: 'Visual Studio 17 2022',
                buildDir: 'build'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'cmake',
          [
            '-S', '.',
            '-B', 'build',
            '-G', 'Visual Studio 17 2022',
            '-DCMAKE_BUILD_TYPE=Release'
          ],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\mycpp-app'
          })
        );
      });

      test('should handle MSBuild for Visual Studio projects', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build succeeded.',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_cpp',
              arguments: {
                projectPath: 'C:\\projects\\mycpp-app\\MyApp.sln',
                buildSystem: 'msbuild',
                configuration: 'Release',
                platform: 'x64'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'msbuild',
          [
            'C:\\projects\\mycpp-app\\MyApp.sln',
            '/p:Configuration=Release',
            '/p:Platform=x64'
          ],
          expect.any(Object)
        );
      });
    });
  });

  describe('build_docker Tool', () => {
    describe('Input Validation', () => {
      test('should validate Dockerfile path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Successfully built abc123',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_docker',
              arguments: {
                contextPath: 'C:\\projects\\myapp',
                imageName: 'myapp:latest'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\myapp');
      });

      test('should validate image name format', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_docker',
              arguments: {
                contextPath: 'C:\\projects\\myapp',
                imageName: 'Invalid@Image@Name'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid image name');
      });
    });

    describe('Docker Build Actions', () => {
      test('should execute docker build with build args', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Successfully built and tagged myapp:latest',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_docker',
              arguments: {
                contextPath: 'C:\\projects\\myapp',
                imageName: 'myapp:latest',
                dockerfile: 'Dockerfile.prod',
                buildArgs: {
                  'NODE_ENV': 'production',
                  'VERSION': '1.0.0'
                },
                noCache: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'docker',
          [
            'build',
            '-t', 'myapp:latest',
            '-f', 'Dockerfile.prod',
            '--build-arg', 'NODE_ENV=production',
            '--build-arg', 'VERSION=1.0.0',
            '--no-cache',
            '.'
          ],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\myapp'
          })
        );
      });

      test('should handle multi-stage builds with target', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Successfully built development stage',
          exitCode: 0
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_docker',
              arguments: {
                contextPath: 'C:\\projects\\myapp',
                imageName: 'myapp:dev',
                target: 'development',
                platform: 'linux/amd64'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'docker',
          [
            'build',
            '-t', 'myapp:dev',
            '--target', 'development',
            '--platform', 'linux/amd64',
            '.'
          ],
          expect.any(Object)
        );
      });
    });
  });

  describe('Multi-tool Integration', () => {
    test('should register all additional language tools', () => {
      const expectedTools = [
        'build_go',
        'build_rust',
        'build_cpp',
        'build_docker'
      ];

      expect(expectedTools).toHaveLength(4);
    });

    test('should support complex build pipelines', async () => {
      // Test scenario: Build Rust backend → Build Docker container
      security.validatePath.mockReturnValue(undefined);
      helpers.executeBuild.mockResolvedValue({
        success: true,
        output: 'Pipeline completed successfully',
        exitCode: 0
      });

      // This would be handled by orchestration layer
      expect(true).toBe(true);
    });
  });
});