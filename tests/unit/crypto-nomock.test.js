// Test crypto without mocking to get real coverage
const crypto = require('../server/src/utils/crypto');

describe('CryptoManager Real Coverage', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN
    };
  });

  afterEach(() => {
    // Restore original env
    process.env.ENCRYPTION_KEY = originalEnv.ENCRYPTION_KEY;
    process.env.MCP_AUTH_TOKEN = originalEnv.MCP_AUTH_TOKEN;
    
    // Re-initialize crypto with restored env
    crypto.initializeKey();
  });

  describe('Core Encryption/Decryption Flow', () => {
    test('should handle full encryption flow with valid key', () => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-for-coverage';
      crypto.initializeKey();
      
      const plaintext = 'MySecurePassword123!';
      
      // This should trigger lines 37-57
      const encrypted = crypto.encrypt(plaintext);
      expect(encrypted).toMatch(/^enc:/);
      expect(encrypted).not.toBe(plaintext);
      
      // This should trigger lines 72-85
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('should handle encryption when disabled', () => {
      delete process.env.ENCRYPTION_KEY;
      delete process.env.MCP_AUTH_TOKEN;
      crypto.initializeKey();
      
      const plaintext = 'NoEncryption';
      
      // Line 37-38: return early when encryption disabled
      expect(crypto.encrypt(plaintext)).toBe(plaintext);
      expect(crypto.decrypt(plaintext)).toBe(plaintext);
    });

    test('should handle empty text in encrypt', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-empty-text-handling';
      crypto.initializeKey();
      
      // Line 37: check for !text
      expect(crypto.encrypt('')).toBe('');
      expect(crypto.encrypt(null)).toBe(null);
      expect(crypto.encrypt(undefined)).toBe(undefined);
    });

    test('should handle decrypt with non-encrypted text', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-decrypt-plain-text';
      crypto.initializeKey();
      
      // Line 68-69: return early for non-encrypted text
      expect(crypto.decrypt('plain-text')).toBe('plain-text');
      expect(crypto.decrypt('')).toBe('');
      expect(crypto.decrypt(null)).toBe(null);
    });

    test('should handle encryption errors gracefully', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-error-handling-test';
      crypto.initializeKey();
      
      // Mock crypto.randomBytes to throw
      const originalRandomBytes = require('crypto').randomBytes;
      require('crypto').randomBytes = jest.fn(() => {
        throw new Error('Random bytes error');
      });
      
      const originalError = console.error;
      console.error = jest.fn();
      
      // Lines 58-60: catch block
      const result = crypto.encrypt('test');
      expect(result).toBe('test');
      expect(console.error).toHaveBeenCalledWith('Encryption failed:', 'Random bytes error');
      
      require('crypto').randomBytes = originalRandomBytes;
      console.error = originalError;
    });

    test('should handle decryption with invalid base64', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-decrypt-error-test';
      crypto.initializeKey();
      
      const invalidEncrypted = 'enc:invalid-base64-!!!@@##$$';
      
      const originalError = console.error;
      console.error = jest.fn();
      
      // Lines 86-88: catch block in decrypt
      expect(() => crypto.decrypt(invalidEncrypted)).toThrow('Failed to decrypt credentials');
      expect(console.error).toHaveBeenCalledWith('Decryption failed:', expect.any(String));
      
      console.error = originalError;
    });

    test('should handle decryption with corrupted data', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-corrupted-decrypt';
      crypto.initializeKey();
      
      // Create valid encrypted data first
      const plaintext = 'TestData';
      const encrypted = crypto.encrypt(plaintext);
      
      // Corrupt it by changing the base64 content
      const parts = encrypted.split(':');
      const corruptedBase64 = parts[1].substring(0, parts[1].length - 10) + 'CORRUPTED=';
      const corrupted = 'enc:' + corruptedBase64;
      
      const originalError = console.error;
      console.error = jest.fn();
      
      expect(() => crypto.decrypt(corrupted)).toThrow('Failed to decrypt credentials');
      
      console.error = originalError;
    });

    test('should handle very short encrypted data', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-short-data-decrypt';
      crypto.initializeKey();
      
      // Too short to contain IV + tag + data
      const tooShort = 'enc:' + Buffer.from('short').toString('base64');
      
      const originalError = console.error;
      console.error = jest.fn();
      
      expect(() => crypto.decrypt(tooShort)).toThrow('Failed to decrypt credentials');
      
      console.error = originalError;
    });
  });

  describe('Hash and Token Functions', () => {
    test('should hash null/undefined/empty consistently', () => {
      // Line 96: !data check
      expect(crypto.hashForLogging(null)).toBe('null');
      expect(crypto.hashForLogging(undefined)).toBe('null');
      expect(crypto.hashForLogging('')).toBe('null');
      expect(crypto.hashForLogging(0)).toBe('null');
      expect(crypto.hashForLogging(false)).toBe('null');
    });

    test('should hash actual data', () => {
      // Lines 98-99: actual hashing
      const hash = crypto.hashForLogging('test-data');
      expect(hash).toMatch(/^[a-f0-9]{8}\.\.\.$/);
      expect(crypto.hashForLogging('test-data')).toBe(hash); // consistent
    });

    test('should generate tokens with various lengths', () => {
      // Line 106: full function coverage
      const token32 = crypto.generateSecureToken();
      expect(token32).toHaveLength(64); // 32 bytes = 64 hex
      
      const token16 = crypto.generateSecureToken(16);
      expect(token16).toHaveLength(32); // 16 bytes = 32 hex
      
      const token64 = crypto.generateSecureToken(64);
      expect(token64).toHaveLength(128); // 64 bytes = 128 hex
    });
  });

  describe('Password Validation Edge Cases', () => {
    test('should validate all password requirements', () => {
      // Perfect password
      const perfect = crypto.validatePasswordStrength('MyP@ssw0rd123!');
      expect(perfect.isValid).toBe(true);
      expect(perfect.issues).toHaveLength(0);
      
      // Missing length (line 121-123)
      const short = crypto.validatePasswordStrength('Sh0rt!');
      expect(short.isValid).toBe(false);
      expect(short.issues).toContain('Password must be at least 12 characters long');
      
      // Missing uppercase (line 125-127)
      const noUpper = crypto.validatePasswordStrength('myp@ssw0rd123!');
      expect(noUpper.isValid).toBe(false);
      expect(noUpper.issues).toContain('Password must contain at least one uppercase letter');
      
      // Missing lowercase (line 129-131)
      const noLower = crypto.validatePasswordStrength('MYP@SSW0RD123!');
      expect(noLower.isValid).toBe(false);
      expect(noLower.issues).toContain('Password must contain at least one lowercase letter');
      
      // Missing numbers (line 133-135)
      const noNumbers = crypto.validatePasswordStrength('MyPassword!!!');
      expect(noNumbers.isValid).toBe(false);
      expect(noNumbers.issues).toContain('Password must contain at least one number');
      
      // Missing special chars (line 137-139)
      const noSpecial = crypto.validatePasswordStrength('MyPassword123');
      expect(noSpecial.isValid).toBe(false);
      expect(noSpecial.issues).toContain('Password must contain at least one special character');
      
      // All issues at once
      const terrible = crypto.validatePasswordStrength('bad');
      expect(terrible.isValid).toBe(false);
      expect(terrible.issues).toHaveLength(4); // 'bad' has lowercase, so only 4 issues
    });

    test('should handle edge case passwords', () => {
      // Empty password
      const empty = crypto.validatePasswordStrength('');
      expect(empty.isValid).toBe(false);
      expect(empty.issues).toHaveLength(5);
      
      // Just long enough
      const justLong = crypto.validatePasswordStrength('MyP@ssw0rd12');
      expect(justLong.isValid).toBe(true);
      
      // Unicode characters
      const unicode = crypto.validatePasswordStrength('MyP@ssw0rd🔐12');
      expect(unicode.isValid).toBe(true);
    });
  });

  describe('Encryption with different scenarios', () => {
    test('should encrypt binary-like data', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-binary-encryption';
      crypto.initializeKey();
      
      const binaryString = '\x00\x01\x02\x03\x04\x05\xFF\xFE';
      const encrypted = crypto.encrypt(binaryString);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(binaryString);
    });

    test('should handle multiple encrypt/decrypt cycles', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-multiple-cycles-ok';
      crypto.initializeKey();
      
      const data = 'Cycle test data';
      let current = data;
      
      // Multiple cycles
      for (let i = 0; i < 5; i++) {
        const encrypted = crypto.encrypt(current);
        current = crypto.decrypt(encrypted);
      }
      
      expect(current).toBe(data);
    });

    test('should work with MCP_AUTH_TOKEN fallback', () => {
      delete process.env.ENCRYPTION_KEY;
      process.env.MCP_AUTH_TOKEN = 'fallback-auth-token-for-encrypt';
      crypto.initializeKey();
      
      expect(crypto.encryptionEnabled).toBe(true);
      
      const data = 'Fallback encryption test';
      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(data);
    });
  });
});