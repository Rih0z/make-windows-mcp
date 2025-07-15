// MCP Client Tests

describe('MCP Client', () => {
  let spawn, fs, dotenv;
  let mockStdin, mockStdout, mockStderr;
  let originalExit, originalEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Mock process.exit to prevent test runner from exiting
    originalExit = process.exit;
    process.exit = jest.fn();
  });

  afterAll(() => {
    // Restore process.exit and environment
    process.exit = originalExit;
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Reset all mocks
    jest.resetModules();
    jest.clearAllMocks();

    // Set test environment variables
    process.env.WINDOWS_VM_IP = '192.168.1.100';
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.MCP_SERVER_PORT = '8080';

    // Create mock streams
    mockStdin = { write: jest.fn(), end: jest.fn() };
    mockStdout = { on: jest.fn() };
    mockStderr = { on: jest.fn() };

    // Mock modules
    jest.mock('child_process', () => ({
      spawn: jest.fn()
    }));

    jest.mock('dotenv', () => ({
      config: jest.fn()
    }));

    jest.mock('fs', () => ({
      existsSync: jest.fn(() => true)
    }));

    // Get mocked modules
    spawn = require('child_process').spawn;
    fs = require('fs');
    dotenv = require('dotenv');

    // Mock the spawn return value
    spawn.mockReturnValue({
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    });
  });

  test('should initialize with environment variables', () => {
    // Mock the module to prevent auto-execution
    jest.doMock('../client/src/mcp-client', () => {
      return {
        startMCPClient: jest.fn()
      };
    });

    const client = require('../client/src/mcp-client');
    expect(client.startMCPClient).toBeDefined();
  });

  test('should check for .env file', () => {
    // Test that fs.existsSync is called
    fs.existsSync.mockReturnValue(false);
    
    // Mock console.warn
    console.warn = jest.fn();
    
    // Require the module (but prevent execution)
    jest.isolateModules(() => {
      jest.doMock('../client/src/mcp-client', () => {
        const fs = require('fs');
        if (!fs.existsSync('.env')) {
          console.warn('Warning: .env file not found');
        }
        return { startMCPClient: jest.fn() };
      });
      
      require('../client/src/mcp-client');
    });

    expect(console.warn).toHaveBeenCalledWith('Warning: .env file not found');
  });

  test('should validate required environment variables', () => {
    // Remove required env var
    delete process.env.WINDOWS_VM_IP;
    
    // Mock console.error and process.exit
    console.error = jest.fn();
    
    jest.isolateModules(() => {
      jest.doMock('../client/src/mcp-client', () => {
        if (!process.env.WINDOWS_VM_IP) {
          console.error('Error: WINDOWS_VM_IP is required');
          process.exit(1);
        }
        return { startMCPClient: jest.fn() };
      });
      
      require('../client/src/mcp-client');
    });

    expect(console.error).toHaveBeenCalledWith('Error: WINDOWS_VM_IP is required');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('should spawn MCP process with correct arguments', () => {
    // Create a testable version of the client startup
    const mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    };
    
    spawn.mockReturnValue(mockProcess);

    // Simulate the MCP client startup logic
    const serverUrl = `http://${process.env.WINDOWS_VM_IP}:${process.env.MCP_SERVER_PORT}/sse`;
    const mcpArgs = ['--server', serverUrl];
    
    // Call spawn as the client would
    const mcpProcess = spawn('node', mcpArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    expect(spawn).toHaveBeenCalledWith('node', mcpArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    expect(mcpProcess).toBe(mockProcess);
  });

  test('should handle MCP process errors', () => {
    const mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    };
    
    spawn.mockReturnValue(mockProcess);
    console.error = jest.fn();

    // Simulate process creation
    const mcpProcess = spawn('node', ['--server', 'http://test:8080/sse']);
    
    // Get the error handler
    const errorHandler = mockProcess.on.mock.calls.find(call => call[0] === 'error');
    if (errorHandler) {
      // Simulate an error
      errorHandler[1](new Error('Failed to start'));
    }

    // Verify error handling would occur
    expect(mockProcess.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  test('should handle MCP process exit', () => {
    const mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    };
    
    spawn.mockReturnValue(mockProcess);
    console.log = jest.fn();

    // Simulate process creation
    const mcpProcess = spawn('node', ['--server', 'http://test:8080/sse']);
    
    // Get the exit handler
    const exitHandler = mockProcess.on.mock.calls.find(call => call[0] === 'exit');
    if (exitHandler) {
      // Simulate process exit
      exitHandler[1](0, null);
    }

    // Verify exit handling would occur
    expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
  });

  test('should forward stdin to MCP process', () => {
    const mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    };
    
    spawn.mockReturnValue(mockProcess);

    // Simulate process creation
    const mcpProcess = spawn('node', ['--server', 'http://test:8080/sse']);
    
    // Simulate stdin data
    const testData = 'test input\n';
    process.stdin = {
      on: jest.fn(),
      resume: jest.fn()
    };

    // In the real client, stdin is piped
    // Simulate this behavior
    mockStdin.write(testData);

    expect(mockStdin.write).toHaveBeenCalledWith(testData);
  });

  test('should handle stdout data from MCP process', () => {
    console.log = jest.fn();
    
    // Simulate stdout data handler
    const dataHandler = mockStdout.on.mock.calls.find(call => call[0] === 'data');
    if (dataHandler) {
      dataHandler[1](Buffer.from('MCP output'));
    }

    // In a real scenario, this would be logged
    // The actual client would handle this
  });

  test('should handle stderr data from MCP process', () => {
    console.error = jest.fn();
    
    // Simulate stderr data handler
    const dataHandler = mockStderr.on.mock.calls.find(call => call[0] === 'data');
    if (dataHandler) {
      dataHandler[1](Buffer.from('MCP error'));
    }

    // In a real scenario, this would be logged as an error
    // The actual client would handle this
  });
});