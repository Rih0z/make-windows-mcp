// MCP Client Tests
const { spawn } = require('child_process');

// Mock environment variables
process.env.WINDOWS_VM_IP = '192.168.1.100';
process.env.MCP_AUTH_TOKEN = 'test-token';
process.env.MCP_SERVER_PORT = '8080';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

describe('MCP Client', () => {
  let mockStdin, mockStdout, mockStderr;
  let originalExit;
  
  beforeAll(() => {
    // Mock process.exit to prevent test runner from exiting
    originalExit = process.exit;
    process.exit = jest.fn();
  });
  
  afterAll(() => {
    // Restore process.exit
    process.exit = originalExit;
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to ensure clean state
    jest.resetModules();
    
    // Mock fs.existsSync to simulate .env file exists
    jest.mock('fs', () => ({
      existsSync: jest.fn(() => true)
    }));
    
    // Create mock streams
    mockStdin = { write: jest.fn(), end: jest.fn() };
    mockStdout = { on: jest.fn() };
    mockStderr = { on: jest.fn() };
    
    // Mock the spawn return value
    spawn.mockReturnValue({
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn()
    });
  });

  test('should initialize with environment variables', () => {
    require('../client/src/mcp-client');
    
    expect(spawn).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['--stdio']),
      expect.objectContaining({
        env: expect.objectContaining({
          WINDOWS_VM_IP: '192.168.1.100',
          MCP_AUTH_TOKEN: 'test-token',
          MCP_SERVER_PORT: '8080'
        })
      })
    );
  });

  test('should handle missing environment variables', () => {
    delete process.env.WINDOWS_VM_IP;
    delete process.env.MCP_AUTH_TOKEN;
    
    require('../client/src/mcp-client');
    
    // Should still spawn but with undefined values
    expect(spawn).toHaveBeenCalled();
  });

  test('should setup stdio handlers', () => {
    require('../client/src/mcp-client');
    
    // Check that stdout and stderr handlers are set up
    expect(mockStdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockStderr.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  test('should pipe data from mcp process to stdout', () => {
    // Mock process.stdout.write
    const originalWrite = process.stdout.write;
    process.stdout.write = jest.fn();
    
    require('../client/src/mcp-client');
    
    // Get the data handler that was registered
    const dataHandler = mockStdout.on.mock.calls[0][1];
    
    // Simulate data from the MCP process
    const testData = Buffer.from('Test output from MCP');
    dataHandler(testData);
    
    // Check that it was written to stdout
    expect(process.stdout.write).toHaveBeenCalledWith(testData);
    
    // Restore original
    process.stdout.write = originalWrite;
  });

  test('should pipe stderr data', () => {
    // Mock process.stderr.write
    const originalWrite = process.stderr.write;
    process.stderr.write = jest.fn();
    
    require('../client/src/mcp-client');
    
    // Get the data handler that was registered
    const dataHandler = mockStderr.on.mock.calls[0][1];
    
    // Simulate error data
    const testData = Buffer.from('Error from MCP');
    dataHandler(testData);
    
    // Check that it was written to stderr
    expect(process.stderr.write).toHaveBeenCalledWith(testData);
    
    // Restore original
    process.stderr.write = originalWrite;
  });

  test('should handle process exit', () => {
    // Mock process.exit
    const originalExit = process.exit;
    process.exit = jest.fn();
    
    const mockProcess = spawn.mock.results[0].value;
    
    require('../client/src/mcp-client');
    
    // Get the exit handler
    const exitHandler = mockProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
    
    // Simulate process exit
    exitHandler(0);
    
    expect(process.exit).toHaveBeenCalledWith(0);
    
    // Restore original
    process.exit = originalExit;
  });

  test('should handle process error', () => {
    // Mock console.error
    const originalError = console.error;
    console.error = jest.fn();
    
    const mockProcess = spawn.mock.results[0].value;
    
    require('../client/src/mcp-client');
    
    // Get the error handler
    const errorHandler = mockProcess.on.mock.calls.find(call => call[0] === 'error')[1];
    
    // Simulate process error
    const testError = new Error('MCP process error');
    errorHandler(testError);
    
    expect(console.error).toHaveBeenCalledWith('MCP client error:', testError.message);
    
    // Restore original
    console.error = originalError;
  });

  test('should pipe stdin to mcp process', () => {
    // Mock process.stdin
    const originalStdin = process.stdin;
    process.stdin = {
      pipe: jest.fn()
    };
    
    require('../client/src/mcp-client');
    
    expect(process.stdin.pipe).toHaveBeenCalledWith(mockStdin);
    
    // Restore original
    process.stdin = originalStdin;
  });

  test('should include all environment variables in spawn', () => {
    // Add additional env vars
    process.env.CUSTOM_VAR = 'custom-value';
    
    require('../client/src/mcp-client');
    
    const spawnEnv = spawn.mock.calls[0][2].env;
    expect(spawnEnv).toMatchObject({
      WINDOWS_VM_IP: '192.168.1.100',
      MCP_AUTH_TOKEN: 'test-token',
      MCP_SERVER_PORT: '8080',
      CUSTOM_VAR: 'custom-value'
    });
  });

  test('should use stdio as inherit for child process', () => {
    require('../client/src/mcp-client');
    
    expect(spawn).toHaveBeenCalledWith(
      'node',
      expect.any(Array),
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe', 'pipe']
      })
    );
  });
});