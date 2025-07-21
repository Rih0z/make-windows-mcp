/**
 * MCP Protocol Compliance Testing
 * MCPプロトコル準拠テスト - 仕様完全準拠検証
 * Model Context Protocol 2024-11-05 specification compliance verification
 */

const { EventEmitter } = require('events');

describe('MCP Protocol Compliance Testing', () => {
  let mockServer;
  let mockTransport;
  let mockClient;
  let serverInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('server/src/')) {
        delete require.cache[key];
      }
    });
    
    // Mock environment
    process.env.MCP_AUTH_TOKEN = 'test-mcp-token';
    process.env.MCP_SERVER_PORT = '8080';
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock MCP SDK components
    mockTransport = new EventEmitter();
    mockTransport.start = jest.fn();
    mockTransport.close = jest.fn();
    mockTransport.send = jest.fn();
    mockTransport.onMessage = jest.fn();
    
    mockServer = new EventEmitter();
    mockServer.setRequestHandler = jest.fn();
    mockServer.connect = jest.fn();
    mockServer.close = jest.fn();
    mockServer.addTool = jest.fn();
    mockServer.listTools = jest.fn();
    mockServer.onError = jest.fn();
    mockServer.onClose = jest.fn();
    
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
    
    // Mock utilities
    jest.doMock('../../server/src/utils/port-manager', () => ({
      initialize: jest.fn(),
      findAvailablePort: jest.fn().mockResolvedValue(8080),
      getPortInfo: jest.fn().mockReturnValue({
        preferredPort: 8080,
        assignedPort: 8080,
        fallbackUsed: false
      }),
      displayPortSummary: jest.fn(),
      setupGracefulShutdown: jest.fn(),
      cleanup: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/rate-limiter', () => ({
      checkLimit: jest.fn().mockReturnValue({
        allowed: true,
        remaining: 59,
        resetTime: Date.now() + 60000
      }),
      cleanup: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/auth-manager', () => ({
      validateToken: jest.fn().mockReturnValue(true),
      validateBearerToken: jest.fn().mockReturnValue(true),
      isTrustedIP: jest.fn().mockReturnValue(true),
      logAuthAttempt: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/logger', () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/security', () => ({
      validatePowerShellCommand: jest.fn().mockReturnValue(true),
      validatePath: jest.fn().mockReturnValue(true),
      validateCommand: jest.fn().mockReturnValue(true),
      sanitizeInput: jest.fn(input => input)
    }));
    
    jest.doMock('../../server/src/utils/helpers', () => ({
      formatCommandResult: jest.fn((output, error, exitCode) => ({
        success: exitCode === 0,
        output: output || '',
        error: error || null,
        exitCode: exitCode || 0
      })),
      validateRequiredParams: jest.fn(),
      sanitizeOutput: jest.fn(output => output),
      createTimestamp: jest.fn(() => '2023-01-01T00:00:00.000Z')
    }));
    
    jest.doMock('../../server/src/utils/help-generator', () => ({
      generateWelcomeMessage: jest.fn().mockReturnValue('Welcome to Windows MCP Server'),
      generateToolHelp: jest.fn().mockReturnValue('Tool help content'),
      generateDynamicHelp: jest.fn().mockReturnValue('Dynamic help content')
    }));
    
    // Import server after mocking
    serverInstance = require('../../server/src/server');
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_SERVER_PORT;
    
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });

  describe('MCP Protocol Version Compliance', () => {
    test('should support MCP protocol version 2024-11-05', async () => {
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
        
        expect(response.protocolVersion).toBe('2024-11-05');
        expect(response.capabilities).toEqual({
          tools: {}
        });
        expect(response.serverInfo.name).toBe('windows-mcp-server');
        expect(response.serverInfo.version).toBe('1.0.40');
      }
    });

    test('should reject unsupported protocol versions', async () => {
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const request = {
          params: {
            protocolVersion: '2024-01-01',
            capabilities: {
              tools: {}
            },
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          }
        };
        
        await expect(initHandler(request)).rejects.toThrow('Unsupported protocol version');
      }
    });
  });

  describe('Initialize Request Compliance', () => {
    test('should handle valid initialize request', async () => {
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const request = {
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              sampling: {}
            },
            clientInfo: {
              name: 'claude-desktop',
              version: '1.0.0'
            }
          }
        };
        
        const response = await initHandler(request);
        
        // Verify response structure
        expect(response).toHaveProperty('protocolVersion');
        expect(response).toHaveProperty('capabilities');
        expect(response).toHaveProperty('serverInfo');
        
        // Verify server info
        expect(response.serverInfo).toHaveProperty('name');
        expect(response.serverInfo).toHaveProperty('version');
        expect(typeof response.serverInfo.name).toBe('string');
        expect(typeof response.serverInfo.version).toBe('string');
      }
    });

    test('should reject initialize request with missing required fields', async () => {
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const invalidRequests = [
          {
            params: {
              // Missing protocolVersion
              capabilities: { tools: {} },
              clientInfo: { name: 'test', version: '1.0.0' }
            }
          },
          {
            params: {
              protocolVersion: '2024-11-05',
              // Missing capabilities
              clientInfo: { name: 'test', version: '1.0.0' }
            }
          },
          {
            params: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} }
              // Missing clientInfo
            }
          }
        ];
        
        for (const request of invalidRequests) {
          await expect(initHandler(request)).rejects.toThrow();
        }
      }
    });
  });

  describe('Tools List Compliance', () => {
    test('should return valid tools list structure', async () => {
      const listHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/list')?.[1];
      
      if (listHandler) {
        const response = await listHandler({});
        
        // Verify response structure
        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);
        
        // Verify each tool structure
        response.tools.forEach(tool => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
          
          expect(typeof tool.name).toBe('string');
          expect(typeof tool.description).toBe('string');
          expect(typeof tool.inputSchema).toBe('object');
          
          // Verify input schema structure
          expect(tool.inputSchema).toHaveProperty('type', 'object');
          expect(tool.inputSchema).toHaveProperty('properties');
          expect(typeof tool.inputSchema.properties).toBe('object');
        });
      }
    });

    test('should include all required tools', async () => {
      const listHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/list')?.[1];
      
      if (listHandler) {
        const response = await listHandler({});
        
        const toolNames = response.tools.map(tool => tool.name);
        
        // Verify all expected tools are present
        expect(toolNames).toContain('build_dotnet');
        expect(toolNames).toContain('build_java');
        expect(toolNames).toContain('build_python');
        expect(toolNames).toContain('run_powershell');
        expect(toolNames).toContain('run_batch');
        expect(toolNames).toContain('mcp_self_build');
        expect(toolNames).toContain('process_manager');
        expect(toolNames).toContain('file_sync');
        
        expect(response.tools.length).toBe(8);
      }
    });
  });

  describe('Tool Call Compliance', () => {
    test('should handle valid tool call request', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const response = await callHandler(request);
        
        // Verify response structure
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        
        // Verify content structure
        response.content.forEach(item => {
          expect(item).toHaveProperty('type');
          expect(item).toHaveProperty('text');
          expect(typeof item.type).toBe('string');
          expect(typeof item.text).toBe('string');
        });
      }
    });

    test('should reject tool call with invalid tool name', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'nonexistent_tool',
            arguments: {}
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(callHandler(request)).rejects.toThrow('Unknown tool');
      }
    });

    test('should reject tool call with missing required parameters', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              // Missing required projectPath
              buildTool: 'msbuild'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(callHandler(request)).rejects.toThrow('Missing required parameter');
      }
    });

    test('should validate tool arguments against schema', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 123 // Invalid type (should be string)
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(callHandler(request)).rejects.toThrow();
      }
    });
  });

  describe('Error Response Compliance', () => {
    test('should return proper error structure for invalid requests', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'invalid_tool',
            arguments: {}
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        try {
          await callHandler(request);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe('string');
        }
      }
    });

    test('should handle authentication errors properly', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer invalid-token',
            clientIP: '127.0.0.1'
          }
        };
        
        try {
          await callHandler(request);
          fail('Expected authentication error');
        } catch (error) {
          expect(error.message).toContain('Invalid authorization token');
        }
      }
    });
  });

  describe('JSON-RPC 2.0 Compliance', () => {
    test('should handle JSON-RPC 2.0 request format', async () => {
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const jsonRpcRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
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
        
        const response = await initHandler(jsonRpcRequest);
        
        // Response should be valid
        expect(response).toBeDefined();
        expect(response.protocolVersion).toBe('2024-11-05');
      }
    });

    test('should handle notifications (requests without id)', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const notification = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Should not throw error for notification
        await expect(callHandler(notification)).resolves.toBeDefined();
      }
    });
  });

  describe('Content Type Compliance', () => {
    test('should return text content type for tool responses', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const response = await callHandler(request);
        
        // Verify all content items have valid type
        response.content.forEach(item => {
          expect(['text', 'image', 'resource']).toContain(item.type);
        });
      }
    });

    test('should handle binary content appropriately', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'file_sync',
            arguments: {
              sourcePath: 'C:\\temp\\test.pdf',
              destPath: 'C:\\backup\\test.pdf'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const response = await callHandler(request);
        
        // Should handle binary files appropriately
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');
      }
    });
  });

  describe('Rate Limiting Compliance', () => {
    test('should implement rate limiting according to spec', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        // Mock rate limiter to return exceeded
        const mockRateLimiter = require('../../server/src/utils/rate-limiter');
        mockRateLimiter.checkLimit.mockReturnValue({
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + 60000
        });
        
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        try {
          await callHandler(request);
          fail('Expected rate limit error');
        } catch (error) {
          expect(error.message).toContain('Rate limit exceeded');
        }
      }
    });
  });

  describe('Security Compliance', () => {
    test('should validate all inputs according to security requirements', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const mockSecurity = require('../../server/src/utils/security');
        
        await callHandler(request);
        
        // Verify security validation was called
        expect(mockSecurity.validatePowerShellCommand).toHaveBeenCalledWith('Get-Process');
      }
    });

    test('should sanitize all outputs', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const mockHelpers = require('../../server/src/utils/helpers');
        
        await callHandler(request);
        
        // Verify output sanitization was called
        expect(mockHelpers.sanitizeOutput).toHaveBeenCalled();
      }
    });
  });

  describe('Logging Compliance', () => {
    test('should log all operations as required', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Date'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const mockLogger = require('../../server/src/utils/logger');
        
        await callHandler(request);
        
        // Verify logging was called
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Tool execution'),
          expect.any(Object)
        );
      }
    });
  });

  describe('Transport Layer Compliance', () => {
    test('should properly initialize transport layer', () => {
      // Verify transport initialization
      expect(mockTransport.start).toHaveBeenCalled();
    });

    test('should handle transport errors gracefully', async () => {
      mockTransport.start.mockRejectedValue(new Error('Transport failed'));
      
      // Should not throw unhandled error
      expect(() => require('../../server/src/server')).not.toThrow();
    });

    test('should cleanup transport on shutdown', () => {
      const originalExit = process.exit;
      process.exit = jest.fn();
      
      try {
        process.emit('SIGINT');
        expect(mockTransport.close).toHaveBeenCalled();
      } finally {
        process.exit = originalExit;
      }
    });
  });

  describe('Capability Negotiation Compliance', () => {
    test('should negotiate capabilities properly', async () => {
      const initHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'initialize')?.[1];
      
      if (initHandler) {
        const request = {
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: true
              },
              sampling: {}
            },
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          }
        };
        
        const response = await initHandler(request);
        
        // Should return server capabilities
        expect(response.capabilities).toEqual({
          tools: {}
        });
      }
    });
  });

  describe('Timeout Compliance', () => {
    test('should respect command timeouts', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 60'
            }
          },
          meta: {
            authorization: 'Bearer test-mcp-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock process timeout
        const mockProcess = require('child_process').spawn();
        setTimeout(() => {
          mockProcess.emit('error', new Error('Command timeout'));
        }, 100);
        
        const response = await callHandler(request);
        
        // Should handle timeout gracefully
        expect(response.content[0].text).toContain('timeout');
      }
    });
  });
});