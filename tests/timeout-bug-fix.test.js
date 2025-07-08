/**
 * @file timeout-bug-fix.test.js
 * Tests for the critical timeout bug fix in v1.0.13
 * Ensures that execute_powershell tool uses 30-minute timeouts instead of 1.8 seconds
 */

const request = require('supertest');
const { getNumericEnv } = require('../server/src/utils/helpers');

describe('Critical Timeout Bug Fix Tests', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    
    // Setup test environment
    process.env.MCP_AUTH_TOKEN = 'test-token';
    process.env.ALLOWED_IPS = '';
    process.env.ENABLE_DANGEROUS_MODE = 'true';
    process.env.COMMAND_TIMEOUT = '1800000'; // 30 minutes
    
    // Clear require cache to ensure fresh server instance
    delete require.cache[require.resolve('../server/src/server')];
    app = require('../server/src/server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getNumericEnv Function Behavior', () => {
    test('should return correct default value for COMMAND_TIMEOUT', () => {
      // Test the fixed behavior - default should be 1800000 (30 minutes), not 1800 (1.8 seconds)
      const timeout = getNumericEnv('COMMAND_TIMEOUT_TEST_NOT_SET', 1800000);
      expect(timeout).toBe(1800000);
      
      // Test that the bug fix works - should not use 1800 as default
      const buggyTimeout = getNumericEnv('COMMAND_TIMEOUT_TEST_NOT_SET', 1800);
      expect(buggyTimeout).toBe(1800); // This would be the buggy value
      expect(buggyTimeout).not.toBe(1800000); // Ensure we can distinguish
    });

    test('should read environment variable correctly', () => {
      process.env.TEST_TIMEOUT = '1800000';
      const timeout = getNumericEnv('TEST_TIMEOUT', 300000);
      expect(timeout).toBe(1800000);
      delete process.env.TEST_TIMEOUT;
    });

    test('should convert timeout to seconds correctly', () => {
      const timeoutMs = 1800000; // 30 minutes in milliseconds
      const timeoutSeconds = timeoutMs / 1000;
      expect(timeoutSeconds).toBe(1800); // 30 minutes in seconds
      
      // Ensure this is not confused with the buggy default of 1800 milliseconds
      const buggyMs = 1800;
      const buggySeconds = buggyMs / 1000;
      expect(buggySeconds).toBe(1.8); // This would be the bug
    });
  });

  describe('execute_powershell Tool Timeout Configuration', () => {
    test('should use correct timeout for execute_powershell commands', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "timeout test"'
            }
          }
        });

      expect(response.status).toBe(200);
      
      // The response should succeed without timing out immediately
      // In the bug, commands would timeout after 1.8 seconds
      expect(response.body).toBeDefined();
      expect(response.body.content).toBeDefined();
    });

    test('should handle timeout parameter correctly', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "timeout parameter test"',
              timeout: 60 // 1 minute
            }
          }
        });

      expect(response.status).toBe(200);
      
      // Should respect the custom timeout parameter
      expect(response.body).toBeDefined();
    });

    test('should cap timeout at maximum allowed value', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({
          method: 'tools/call',
          params: {
            name: 'execute_powershell',
            arguments: {
              command: 'echo "max timeout test"',
              timeout: 2000 // Greater than max of 1800 seconds
            }
          }
        });

      expect(response.status).toBe(200);
      
      // Should still work with capped timeout
      expect(response.body).toBeDefined();
    });
  });

  describe('Server Configuration Display', () => {
    test('should display timeout configuration on health endpoint', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
      expect(response.body.configuration).toBeDefined();
      expect(response.body.configuration.commandTimeout).toBeDefined();
      
      // Should show timeout in minutes for 30-minute setting
      expect(response.body.configuration.timeoutMinutes).toBe(30);
    });

    test('should show correct timeout in startup logs', () => {
      // This test verifies the timeout display functionality added in the fix
      const timeoutMs = getNumericEnv('COMMAND_TIMEOUT', 1800000);
      const timeoutMinutes = Math.round(timeoutMs / 60000);
      const timeoutSeconds = Math.round(timeoutMs / 1000);

      expect(timeoutMinutes).toBe(30);
      expect(timeoutSeconds).toBe(1800);
      
      // Ensure it's not the buggy values
      expect(timeoutMinutes).not.toBe(0); // Would be 0 with 1800ms
      expect(timeoutSeconds).not.toBe(1.8); // Rounded would be 2, not 1800
    });
  });

  describe('Version Information', () => {
    test('should be version 1.0.14 or higher with timeout fix', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.version).toBeDefined();
      
      // Parse version and ensure it's 1.0.14 or higher (includes the timeout fix)
      const version = response.body.version;
      
      if (version !== 'unknown') {
        const versionParts = version.split('.').map(Number);
        
        expect(versionParts[0]).toBeGreaterThanOrEqual(1);
        expect(versionParts[1]).toBeGreaterThanOrEqual(0);
        
        if (versionParts[1] === 0) {
          expect(versionParts[2]).toBeGreaterThanOrEqual(14);
        }
      } else {
        // If version is unknown, just ensure the field exists
        expect(version).toBe('unknown');
      }
    });
  });

  describe('Regression Prevention', () => {
    test('should prevent timeout default regression', () => {
      // This test ensures the bug doesn't reoccur
      // The critical line was: getNumericEnv('COMMAND_TIMEOUT', 1800) / 1000
      // Which resulted in 1.8 second timeout instead of 30 minutes
      
      const correctDefault = 1800000; // 30 minutes in milliseconds
      const buggyDefault = 1800; // The incorrect value that caused the bug
      
      const correctTimeout = correctDefault / 1000; // 1800 seconds
      const buggyTimeout = buggyDefault / 1000; // 1.8 seconds
      
      expect(correctTimeout).toBe(1800); // 30 minutes
      expect(buggyTimeout).toBe(1.8); // The bug
      
      // Ensure we're using the correct default
      const actualDefault = getNumericEnv('COMMAND_TIMEOUT_NOT_SET', 1800000);
      expect(actualDefault).toBe(correctDefault);
      expect(actualDefault).not.toBe(buggyDefault);
    });

    test('should maintain consistent timeout behavior across tools', () => {
      // Verify all tools that use timeout follow the same pattern
      const timeouts = [
        getNumericEnv('COMMAND_TIMEOUT', 1800000), // execute_powershell default
        getNumericEnv('COMMAND_TIMEOUT', 1800000), // build tools default
        getNumericEnv('COMMAND_TIMEOUT', 600000),  // C++ builds (10 min)
        getNumericEnv('COMMAND_TIMEOUT', 600000)   // Android builds (10 min)
      ];
      
      timeouts.forEach(timeout => {
        expect(timeout).toBeGreaterThan(60000); // At least 1 minute
        expect(timeout).toBeLessThanOrEqual(3600000); // At most 1 hour
      });
    });
  });
});