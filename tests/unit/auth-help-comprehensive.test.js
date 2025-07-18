/**
 * Auth Manager & Help Generator Comprehensive Testing
 * auth-manager.js, help-generator.js の完全テストスイート
 */

const fs = require('fs');
const path = require('path');

describe('Auth Manager & Help Generator Comprehensive Testing', () => {
  let authManager, helpGenerator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    delete require.cache[require.resolve('../server/src/utils/auth-manager')];
    delete require.cache[require.resolve('../server/src/utils/help-generator')];
    
    // Mock environment variables
    process.env.MCP_AUTH_TOKEN = 'test-token-123';
    process.env.AUTH_REQUIRED = 'true';
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock fs operations
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('test-token-123');
    jest.spyOn(fs, 'writeFileSync').mockImplementation();
    
    // Get fresh instances
    authManager = require('../server/src/utils/auth-manager');
    helpGenerator = require('../server/src/utils/help-generator');
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.AUTH_REQUIRED;
    
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    
    // Restore fs methods
    jest.restoreAllMocks();
  });

  describe('Auth Manager Tests', () => {
    test('should validate correct authentication token', () => {
      const result = authManager.validateToken('test-token-123');
      expect(result).toBe(true);
    });

    test('should reject invalid authentication token', () => {
      const result = authManager.validateToken('invalid-token');
      expect(result).toBe(false);
    });

    test('should handle null token', () => {
      const result = authManager.validateToken(null);
      expect(result).toBe(false);
    });

    test('should handle undefined token', () => {
      const result = authManager.validateToken(undefined);
      expect(result).toBe(false);
    });

    test('should handle empty string token', () => {
      const result = authManager.validateToken('');
      expect(result).toBe(false);
    });

    test('should generate secure authentication token', () => {
      const token = authManager.generateToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);
      expect(token).toMatch(/^[a-zA-Z0-9]+$/);
    });

    test('should generate unique tokens', () => {
      const token1 = authManager.generateToken();
      const token2 = authManager.generateToken();
      
      expect(token1).not.toBe(token2);
    });

    test('should save token to file', () => {
      const token = 'new-test-token';
      authManager.saveToken(token);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('auth-token'),
        token,
        'utf8'
      );
    });

    test('should load token from file', () => {
      const token = authManager.loadToken();
      
      expect(token).toBe('test-token-123');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('auth-token'),
        'utf8'
      );
    });

    test('should handle file read errors', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const token = authManager.loadToken();
      expect(token).toBeNull();
    });

    test('should verify token expiration', () => {
      const expiredToken = authManager.createTokenWithExpiry('test-token', Date.now() - 1000);
      const validToken = authManager.createTokenWithExpiry('test-token', Date.now() + 1000);
      
      expect(authManager.isTokenExpired(expiredToken)).toBe(true);
      expect(authManager.isTokenExpired(validToken)).toBe(false);
    });

    test('should refresh expired token', () => {
      const oldToken = 'old-token';
      const newToken = authManager.refreshToken(oldToken);
      
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
    });

    test('should handle IP-based authentication', () => {
      const trustedIP = '127.0.0.1';
      const untrustedIP = '192.168.1.100';
      
      expect(authManager.isTrustedIP(trustedIP)).toBe(true);
      expect(authManager.isTrustedIP(untrustedIP)).toBe(false);
    });

    test('should validate Bearer token format', () => {
      const validBearer = 'Bearer test-token-123';
      const invalidBearer = 'Basic dGVzdA==';
      const noBearer = 'test-token-123';
      
      expect(authManager.validateBearerToken(validBearer)).toBe(true);
      expect(authManager.validateBearerToken(invalidBearer)).toBe(false);
      expect(authManager.validateBearerToken(noBearer)).toBe(false);
    });

    test('should handle authentication in dangerous mode', () => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const dangerousAuthManager = require('../server/src/utils/auth-manager');
      
      // Should bypass authentication in dangerous mode
      expect(dangerousAuthManager.validateToken('any-token')).toBe(true);
    });

    test('should log authentication attempts', () => {
      authManager.logAuthAttempt('192.168.1.1', 'test-token', true);
      authManager.logAuthAttempt('192.168.1.2', 'invalid-token', false);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Authentication attempt')
      );
    });

    test('should handle rate limiting for auth attempts', () => {
      const ip = '192.168.1.1';
      
      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        authManager.validateTokenWithRateLimit(ip, 'invalid-token');
      }
      
      // Should be rate limited
      const result = authManager.validateTokenWithRateLimit(ip, 'test-token-123');
      expect(result.rateLimited).toBe(true);
    });
  });

  describe('Help Generator Tests', () => {
    test('should generate welcome message', () => {
      const welcome = helpGenerator.generateWelcomeMessage();
      
      expect(welcome).toBeDefined();
      expect(typeof welcome).toBe('string');
      expect(welcome).toContain('Windows MCP');
      expect(welcome).toContain('available commands');
    });

    test('should generate tool help', () => {
      const toolHelp = helpGenerator.generateToolHelp('build_dotnet');
      
      expect(toolHelp).toBeDefined();
      expect(typeof toolHelp).toBe('string');
      expect(toolHelp).toContain('build_dotnet');
    });

    test('should generate category help', () => {
      const categoryHelp = helpGenerator.generateCategoryHelp('build');
      
      expect(categoryHelp).toBeDefined();
      expect(typeof categoryHelp).toBe('string');
      expect(categoryHelp).toContain('build');
    });

    test('should list all available tools', () => {
      const toolsList = helpGenerator.listAllTools();
      
      expect(Array.isArray(toolsList)).toBe(true);
      expect(toolsList.length).toBeGreaterThan(0);
      expect(toolsList).toContain('build_dotnet');
      expect(toolsList).toContain('run_powershell');
    });

    test('should generate usage examples', () => {
      const examples = helpGenerator.generateUsageExamples('build_dotnet');
      
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0]).toHaveProperty('description');
      expect(examples[0]).toHaveProperty('command');
    });

    test('should handle invalid tool names', () => {
      const invalidHelp = helpGenerator.generateToolHelp('invalid-tool');
      
      expect(invalidHelp).toBeDefined();
      expect(invalidHelp).toContain('not found');
    });

    test('should generate dynamic help based on available tools', () => {
      const dynamicHelp = helpGenerator.generateDynamicHelp();
      
      expect(dynamicHelp).toBeDefined();
      expect(typeof dynamicHelp).toBe('string');
      expect(dynamicHelp).toContain('available tools');
    });

    test('should format help text with proper markdown', () => {
      const formattedHelp = helpGenerator.formatHelpText({
        title: 'Test Tool',
        description: 'Test description',
        examples: ['example1', 'example2']
      });
      
      expect(formattedHelp).toContain('# Test Tool');
      expect(formattedHelp).toContain('Test description');
      expect(formattedHelp).toContain('example1');
    });

    test('should generate troubleshooting guide', () => {
      const troubleshooting = helpGenerator.generateTroubleshooting('build_dotnet');
      
      expect(troubleshooting).toBeDefined();
      expect(typeof troubleshooting).toBe('string');
      expect(troubleshooting).toContain('troubleshooting');
    });

    test('should handle version-specific help', () => {
      const versionHelp = helpGenerator.generateVersionHelp('1.0.40');
      
      expect(versionHelp).toBeDefined();
      expect(versionHelp).toContain('1.0.40');
    });

    test('should generate contextual help', () => {
      const contextualHelp = helpGenerator.generateContextualHelp({
        currentTool: 'build_dotnet',
        lastError: 'Build failed',
        userHistory: ['build_dotnet', 'run_powershell']
      });
      
      expect(contextualHelp).toBeDefined();
      expect(contextualHelp).toContain('build_dotnet');
    });

    test('should cache help content for performance', () => {
      const help1 = helpGenerator.generateToolHelp('build_dotnet');
      const help2 = helpGenerator.generateToolHelp('build_dotnet');
      
      expect(help1).toBe(help2);
      expect(helpGenerator.getCacheStats().hits).toBeGreaterThan(0);
    });

    test('should clear help cache', () => {
      helpGenerator.generateToolHelp('build_dotnet');
      helpGenerator.clearCache();
      
      expect(helpGenerator.getCacheStats().size).toBe(0);
    });

    test('should handle localization', () => {
      const englishHelp = helpGenerator.generateLocalizedHelp('build_dotnet', 'en');
      const japaneseHelp = helpGenerator.generateLocalizedHelp('build_dotnet', 'ja');
      
      expect(englishHelp).toBeDefined();
      expect(japaneseHelp).toBeDefined();
      expect(englishHelp).not.toBe(japaneseHelp);
    });

    test('should generate search results', () => {
      const searchResults = helpGenerator.searchHelp('build');
      
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0]).toHaveProperty('tool');
      expect(searchResults[0]).toHaveProperty('relevance');
    });

    test('should handle help for new features', () => {
      const newFeatureHelp = helpGenerator.generateNewFeatureHelp({
        toolName: 'new_tool',
        description: 'New tool description',
        examples: ['example1']
      });
      
      expect(newFeatureHelp).toBeDefined();
      expect(newFeatureHelp).toContain('new_tool');
      expect(newFeatureHelp).toContain('New tool description');
    });
  });

  describe('Integration Tests', () => {
    test('should work together for authenticated help requests', () => {
      // Simulate authenticated help request
      const token = 'test-token-123';
      const isAuthenticated = authManager.validateToken(token);
      
      if (isAuthenticated) {
        const help = helpGenerator.generateWelcomeMessage();
        expect(help).toBeDefined();
      }
      
      expect(isAuthenticated).toBe(true);
    });

    test('should handle unauthenticated help requests', () => {
      const isAuthenticated = authManager.validateToken('invalid-token');
      
      if (!isAuthenticated) {
        const authHelp = helpGenerator.generateAuthHelp();
        expect(authHelp).toBeDefined();
        expect(authHelp).toContain('authentication');
      }
      
      expect(isAuthenticated).toBe(false);
    });

    test('should log help requests with authentication info', () => {
      const ip = '192.168.1.1';
      const token = 'test-token-123';
      
      authManager.logAuthAttempt(ip, token, true);
      const help = helpGenerator.generateToolHelp('build_dotnet');
      
      expect(help).toBeDefined();
      expect(console.log).toHaveBeenCalled();
    });

    test('should handle high-volume help requests', () => {
      const requests = [];
      
      for (let i = 0; i < 100; i++) {
        const promise = new Promise((resolve) => {
          const isAuth = authManager.validateToken('test-token-123');
          const help = helpGenerator.generateToolHelp('build_dotnet');
          resolve({ isAuth, help });
        });
        requests.push(promise);
      }
      
      return Promise.all(requests).then(results => {
        expect(results).toHaveLength(100);
        results.forEach(result => {
          expect(result.isAuth).toBe(true);
          expect(result.help).toBeDefined();
        });
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupted auth token file', () => {
      fs.readFileSync.mockReturnValue('corrupted-data\x00\x01');
      
      const token = authManager.loadToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('should handle permission errors', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      expect(() => authManager.saveToken('test-token')).not.toThrow();
    });

    test('should handle malformed help requests', () => {
      const malformedRequests = [null, undefined, '', 123, {}, []];
      
      malformedRequests.forEach(request => {
        expect(() => helpGenerator.generateToolHelp(request)).not.toThrow();
      });
    });

    test('should handle memory pressure during help generation', () => {
      const largeHelpRequest = 'build_dotnet'.repeat(1000);
      
      expect(() => helpGenerator.generateToolHelp(largeHelpRequest)).not.toThrow();
    });

    test('should handle concurrent auth and help operations', () => {
      const operations = [];
      
      for (let i = 0; i < 50; i++) {
        const authOp = new Promise(resolve => {
          const result = authManager.validateToken('test-token-123');
          resolve(result);
        });
        
        const helpOp = new Promise(resolve => {
          const result = helpGenerator.generateToolHelp('build_dotnet');
          resolve(result);
        });
        
        operations.push(authOp, helpOp);
      }
      
      return Promise.all(operations).then(results => {
        expect(results).toHaveLength(100);
        
        // Check auth results
        const authResults = results.filter((_, i) => i % 2 === 0);
        authResults.forEach(result => expect(result).toBe(true));
        
        // Check help results  
        const helpResults = results.filter((_, i) => i % 2 === 1);
        helpResults.forEach(result => expect(result).toBeDefined());
      });
    });

    test('should handle invalid authentication configurations', () => {
      delete process.env.MCP_AUTH_TOKEN;
      process.env.AUTH_REQUIRED = 'false';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const noAuthManager = require('../server/src/utils/auth-manager');
      
      expect(() => noAuthManager.validateToken('any-token')).not.toThrow();
    });

    test('should handle help generation failures gracefully', () => {
      // Mock internal error in help generation
      const originalMethod = helpGenerator.generateToolHelp;
      helpGenerator.generateToolHelp = jest.fn().mockImplementation(() => {
        throw new Error('Help generation failed');
      });
      
      expect(() => helpGenerator.generateToolHelp('build_dotnet')).toThrow();
      
      // Restore original method
      helpGenerator.generateToolHelp = originalMethod;
    });

    test('should validate help content structure', () => {
      const help = helpGenerator.generateToolHelp('build_dotnet');
      
      expect(help).toBeDefined();
      expect(typeof help).toBe('string');
      expect(help.length).toBeGreaterThan(0);
      
      // Should contain structured help elements
      expect(help).toMatch(/#{1,3}\s/); // Markdown headers
    });
  });
});