const AuthManager = require('../server/src/utils/auth-manager');

describe('Auth Manager - Complete Coverage', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = process.env;
    
    // Create a fresh environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    test('should initialize with valid auth token', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token-123456789';
      
      // Create new instance by requiring the module again
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.isAuthEnabled()).toBe(true);
      expect(authManager.getExpectedTokenLength()).toBe(25);
    });

    test('should initialize with disabled auth for default token', () => {
      process.env.MCP_AUTH_TOKEN = 'change-this-to-a-secure-random-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.isAuthEnabled()).toBe(false);
    });

    test('should initialize with disabled auth for missing token', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.isAuthEnabled()).toBe(false);
    });

    test('should initialize with disabled auth for empty token', () => {
      process.env.MCP_AUTH_TOKEN = '';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.isAuthEnabled()).toBe(false);
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Bearer header', () => {
      const token = AuthManager.extractToken('Bearer test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should extract token from bearer header (case insensitive)', () => {
      const token = AuthManager.extractToken('bearer test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should extract token from BEARER header (uppercase)', () => {
      const token = AuthManager.extractToken('BEARER test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should handle token with extra whitespace', () => {
      const token = AuthManager.extractToken('  Bearer   test-token-123  ');
      expect(token).toBe('test-token-123');
    });

    test('should handle token without Bearer prefix', () => {
      const token = AuthManager.extractToken('test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should return null for Bearer without token', () => {
      const token = AuthManager.extractToken('Bearer');
      expect(token).toBe(null);
    });

    test('should return null for Bearer with only whitespace', () => {
      const token = AuthManager.extractToken('Bearer   ');
      expect(token).toBe(null);
    });

    test('should return null for empty header', () => {
      const token = AuthManager.extractToken('');
      expect(token).toBe(null);
    });

    test('should return null for whitespace-only header', () => {
      const token = AuthManager.extractToken('   ');
      expect(token).toBe(null);
    });

    test('should return null for null header', () => {
      const token = AuthManager.extractToken(null);
      expect(token).toBe(null);
    });

    test('should return null for undefined header', () => {
      const token = AuthManager.extractToken(undefined);
      expect(token).toBe(null);
    });

    test('should return null for non-string header', () => {
      const token = AuthManager.extractToken(123);
      expect(token).toBe(null);
    });

    test('should return null for object header', () => {
      const token = AuthManager.extractToken({});
      expect(token).toBe(null);
    });
  });

  describe('Token Validation', () => {
    test('should validate correct token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken('test-secure-token');
      expect(isValid).toBe(true);
    });

    test('should reject incorrect token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken('wrong-token');
      expect(isValid).toBe(false);
    });

    test('should allow any token when auth is disabled', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken('any-token');
      expect(isValid).toBe(true);
    });

    test('should reject null token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken(null);
      expect(isValid).toBe(false);
    });

    test('should reject undefined token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken(undefined);
      expect(isValid).toBe(false);
    });

    test('should reject non-string token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken(123);
      expect(isValid).toBe(false);
    });

    test('should reject empty string token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const isValid = authManager.validateToken('');
      expect(isValid).toBe(false);
    });
  });

  describe('Secure Comparison', () => {
    test('should return true for identical strings', () => {
      const result = AuthManager.secureCompare('test-token', 'test-token');
      expect(result).toBe(true);
    });

    test('should return false for different strings', () => {
      const result = AuthManager.secureCompare('test-token', 'different-token');
      expect(result).toBe(false);
    });

    test('should return false for strings of different lengths', () => {
      const result = AuthManager.secureCompare('short', 'much-longer-string');
      expect(result).toBe(false);
    });

    test('should return false for non-string first parameter', () => {
      const result = AuthManager.secureCompare(123, 'test-token');
      expect(result).toBe(false);
    });

    test('should return false for non-string second parameter', () => {
      const result = AuthManager.secureCompare('test-token', 123);
      expect(result).toBe(false);
    });

    test('should return false for null parameters', () => {
      const result = AuthManager.secureCompare(null, 'test-token');
      expect(result).toBe(false);
    });

    test('should return false for undefined parameters', () => {
      const result = AuthManager.secureCompare('test-token', undefined);
      expect(result).toBe(false);
    });

    test('should return true for empty strings', () => {
      const result = AuthManager.secureCompare('', '');
      expect(result).toBe(true);
    });

    test('should handle special characters', () => {
      const result = AuthManager.secureCompare('test@#$%^&*()_+', 'test@#$%^&*()_+');
      expect(result).toBe(true);
    });

    test('should handle Unicode characters', () => {
      const result = AuthManager.secureCompare('テスト', 'テスト');
      expect(result).toBe(true);
    });
  });

  describe('Partial Token Generation', () => {
    test('should generate partial token for normal tokens', () => {
      const partial = AuthManager.getPartialToken('test-token-123456789');
      expect(partial).toBe('test...6789');
    });

    test('should return "too short" for short tokens', () => {
      const partial = AuthManager.getPartialToken('short');
      expect(partial).toBe('too short');
    });

    test('should return "null" for null token', () => {
      const partial = AuthManager.getPartialToken(null);
      expect(partial).toBe('null');
    });

    test('should return "null" for undefined token', () => {
      const partial = AuthManager.getPartialToken(undefined);
      expect(partial).toBe('null');
    });

    test('should return "null" for non-string token', () => {
      const partial = AuthManager.getPartialToken(123);
      expect(partial).toBe('null');
    });

    test('should return "null" for empty string', () => {
      const partial = AuthManager.getPartialToken('');
      expect(partial).toBe('null');
    });

    test('should handle exactly 8 character tokens', () => {
      const partial = AuthManager.getPartialToken('12345678');
      expect(partial).toBe('1234...5678');
    });

    test('should handle 7 character tokens', () => {
      const partial = AuthManager.getPartialToken('1234567');
      expect(partial).toBe('too short');
    });
  });

  describe('Token Length and Partial Information', () => {
    test('should return expected token length when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token-123456789';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.getExpectedTokenLength()).toBe(25);
    });

    test('should return 0 when auth is disabled', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.getExpectedTokenLength()).toBe(0);
    });

    test('should return expected token partial when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token-123456789';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.getExpectedTokenPartial()).toBe('test...6789');
    });

    test('should return "none" when auth is disabled', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      expect(authManager.getExpectedTokenPartial()).toBe('none');
    });
  });

  describe('Diagnostics Generation', () => {
    test('should generate diagnostics when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token-123456789';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('wrong-token', 'Bearer wrong-token');
      
      expect(diagnostics.authEnabled).toBe(true);
      expect(diagnostics.tokenAnalysis).toBeDefined();
      expect(diagnostics.tokenAnalysis.expected.length).toBe(25);
      expect(diagnostics.tokenAnalysis.received.length).toBe(11);
      expect(diagnostics.tokenAnalysis.headerAnalysis.startsWithBearer).toBe(true);
      expect(diagnostics.serverInfo).toBeDefined();
    });

    test('should generate diagnostics when auth is disabled', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('any-token', 'Bearer any-token');
      
      expect(diagnostics.authEnabled).toBe(false);
      expect(diagnostics.tokenAnalysis).toBeUndefined();
      expect(diagnostics.serverInfo).toBeDefined();
    });

    test('should include character differences in diagnostics', () => {
      process.env.MCP_AUTH_TOKEN = 'test-token-123';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('test-token-124', 'Bearer test-token-124');
      
      expect(diagnostics.tokenAnalysis.characterDifferences).toBeDefined();
      expect(diagnostics.tokenAnalysis.characterDifferences.length).toBe(1);
      expect(diagnostics.tokenAnalysis.characterDifferences[0].position).toBe(13);
    });

    test('should handle missing auth header in diagnostics', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('test-token', null);
      
      expect(diagnostics.tokenAnalysis.headerAnalysis.provided).toBe(false);
      expect(diagnostics.tokenAnalysis.headerAnalysis.format).toBe('missing');
    });

    test('should handle empty provided token in diagnostics', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics(null, 'Bearer ');
      
      expect(diagnostics.tokenAnalysis.received.length).toBe(0);
      expect(diagnostics.tokenAnalysis.received.partial).toBe('null');
    });

    test('should limit character differences to 5 for security', () => {
      process.env.MCP_AUTH_TOKEN = 'abcdefghijklmnop';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('1234567890123456', 'Bearer 1234567890123456');
      
      expect(diagnostics.tokenAnalysis.characterDifferences.length).toBe(5);
    });
  });

  describe('Session Health', () => {
    test('should return session health when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-secure-token';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const health = authManager.getSessionHealth();
      
      expect(health.authEnabled).toBe(true);
      expect(health.tokenConfigured).toBe(true);
      expect(health.instanceHealth).toBe('stable');
      expect(health.memoryUsage).toBeDefined();
      expect(typeof health.serverUptime).toBe('number');
    });

    test('should return session health when auth is disabled', () => {
      delete process.env.MCP_AUTH_TOKEN;
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const health = authManager.getSessionHealth();
      
      expect(health.authEnabled).toBe(false);
      expect(health.tokenConfigured).toBe(false);
      expect(health.instanceHealth).toBe('stable');
    });

    test('should include timestamp in session health', () => {
      const health = AuthManager.getSessionHealth();
      
      expect(health.timestamp).toBeDefined();
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
    });

    test('should include memory usage in session health', () => {
      const health = AuthManager.getSessionHealth();
      
      expect(health.memoryUsage).toBeDefined();
      expect(typeof health.memoryUsage.rss).toBe('number');
      expect(typeof health.memoryUsage.heapTotal).toBe('number');
      expect(typeof health.memoryUsage.heapUsed).toBe('number');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long tokens', () => {
      const longToken = 'a'.repeat(1000);
      const partial = AuthManager.getPartialToken(longToken);
      expect(partial).toBe('aaaa...aaaa');
    });

    test('should handle tokens with special characters', () => {
      const specialToken = 'test@#$%^&*()_+-={}[]|\\:";\'<>?,./ token';
      const partial = AuthManager.getPartialToken(specialToken);
      expect(partial).toBe('test...oken');
    });

    test('should handle Unicode tokens', () => {
      const unicodeToken = 'テスト-トークン-123456789';
      const partial = AuthManager.getPartialToken(unicodeToken);
      expect(partial).toBe('テスト...6789');
    });

    test('should handle tokens with newlines', () => {
      const tokenWithNewlines = 'test\ntoken\nwith\nnewlines';
      const partial = AuthManager.getPartialToken(tokenWithNewlines);
      expect(partial).toBe('test...ines');
    });

    test('should handle tokens with tabs', () => {
      const tokenWithTabs = 'test\ttoken\twith\ttabs';
      const partial = AuthManager.getPartialToken(tokenWithTabs);
      expect(partial).toBe('test...tabs');
    });

    test('should handle auth header with unusual spacing', () => {
      const token = AuthManager.extractToken('Bearer\t\t\ttest-token\t\t\t');
      expect(token).toBe('test-token');
    });

    test('should handle auth header with mixed case bearer', () => {
      const token = AuthManager.extractToken('BeArEr test-token');
      expect(token).toBe('test-token');
    });

    test('should handle diagnostics with different token lengths', () => {
      process.env.MCP_AUTH_TOKEN = 'short';
      
      delete require.cache[require.resolve('../server/src/utils/auth-manager')];
      const authManager = require('../server/src/utils/auth-manager');
      
      const diagnostics = authManager.generateDiagnostics('much-longer-token', 'Bearer much-longer-token');
      
      expect(diagnostics.tokenAnalysis.expected.length).toBe(5);
      expect(diagnostics.tokenAnalysis.received.length).toBe(17);
      expect(diagnostics.tokenAnalysis.characterDifferences).toBeUndefined();
    });
  });
});