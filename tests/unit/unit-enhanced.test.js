// Enhanced unit tests for individual components

// Mock fs before requiring modules
jest.mock('fs');

const fs = require('fs');

describe('Enhanced Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup default fs mocks
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.appendFileSync.mockImplementation(() => {});
    fs.statSync.mockReturnValue({ size: 1000 });
    fs.renameSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
  });

  describe('Security Module Comprehensive Tests', () => {
    let security;

    beforeEach(() => {
      security = require('../../server/src/utils/security');
    });

    describe('PowerShell Command Validation', () => {
      test('should handle complex PowerShell syntax', () => {
        const complexCommands = [
          'Get-Process | Where-Object {$_.WorkingSet -gt 1MB} | Sort-Object WorkingSet -Descending',
          'Get-WinEvent -FilterHashtable @{LogName="System"; Level=2} | Select-Object -First 10',
          '$ErrorActionPreference = "Stop"; Get-Service',
          'ForEach-Object {Write-Host $_.Name}',
          'Get-ChildItem -Path "C:\\Program Files" -Recurse -Force'
        ];

        complexCommands.forEach(command => {
          expect(() => security.validatePowerShellCommand(command)).not.toThrow();
          const result = security.validatePowerShellCommand(command);
          expect(result).toBeTruthy();
          expect(typeof result).toBe('string');
        });
      });

      test('should properly escape special characters', () => {
        const commandWithQuotes = 'echo "Hello \'World\'"';
        const result = security.validatePowerShellCommand(commandWithQuotes);
        expect(result).toContain("''"); // Single quotes should be escaped
      });

      test('should reject commands exceeding length limit', () => {
        const longCommand = 'echo ' + 'a'.repeat(2050);
        expect(() => security.validatePowerShellCommand(longCommand))
          .toThrow('Command too long');
      });

      test('should handle edge cases in dangerous pattern detection', () => {
        const edgeCases = [
          'shutdown_service', // Contains shutdown but not dangerous
          'format-table',     // Contains format but not dangerous
          'Get-NetUser',      // Contains net user but not dangerous
        ];

        edgeCases.forEach(command => {
          expect(() => security.validatePowerShellCommand(command)).not.toThrow();
        });
      });
    });

    describe('Path Validation Edge Cases', () => {
      test('should handle various path formats', () => {
        const validPaths = [
          'C:\\projects\\app.csproj',
          'C:/projects/app.csproj',
          'C:\\projects\\subdir\\app.csproj',
          'Z:\\shared\\project.sln'
        ];

        validPaths.forEach(path => {
          expect(() => security.validatePath(path)).not.toThrow();
          const result = security.validatePath(path);
          expect(result).toContain('\\\\'); // Should be normalized to Windows format
        });
      });

      test('should detect sophisticated directory traversal attempts', () => {
        const maliciousPaths = [
          'C:\\projects\\..\\..\\..\\Windows\\System32',
          'C:/projects/../../../etc/passwd',
          'C:\\projects\\sub\\..\\..\\..\\sensitive',
          'C:\\projects\\app%2e%2e\\..\\system'
        ];

        maliciousPaths.forEach(path => {
          expect(() => security.validatePath(path))
            .toThrow('Directory traversal detected');
        });
      });

      test('should handle custom allowed paths from environment', () => {
        const originalEnv = process.env.ALLOWED_BUILD_PATHS;
        process.env.ALLOWED_BUILD_PATHS = 'D:\\custom\\,E:\\projects\\';

        const validPath = 'D:\\custom\\app.csproj';
        const invalidPath = 'C:\\projects\\app.csproj';

        expect(() => security.validatePath(validPath)).not.toThrow();
        expect(() => security.validatePath(invalidPath))
          .toThrow('Path not in allowed directories');

        process.env.ALLOWED_BUILD_PATHS = originalEnv;
      });
    });

    describe('IP Address Validation Comprehensive', () => {
      test('should validate IPv6 addresses', () => {
        const validIPv6 = [
          '2001:db8::1',
          'fe80::1%eth0',
          '::1',
          '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
        ];

        validIPv6.forEach(ip => {
          expect(() => security.validateIPAddress(ip)).not.toThrow();
        });
      });

      test('should reject malformed IP addresses', () => {
        const invalidIPs = [
          '256.1.1.1',
          '192.168.1',
          '192.168.1.1.1',
          'not-an-ip',
          '192.168.01.1', // Leading zeros
          ''
        ];

        invalidIPs.forEach(ip => {
          expect(() => security.validateIPAddress(ip))
            .toThrow('Invalid IP address format');
        });
      });
    });

    describe('SSH Credentials Validation', () => {
      test('should validate proper credentials', () => {
        const validCreds = {
          host: '192.168.1.100',
          username: 'admin',
          password: 'SecurePass123!'
        };

        expect(() => security.validateSSHCredentials(
          validCreds.host, validCreds.username, validCreds.password
        )).not.toThrow();
      });

      test('should detect SQL injection attempts in credentials', () => {
        const maliciousCredentials = [
          { username: "admin'; DROP TABLE users; --", password: 'test' },
          { username: 'admin', password: "' OR '1'='1" },
          { username: 'admin UNION SELECT * FROM passwords', password: 'test' }
        ];

        maliciousCredentials.forEach(cred => {
          expect(() => security.validateSSHCredentials(
            '192.168.1.1', cred.username, cred.password
          )).toThrow('Invalid characters in credentials');
        });
      });

      test('should handle credential length limits', () => {
        const longUsername = 'a'.repeat(65);
        const longPassword = 'b'.repeat(129);

        expect(() => security.validateSSHCredentials('192.168.1.1', longUsername, 'test'))
          .toThrow('Invalid username');
        expect(() => security.validateSSHCredentials('192.168.1.1', 'admin', longPassword))
          .toThrow('Invalid password');
      });
    });
  });

  describe('Rate Limiter Comprehensive Tests', () => {
    let rateLimiter;

    beforeEach(() => {
      rateLimiter = require('../../server/src/utils/rate-limiter');
      rateLimiter.clear();
    });

    test('should handle rapid successive requests', () => {
      const clientIP = '192.168.1.100';
      
      // Make rapid requests
      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.checkLimit(clientIP, 50, 60000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(50 - i - 1);
      }
    });

    test('should properly reset after time window', (done) => {
      const clientIP = '192.168.1.101';
      
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(clientIP, 5, 100); // 100ms window
      }
      
      // Should be blocked
      let result = rateLimiter.checkLimit(clientIP, 5, 100);
      expect(result.allowed).toBe(false);
      
      // Wait for window to reset
      setTimeout(() => {
        result = rateLimiter.checkLimit(clientIP, 5, 100);
        expect(result.allowed).toBe(true);
        done();
      }, 150);
    });

    test('should handle multiple clients independently', () => {
      const clients = ['client1', 'client2', 'client3'];
      
      clients.forEach(client => {
        // Each client should be able to make requests independently
        for (let i = 0; i < 30; i++) {
          const result = rateLimiter.checkLimit(client, 50, 60000);
          expect(result.allowed).toBe(true);
        }
      });
    });

    test('should clean up old client data', () => {
      const rateLimiter = require('../../server/src/utils/rate-limiter');
      
      // Add some old data
      rateLimiter.clients.set('old-client', {
        requests: [Date.now() - 3600000], // 1 hour ago
        blocked: false,
        blockExpiry: 0
      });
      
      // Trigger cleanup
      rateLimiter.cleanup();
      
      // Old client should be removed
      expect(rateLimiter.clients.has('old-client')).toBe(false);
    });

    test('should handle block/unblock operations', () => {
      const clientIP = '192.168.1.102';
      
      // Block client manually
      rateLimiter.blockClient(clientIP, 1000);
      
      let result = rateLimiter.checkLimit(clientIP, 50, 60000);
      expect(result.allowed).toBe(false);
      
      // Unblock client
      rateLimiter.unblockClient(clientIP);
      
      result = rateLimiter.checkLimit(clientIP, 50, 60000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Logger Comprehensive Tests', () => {
    let logger;

    beforeEach(() => {
      // Fresh logger instance
      delete require.cache[require.resolve('../../server/src/utils/logger')];
      logger = require('../../server/src/utils/logger');
    });

    test('should respect log levels', () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';
      
      delete require.cache[require.resolve('../../server/src/utils/logger')];
      const restrictiveLogger = require('../../server/src/utils/logger');
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      restrictiveLogger.debug('debug message');
      restrictiveLogger.info('info message');
      restrictiveLogger.warn('warn message');
      
      // Only warn should be logged
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('warn message'));
      
      consoleSpy.mockRestore();
      process.env.LOG_LEVEL = originalLevel;
    });

    test('should format messages consistently', () => {
      const message = 'test message';
      const metadata = { userId: 123, action: 'test' };
      
      const formatted = logger.formatMessage('info', message, metadata);
      
      expect(formatted).toMatch(/\[\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\]/);
      expect(formatted).toContain('INFO:');
      expect(formatted).toContain(message);
      expect(formatted).toContain(JSON.stringify(metadata));
    });

    test('should handle log rotation correctly', () => {
      // Mock large file size to trigger rotation
      fs.statSync.mockReturnValue({ size: 15 * 1024 * 1024 });
      
      logger.info('trigger rotation');
      
      expect(fs.renameSync).toHaveBeenCalled();
    });

    test('should handle security events specially', () => {
      const event = 'Unauthorized access attempt';
      const details = { ip: '192.168.1.50', timestamp: new Date().toISOString() };
      
      logger.security(event, details);
      
      // Should write to both security.log and app.log
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('security.log'),
        expect.stringContaining(event)
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app.log'),
        expect.stringContaining(event)
      );
    });

    test('should create log directory if missing', () => {
      fs.existsSync.mockReturnValue(false);
      
      delete require.cache[require.resolve('../../server/src/utils/logger')];
      require('../../server/src/utils/logger');
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });
  });

  describe('Utility Function Edge Cases', () => {
    test('should handle process environment edge cases', () => {
      const originalEnv = { ...process.env };
      
      // Test with minimal environment
      delete process.env.MCP_SERVER_PORT;
      delete process.env.ALLOWED_BUILD_PATHS;
      delete process.env.LOG_LEVEL;
      
      // Should use defaults
      delete require.cache[require.resolve('../../server/src/utils/security')];
      const security = require('../../server/src/utils/security');
      
      expect(() => security.validatePath('C:\\projects\\test.csproj')).not.toThrow();
      
      // Restore environment
      process.env = originalEnv;
    });

    test('should handle malformed environment variables', () => {
      const originalEnv = process.env.ALLOWED_IPS;
      
      // Set malformed IP list
      process.env.ALLOWED_IPS = '192.168.1.1,invalid-ip,::1,';
      
      // Should handle gracefully
      delete require.cache[require.resolve('../../server/src/server')];
      expect(() => require('../../server/src/server')).not.toThrow();
      
      process.env.ALLOWED_IPS = originalEnv;
    });
  });

  describe('Memory and Resource Management', () => {
    test('should clean up resources properly', () => {
      const rateLimiter = require('../../server/src/utils/rate-limiter');
      
      // Add test data
      for (let i = 0; i < 100; i++) {
        rateLimiter.checkLimit(`client-${i}`, 50, 60000);
      }
      
      expect(rateLimiter.clients.size).toBeGreaterThan(0);
      
      // Clear should remove all data
      rateLimiter.clear();
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle module reloading', () => {
      // Load module multiple times
      for (let i = 0; i < 5; i++) {
        delete require.cache[require.resolve('../../server/src/utils/logger')];
        const logger = require('../../server/src/utils/logger');
        expect(logger).toBeDefined();
      }
    });
  });
});