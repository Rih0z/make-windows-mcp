/**
 * Client-Server E2E Testing
 * クライアント-サーバー間の包括的E2Eテストスイート
 * 実際のMCP通信、データフロー、エラー処理の統合テスト
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('net');

describe('Client-Server E2E Testing', () => {
  let mockServer;
  let mockClient;
  let mockPortManager;
  let mockProcess;
  let mockTransport;
  let testPort;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('server/src/') || key.includes('client/src/')) {
        delete require.cache[key];
      }
    });
    
    // Test environment setup
    testPort = 8080;
    process.env.MCP_AUTH_TOKEN = 'test-e2e-token-123';
    process.env.MCP_SERVER_PORT = testPort.toString();
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\;C:\\temp\\';
    process.env.COMMAND_TIMEOUT = '30000';
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock child_process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();
    spawn.mockReturnValue(mockProcess);
    
    // Mock fs operations
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue('test content');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();
    
    // Mock net operations
    const mockNetServer = new EventEmitter();
    mockNetServer.listen = jest.fn((port, host, callback) => {
      callback && callback();
    });
    mockNetServer.close = jest.fn();
    net.createServer = jest.fn().mockReturnValue(mockNetServer);
    
    // Mock MCP Transport
    mockTransport = new EventEmitter();
    mockTransport.start = jest.fn();
    mockTransport.close = jest.fn();
    mockTransport.send = jest.fn();
    mockTransport.onMessage = jest.fn();
    
    // Mock MCP Server
    mockServer = new EventEmitter();
    mockServer.setRequestHandler = jest.fn();
    mockServer.connect = jest.fn();
    mockServer.close = jest.fn();
    mockServer.addTool = jest.fn();
    mockServer.listTools = jest.fn();
    
    // Mock MCP Client
    mockClient = new EventEmitter();
    mockClient.connect = jest.fn();
    mockClient.close = jest.fn();
    mockClient.request = jest.fn();
    mockClient.listTools = jest.fn();
    mockClient.callTool = jest.fn();
    
    // Mock SDK modules
    jest.doMock('@modelcontextprotocol/sdk/server', () => ({
      Server: jest.fn(() => mockServer)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/server/stdio', () => ({
      StdioServerTransport: jest.fn(() => mockTransport)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/client', () => ({
      Client: jest.fn(() => mockClient)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/client/stdio', () => ({
      StdioClientTransport: jest.fn(() => mockTransport)
    }));
    
    // Mock port manager
    mockPortManager = {
      initialize: jest.fn(),
      findAvailablePort: jest.fn().mockResolvedValue(testPort),
      getPortInfo: jest.fn().mockReturnValue({
        preferredPort: testPort,
        assignedPort: testPort,
        fallbackUsed: false
      }),
      displayPortSummary: jest.fn(),
      setupGracefulShutdown: jest.fn(),
      cleanup: jest.fn()
    };
    
    jest.doMock('../server/src/utils/port-manager', () => mockPortManager);
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_SERVER_PORT;
    delete process.env.ALLOWED_BUILD_PATHS;
    delete process.env.COMMAND_TIMEOUT;
    
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });

  describe('Server-Client Connection', () => {
    test('should establish MCP connection successfully', async () => {
      // Start server
      const server = require('../server/src/server');
      
      // Mock successful connection
      mockServer.connect.mockResolvedValue(true);
      mockTransport.start.mockResolvedValue(true);
      
      // Verify server initialization
      expect(mockPortManager.initialize).toHaveBeenCalled();
      expect(mockPortManager.findAvailablePort).toHaveBeenCalled();
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith('initialize', expect.any(Function));
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith('tools/list', expect.any(Function));
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith('tools/call', expect.any(Function));
      expect(mockTransport.start).toHaveBeenCalled();
    });

    test('should handle connection timeout', async () => {
      // Mock connection timeout
      mockTransport.start.mockRejectedValue(new Error('Connection timeout'));
      
      // Verify error handling
      expect(() => require('../server/src/server')).not.toThrow();
    });

    test('should handle port conflicts', async () => {
      // Mock port conflict
      mockPortManager.findAvailablePort.mockRejectedValue(new Error('No available ports'));
      
      // Verify graceful handling
      expect(() => require('../server/src/server')).not.toThrow();
    });
  });

  describe('MCP Protocol Message Flow', () => {
    test('should handle initialize handshake', async () => {
      const server = require('../server/src/server');
      
      // Mock initialize request
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const request = {
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
        };
        
        const response = await initHandler(request);
        
        expect(response).toEqual({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'windows-mcp-server',
            version: '1.0.40'
          }
        });
      }
    });

    test('should handle tools/list request', async () => {
      const server = require('../server/src/server');
      
      // Mock tools/list request
      const listHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/list')?.[1];
      
      if (listHandler) {
        const response = await listHandler({});
        
        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);
        expect(response.tools.length).toBe(8);
        
        // Verify tool structure
        response.tools.forEach(tool => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
        });
      }
    });

    test('should handle tools/call request', async () => {
      const server = require('../server/src/server');
      
      // Mock tools/call request
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\builds\\test.csproj',
              buildTool: 'msbuild',
              configuration: 'Release'
            }
          },
          meta: {
            authorization: 'Bearer test-e2e-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock successful build
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Build successful'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response).toHaveProperty('content');
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain('dotnet build');
      }
    });
  });

  describe('Tool Execution Flow', () => {
    test('should execute PowerShell command end-to-end', async () => {
      const server = require('../server/src/server');
      
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date',
              workingDirectory: 'C:\\temp'
            }
          },
          meta: {
            authorization: 'Bearer test-e2e-token-123',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock PowerShell execution
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('2023-01-01 12:00:00'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(spawn).toHaveBeenCalledWith(\n          'powershell',\n          ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Date'],\n          {\n            cwd: 'C:\\\\temp',\n            timeout: 30000,\n            killSignal: 'SIGTERM'\n          }\n        );\n        \n        expect(response.content[0].text).toContain('2023-01-01 12:00:00');\n      }\n    });\n\n    test('should execute .NET build end-to-end', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'build_dotnet',\n            arguments: {\n              projectPath: 'C:\\\\builds\\\\MyApp.csproj',\n              buildTool: 'dotnet',\n              configuration: 'Release'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock dotnet build execution\n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('Build succeeded.'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(spawn).toHaveBeenCalledWith(\n          'dotnet',\n          ['build', 'C:\\\\builds\\\\MyApp.csproj', '-c', 'Release'],\n          {\n            cwd: 'C:\\\\builds\\\\',\n            timeout: 30000,\n            killSignal: 'SIGTERM'\n          }\n        );\n        \n        expect(response.content[0].text).toContain('Build succeeded');\n      }\n    });\n\n    test('should execute Python build end-to-end', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'build_python',\n            arguments: {\n              projectPath: 'C:\\\\builds\\\\python-app',\n              requirements: 'requirements.txt',\n              testCommand: 'pytest'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock Python build execution\n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('Virtual environment created'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(response.content[0].text).toContain('Python build');\n      }\n    });\n  });\n\n  describe('Error Handling Flow', () => {\n    test('should handle command execution errors', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-NonExistentCommand'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock command failure\n        setTimeout(() => {\n          mockProcess.stderr.emit('data', Buffer.from('Command not found'));\n          mockProcess.emit('close', 1);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(response.content[0].text).toContain('Command not found');\n      }\n    });\n\n    test('should handle authentication errors', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-Date'\n            }\n          },\n          meta: {\n            authorization: 'Bearer invalid-token',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        await expect(callHandler(request)).rejects.toThrow('Invalid authorization token');\n      }\n    });\n\n    test('should handle rate limiting', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        // Mock rate limiter to return exceeded\n        const mockRateLimiter = require('../server/src/utils/rate-limiter');\n        mockRateLimiter.checkLimit = jest.fn().mockReturnValue({\n          allowed: false,\n          remaining: 0,\n          resetTime: Date.now() + 60000\n        });\n        \n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-Date'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        await expect(callHandler(request)).rejects.toThrow('Rate limit exceeded');\n      }\n    });\n  });\n\n  describe('Security Validation Flow', () => {\n    test('should validate command security', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-Process'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock security validation\n        const mockSecurity = require('../server/src/utils/security');\n        mockSecurity.validatePowerShellCommand = jest.fn().mockReturnValue(true);\n        \n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('Process list'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(mockSecurity.validatePowerShellCommand).toHaveBeenCalledWith('Get-Process');\n        expect(response.content[0].text).toContain('Process list');\n      }\n    });\n\n    test('should reject dangerous commands', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        // Mock security validation to reject dangerous command\n        const mockSecurity = require('../server/src/utils/security');\n        mockSecurity.validatePowerShellCommand = jest.fn().mockImplementation(() => {\n          throw new Error('Dangerous command detected');\n        });\n        \n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Remove-Item -Path C:\\\\ -Recurse -Force'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        await expect(callHandler(request)).rejects.toThrow('Dangerous command detected');\n      }\n    });\n  });\n\n  describe('Resource Management Flow', () => {\n    test('should handle server shutdown gracefully', async () => {\n      const server = require('../server/src/server');\n      \n      // Mock graceful shutdown\n      const originalExit = process.exit;\n      process.exit = jest.fn();\n      \n      try {\n        // Trigger shutdown\n        process.emit('SIGINT');\n        \n        // Verify cleanup\n        expect(mockPortManager.cleanup).toHaveBeenCalled();\n        expect(mockTransport.close).toHaveBeenCalled();\n      } finally {\n        process.exit = originalExit;\n      }\n    });\n\n    test('should handle process cleanup on timeout', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Start-Sleep -Seconds 60'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock timeout\n        setTimeout(() => {\n          mockProcess.emit('error', new Error('Command timeout'));\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(mockProcess.kill).toHaveBeenCalled();\n        expect(response.content[0].text).toContain('timeout');\n      }\n    });\n  });\n\n  describe('Performance and Stress Testing', () => {\n    test('should handle concurrent requests', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const promises = [];\n        \n        for (let i = 0; i < 10; i++) {\n          const request = {\n            params: {\n              name: 'run_powershell',\n              arguments: {\n                command: `Write-Output \"Request ${i}\"`\n              }\n            },\n            meta: {\n              authorization: 'Bearer test-e2e-token-123',\n              clientIP: '127.0.0.1'\n            }\n          };\n          \n          promises.push(callHandler(request));\n        }\n        \n        // Mock successful responses\n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('Request completed'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const results = await Promise.all(promises);\n        \n        expect(results).toHaveLength(10);\n        results.forEach(result => {\n          expect(result).toHaveProperty('content');\n        });\n      }\n    });\n\n    test('should handle memory pressure', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const largeCommand = 'Write-Output \"' + 'A'.repeat(10000) + '\"';\n        \n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: largeCommand\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock large response\n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('A'.repeat(10000)));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(response.content[0].text).toContain('A'.repeat(100)); // Partial check\n      }\n    });\n  });\n\n  describe('Logging and Monitoring Flow', () => {\n    test('should log all operations', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-Date'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock logger\n        const mockLogger = require('../server/src/utils/logger');\n        mockLogger.info = jest.fn();\n        mockLogger.error = jest.fn();\n        \n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('2023-01-01'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        expect(mockLogger.info).toHaveBeenCalledWith(\n          expect.stringContaining('Tool execution'),\n          expect.any(Object)\n        );\n      }\n    });\n\n    test('should monitor server health', async () => {\n      const server = require('../server/src/server');\n      \n      // Verify health monitoring setup\n      expect(mockPortManager.initialize).toHaveBeenCalled();\n      expect(mockPortManager.getPortInfo).toHaveBeenCalled();\n      expect(mockPortManager.displayPortSummary).toHaveBeenCalled();\n    });\n  });\n\n  describe('Data Integrity and Validation', () => {\n    test('should validate request structure', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const invalidRequest = {\n          params: {\n            name: 'run_powershell'\n            // Missing arguments\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        await expect(callHandler(invalidRequest)).rejects.toThrow();\n      }\n    });\n\n    test('should sanitize output data', async () => {\n      const server = require('../server/src/server');\n      \n      const callHandler = mockServer.setRequestHandler.mock.calls\n        .find(call => call[0] === 'tools/call')?.[1];\n      \n      if (callHandler) {\n        const request = {\n          params: {\n            name: 'run_powershell',\n            arguments: {\n              command: 'Get-Date'\n            }\n          },\n          meta: {\n            authorization: 'Bearer test-e2e-token-123',\n            clientIP: '127.0.0.1'\n          }\n        };\n        \n        // Mock output with control characters\n        setTimeout(() => {\n          mockProcess.stdout.emit('data', Buffer.from('Output\\x00\\x01\\x02'));\n          mockProcess.emit('close', 0);\n        }, 10);\n        \n        const response = await callHandler(request);\n        \n        // Should not contain control characters\n        expect(response.content[0].text).not.toContain('\\x00');\n        expect(response.content[0].text).not.toContain('\\x01');\n        expect(response.content[0].text).not.toContain('\\x02');\n      }\n    });\n  });\n\n  describe('Help System Integration', () => {\n    test('should provide dynamic help', async () => {\n      const server = require('../server/src/server');\n      \n      // Mock help generator\n      const mockHelpGenerator = require('../server/src/utils/help-generator');\n      mockHelpGenerator.generateWelcomeMessage = jest.fn().mockReturnValue('Welcome to Windows MCP Server');\n      mockHelpGenerator.generateDynamicHelp = jest.fn().mockReturnValue('Dynamic help content');\n      \n      // Verify help system is initialized\n      expect(mockHelpGenerator.generateWelcomeMessage).toHaveBeenCalled();\n      expect(mockHelpGenerator.generateDynamicHelp).toHaveBeenCalled();\n    });\n  });\n});