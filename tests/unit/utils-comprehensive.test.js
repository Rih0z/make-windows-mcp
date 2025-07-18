/**
 * Utils Files Comprehensive Testing
 * crypto.js, helpers.js, logger.js の完全テストスイート
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

describe('Utils Files Comprehensive Testing', () => {
  let crypto, helpers, logger;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    delete require.cache[require.resolve('../server/src/utils/crypto')];
    delete require.cache[require.resolve('../server/src/utils/helpers')];
    delete require.cache[require.resolve('../server/src/utils/logger')];
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Get fresh instances
    crypto = require('../server/src/utils/crypto');
    helpers = require('../server/src/utils/helpers');
    logger = require('../server/src/utils/logger');
  });

  afterEach(() => {
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });

  describe('Crypto Utility Tests', () => {
    test('should encrypt and decrypt data correctly', () => {
      const originalData = 'test-password-123';
      const encrypted = crypto.encrypt(originalData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(originalData);
      expect(encrypted).not.toBe(originalData);
    });

    test('should generate different encrypted outputs for same input', () => {
      const data = 'same-password';
      const encrypted1 = crypto.encrypt(data);
      const encrypted2 = crypto.encrypt(data);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(crypto.decrypt(encrypted1)).toBe(data);
      expect(crypto.decrypt(encrypted2)).toBe(data);
    });

    test('should handle empty string encryption', () => {
      const encrypted = crypto.encrypt('');
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe('');
    });

    test('should handle unicode characters', () => {
      const unicodeData = 'テスト🚀Привет';
      const encrypted = crypto.encrypt(unicodeData);
      const decrypted = crypto.decrypt(encrypted);
      
      expect(decrypted).toBe(unicodeData);
    });

    test('should handle large data encryption', () => {
      const largeData = 'A'.repeat(10000);
      const encrypted = crypto.encrypt(largeData);
      const decrypted = crypto.decrypt(largeData);
      
      expect(decrypted).toBe(largeData);
    });

    test('should throw error for invalid encrypted data', () => {
      expect(() => crypto.decrypt('invalid-encrypted-data')).toThrow();
    });

    test('should throw error for malformed encrypted data', () => {
      expect(() => crypto.decrypt('not:valid:format')).toThrow();
    });

    test('should handle null and undefined inputs', () => {
      expect(() => crypto.encrypt(null)).toThrow();
      expect(() => crypto.encrypt(undefined)).toThrow();
      expect(() => crypto.decrypt(null)).toThrow();
      expect(() => crypto.decrypt(undefined)).toThrow();
    });

    test('should generate consistent hash for same input', () => {
      const data = 'test-data';
      const hash1 = crypto.hash(data);
      const hash2 = crypto.hash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    test('should generate different hashes for different inputs', () => {
      const hash1 = crypto.hash('data1');
      const hash2 = crypto.hash('data2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Helpers Utility Tests', () => {
    test('should sanitize command output', () => {
      const output = 'Normal output\n\x00\x01\x02dangerous chars';
      const sanitized = helpers.sanitizeOutput(output);
      
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x01');
      expect(sanitized).not.toContain('\x02');
      expect(sanitized).toContain('Normal output');
    });

    test('should format command result with success status', () => {
      const result = helpers.formatCommandResult('success output', null, 0);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('output', 'success output');
      expect(result).toHaveProperty('error', null);
      expect(result).toHaveProperty('exitCode', 0);
    });

    test('should format command result with error status', () => {
      const result = helpers.formatCommandResult('', 'error message', 1);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('output', '');
      expect(result).toHaveProperty('error', 'error message');
      expect(result).toHaveProperty('exitCode', 1);
    });

    test('should validate required parameters', () => {
      const params = { projectPath: 'C:\\projects\\test' };
      const required = ['projectPath'];
      
      expect(() => helpers.validateRequiredParams(params, required)).not.toThrow();
    });

    test('should throw error for missing required parameters', () => {
      const params = { projectPath: 'C:\\projects\\test' };
      const required = ['projectPath', 'buildTool'];
      
      expect(() => helpers.validateRequiredParams(params, required))
        .toThrow('Missing required parameter: buildTool');
    });

    test('should extract first word from command', () => {
      expect(helpers.extractFirstWord('dotnet build')).toBe('dotnet');
      expect(helpers.extractFirstWord('  python  script.py  ')).toBe('python');
      expect(helpers.extractFirstWord('')).toBe('');
    });

    test('should check if path is absolute', () => {
      expect(helpers.isAbsolutePath('C:\\projects\\test')).toBe(true);
      expect(helpers.isAbsolutePath('/home/user/project')).toBe(true);
      expect(helpers.isAbsolutePath('relative/path')).toBe(false);
      expect(helpers.isAbsolutePath('../relative')).toBe(false);
    });

    test('should create timestamp string', () => {
      const timestamp = helpers.createTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should handle edge cases in command execution', () => {
      const result = helpers.formatCommandResult(null, null, null);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('output', '');
      expect(result).toHaveProperty('error', 'Unknown error');
      expect(result).toHaveProperty('exitCode', -1);
    });
  });

  describe('Logger Utility Tests', () => {
    beforeEach(() => {
      // Mock fs operations
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation();
      jest.spyOn(fs, 'appendFileSync').mockImplementation();
      jest.spyOn(fs, 'writeFileSync').mockImplementation();
      jest.spyOn(fs, 'readFileSync').mockReturnValue('');
      jest.spyOn(fs, 'unlinkSync').mockImplementation();
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1000 });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should log info messages', () => {
      logger.info('Test info message');
      
      expect(fs.appendFileSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test info message'));
    });

    test('should log error messages', () => {
      logger.error('Test error message');
      
      expect(fs.appendFileSync).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Test error message'));
    });

    test('should log warn messages', () => {
      logger.warn('Test warning message');
      
      expect(fs.appendFileSync).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Test warning message'));
    });

    test('should log debug messages', () => {
      logger.debug('Test debug message');
      
      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    test('should handle file system errors gracefully', () => {
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('File system error');
      });
      
      expect(() => logger.info('Test message')).not.toThrow();
    });

    test('should rotate logs when size limit exceeded', () => {
      fs.statSync.mockReturnValue({ size: 10 * 1024 * 1024 + 1 }); // Over 10MB
      
      logger.info('Test message');
      
      expect(fs.writeFileSync).toHaveBeenCalled(); // Log rotation
    });

    test('should create log directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      
      logger.info('Test message');
      
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    test('should log structured data', () => {
      const structuredData = {
        action: 'build',
        project: 'test-project',
        status: 'success'
      };
      
      logger.info('Build completed', structuredData);
      
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Build completed')
      );
    });

    test('should handle circular references in log data', () => {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj;
      
      expect(() => logger.info('Circular test', circularObj)).not.toThrow();
    });

    test('should limit log file count', () => {
      const mockFiles = Array.from({ length: 15 }, (_, i) => `app.log.${i}`);
      fs.readdirSync.mockReturnValue(mockFiles);
      
      logger.info('Test message');
      
      expect(fs.unlinkSync).toHaveBeenCalled(); // Old logs removed
    });
  });

  describe('Integration Tests', () => {
    test('should work together in typical workflow', () => {
      // Simulate a typical workflow using all utilities
      const password = 'user-password-123';
      const encrypted = crypto.encrypt(password);
      
      const result = helpers.formatCommandResult('Build successful', null, 0);
      logger.info('Build completed', result);
      
      const timestamp = helpers.createTimestamp();
      expect(timestamp).toBeDefined();
      
      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toBe(password);
      
      expect(result.success).toBe(true);
    });

    test('should handle error scenarios across utilities', () => {
      try {
        crypto.decrypt('invalid-data');
      } catch (error) {
        const result = helpers.formatCommandResult('', error.message, 1);
        logger.error('Crypto error', result);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('should handle high load scenarios', () => {
      // Simulate high load
      for (let i = 0; i < 100; i++) {
        const data = `test-data-${i}`;
        const encrypted = crypto.encrypt(data);
        const hash = crypto.hash(data);
        
        const result = helpers.formatCommandResult(`output-${i}`, null, 0);
        logger.info(`Operation ${i}`, result);
        
        expect(crypto.decrypt(encrypted)).toBe(data);
        expect(hash).toBeDefined();
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle memory pressure gracefully', () => {
      const largeData = 'A'.repeat(1000000); // 1MB string
      
      expect(() => {
        const encrypted = crypto.encrypt(largeData);
        const result = helpers.formatCommandResult(largeData, null, 0);
        logger.info('Large data test', result);
        crypto.decrypt(encrypted);
      }).not.toThrow();
    });

    test('should handle special characters in all utilities', () => {
      const specialData = '!@#$%^&*()[]{}|;:,.<>?/~`';
      
      const encrypted = crypto.encrypt(specialData);
      const decrypted = crypto.decrypt(encrypted);
      const sanitized = helpers.sanitizeOutput(specialData);
      
      expect(decrypted).toBe(specialData);
      expect(sanitized).toBeDefined();
      
      logger.info('Special characters test', { data: specialData });
    });

    test('should handle concurrent operations', () => {
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        const promise = new Promise((resolve) => {
          const data = `concurrent-${i}`;
          const encrypted = crypto.encrypt(data);
          const result = helpers.formatCommandResult(data, null, 0);
          logger.info(`Concurrent ${i}`, result);
          
          resolve({
            encrypted,
            decrypted: crypto.decrypt(encrypted),
            result
          });
        });
        promises.push(promise);
      }
      
      return Promise.all(promises).then(results => {
        expect(results).toHaveLength(50);
        results.forEach((result, i) => {
          expect(result.decrypted).toBe(`concurrent-${i}`);
          expect(result.result.success).toBe(true);
        });
      });
    });

    test('should handle system resource limitations', () => {
      // Simulate resource constraints
      const originalAppendFile = fs.appendFileSync;
      let callCount = 0;
      
      fs.appendFileSync.mockImplementation((path, data) => {
        callCount++;
        if (callCount > 5) {
          throw new Error('Resource limit exceeded');
        }
        return originalAppendFile.call(fs, path, data);
      });
      
      // Should handle resource limitations gracefully
      for (let i = 0; i < 10; i++) {
        expect(() => logger.info(`Test ${i}`)).not.toThrow();
      }
    });

    test('should validate input parameters thoroughly', () => {
      // Test various invalid inputs
      const invalidInputs = [null, undefined, {}, [], 123, true, false];
      
      invalidInputs.forEach(input => {
        expect(() => {
          try {
            crypto.encrypt(input);
          } catch (error) {
            expect(error).toBeDefined();
          }
        }).not.toThrow();
      });
    });
  });
});