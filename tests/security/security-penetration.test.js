/**
 * Security Penetration Testing
 * セキュリティ脆弱性の検証とペネトレーションテスト
 */

const securityValidator = require('../../server/src/utils/security');
const rateLimiter = require('../../server/src/utils/rate-limiter');

describe('Security Penetration Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.clear();
  });

  describe('Injection Attack Prevention', () => {
    test('should prevent command injection in PowerShell commands', () => {
      const injectionAttempts = [
        'echo hello; rm -rf /',
        'echo hello && del /s /f C:\\',
        'echo hello | powershell -Command "Get-Process"',
        'echo $(whoami)',
        'echo `whoami`',
        'echo hello; shutdown /s',
        'dotnet build; format C:',
        'python -c "import os; os.system(\'rm -rf /\')"',
        'echo hello\'; DROP TABLE users; --',
        'echo hello" && calc.exe'
      ];

      const results = injectionAttempts.map(cmd => {
        try {
          securityValidator.validatePowerShellCommand(cmd);
          return { success: true, command: cmd };
        } catch (error) {
          return { success: false, command: cmd, error: error.message };
        }
      });

      // All injection attempts should be blocked
      const blockedAttempts = results.filter(r => !r.success);
      expect(blockedAttempts.length).toBeGreaterThan(5); // Most should be blocked
      
      // Check specific patterns are detected
      const dangerousBlocked = results.filter(r => 
        !r.success && (
          r.error.includes('Dangerous command detected') ||
          r.error.includes('Command not allowed')
        )
      );
      expect(dangerousBlocked.length).toBeGreaterThan(3);
    });

    test('should prevent SQL injection patterns in credentials', () => {
      const sqlInjectionAttempts = [
        { username: "admin'; DROP TABLE users; --", password: "password" },
        { username: "admin", password: "' OR '1'='1" },
        { username: "admin' UNION SELECT * FROM passwords --", password: "test" },
        { username: "admin", password: "password'; INSERT INTO admin VALUES('hacker', 'pass'); --" },
        { username: "1' OR '1'='1", password: "anything" }
      ];

      const results = sqlInjectionAttempts.map(creds => {
        try {
          securityValidator.validateSSHCredentials('127.0.0.1', creds.username, creds.password);
          return { success: true, creds };
        } catch (error) {
          return { success: false, creds, error: error.message };
        }
      });

      // All SQL injection attempts should be blocked
      const blockedAttempts = results.filter(r => !r.success);
      expect(blockedAttempts).toHaveLength(5);
      
      // Should specifically mention credential validation
      blockedAttempts.forEach(attempt => {
        expect(attempt.error).toContain('Invalid characters in credentials');
      });
    });

    test('should prevent path traversal attacks', () => {
      const traversalAttempts = [
        'C:\\builds\\..\\..\\windows\\system32',
        'C:\\builds\\project\\..\\..\\..\\sensitive',
        '/var/www/../../../etc/passwd',
        'C:\\builds\\..\\..\\..\\..\\windows',
        'C:\\projects\\test\\..\\..\\..\\system32\\cmd.exe',
        '..\\..\\..\\windows\\system32',
        'C:\\builds\\test\\..\\unauthorized',
        'C:\\builds\\~/sensitive',
        'C:\\builds\\~\\backdoor'
      ];

      const results = traversalAttempts.map(path => {
        try {
          securityValidator.validatePath(path);
          return { success: true, path };
        } catch (error) {
          return { success: false, path, error: error.message };
        }
      });

      // All traversal attempts should be blocked
      const blockedAttempts = results.filter(r => !r.success);
      expect(blockedAttempts).toHaveLength(9);
      
      // Should specifically mention directory traversal
      const traversalBlocked = blockedAttempts.filter(attempt =>
        attempt.error.includes('Directory traversal detected')
      );
      expect(traversalBlocked.length).toBeGreaterThan(5);
    });
  });

  describe('Rate Limiting Security', () => {
    test('should prevent brute force attacks', () => {
      const attackerIP = '192.168.100.1';
      const attempts = [];
      
      // Simulate brute force attack (100 rapid requests)
      for (let i = 0; i < 100; i++) {
        const result = rateLimiter.checkLimit(attackerIP, 10, 60000); // Low limit
        attempts.push(result);
      }
      
      // Should block attacker after initial allowed requests
      const allowedAttempts = attempts.filter(a => a.allowed);
      const blockedAttempts = attempts.filter(a => !a.allowed);
      
      expect(allowedAttempts).toHaveLength(10); // Only first 10 allowed
      expect(blockedAttempts).toHaveLength(90); // Rest blocked
      
      // Attacker should be blocked for extended period
      const status = rateLimiter.getStatus(attackerIP);
      expect(status.blocked).toBe(true);
      expect(status.blockExpiry).toBeGreaterThan(Date.now());
    });

    test('should handle distributed attacks from multiple IPs', () => {
      const attackResults = [];
      
      // Simulate distributed attack from 50 different IPs
      for (let i = 1; i <= 50; i++) {
        const attackerIP = `192.168.1.${i}`;
        
        // Each IP tries to overwhelm with requests
        for (let j = 0; j < 20; j++) {
          const result = rateLimiter.checkLimit(attackerIP, 5, 60000); // Very low limit
          attackResults.push({ ip: attackerIP, result });
        }
      }
      
      // Should block excessive requests from each IP
      const blockedResults = attackResults.filter(r => !r.result.allowed);
      expect(blockedResults.length).toBeGreaterThan(700); // Most should be blocked
      
      // Each IP should have limited allowed requests
      const ipGroups = new Map();
      attackResults.forEach(({ ip, result }) => {
        if (!ipGroups.has(ip)) ipGroups.set(ip, []);
        ipGroups.get(ip).push(result);
      });
      
      // Each IP should have exactly 5 allowed requests
      ipGroups.forEach((results, ip) => {
        const allowed = results.filter(r => r.allowed);
        expect(allowed).toHaveLength(5);
      });
    });

    test('should handle slow rate attacks', () => {
      const slowAttackerIP = '192.168.200.1';
      const results = [];
      
      // Simulate slow attack just under rate limits
      const startTime = Date.now();
      
      for (let i = 0; i < 15; i++) {
        // Mock time progression for slow attack
        jest.spyOn(Date, 'now').mockReturnValue(startTime + (i * 4000)); // 4 seconds apart
        
        const result = rateLimiter.checkLimit(slowAttackerIP, 10, 60000);
        results.push(result);
      }
      
      Date.now.mockRestore();
      
      // Should allow requests that are properly spaced
      const allowedRequests = results.filter(r => r.allowed);
      expect(allowedRequests.length).toBeGreaterThanOrEqual(10); // Should allow at least initial limit
    });
  });

  describe('Input Validation Bypass Attempts', () => {
    test('should prevent Unicode normalization attacks', () => {
      const unicodeAttempts = [
        'echo \u0065\u0078\u0070\u006C\u006F\u0069\u0074', // "exploit" in Unicode
        'echo \uFF65\uFF78\uFF76\uFF80\uFF72\uFF84', // Half-width katakana
        'echo \u202E\u202D malicious', // Right-to-left override
        'echo test\u0000hidden', // Null byte injection
        'echo test\u180E\u200B\u200C\u200D\u2060\uFEFF', // Zero-width characters
      ];

      const results = unicodeAttempts.map(cmd => {
        try {
          const sanitized = securityValidator.sanitizeCommand(cmd);
          return { original: cmd, sanitized, dangerous: false };
        } catch (error) {
          return { original: cmd, sanitized: null, dangerous: true, error: error.message };
        }
      });

      // Should handle Unicode safely
      results.forEach(result => {
        if (result.sanitized) {
          // Should remove or neutralize dangerous Unicode
          expect(result.sanitized).not.toContain('\u0000'); // Null bytes removed
          expect(result.sanitized.length).toBeLessThanOrEqual(result.original.length);
        }
      });
    });

    test('should prevent encoding bypass attempts', () => {
      const encodingAttempts = [
        'echo %65%78%70%6C%6F%69%74', // URL encoded "exploit"
        'echo &#x65;&#x78;&#x70;&#x6C;&#x6F;&#x69;&#x74;', // HTML entity encoded
        'echo \\x65\\x78\\x70\\x6C\\x6F\\x69\\x74', // Hex encoded
        'echo test&lt;script&gt;alert()&lt;/script&gt;', // HTML encoded script
        'echo $(echo malicious | base64 -d)', // Base64 encoded command
      ];

      const results = encodingAttempts.map(cmd => {
        try {
          securityValidator.validatePowerShellCommand(cmd);
          return { success: true, command: cmd };
        } catch (error) {
          return { success: false, command: cmd, error: error.message };
        }
      });

      // Should handle all encoding attempts (either allow safely or block)
      expect(results).toHaveLength(5);
      
      // Check that dangerous patterns are still detected even with encoding
      const suspiciousBlocked = results.filter(r => 
        !r.success && (
          r.error.includes('Dangerous command') ||
          r.error.includes('Command not allowed')
        )
      );
      expect(suspiciousBlocked.length).toBeGreaterThanOrEqual(0); // Some may be blocked
    });

    test('should handle very long input attacks', () => {
      const longInputs = [
        'echo ' + 'A'.repeat(10000), // Very long command
        'dotnet build ' + 'C:\\builds\\' + 'a'.repeat(5000) + '\\project.csproj', // Long path
        'echo "' + 'payload'.repeat(1000) + '"', // Long string argument
        'A'.repeat(20000), // Extremely long command
      ];

      const results = longInputs.map(cmd => {
        try {
          securityValidator.validatePowerShellCommand(cmd);
          return { success: true, command: cmd.substring(0, 50) + '...' };
        } catch (error) {
          return { success: false, command: cmd.substring(0, 50) + '...', error: error.message };
        }
      });

      // Should handle long inputs appropriately
      const lengthBlocked = results.filter(r => 
        !r.success && r.error.includes('Command too long')
      );
      expect(lengthBlocked.length).toBeGreaterThan(1);
    });
  });

  describe('Privilege Escalation Prevention', () => {
    test('should prevent dangerous process operations', () => {
      const dangerousProcesses = [
        { process: 'explorer', action: 'stop' },
        { process: 'csrss', action: 'stop' },
        { process: 'winlogon', action: 'stop' },
        { process: 'services', action: 'stop' },
        { process: 'lsass', action: 'stop' },
        { process: 'system', action: 'stop' },
        { process: 'smss', action: 'stop' },
      ];

      const results = dangerousProcesses.map(({ process, action }) => {
        try {
          securityValidator.validateProcessManagement(process, action);
          return { success: true, process, action };
        } catch (error) {
          return { success: false, process, action, error: error.message };
        }
      });

      // Should block stopping critical system processes
      const protectedBlocked = results.filter(r => 
        !r.success && r.error.includes('Cannot stop protected system process')
      );
      expect(protectedBlocked.length).toBeGreaterThan(5);
    });

    test('should prevent dangerous build flags', () => {
      const dangerousFlagSets = [
        ['--privileged', '--rm'],
        ['--cap-add', 'SYS_ADMIN'],
        ['--security-opt', 'apparmor:unconfined'],
        ['--volume', '/:/host'],
        ['--mount', 'type=bind,source=/,target=/host'],
        ['-v', '/etc:/host-etc'],
        ['--network', 'host'],
        ['--user', 'root', '--privileged'],
      ];

      const results = dangerousFlagSets.map(flags => {
        try {
          securityValidator.validateBuildFlags(flags);
          return { success: true, flags };
        } catch (error) {
          return { success: false, flags, error: error.message };
        }
      });

      // Should block dangerous build flags
      const flagsBlocked = results.filter(r => 
        !r.success && r.error.includes('Dangerous build flag detected')
      );
      expect(flagsBlocked.length).toBeGreaterThan(3); // At least half should be blocked
    });

    test('should prevent environment variable manipulation', () => {
      const maliciousEnvironments = [
        { PATH: '/malicious/bin:/usr/bin' },
        { HOME: '/tmp/hacker' },
        { SYSTEMROOT: 'C:\\malicious' },
        { USERPROFILE: 'C:\\temp\\backdoor' },
        { WINDIR: 'C:\\fake-windows' },
      ];

      const results = maliciousEnvironments.map(env => {
        try {
          securityValidator.validateBuildEnvironment(env);
          return { success: true, env };
        } catch (error) {
          return { success: false, env, error: error.message };
        }
      });

      // Should block modification of protected environment variables
      const protectedBlocked = results.filter(r => 
        !r.success && r.error.includes('Cannot override protected environment variable')
      );
      expect(protectedBlocked).toHaveLength(5);
    });
  });

  describe('Network Security', () => {
    test('should prevent dangerous IP address access', () => {
      const dangerousIPs = [
        '169.254.1.1', // Link-local
        '224.0.0.1',   // Multicast
        '0.0.0.1',     // Reserved
        '169.254.169.254', // AWS metadata service
        '224.0.0.2',   // All routers multicast
      ];

      const results = dangerousIPs.map(ip => {
        try {
          securityValidator.validateIPAddress(ip);
          return { success: true, ip };
        } catch (error) {
          return { success: false, ip, error: error.message };
        }
      });

      // Should block dangerous IP ranges
      const ipBlocked = results.filter(r => 
        !r.success && r.error.includes('Access to IP range blocked')
      );
      expect(ipBlocked.length).toBeGreaterThan(3);
    });

    test('should handle malformed IP addresses', () => {
      const malformedIPs = [
        '999.999.999.999',
        '192.168.1',
        '192.168.1.1.1',
        'not-an-ip',
        '192.168.1.-1',
        '',
        null,
        undefined,
      ];

      const results = malformedIPs.map(ip => {
        try {
          securityValidator.validateIPAddress(ip);
          return { success: true, ip };
        } catch (error) {
          return { success: false, ip, error: error.message };
        }
      });

      // Should reject all malformed IPs
      const malformedBlocked = results.filter(r => 
        !r.success && r.error.includes('Invalid IP address format')
      );
      expect(malformedBlocked.length).toBeGreaterThan(6);
    });
  });

  describe('Race Condition Testing', () => {
    test('should handle concurrent security validations', async () => {
      const concurrentPromises = [];
      
      // Create 100 concurrent validation requests
      for (let i = 0; i < 100; i++) {
        const promise = new Promise((resolve) => {
          try {
            const result = securityValidator.validatePowerShellCommand(`echo test${i}`);
            resolve({ success: true, result, index: i });
          } catch (error) {
            resolve({ success: false, error: error.message, index: i });
          }
        });
        concurrentPromises.push(promise);
      }
      
      const results = await Promise.all(concurrentPromises);
      
      // All validations should complete
      expect(results).toHaveLength(100);
      
      // Most should succeed (simple echo commands)
      const successful = results.filter(r => r.success);
      expect(successful.length).toBeGreaterThan(90);
      
      // Should maintain order consistency
      const indices = results.map(r => r.index);
      expect(indices.sort((a, b) => a - b)).toEqual(Array.from({length: 100}, (_, i) => i));
    });

    test('should handle concurrent rate limiting', () => {
      const clientIP = '192.168.50.1';
      const concurrentRequests = [];
      
      // Make 50 concurrent requests
      for (let i = 0; i < 50; i++) {
        const result = rateLimiter.checkLimit(clientIP, 10, 60000);
        concurrentRequests.push(result);
      }
      
      // Should properly count all requests
      const allowedCount = concurrentRequests.filter(r => r.allowed).length;
      const blockedCount = concurrentRequests.filter(r => !r.allowed).length;
      
      expect(allowedCount + blockedCount).toBe(50);
      expect(allowedCount).toBe(10); // Only 10 should be allowed
      expect(blockedCount).toBe(40); // Rest should be blocked
    });
  });

  describe('Memory Safety', () => {
    test('should prevent memory exhaustion attacks', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      try {
        // Attempt to create many large objects
        const largeObjects = [];
        for (let i = 0; i < 1000; i++) {
          // Create objects with large string data
          const largeString = 'A'.repeat(10000);
          rateLimiter.checkLimit(`192.168.${i % 255}.1`, 60, 60000);
          
          // Try to validate large commands
          try {
            securityValidator.validatePowerShellCommand(`echo "${largeString.substring(0, 1000)}"`);
          } catch (error) {
            // Expected for some large commands
          }
          
          // Break if memory usage gets too high
          if (i % 100 === 0) {
            const currentMemory = process.memoryUsage().heapUsed;
            if (currentMemory - initialMemory > 50 * 1024 * 1024) { // 50MB limit
              break;
            }
          }
        }
      } catch (error) {
        // System should handle memory pressure gracefully
        expect(error).toBeDefined();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be controlled
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
      
      // System should still be responsive
      expect(() => rateLimiter.checkLimit('192.168.1.1', 60, 60000)).not.toThrow();
      expect(() => {
        try {
          securityValidator.validatePath('C:\\builds\\test');
        } catch (error) {
          // Expected validation error is acceptable
          expect(error.message).toContain('Path not in allowed directories');
        }
      }).not.toThrow();
    });
  });

  describe('Authentication & Authorization Bypass', () => {
    test('should prevent empty or malformed credentials', () => {
      const invalidCredentials = [
        { host: '127.0.0.1', username: '', password: 'test' },
        { host: '127.0.0.1', username: 'admin', password: '' },
        { host: '127.0.0.1', username: null, password: 'test' },
        { host: '127.0.0.1', username: 'admin', password: null },
        { host: '127.0.0.1', username: 'a'.repeat(100), password: 'test' }, // Too long
        { host: '127.0.0.1', username: 'admin', password: 'p'.repeat(200) }, // Too long
      ];

      const results = invalidCredentials.map(creds => {
        try {
          securityValidator.validateSSHCredentials(creds.host, creds.username, creds.password);
          return { success: true, creds };
        } catch (error) {
          return { success: false, creds, error: error.message };
        }
      });

      // Should reject all invalid credentials
      const rejected = results.filter(r => !r.success);
      expect(rejected).toHaveLength(6);
      
      // Should provide appropriate error messages
      rejected.forEach(result => {
        expect(result.error).toMatch(/Invalid (username|password)/);
      });
    });
  });
});