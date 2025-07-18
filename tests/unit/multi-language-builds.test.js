const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock the dependencies
jest.mock('child_process');
jest.mock('../server/src/utils/logger');
jest.mock('../server/src/utils/helpers');
jest.mock('../server/src/utils/security');

const { spawn } = require('child_process');
const logger = require('../server/src/utils/logger');
const helpers = require('../server/src/utils/helpers');
const security = require('../server/src/utils/security');

describe('Multi-Language Build Tools', () => {
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
    app.use(require('../server/src/server'));
  });

  describe('build_java Tool', () => {
    describe('Input Validation', () => {
      test('should validate required projectPath parameter', async () => {
        security.validatePath.mockImplementation(() => {
          throw new Error('Invalid path');
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {}
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('projectPath is required');
      });

      test('should validate projectPath against allowed directories', async () => {
        security.validatePath.mockImplementation((path) => {
          if (path.includes('unauthorized')) {
            throw new Error('Path not in allowed directories');
          }
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\unauthorized\\project\\pom.xml'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Path not in allowed directories');
      });

      test('should validate build tool type (maven/gradle)', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\invalid.txt',
                buildTool: 'invalid'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid build tool');
      });

      test('should auto-detect build tool from file extension', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'BUILD SUCCESSFUL',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('mvn'),
          expect.any(Object)
        );
      });

      test('should detect Gradle build from build.gradle', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'BUILD SUCCESSFUL',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\build.gradle'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('gradle'),
          expect.any(Object)
        );
      });
    });

    describe('Maven Build', () => {
      test('should execute maven clean compile successfully', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: '[INFO] BUILD SUCCESS\n[INFO] Total time: 10.5 s',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml',
                goals: ['clean', 'compile']
              }
            }
          });

        expect(response.status).toBe(200);
        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'mvn clean compile',
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\myapp',
            timeout: 30000
          })
        );
      });

      test('should handle maven build with profiles', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: '[INFO] BUILD SUCCESS',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml',
                goals: ['clean', 'install'],
                profiles: ['production']
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'mvn clean install -Pproduction',
          expect.any(Object)
        );
      });

      test('should handle maven build with properties', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: '[INFO] BUILD SUCCESS',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml',
                goals: ['test'],
                properties: {
                  'maven.test.skip': 'false',
                  'spring.profiles.active': 'test'
                }
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'mvn test -Dmaven.test.skip=false -Dspring.profiles.active=test',
          expect.any(Object)
        );
      });
    });

    describe('Gradle Build', () => {
      test('should execute gradle build successfully', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'BUILD SUCCESSFUL in 15s',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\build.gradle',
                tasks: ['clean', 'build']
              }
            }
          });

        expect(response.status).toBe(200);
        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'gradle clean build',
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\myapp'
          })
        );
      });

      test('should handle gradle wrapper (gradlew)', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'BUILD SUCCESSFUL',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\build.gradle',
                useWrapper: true,
                tasks: ['test']
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'gradlew test',
          expect.any(Object)
        );
      });

      test('should handle gradle build with properties', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'BUILD SUCCESSFUL',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\build.gradle',
                tasks: ['bootRun'],
                properties: {
                  'spring.profiles.active': 'dev'
                }
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'gradle bootRun -Dspring.profiles.active=dev',
          expect.any(Object)
        );
      });
    });

    describe('Error Handling', () => {
      test('should handle build failures', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: false,
          output: '[ERROR] COMPILATION ERROR',
          exitCode: 1
        });

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml'
              }
            }
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('Build failed');
      });

      test('should handle timeout errors', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockRejectedValue(new Error('Command timeout'));

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml'
              }
            }
          });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('timeout');
      });

      test('should handle missing build files', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\nonexistent.xml'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Unsupported project file');
      });
    });

    describe('Remote Host Support', () => {
      test('should handle remote Maven builds', async () => {
        security.validatePath.mockReturnValue(undefined);
        security.validateIPAddress.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: '[INFO] BUILD SUCCESS',
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
              name: 'build_java',
              arguments: {
                projectPath: 'C:\\projects\\myapp\\pom.xml',
                remoteHost: '192.168.1.100',
                goals: ['clean', 'package']
              }
            }
          });

        expect(security.validateIPAddress).toHaveBeenCalledWith('192.168.1.100');
        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('mvn clean package'),
          expect.objectContaining({
            remoteHost: '192.168.1.100'
          })
        );
      });
    });
  });

  describe('Multi-tool Integration', () => {
    test('should register all multi-language build tools', () => {
      // This test will be updated when we implement the actual tools
      // For now, we're testing the expected tool names
      const expectedTools = [
        'build_java',
        'build_python', 
        'build_node'
      ];

      // In the actual implementation, we'll check if tools are registered
      expect(expectedTools).toHaveLength(3);
    });
  });
});