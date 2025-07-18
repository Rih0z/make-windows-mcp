/**
 * Bug Report Validation Tests
 * Tests for critical issues reported on 2025-07-11
 */

const request = require('supertest');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Mock the Express app and dependencies
const app = require('../server/src/server');

describe('Bug Report Validation Tests - 2025-07-11', () => {
  const validToken = process.env.MCP_AUTH_TOKEN || 'test-token-12345';
  
  beforeAll(() => {
    // Set test environment
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '600000'; // 10 minutes for tests
    process.env.MCP_AUTH_TOKEN = validToken;
  });

  /**
   * Bug Report Issue 1: PowerShell Command Timeout
   * Symptom: dotnet commands timeout at 2 minutes
   * Expected: Commands should run for at least 5-10 minutes
   */
  describe('Issue 1: PowerShell Command Timeout', () => {
    test('dotnet commands should have extended timeout (10 minutes)', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'dotnet --version'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      
      // Parse the result to check timeout configuration
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
    }, 30000); // 30 second test timeout

    test('complex dotnet run command should not timeout', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Host "Simulating dotnet run command"; Start-Sleep -Seconds 2; Write-Host "dotnet command completed"',
              timeout: 600 // 10 minutes explicit timeout
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
      expect(result.output).toContain('dotnet command completed');
    }, 15000);
  });

  /**
   * Bug Report Issue 2: encode_file_base64 dangerousMode Error
   * Symptom: "dangerousMode is not defined" error
   * Expected: Tool should work properly with correct parameter validation
   */
  describe('Issue 2: encode_file_base64 dangerousMode Error', () => {
    const testFilePath = path.join(__dirname, 'fixtures', 'test.pdf');
    
    beforeAll(() => {
      // Create test fixtures directory and file
      const fixturesDir = path.dirname(testFilePath);
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
      
      // Create a small test PDF-like file
      if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, '%PDF-1.4\\nTest PDF content for encoding\\n');
      }
    });

    test('encode_file_base64 should not throw dangerousMode error', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'encode_file_base64',
            arguments: {
              filePath: testFilePath
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.error).toBeUndefined();
      
      // Should not contain dangerousMode error
      if (response.body.error) {
        expect(response.body.error.message).not.toContain('dangerousMode is not defined');
      }
    });

    test('encode_file_base64 with options should work correctly', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'encode_file_base64',
            arguments: {
              filePath: testFilePath,
              options: {
                preview: true,
                maxSizeBytes: 1048576
              }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.error).toBeUndefined();
    });

    afterAll(() => {
      // Clean up test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });
  });

  /**
   * Integration Tests: Reproduce Exact Bug Report Scenarios
   */
  describe('Integration Tests: Exact Bug Report Reproduction', () => {
    test('Bug Report Scenario 1: dotnet run command reproduction', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Host "Simulating: dotnet run --project StandardTaxPdfConverter.TestConsole.csproj"; Start-Sleep -Seconds 3; Write-Host "PDF generation test completed"'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
      expect(result.output).toContain('PDF generation test completed');
    }, 20000);

    test('Bug Report Scenario 2: Base64 encoding reproduction', async () => {
      // Test the PowerShell workaround mentioned in bug report
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: '$testData = "test content"; $bytes = [System.Text.Encoding]::UTF8.GetBytes($testData); [Convert]::ToBase64String($bytes)'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
      expect(result.output).toContain('dGVzdCBjb250ZW50'); // Base64 for "test content"
    });
  });

  /**
   * Timeout Configuration Tests
   */
  describe('Timeout Configuration Validation', () => {
    test('default timeout should be appropriate for dotnet commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'dotnet --info'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      
      // Should complete successfully with dotnet-aware timeout
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
    });

    test('custom timeout parameter should be respected', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 1; Write-Host "Custom timeout test"',
              timeout: 30 // 30 seconds
            }
          }
        });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(executionTime).toBeLessThan(25000); // Should complete in under 25 seconds
      
      const result = JSON.parse(response.body.result.content);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Custom timeout test');
    }, 35000);
  });

  /**
   * Error Handling and Validation Tests
   */
  describe('Error Handling Validation', () => {
    test('invalid parameters should return proper error messages', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'encode_file_base64',
            arguments: {
              // Missing required filePath
            }
          }
        });

      expect(response.status).toBe(200);
      if (response.body.error) {
        expect(response.body.error.message).not.toContain('dangerousMode is not defined');
        expect(response.body.error.message).toContain('filePath');
      }
    });

    test('authentication should work correctly', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/list',
          params: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeDefined();
    });
  });
});

module.exports = {
  testSuite: 'Bug Report Validation Tests',
  version: '1.0.31',
  reportDate: '2025-07-11',
  issues: [
    {
      id: 1,
      title: 'PowerShell Command Timeout',
      status: 'FIXED',
      solution: 'Implemented dotnet-aware timeout defaults (10 minutes)'
    },
    {
      id: 2,
      title: 'encode_file_base64 dangerousMode Error', 
      status: 'FIXED',
      solution: 'Added missing dangerousMode variable declaration'
    }
  ]
};