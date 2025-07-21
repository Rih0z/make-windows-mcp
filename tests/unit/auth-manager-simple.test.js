/**
 * Auth Manager Simple Test - Core Functions Coverage
 */

describe('Auth Manager Simple Coverage', () => {
  let AuthManager;

  beforeEach(() => {
    // Clear require cache
    delete require.cache[require.resolve('../../server/src/utils/auth-manager')];
    
    // Clear environment
    delete process.env.MCP_AUTH_TOKEN;
  });

  describe('Basic Functionality', () => {
    test('should initialize with disabled auth for missing token', () => {
      AuthManager = require('../../server/src/utils/auth-manager');
      expect(AuthManager.isAuthEnabled()).toBe(false);
    });

    test('should initialize with disabled auth for default token', () => {
      process.env.MCP_AUTH_TOKEN = 'change-this-to-a-secure-random-token';
      AuthManager = require('../../server/src/utils/auth-manager');
      expect(AuthManager.isAuthEnabled()).toBe(false);
    });

    test('should initialize with enabled auth for valid token', () => {
      process.env.MCP_AUTH_TOKEN = 'valid-token-12345678901234567890';
      AuthManager = require('../../server/src/utils/auth-manager');
      expect(AuthManager.isAuthEnabled()).toBe(true);
    });

    test('should initialize with disabled auth for empty token', () => {
      process.env.MCP_AUTH_TOKEN = '';
      AuthManager = require('../../server/src/utils/auth-manager');
      expect(AuthManager.isAuthEnabled()).toBe(false);
    });
  });

  describe('Token Extraction', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'test-token-123456789';
      AuthManager = require('../../server/src/utils/auth-manager');
    });

    test('should extract token from Bearer header', () => {
      const token = AuthManager.extractToken('Bearer test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should extract token from bearer header (case insensitive)', () => {
      const token = AuthManager.extractToken('bearer test-token-456');
      expect(token).toBe('test-token-456');
    });

    test('should extract token from BEARER header (uppercase)', () => {
      const token = AuthManager.extractToken('BEARER test-token-789');
      expect(token).toBe('test-token-789');
    });

    test('should handle token with extra whitespace', () => {
      const token = AuthManager.extractToken('Bearer   test-token-whitespace   ');
      expect(token).toBe('test-token-whitespace');
    });

    test('should return null for empty header', () => {
      const token = AuthManager.extractToken('');
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

    test('should return null for Bearer without token', () => {
      const token = AuthManager.extractToken('Bearer');
      expect(token).toBe(null);
    });
  });

  describe('Token Validation', () => {
    test('should validate correct token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'test-token-validation-123';
      AuthManager = require('../../server/src/utils/auth-manager');
      
      const isValid = AuthManager.validateToken('test-token-validation-123');
      expect(isValid).toBe(true);
    });

    test('should reject incorrect token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'correct-token-123456789';
      AuthManager = require('../../server/src/utils/auth-manager');
      
      const isValid = AuthManager.validateToken('wrong-token');
      expect(isValid).toBe(false);
    });

    test('should allow any token when auth is disabled', () => {
      process.env.MCP_AUTH_TOKEN = '';
      AuthManager = require('../../server/src/utils/auth-manager');
      
      const isValid = AuthManager.validateToken('any-token');
      expect(isValid).toBe(true);
    });

    test('should reject null token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'enabled-token-123456789';
      AuthManager = require('../../server/src/utils/auth-manager');
      
      const isValid = AuthManager.validateToken(null);
      expect(isValid).toBe(false);
    });

    test('should reject undefined token when auth is enabled', () => {
      process.env.MCP_AUTH_TOKEN = 'enabled-token-123456789';
      AuthManager = require('../../server/src/utils/auth-manager');
      
      const isValid = AuthManager.validateToken(undefined);
      expect(isValid).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = 'utility-token-123456789';
      AuthManager = require('../../server/src/utils/auth-manager');
    });

    test('should return expected token length when auth is enabled', () => {
      const length = AuthManager.getExpectedTokenLength();
      expect(length).toBe(21); // 'utility-token-123456789'.length
    });

    test('should return partial token when auth is enabled', () => {
      const partial = AuthManager.getExpectedTokenPartial();
      expect(partial).toContain('util'); // First 4 chars
      expect(partial).toContain('6789'); // Last 4 chars
    });

    test('should generate diagnostics when auth is enabled', () => {
      const diagnostics = AuthManager.generateDiagnostics('wrong-token', 'Bearer wrong-token');
      expect(diagnostics).toBeDefined();
      expect(diagnostics.authEnabled).toBe(true);
      expect(diagnostics.tokenProvided).toBe(true);
    });

    test('should get session health', () => {
      const health = AuthManager.getSessionHealth();
      expect(health).toBeDefined();
      expect(health.authEnabled).toBe(true);
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Disabled Auth State', () => {
    beforeEach(() => {
      process.env.MCP_AUTH_TOKEN = '';
      AuthManager = require('../../server/src/utils/auth-manager');
    });

    test('should return 0 length when auth is disabled', () => {
      const length = AuthManager.getExpectedTokenLength();
      expect(length).toBe(0);
    });

    test('should return "none" partial when auth is disabled', () => {
      const partial = AuthManager.getExpectedTokenPartial();
      expect(partial).toBe('none');
    });

    test('should generate diagnostics when auth is disabled', () => {
      const diagnostics = AuthManager.generateDiagnostics('any-token', 'Bearer any-token');
      expect(diagnostics.authEnabled).toBe(false);
    });

    test('should get session health when disabled', () => {
      const health = AuthManager.getSessionHealth();
      expect(health.authEnabled).toBe(false);
    });
  });

  describe('Secure Comparison', () => {
    beforeEach(() => {
      AuthManager = require('../../server/src/utils/auth-manager');
    });

    test('should return true for identical strings', () => {
      const result = AuthManager.secureCompare('test123', 'test123');
      expect(result).toBe(true);
    });

    test('should return false for different strings', () => {
      const result = AuthManager.secureCompare('test123', 'test456');
      expect(result).toBe(false);
    });

    test('should return false for different lengths', () => {
      const result = AuthManager.secureCompare('short', 'much longer string');
      expect(result).toBe(false);
    });

    test('should return false for null parameters', () => {
      const result = AuthManager.secureCompare(null, 'test');
      expect(result).toBe(false);
    });

    test('should return false for undefined parameters', () => {
      const result = AuthManager.secureCompare(undefined, 'test');
      expect(result).toBe(false);
    });

    test('should return true for empty strings', () => {
      const result = AuthManager.secureCompare('', '');
      expect(result).toBe(true);
    });
  });

  describe('Partial Token Generation', () => {
    test('should generate partial token for normal tokens', () => {
      const partial = AuthManager.getPartialToken('1234567890abcdef');
      expect(partial).toBe('1234...cdef');
    });

    test('should return "too short" for short tokens', () => {
      const partial = AuthManager.getPartialToken('123');
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

    test('should handle exactly 8 character tokens', () => {
      const partial = AuthManager.getPartialToken('12345678');
      expect(partial).toBe('1234...5678');
    });
  });
});