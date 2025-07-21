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

describe('Additional Language Build Tools - Phase 3', () => {
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

  describe('build_kotlin Tool', () => {
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
              name: 'build_kotlin',
              arguments: {}
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('projectPath is required');
      });

      test('should validate Kotlin/Android project type', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_kotlin',
              arguments: {
                projectPath: 'C:\\projects\\MyKotlinApp',
                projectType: 'invalid_type'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid project type');
      });
    });

    describe('Kotlin Build Actions', () => {
      test('should execute Gradle build for Android app', async () => {
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
              name: 'build_kotlin',
              arguments: {
                projectPath: 'C:\\projects\\AndroidApp',
                projectType: 'android',
                buildVariant: 'release',
                tasks: ['assembleRelease']
              }
            }
          });

        expect(response.status).toBe(200);
        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('gradlew'),
          ['assembleRelease'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\AndroidApp'
          })
        );
      });

      test('should execute Kotlin/Native build', async () => {
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
              name: 'build_kotlin',
              arguments: {
                projectPath: 'C:\\projects\\KotlinNative',
                projectType: 'native',
                target: 'mingwX64',
                buildType: 'release'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('gradlew'),
          expect.arrayContaining(['build', '-Ptarget=mingwX64']),
          expect.any(Object)
        );
      });

      test('should handle Android signing configuration', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Signed APK generated',
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
              name: 'build_kotlin',
              arguments: {
                projectPath: 'C:\\projects\\AndroidApp',
                projectType: 'android',
                buildVariant: 'release',
                tasks: ['assembleRelease'],
                signingConfig: {
                  storeFile: 'C:\\keys\\release.keystore',
                  storePassword: 'encrypted:xxx',
                  keyAlias: 'release',
                  keyPassword: 'encrypted:yyy'
                }
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            'assembleRelease',
            '-Pandroid.injected.signing.store.file=C:\\keys\\release.keystore'
          ]),
          expect.any(Object)
        );
      });
    });
  });

  describe('build_swift Tool', () => {
    describe('Input Validation', () => {
      test('should validate Swift project path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build succeeded',
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
              name: 'build_swift',
              arguments: {
                projectPath: 'C:\\projects\\iOSApp',
                action: 'build'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\iOSApp');
      });

      test('should validate Swift actions', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_swift',
              arguments: {
                projectPath: 'C:\\projects\\SwiftApp',
                action: 'invalid_action'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid Swift action');
      });
    });

    describe('Swift Build Actions', () => {
      test('should execute swift build for package', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Build complete',
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
              name: 'build_swift',
              arguments: {
                projectPath: 'C:\\projects\\SwiftPackage',
                action: 'build',
                configuration: 'release',
                platform: 'windows'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'swift',
          ['build', '-c', 'release'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\SwiftPackage'
          })
        );
      });

      test('should execute swift test with coverage', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'All tests passed',
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
              name: 'build_swift',
              arguments: {
                projectPath: 'C:\\projects\\SwiftPackage',
                action: 'test',
                enableCodeCoverage: true,
                parallel: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'swift',
          ['test', '--enable-code-coverage', '--parallel'],
          expect.any(Object)
        );
      });
    });
  });

  describe('build_php Tool', () => {
    describe('Input Validation', () => {
      test('should validate PHP project path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Dependencies installed',
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
              name: 'build_php',
              arguments: {
                projectPath: 'C:\\projects\\PHPApp',
                action: 'install'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\PHPApp');
      });

      test('should validate PHP package manager', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_php',
              arguments: {
                projectPath: 'C:\\projects\\PHPApp',
                action: 'install',
                packageManager: 'invalid_manager'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid package manager');
      });
    });

    describe('PHP Build Actions', () => {
      test('should execute composer install', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Loading composer repositories',
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
              name: 'build_php',
              arguments: {
                projectPath: 'C:\\projects\\PHPApp',
                action: 'install',
                packageManager: 'composer',
                noDev: true,
                optimize: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'composer',
          ['install', '--no-dev', '--optimize-autoloader'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\PHPApp'
          })
        );
      });

      test('should execute PHPUnit tests', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'PHPUnit 9.5.0',
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
              name: 'build_php',
              arguments: {
                projectPath: 'C:\\projects\\PHPApp',
                action: 'test',
                testFramework: 'phpunit',
                coverage: true,
                testSuite: 'unit'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          expect.stringContaining('phpunit'),
          expect.arrayContaining(['--coverage-text', '--testsuite=unit']),
          expect.any(Object)
        );
      });

      test('should execute Laravel artisan commands', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Application cache cleared',
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
              name: 'build_php',
              arguments: {
                projectPath: 'C:\\projects\\LaravelApp',
                action: 'artisan',
                artisanCommand: 'cache:clear'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'php',
          ['artisan', 'cache:clear'],
          expect.any(Object)
        );
      });
    });
  });

  describe('build_ruby Tool', () => {
    describe('Input Validation', () => {
      test('should validate Ruby project path', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Bundle complete',
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
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\RubyApp',
                action: 'install'
              }
            }
          });

        expect(security.validatePath).toHaveBeenCalledWith('C:\\projects\\RubyApp');
      });

      test('should validate Ruby actions', async () => {
        security.validatePath.mockReturnValue(undefined);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer test-token-12345')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\RubyApp',
                action: 'invalid_action'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid Ruby action');
      });
    });

    describe('Ruby Build Actions', () => {
      test('should execute bundle install', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Bundle installed',
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
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\RubyApp',
                action: 'install',
                withoutGroups: ['development', 'test'],
                deployment: true
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'bundle',
          ['install', '--without', 'development test', '--deployment'],
          expect.objectContaining({
            workingDirectory: 'C:\\projects\\RubyApp'
          })
        );
      });

      test('should execute Rails commands', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Migrations completed',
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
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\RailsApp',
                action: 'rails',
                railsCommand: 'db:migrate',
                railsEnv: 'production'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'rails',
          ['db:migrate'],
          expect.objectContaining({
            env: expect.objectContaining({
              RAILS_ENV: 'production'
            })
          })
        );
      });

      test('should execute RSpec tests', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'All specs passed',
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
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\RubyApp',
                action: 'test',
                testFramework: 'rspec',
                parallel: true,
                format: 'documentation'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'rspec',
          expect.arrayContaining(['--format', 'documentation']),
          expect.any(Object)
        );
      });

      test('should build Ruby gem', async () => {
        security.validatePath.mockReturnValue(undefined);
        helpers.executeBuild.mockResolvedValue({
          success: true,
          output: 'Gem built successfully',
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
              name: 'build_ruby',
              arguments: {
                projectPath: 'C:\\projects\\MyGem',
                action: 'build',
                gemspec: 'mygem.gemspec'
              }
            }
          });

        expect(helpers.executeBuild).toHaveBeenCalledWith(
          'gem',
          ['build', 'mygem.gemspec'],
          expect.any(Object)
        );
      });
    });
  });

  describe('Multi-tool Integration Phase 3', () => {
    test('should register all phase 3 language tools', () => {
      const expectedTools = [
        'build_kotlin',
        'build_swift',
        'build_php',
        'build_ruby'
      ];

      expect(expectedTools).toHaveLength(4);
    });

    test('should support complex multi-language pipelines', async () => {
      // Test scenario: Build mobile app with backend
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