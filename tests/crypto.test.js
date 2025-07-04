const crypto = require('../server/src/utils/crypto');

describe('CryptoManager', () => {
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

  describe('Initialization', () => {
    test('should initialize with ENCRYPTION_KEY', () => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-12345';
      crypto.initializeKey();
      
      expect(crypto.encryptionEnabled).toBe(true);
    });

    test('should fall back to MCP_AUTH_TOKEN if ENCRYPTION_KEY not set', () => {
      delete process.env.ENCRYPTION_KEY;
      process.env.MCP_AUTH_TOKEN = 'test-auth-token-12345';
      crypto.initializeKey();
      
      expect(crypto.encryptionEnabled).toBe(true);
    });

    test('should disable encryption if no keys are set', () => {
      delete process.env.ENCRYPTION_KEY;
      delete process.env.MCP_AUTH_TOKEN;
      
      // Mock console.warn
      const originalWarn = console.warn;
      console.warn = jest.fn();
      
      crypto.initializeKey();
      
      expect(crypto.encryptionEnabled).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No ENCRYPTION_KEY set'));
      
      console.warn = originalWarn;
    });
  });

  describe('Encryption/Decryption', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = 'test-key-for-encryption-12345678';
      crypto.initializeKey();
    });

    test('should encrypt and decrypt text correctly', () => {
      const plaintext = 'MySecurePassword123!';
      
      const encrypted = crypto.encrypt(plaintext);
      expect(encrypted).toMatch(/^enc:/);
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('should generate different encrypted values for same text', () => {
      const plaintext = 'TestPassword';
      
      const encrypted1 = crypto.encrypt(plaintext);
      const encrypted2 = crypto.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(crypto.decrypt(encrypted1)).toBe(plaintext);
      expect(crypto.decrypt(encrypted2)).toBe(plaintext);
    });

    test('should handle empty text', () => {
      expect(crypto.encrypt('')).toBe('');
      expect(crypto.decrypt('')).toBe('');
    });

    test('should return original text when encryption is disabled', () => {
      delete process.env.ENCRYPTION_KEY;
      delete process.env.MCP_AUTH_TOKEN;
      crypto.initializeKey();
      
      const plaintext = 'NoEncryption';
      expect(crypto.encrypt(plaintext)).toBe(plaintext);
      expect(crypto.decrypt(plaintext)).toBe(plaintext);
    });

    test('should return non-encrypted text as-is when decrypting', () => {
      const plaintext = 'NotEncrypted';
      expect(crypto.decrypt(plaintext)).toBe(plaintext);
    });

    test('should handle encryption errors gracefully', () => {
      // Mock crypto.createCipheriv to throw
      const originalCreateCipheriv = require('crypto').createCipheriv;
      require('crypto').createCipheriv = jest.fn(() => {
        throw new Error('Cipher error');
      });
      
      const originalError = console.error;
      console.error = jest.fn();
      
      const result = crypto.encrypt('test');
      expect(result).toBe('test');
      expect(console.error).toHaveBeenCalledWith('Encryption failed:', 'Cipher error');
      
      require('crypto').createCipheriv = originalCreateCipheriv;
      console.error = originalError;
    });

    test('should throw on decryption failure', () => {
      const invalidEncrypted = 'enc:invalid-base64-data!!!';
      
      const originalError = console.error;
      console.error = jest.fn();
      
      expect(() => crypto.decrypt(invalidEncrypted)).toThrow('Failed to decrypt credentials');
      expect(console.error).toHaveBeenCalledWith('Decryption failed:', expect.any(String));
      
      console.error = originalError;
    });

    test('should handle corrupted encrypted data', () => {
      const plaintext = 'TestData';
      const encrypted = crypto.encrypt(plaintext);
      
      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, -5) + 'XXXXX';
      
      const originalError = console.error;
      console.error = jest.fn();
      
      expect(() => crypto.decrypt(corrupted)).toThrow('Failed to decrypt credentials');
      
      console.error = originalError;
    });
  });

  describe('hashForLogging', () => {
    test('should hash data consistently', () => {
      const data = 'SensitivePassword123';
      
      const hash1 = crypto.hashForLogging(data);
      const hash2 = crypto.hashForLogging(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{8}\.\.\.$/);
      expect(hash1).not.toContain(data);
    });

    test('should handle null/undefined data', () => {
      expect(crypto.hashForLogging(null)).toBe('null');
      expect(crypto.hashForLogging(undefined)).toBe('null');
      expect(crypto.hashForLogging('')).toBe('null');
    });

    test('should produce different hashes for different data', () => {
      const hash1 = crypto.hashForLogging('data1');
      const hash2 = crypto.hashForLogging('data2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSecureToken', () => {
    test('should generate token of default length', () => {
      const token = crypto.generateSecureToken();
      
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    test('should generate token of custom length', () => {
      const lengths = [16, 24, 48];
      
      lengths.forEach(byteLength => {
        const token = crypto.generateSecureToken(byteLength);
        expect(token).toHaveLength(byteLength * 2); // hex encoding doubles length
      });
    });

    test('should generate unique tokens', () => {
      const tokens = new Set();
      
      for (let i = 0; i < 100; i++) {
        tokens.add(crypto.generateSecureToken());
      }
      
      expect(tokens.size).toBe(100);
    });
  });

  describe('validatePasswordStrength', () => {
    test('should validate strong password', () => {
      const result = crypto.validatePasswordStrength('StrongP@ssw0rd123!');
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should reject short password', () => {
      const result = crypto.validatePasswordStrength('Short1!');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must be at least 12 characters long');
    });

    test('should require uppercase letters', () => {
      const result = crypto.validatePasswordStrength('lowercase123!@#');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must contain at least one uppercase letter');
    });

    test('should require lowercase letters', () => {
      const result = crypto.validatePasswordStrength('UPPERCASE123!@#');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must contain at least one lowercase letter');
    });

    test('should require numbers', () => {
      const result = crypto.validatePasswordStrength('NoNumbersHere!@#');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must contain at least one number');
    });

    test('should require special characters', () => {
      const result = crypto.validatePasswordStrength('NoSpecialChars123');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Password must contain at least one special character');
    });

    test('should return multiple issues for weak password', () => {
      const result = crypto.validatePasswordStrength('weak');
      
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(3);
    });

    test('should handle edge cases in password validation', () => {
      // Empty password
      const emptyResult = crypto.validatePasswordStrength('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.issues).toContain('Password must be at least 12 characters long');
      
      // Very long password with all requirements
      const longPassword = 'A'.repeat(50) + 'a1!';
      const longResult = crypto.validatePasswordStrength(longPassword);
      expect(longResult.isValid).toBe(true);
    });
  });

  describe('Edge Cases and Security', () => {
    test('should handle very long text encryption', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-long-text-12345678';
      crypto.initializeKey();
      
      const longText = 'A'.repeat(10000);
      const encrypted = crypto.encrypt(longText);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(longText);
    });

    test('should handle unicode text', () => {
      process.env.ENCRYPTION_KEY = 'test-key-for-unicode-text-123456';
      crypto.initializeKey();
      
      const unicodeTexts = [
        '中文密码测试',
        'パスワードテスト',
        '🔐🔑🛡️',
        'Пароль тест',
        'كلمة المرور'
      ];
      
      unicodeTexts.forEach(text => {
        const encrypted = crypto.encrypt(text);
        const decrypted = crypto.decrypt(encrypted);
        expect(decrypted).toBe(text);
      });
    });

    test('should handle special characters in text', () => {
      process.env.ENCRYPTION_KEY = 'test-key-special-chars-123456789';
      crypto.initializeKey();
      
      const specialTexts = [
        'Password with\nnewline',
        'Tab\there',
        'Quote"Test\'Password',
        'Null\x00Byte',
        'Backslash\\Forward/'
      ];
      
      specialTexts.forEach(text => {
        const encrypted = crypto.encrypt(text);
        const decrypted = crypto.decrypt(encrypted);
        expect(decrypted).toBe(text);
      });
    });
  });
});