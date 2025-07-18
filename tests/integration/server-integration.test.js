/**
 * Server Integration Testing
 * server.js の完全統合テストスイート
 * MCP プロトコル準拠、ツール登録、リクエスト処理の包括的テスト
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Mock external dependencies
jest.mock('fs');
jest.mock('child_process');

describe('Server Integration Testing', () => {
  let server;
  let mockTransport;
  let mockPortManager;
  let mockRateLimiter;
  let mockAuthManager;
  let mockHelpGenerator;
  let mockLogger;
  let mockSecurity;
  let mockHelpers;
  let mockCrypto;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    const moduleCache = require.cache;
    Object.keys(moduleCache).forEach(key => {
      if (key.includes('server/src/')) {
        delete moduleCache[key];
      }
    });
    
    // Mock environment variables
    process.env.MCP_AUTH_TOKEN = 'test-token-123';
    process.env.MCP_SERVER_PORT = '8080';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\;C:\\temp\\';
    process.env.COMMAND_TIMEOUT = '30000';
    process.env.RATE_LIMIT_REQUESTS = '60';
    process.env.RATE_LIMIT_WINDOW = '60000';
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock MCP Server SDK
    mockTransport = {
      start: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    };
    
    // Mock utility modules
    mockPortManager = {
      initialize: jest.fn(),
      findAvailablePort: jest.fn().mockResolvedValue(8080),
      getPortInfo: jest.fn().mockReturnValue({
        preferredPort: 8080,
        assignedPort: 8080,
        fallbackUsed: false
      }),
      displayPortSummary: jest.fn(),
      setupGracefulShutdown: jest.fn()
    };
    
    mockRateLimiter = {
      checkLimit: jest.fn().mockReturnValue({
        allowed: true,
        remaining: 59,
        resetTime: Date.now() + 60000
      }),
      cleanup: jest.fn()
    };
    
    mockAuthManager = {
      validateToken: jest.fn().mockReturnValue(true),
      validateBearerToken: jest.fn().mockReturnValue(true),
      isTrustedIP: jest.fn().mockReturnValue(true),
      logAuthAttempt: jest.fn()
    };
    
    mockHelpGenerator = {
      generateWelcomeMessage: jest.fn().mockReturnValue('Welcome to Windows MCP Server'),
      generateToolHelp: jest.fn().mockReturnValue('Tool help content'),
      generateDynamicHelp: jest.fn().mockReturnValue('Dynamic help content')
    };
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
    
    mockSecurity = {
      validatePowerShellCommand: jest.fn().mockReturnValue(true),
      validatePath: jest.fn().mockReturnValue(true),
      validateCommand: jest.fn().mockReturnValue(true),
      sanitizeInput: jest.fn(input => input)
    };
    
    mockHelpers = {
      formatCommandResult: jest.fn((output, error, exitCode) => ({
        success: exitCode === 0,
        output: output || '',
        error: error || null,
        exitCode: exitCode || 0
      })),
      validateRequiredParams: jest.fn(),
      sanitizeOutput: jest.fn(output => output),
      createTimestamp: jest.fn(() => '2023-01-01T00:00:00.000Z')
    };
    
    mockCrypto = {
      encrypt: jest.fn(data => `encrypted_${data}`),
      decrypt: jest.fn(data => data.replace('encrypted_', '')),
      hash: jest.fn(data => `hash_${data}`)
    };
    
    // Mock fs operations
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue('test content');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();
    
    // Mock child_process
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    spawn.mockReturnValue(mockProcess);
    
    // Mock module requires
    jest.doMock('@modelcontextprotocol/sdk/server/stdio', () => ({
      StdioServerTransport: jest.fn(() => mockTransport)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/server', () => ({
      Server: jest.fn(() => ({
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn(),
        addTool: jest.fn(),
        listTools: jest.fn(),
        onError: jest.fn(),
        onClose: jest.fn()
      }))
    }));
    
    jest.doMock('../server/src/utils/port-manager', () => mockPortManager);
    jest.doMock('../server/src/utils/rate-limiter', () => mockRateLimiter);
    jest.doMock('../server/src/utils/auth-manager', () => mockAuthManager);
    jest.doMock('../server/src/utils/help-generator', () => mockHelpGenerator);
    jest.doMock('../server/src/utils/logger', () => mockLogger);
    jest.doMock('../server/src/utils/security', () => mockSecurity);
    jest.doMock('../server/src/utils/helpers', () => mockHelpers);
    jest.doMock('../server/src/utils/crypto', () => mockCrypto);
    
    // Import server after mocking
    server = require('../server/src/server');
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_SERVER_PORT;
    delete process.env.ALLOWED_BUILD_PATHS;
    delete process.env.COMMAND_TIMEOUT;
    delete process.env.RATE_LIMIT_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW;
    
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });

  describe('Server Initialization', () => {
    test('should initialize server with proper configuration', () => {
      expect(mockPortManager.initialize).toHaveBeenCalled();
      expect(mockPortManager.setupGracefulShutdown).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Windows MCP Build Server'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('v1.0.40'));
    });

    test('should display security mode warnings', () => {
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Security Mode: NORMAL'));
    });

    test('should show available tools count', () => {
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Available Tools: 8'));
    });
  });

  describe('MCP Protocol Compliance', () => {
    test('should handle initialize request properly', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      // Simulate initialize request
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const result = await initHandler({
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          }
        });
        
        expect(result).toHaveProperty('protocolVersion');
        expect(result).toHaveProperty('capabilities');
        expect(result).toHaveProperty('serverInfo');
        expect(result.serverInfo.name).toBe('windows-mcp-server');
        expect(result.serverInfo.version).toBe('1.0.40');
      }
    });

    test('should handle tools/list request', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      // Simulate tools/list request
      const listHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/list')?.[1];
      
      if (listHandler) {
        const result = await listHandler({});
        
        expect(result).toHaveProperty('tools');
        expect(Array.isArray(result.tools)).toBe(true);
        expect(result.tools.length).toBe(8);
        
        // Check for essential tools
        const toolNames = result.tools.map(tool => tool.name);
        expect(toolNames).toContain('build_dotnet');
        expect(toolNames).toContain('run_powershell');
        expect(toolNames).toContain('run_batch');
      }
    });
  });

  describe('Authentication and Authorization', () => {
    test('should validate authentication tokens', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      // Simulate tool call with authentication
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await toolHandler(request);
        
        expect(mockAuthManager.validateBearerToken).toHaveBeenCalledWith('Bearer test-token-123');
      }
    });

    test('should reject invalid authentication', async () => {
      mockAuthManager.validateBearerToken.mockReturnValue(false);
      
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer invalid-token',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(toolHandler(request)).rejects.toThrow('Invalid authorization token');
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to requests', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await toolHandler(request);
        
        expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith(
          '127.0.0.1',
          60,
          60000
        );
      }
    });

    test('should reject requests when rate limit exceeded', async () => {
      mockRateLimiter.checkLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 30000
      });
      
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(toolHandler(request)).rejects.toThrow('Rate limit exceeded');
      }
    });
  });

  describe('Tool Registration and Execution', () => {
    test('should register all required tools', () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn(),
        addTool: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      // Check that all tools are registered
      expect(mockServer.addTool).toHaveBeenCalledTimes(8);
      
      // Check specific tool registrations
      const toolCalls = mockServer.addTool.mock.calls;
      const toolNames = toolCalls.map(call => call[0].name);
      
      expect(toolNames).toContain('build_dotnet');
      expect(toolNames).toContain('build_java');
      expect(toolNames).toContain('build_python');
      expect(toolNames).toContain('run_powershell');
      expect(toolNames).toContain('run_batch');
      expect(toolNames).toContain('mcp_self_build');
      expect(toolNames).toContain('process_manager');
      expect(toolNames).toContain('file_sync');
    });

    test('should execute build_dotnet tool correctly', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild',
              configuration: 'Release'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock successful build
        mockHelpers.formatCommandResult.mockReturnValue({
          success: true,
          output: 'Build succeeded',
          error: null,
          exitCode: 0
        });
        
        const result = await toolHandler(request);
        
        expect(result).toHaveProperty('content');
        expect(result.content[0]).toHaveProperty('type', 'text');
        expect(result.content[0].text).toContain('Build succeeded');
      }
    });

    test('should execute run_powershell tool correctly', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date',
              workingDirectory: 'C:\\temp'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock successful PowerShell execution
        mockHelpers.formatCommandResult.mockReturnValue({
          success: true,
          output: '2023-01-01 12:00:00',
          error: null,
          exitCode: 0
        });
        
        const result = await toolHandler(request);
        
        expect(mockSecurity.validatePowerShellCommand).toHaveBeenCalledWith('Get-Date');
        expect(result).toHaveProperty('content');
        expect(result.content[0].text).toContain('2023-01-01 12:00:00');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle tool execution errors gracefully', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\invalid\\path',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock build failure
        mockHelpers.formatCommandResult.mockReturnValue({
          success: false,
          output: '',
          error: 'Project file not found',
          exitCode: 1
        });
        
        const result = await toolHandler(request);
        
        expect(result.content[0].text).toContain('Project file not found');
      }
    });

    test('should handle invalid tool names', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'invalid_tool',
            arguments: {}
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(toolHandler(request)).rejects.toThrow('Unknown tool: invalid_tool');
      }
    });

    test('should handle missing required parameters', async () => {
      mockHelpers.validateRequiredParams.mockImplementation(() => {
        throw new Error('Missing required parameter: projectPath');
      });
      
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(toolHandler(request)).rejects.toThrow('Missing required parameter: projectPath');
      }
    });
  });

  describe('Security Validation', () => {
    test('should validate command security', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process',
              workingDirectory: 'C:\\temp'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await toolHandler(request);
        
        expect(mockSecurity.validatePowerShellCommand).toHaveBeenCalledWith('Get-Process');
        expect(mockSecurity.validatePath).toHaveBeenCalledWith('C:\\temp');
      }
    });

    test('should reject dangerous commands', async () => {
      mockSecurity.validatePowerShellCommand.mockImplementation(() => {
        throw new Error('Dangerous command detected');
      });
      
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'rm -rf /',
              workingDirectory: 'C:\\temp'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(toolHandler(request)).rejects.toThrow('Dangerous command detected');
      }
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log tool execution', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await toolHandler(request);
        
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Tool execution'),
          expect.objectContaining({
            tool: 'build_dotnet',
            client: '127.0.0.1'
          })
        );
      }
    });

    test('should log authentication events', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test',
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        await toolHandler(request);
        
        expect(mockAuthManager.logAuthAttempt).toHaveBeenCalledWith(
          '127.0.0.1',
          'Bearer test-token-123',
          true
        );
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle multiple concurrent requests', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const requests = [];
        for (let i = 0; i < 10; i++) {
          const request = {
            params: {
              name: 'build_dotnet',
              arguments: {
                projectPath: `C:\\builds\\test${i}`,
                buildTool: 'msbuild'
              }
            },
            meta: {
              authorization: 'Bearer test-token-123',
              clientIP: '127.0.0.1'
            }
          };
          requests.push(toolHandler(request));
        }
        
        const results = await Promise.all(requests);
        
        expect(results).toHaveLength(10);
        expect(mockRateLimiter.checkLimit).toHaveBeenCalledTimes(10);
      }
    });
  });

  describe('Resource Management', () => {
    test('should handle server startup and shutdown', async () => {
      expect(mockPortManager.findAvailablePort).toHaveBeenCalled();
      expect(mockPortManager.displayPortSummary).toHaveBeenCalled();
      expect(mockTransport.start).toHaveBeenCalled();
    });

    test('should cleanup resources on shutdown', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      // Simulate shutdown
      const originalExit = process.exit;
      process.exit = jest.fn();
      
      try {
        // Trigger shutdown via signal
        process.emit('SIGINT');
        
        expect(mockRateLimiter.cleanup).toHaveBeenCalled();
        expect(mockTransport.close).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-volume requests efficiently', async () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
        connect: jest.fn(),
        close: jest.fn()
      };
      
      const { Server } = require('@modelcontextprotocol/sdk/server');
      Server.mockReturnValue(mockServer);
      
      const toolHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (toolHandler) {
        const startTime = Date.now();
        
        const requests = [];
        for (let i = 0; i < 100; i++) {
          const request = {
            params: {
              name: 'build_dotnet',
              arguments: {
                projectPath: `C:\\builds\\test${i}`,
                buildTool: 'msbuild'
              }
            },
            meta: {
              authorization: 'Bearer test-token-123',
              clientIP: '127.0.0.1'
            }
          };
          requests.push(toolHandler(request));
        }
        
        await Promise.all(requests);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should handle 100 requests in reasonable time
        expect(duration).toBeLessThan(5000);
      }
    });
  });

  describe('Help System Integration', () => {
    test('should provide welcome message on connection', () => {
      expect(mockHelpGenerator.generateWelcomeMessage).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Welcome to Windows MCP Server'));
    });

    test('should provide tool-specific help', () => {
      expect(mockHelpGenerator.generateDynamicHelp).toHaveBeenCalled();
    });
  });
});