// Simple tests to verify new tools are registered
const request = require('supertest');

// Mock all dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('../server/src/utils/security', () => ({
  validateBuildPath: jest.fn().mockImplementation(path => path),
  validateIPAddress: jest.fn().mockImplementation(ip => ip),
  validatePowerShellCommand: jest.fn().mockImplementation(cmd => cmd),
  validateBatchFilePath: jest.fn().mockImplementation(path => path)
}));
jest.mock('../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  security: jest.fn(),
  access: jest.fn()
}));
jest.mock('../server/src/utils/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true)
}));
jest.mock('../server/src/utils/crypto', () => ({
  initializeKey: jest.fn(),
  encryptionEnabled: false
}));

// Mock helpers
jest.mock('../server/src/utils/helpers', () => ({
  getClientIP: jest.fn().mockReturnValue('127.0.0.1'),
  createTextResult: jest.fn().mockImplementation(text => ({
    content: [{ type: 'text', text }]
  })),
  handleValidationError: jest.fn().mockImplementation((error, operation, logger, clientIP) => ({
    content: [{ type: 'text', text: `Validation error: ${error.message}` }]
  })),
  getNumericEnv: jest.fn().mockImplementation((envVar, defaultVal) => defaultVal),
  createDirCommand: jest.fn().mockImplementation(path => `mkdir "${path}"`)
}));

describe('New Tools Registration Test', () => {
  let app;
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.ENABLE_DANGEROUS_MODE = 'false';
    
    // Re-require server
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  test('should list new tools in tools/list response', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-token')
      .send({
        method: 'tools/list'
      });

    if (response.status !== 200) {
      console.error('Error status:', response.status);
      console.error('Error body:', response.body);
      console.error('Error text:', response.text);
    }
    
    expect(response.status).toBe(200);
    expect(response.body.tools).toBeDefined();
    
    const toolNames = response.body.tools.map(t => t.name);
    
    // Verify all tools are registered
    expect(toolNames).toContain('build_dotnet');
    expect(toolNames).toContain('run_powershell');
    expect(toolNames).toContain('ping_host');
    expect(toolNames).toContain('ssh_command');
    expect(toolNames).toContain('run_batch');
    expect(toolNames).toContain('mcp_self_build');
    expect(toolNames).toContain('process_manager');
    expect(toolNames).toContain('file_sync');
    
    // Verify new tools have proper schemas
    const mcpSelfBuild = response.body.tools.find(t => t.name === 'mcp_self_build');
    expect(mcpSelfBuild).toBeDefined();
    expect(mcpSelfBuild.inputSchema.properties.action).toBeDefined();
    expect(mcpSelfBuild.inputSchema.properties.action.enum).toContain('build');
    expect(mcpSelfBuild.inputSchema.properties.action.enum).toContain('test');
    expect(mcpSelfBuild.inputSchema.properties.action.enum).toContain('install');
    
    const processManager = response.body.tools.find(t => t.name === 'process_manager');
    expect(processManager).toBeDefined();
    expect(processManager.inputSchema.properties.action).toBeDefined();
    expect(processManager.inputSchema.properties.action.enum).toContain('start');
    expect(processManager.inputSchema.properties.action.enum).toContain('stop');
    
    const fileSync = response.body.tools.find(t => t.name === 'file_sync');
    expect(fileSync).toBeDefined();
    expect(fileSync.inputSchema.properties.source).toBeDefined();
    expect(fileSync.inputSchema.properties.destination).toBeDefined();
  });

  test('should handle unknown tool gracefully', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-token')
      .send({
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: {}
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.content[0].text).toBe('Unknown tool: non_existent_tool');
  });
});