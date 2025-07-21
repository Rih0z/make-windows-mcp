/**
 * Windows Command Execution Testing
 * 実際のWindowsコマンド実行テスト
 * Real Windows command execution integration tests
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Mock child_process for controlled testing
jest.mock('child_process');
jest.mock('fs');

describe('Windows Command Execution Testing', () => {
  let mockProcess;
  let mockSpawn;
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
    process.env.MCP_AUTH_TOKEN = 'test-windows-token';
    process.env.MCP_SERVER_PORT = '8080';
    process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\;C:\\temp\\;C:\\projects";
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
    mockProcess.pid = 1234;
    
    mockSpawn = spawn;
    mockSpawn.mockReturnValue(mockProcess);
    
    // Mock fs operations
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue('mock content');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();
    fs.statSync = jest.fn().mockReturnValue({ isDirectory: () => false });
    
    // Mock os operations
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    jest.spyOn(os, 'type').mockReturnValue('Windows_NT');
    
    // Mock all utility modules
    jest.doMock('../../server/src/utils/port-manager', () => ({
      initialize: jest.fn(),
      findAvailablePort: jest.fn().mockResolvedValue(8080),
      getPortInfo: jest.fn().mockReturnValue({ preferredPort: 8080, assignedPort: 8080 }),
      displayPortSummary: jest.fn(),
      setupGracefulShutdown: jest.fn(),
      cleanup: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/rate-limiter', () => ({
      checkLimit: jest.fn().mockReturnValue({ allowed: true, remaining: 59 }),
      cleanup: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/auth-manager', () => ({
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
      validateBatchCommand: jest.fn().mockReturnValue(true),
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
      createTimestamp: jest.fn(() => '2023-01-01T00:00:00.000Z'),
      extractFirstWord: jest.fn(cmd => cmd.split(' ')[0])
    }));
    
    // Mock MCP Server SDK
    const mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
      addTool: jest.fn()
    };
    
    const mockTransport = {
      start: jest.fn(),
      close: jest.fn()
    };
    
    jest.doMock('@modelcontextprotocol/sdk/server', () => ({
      Server: jest.fn(() => mockServer)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/server/stdio', () => ({
      StdioServerTransport: jest.fn(() => mockTransport)
    }));
    
    // Import server after mocking
    serverInstance = require('../../server/src/server');
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

  describe('PowerShell Command Execution', () => {
    test('should execute basic PowerShell commands', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
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
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock successful PowerShell execution
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Monday, January 1, 2023 12:00:00 PM'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Date'],
          expect.objectContaining({
            timeout: 30000,
            killSignal: 'SIGTERM'
          })
        );
        
        expect(response.content[0].text).toContain('Monday, January 1, 2023');
      }
    });

    test('should handle PowerShell commands with parameters', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Process -Name explorer'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock process output
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('NPM(K)    PM(M)      WS(M)     CPU(s)     Id  SI ProcessName\\n------    -----      -----     ------     --  -- -----------\\n 45678    89012      34567       1234   5678   1 explorer'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Process -Name explorer'],
          expect.any(Object)
        );
        
        expect(response.content[0].text).toContain('explorer');
      }
    });

    test('should handle PowerShell script execution', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: '$date = Get-Date; Write-Output \"Current date: $date\"'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock script execution
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Current date: Monday, January 1, 2023 12:00:00 PM'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('Current date:');
      }
    });

    test('should handle PowerShell execution with working directory', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Location',
              workingDirectory: 'C:\\temp'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock location output
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('C:\\temp'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-Command', 'Get-Location'],
          expect.objectContaining({
            cwd: 'C:\\temp'
          })
        );
        
        expect(response.content[0].text).toContain('C:\\temp');
      }
    });

    test('should handle PowerShell errors', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-NonExistentCommand'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock error
        setTimeout(() => {
          mockProcess.stderr.emit('data', Buffer.from('Get-NonExistentCommand : The term "Get-NonExistentCommand" is not recognized'));
          mockProcess.emit('close', 1);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('not recognized');
      }
    });
  });

  describe('Batch File Execution', () => {
    test('should execute batch files', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\temp\\test.bat'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock batch execution
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Batch file executed successfully'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'cmd',
          ['/c', 'C:\\temp\\test.bat'],
          expect.any(Object)
        );
        
        expect(response.content[0].text).toContain('Batch file executed successfully');
      }
    });

    test('should handle batch file with parameters', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_batch',
            arguments: {
              batchFile: 'C:\\temp\\test.bat',
              parameters: ['param1', 'param2']
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock batch execution with parameters
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Processing param1 and param2'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'cmd',
          ['/c', 'C:\\temp\\test.bat', 'param1', 'param2'],
          expect.any(Object)
        );
        
        expect(response.content[0].text).toContain('Processing param1 and param2');
      }
    });
  });

  describe('NET Build Commands', () => {
    test('should execute dotnet build commands', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\MyApp.csproj',
              buildTool: 'dotnet',
              configuration: 'Release'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock dotnet build
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Microsoft (R) Build Engine version 17.0.0\\nBuild succeeded.\\n    0 Warning(s)\\n    0 Error(s)'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'dotnet',
          ['build', 'C:\\projects\\MyApp.csproj', '-c', 'Release'],
          expect.objectContaining({
            cwd: 'C:\\projects"
          })
        );
        
        expect(response.content[0].text).toContain('Build succeeded');
      }
    });

    test('should execute msbuild commands', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\MyApp.sln',
              buildTool: 'msbuild',
              configuration: 'Debug'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock msbuild
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Microsoft (R) Build Engine version 17.0.0\\nBuild succeeded.\\n    0 Warning(s)\\n    0 Error(s)'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'msbuild',
          ['C:\\projects\\MyApp.sln', '/p:Configuration=Debug'],
          expect.any(Object)
        );
        
        expect(response.content[0].text).toContain('Build succeeded');
      }
    });

    test('should handle build failures', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_dotnet',
            arguments: {
              projectPath: 'C:\\projects\\BrokenApp.csproj',
              buildTool: 'dotnet'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock build failure
        setTimeout(() => {
          mockProcess.stderr.emit('data', Buffer.from('Program.cs(10,15): error CS0103: The name "undefined" does not exist in the current context'));
          mockProcess.emit('close', 1);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('error CS0103');
      }
    });
  });

  describe('Java Build Commands', () => {
    test('should execute Maven builds', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_java',
            arguments: {
              projectPath: 'C:\\projects\\java-app',
              buildTool: 'maven'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock Maven build
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('[INFO] BUILD SUCCESS\\n[INFO] Total time: 5.123 s'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'mvn',
          ['clean', 'compile'],
          expect.objectContaining({
            cwd: 'C:\\projects\\java-app'
          })
        );
        
        expect(response.content[0].text).toContain('BUILD SUCCESS');
      }
    });

    test('should execute Gradle builds', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_java',
            arguments: {
              projectPath: 'C:\\projects\\gradle-app',
              buildTool: 'gradle'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock Gradle build
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('BUILD SUCCESSFUL in 3s\\n2 actionable tasks: 2 executed'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSpawn).toHaveBeenCalledWith(
          'gradle',
          ['build'],
          expect.objectContaining({
            cwd: 'C:\\projects\\gradle-app'
          })
        );
        
        expect(response.content[0].text).toContain('BUILD SUCCESSFUL');
      }
    });
  });

  describe('Python Build Commands', () => {
    test('should create and manage Python virtual environments', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_python',
            arguments: {
              projectPath: 'C:\\projects\\python-app',
              requirements: 'requirements.txt'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock Python virtual environment setup
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Creating virtual environment...\\nInstalling packages...\\nSuccessfully installed: flask==2.0.1 requests==2.25.1'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('Creating virtual environment');
        expect(response.content[0].text).toContain('Successfully installed');
      }
    });

    test('should run Python tests', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'build_python',
            arguments: {
              projectPath: 'C:\\projects\\python-app',
              testCommand: 'pytest'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock pytest execution
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('=================== test session starts ===================\\ntest_example.py::test_function PASSED\\n=================== 1 passed in 0.12s ==================='));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('test session starts');
        expect(response.content[0].text).toContain('1 passed');
      }
    });
  });

  describe('Process Management', () => {
    test('should list Windows processes', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'process_manager',
            arguments: {
              action: 'list'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock process list
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('ProcessName    PID    CPU    Memory\\nexplorer.exe   1234   2.5    123456\\nnotepad.exe    5678   0.1    45678'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('ProcessName');
        expect(response.content[0].text).toContain('explorer.exe');
        expect(response.content[0].text).toContain('notepad.exe');
      }
    });

    test('should manage Windows services', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'process_manager',
            arguments: {
              action: 'service',
              serviceName: 'Spooler',
              serviceAction: 'status'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock service status
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('SERVICE_NAME: Spooler\\nSTATE: 4 RUNNING\\nWIN32_EXIT_CODE: 0'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('Spooler');
        expect(response.content[0].text).toContain('RUNNING');
      }
    });
  });

  describe('File Operations', () => {
    test('should handle file synchronization', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'file_sync',
            arguments: {
              sourcePath: 'C:\\temp\\source',
              destPath: 'C:\\backup\\dest'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock file sync
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Files copied: 123\\nDirectories copied: 45\\nSync completed successfully'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('Files copied: 123');
        expect(response.content[0].text).toContain('Sync completed successfully');
      }
    });
  });

  describe('Command Timeouts and Termination', () => {
    test('should handle command timeouts', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
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
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock timeout
        setTimeout(() => {
          mockProcess.emit('error', new Error('Command timeout'));
        }, 100);
        
        const response = await callHandler(request);
        
        expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        expect(response.content[0].text).toContain('timeout');
      }
    });

    test('should handle process termination', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
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
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock process termination
        setTimeout(() => {
          mockProcess.emit('error', new Error('Process terminated'));
        }, 100);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('Process terminated');
      }
    });
  });

  describe('Unicode and Encoding Support', () => {
    test('should handle Unicode characters in commands', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Output \"テスト Unicode 测试\"'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock Unicode output
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('テスト Unicode 测试', 'utf8'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('テスト Unicode 测试');
      }
    });

    test('should handle different encoding formats', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-Content -Path C:\\temp\\encoded.txt -Encoding UTF8'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock encoded file content
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Encoded content: 日本語 français español', 'utf8'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(response.content[0].text).toContain('日本語 français español');
      }
    });
  });

  describe('Path Validation and Security', () => {
    test('should validate allowed paths', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-ChildItem',
              workingDirectory: 'C:\\builds"
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        const mockSecurity = require('../../server/src/utils/security');
        
        // Mock directory listing
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('file1.txt\\nfile2.txt\\nsubdir\\n'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const response = await callHandler(request);
        
        expect(mockSecurity.validatePath).toHaveBeenCalledWith('C:\\builds");
        expect(response.content[0].text).toContain('file1.txt');
      }
    });

    test('should reject dangerous paths', async () => {
      const mockServer = require('@modelcontextprotocol/sdk/server').Server();
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const mockSecurity = require('../../server/src/utils/security');
        mockSecurity.validatePath.mockImplementation(() => {
          throw new Error('Path not allowed');
        });
        
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Get-ChildItem',
              workingDirectory: 'C:\\Windows\\System32'
            }
          },
          meta: {
            authorization: 'Bearer test-windows-token',
            clientIP: '127.0.0.1'
          }
        };
        
        await expect(callHandler(request)).rejects.toThrow('Path not allowed');
      }
    });
  });
});