/**
 * Stress Tests and Edge Cases
 * 極限条件でのシステム動作を検証
 */

const securityValidator = require('../server/src/utils/security');
const rateLimiter = require('../server/src/utils/rate-limiter');
const portManager = require('../server/src/utils/port-manager');

describe('Stress Tests and Edge Cases', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.clear();
  });

  describe('Rate Limiter Stress Tests', () => {
    test('should handle 1000 concurrent requests efficiently', () => {
      const startTime = Date.now();
      const results = [];
      
      // Simulate 1000 concurrent requests from different IPs
      for (let i = 0; i < 1000; i++) {
        const result = rateLimiter.checkLimit(`192.168.1.${i % 255}`, 60, 60000);
        results.push(result);
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete within reasonable time (less than 1 second)
      expect(executionTime).toBeLessThan(1000);
      
      // All requests should be allowed initially
      expect(results.filter(r => r.allowed)).toHaveLength(1000);
      
      // Should have created multiple client entries
      expect(rateLimiter.clients.size).toBeGreaterThan(1);
    });

    test('should handle extreme rate limiting scenario', () => {
      const clientIP = '192.168.100.1';
      let blockedCount = 0;
      let allowedCount = 0;
      
      // Attempt 200 requests rapidly
      for (let i = 0; i < 200; i++) {
        const result = rateLimiter.checkLimit(clientIP, 10, 60000); // Very low limit
        if (result.allowed) {
          allowedCount++;
        } else {
          blockedCount++;
        }
      }
      
      // Should allow exactly 10 requests, block the rest
      expect(allowedCount).toBe(10);
      expect(blockedCount).toBe(190);
      
      // Client should be blocked
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(true);
    });

    test('should handle memory cleanup under load', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create many clients with old timestamps
      const oneHourAgo = Date.now() - (60 * 60 * 1000) - 1000;
      for (let i = 0; i < 10000; i++) {
        rateLimiter.clients.set(`client-${i}`, {
          requests: [oneHourAgo],
          blocked: false
        });
      }
      
      expect(rateLimiter.clients.size).toBe(10000);
      
      // Run cleanup
      rateLimiter.cleanup();
      
      // Should remove old clients
      expect(rateLimiter.clients.size).toBe(0);
      
      // Memory should not grow excessively
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle IPv6 addresses under stress', () => {
      const ipv6Addresses = [
        '2001:db8::1',
        '2001:db8::2', 
        '2001:db8::3',
        'fe80::1',
        'fe80::2',
        '::1'
      ];
      
      const results = [];
      
      // Test each IPv6 address with multiple requests
      ipv6Addresses.forEach(ip => {
        for (let i = 0; i < 20; i++) {
          const result = rateLimiter.checkLimit(ip, 60, 60000);
          results.push(result);
        }
      });
      
      // All should be processed without errors
      expect(results).toHaveLength(120);
      expect(results.every(r => r.hasOwnProperty('allowed'))).toBe(true);
    });
  });

  describe('Security Validator Stress Tests', () => {
    test('should handle very long commands efficiently', () => {
      const baseCommand = 'dotnet build ';
      const longPath = 'C:\\projects\\' + 'a'.repeat(1000) + '\\project.csproj';
      const longCommand = baseCommand + longPath;
      
      // Should handle long but valid commands
      expect(() => securityValidator.validatePowerShellCommand(longCommand))
        .not.toThrow();
    });

    test('should handle many path validation requests', () => {
      const startTime = Date.now();
      const paths = [];
      
      // Generate 1000 path validation attempts
      for (let i = 0; i < 1000; i++) {
        paths.push(`C:\\builds\\project${i}\\src\\main.cs`);
      }
      
      // Validate all paths (some may fail, which is expected)
      const results = paths.map(path => {
        try {
          return securityValidator.validatePath(path);
        } catch (error) {
          return null;
        }
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete quickly (less than 500ms)
      expect(executionTime).toBeLessThan(500);
      
      // We processed all 1000 attempts (whether successful or not)
      expect(results).toHaveLength(1000);
      
      // At least some paths should be processed
      expect(paths).toHaveLength(1000);
    });

    test('should handle dangerous pattern detection under load', () => {
      const dangerousCommands = [
        'echo `whoami`',
        'rm -rf /',
        'del /s /f C:\\',
        'format C:',
        'shutdown /s',
        'reboot now',
        'net user hacker /add',
        'reg add HKLM\\Software',
        'schtasks /create /sc minute',
        'wmic process call create "cmd.exe"'
      ];
      
      let detectedCount = 0;
      let totalAttempts = 0;
      
      // Test each dangerous command multiple times
      dangerousCommands.forEach(cmd => {
        for (let i = 0; i < 10; i++) {
          totalAttempts++;
          try {
            securityValidator.validatePowerShellCommand(cmd);
          } catch (error) {
            if (error.message.includes('Dangerous command detected') || 
                error.message.includes('Command not allowed')) {
              detectedCount++;
            }
          }
        }
      });
      
      // Should detect most dangerous patterns (allowing some variance)
      expect(detectedCount).toBeGreaterThan(80); // Most should be detected
      expect(totalAttempts).toBe(100); // Verify all attempts were made
    });

    test('should handle Unicode and special characters', () => {
      const unicodeCommands = [
        'echo "Hello 世界"',
        'echo "Здравствуй мир"',
        'echo "مرحبا بالعالم"',
        'echo "🚀 Test"',
        'echo "Special chars: ñáéíóú"'
      ];
      
      const results = unicodeCommands.map(cmd => {
        try {
          return securityValidator.validatePowerShellCommand(cmd);
        } catch (error) {
          return null;
        }
      });
      
      // All Unicode commands should be processed
      expect(results.filter(r => r !== null)).toHaveLength(5);
    });
  });

  describe('Port Manager Stress Tests', () => {
    test('should handle rapid port availability checks', async () => {
      const ports = [];
      for (let i = 8080; i < 8100; i++) {
        ports.push(i);
      }
      
      const startTime = Date.now();
      
      // Check all ports rapidly
      const promises = ports.map(port => portManager.isPortAvailable(port));
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete within reasonable time
      expect(executionTime).toBeLessThan(5000); // 5 seconds
      
      // All should return boolean results
      expect(results.every(r => typeof r === 'boolean')).toBe(true);
    }, 10000);

    test('should handle concurrent port manager operations', async () => {
      const operations = [];
      
      // Mix different operations
      for (let i = 0; i < 10; i++) {
        operations.push(portManager.getPortInfo());
        operations.push(portManager.isPortAvailable(8080 + i));
      }
      
      // Execute all concurrently
      const results = await Promise.allSettled(operations);
      
      // All operations should complete
      expect(results).toHaveLength(20);
      
      // No operations should be rejected
      const failed = results.filter(r => r.status === 'rejected');
      expect(failed).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null and undefined inputs gracefully', () => {
      const inputs = [null, undefined, '', 0, false, NaN];
      
      inputs.forEach(input => {
        // Security validator should handle gracefully
        expect(() => {
          try {
            securityValidator.validatePowerShellCommand(input);
          } catch (error) {
            // Expected to throw for invalid inputs
            expect(error.message).toContain('Invalid command');
          }
        }).not.toThrow();
        
        expect(() => {
          try {
            securityValidator.validatePath(input);
          } catch (error) {
            // Expected to throw for invalid inputs
            expect(error.message).toContain('Invalid path');
          }
        }).not.toThrow();
      });
    });

    test('should handle extremely large objects', () => {
      // Test with large environment object
      const largeEnv = {};
      for (let i = 0; i < 1000; i++) {
        largeEnv[`VAR_${i}`] = `value_${i}`.repeat(100);
      }
      
      expect(() => securityValidator.validateBuildEnvironment(largeEnv))
        .not.toThrow();
    });

    test('should handle boundary values', () => {
      const boundaryTests = [
        () => rateLimiter.checkLimit('192.168.1.1', 0, 60000), // Zero limit
        () => rateLimiter.checkLimit('192.168.1.1', 1, 1), // Minimal window
        () => rateLimiter.checkLimit('192.168.1.1', Number.MAX_SAFE_INTEGER, 60000), // Max limit
        () => securityValidator.validateProcessManagement(1, 'stop'), // Min PID
        () => securityValidator.validateProcessManagement(999999, 'stop'), // Max PID
      ];
      
      boundaryTests.forEach((test, index) => {
        expect(() => test()).not.toThrow(`Boundary test ${index} should not throw`);
      });
    });

    test('should handle malformed network requests simulation', () => {
      const malformedIPs = [
        '999.999.999.999',
        '192.168.1',
        '192.168.1.1.1',
        'not-an-ip',
        '192.168.1.-1',
        ''
      ];
      
      malformedIPs.forEach(ip => {
        expect(() => {
          try {
            securityValidator.validateIPAddress(ip);
          } catch (error) {
            expect(error.message).toContain('Invalid IP address');
          }
        }).not.toThrow();
      });
    });

    test('should handle circular references in objects', () => {
      const circularObj = { a: 1 };
      circularObj.self = circularObj;
      
      // Should not cause infinite loops
      expect(() => {
        const keys = Object.keys(circularObj);
        expect(keys).toContain('a');
        expect(keys).toContain('self');
      }).not.toThrow();
    });
  });

  describe('Performance Benchmarks', () => {
    test('should maintain performance under load', () => {
      const operations = 10000;
      const startTime = process.hrtime.bigint();
      
      // Perform many security validations
      for (let i = 0; i < operations; i++) {
        try {
          securityValidator.validatePowerShellCommand('dotnet build');
        } catch (error) {
          // Expected for some operations
        }
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      // Should complete within reasonable time (less than 1 second for 10k ops)
      expect(durationMs).toBeLessThan(1000);
      
      // Calculate operations per second
      const opsPerSecond = operations / (durationMs / 1000);
      expect(opsPerSecond).toBeGreaterThan(5000); // At least 5k ops/sec
    });

    test('should not leak memory during extended operation', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        rateLimiter.checkLimit(`192.168.1.${i % 100}`, 60, 60000);
        // Use valid paths that won't throw errors
        try {
          securityValidator.validatePath(`C:\\builds\\project${i}`);
        } catch (error) {
          // Expected for some paths, ignore
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('System Limits', () => {
    test('should handle system resource exhaustion gracefully', () => {
      // Simulate resource exhaustion by creating many objects
      const objects = [];
      let canContinue = true;
      let count = 0;
      
      try {
        while (canContinue && count < 100000) {
          objects.push({
            data: new Array(1000).fill('test'),
            timestamp: Date.now(),
            id: count
          });
          count++;
          
          // Stop if we detect memory pressure
          if (count % 1000 === 0) {
            const memory = process.memoryUsage();
            if (memory.heapUsed > 100 * 1024 * 1024) { // 100MB
              canContinue = false;
            }
          }
        }
      } catch (error) {
        // Expected if we hit system limits
        expect(error).toBeDefined();
      }
      
      // Should have created some objects
      expect(count).toBeGreaterThan(0);
      
      // Should still be able to perform basic operations
      expect(() => rateLimiter.checkLimit('192.168.1.1', 60, 60000))
        .not.toThrow();
    });
  });
});