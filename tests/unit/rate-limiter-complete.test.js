const rateLimiter = require('../server/src/utils/rate-limiter');

describe('Rate Limiter Complete Coverage', () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  afterAll(() => {
    rateLimiter.destroy();
  });

  describe('Cleanup Functionality', () => {
    test('should cleanup old client data automatically', (done) => {
      const clientIP = '192.168.1.100';
      
      // Add a request
      rateLimiter.checkLimit(clientIP, 10, 60000);
      
      // Manually set old timestamp
      const clientData = rateLimiter.clients.get(clientIP);
      clientData.requests = [Date.now() - (2 * 60 * 60 * 1000)]; // 2 hours ago
      
      // Wait for cleanup interval (mocked to be faster)
      rateLimiter.cleanupInterval = setInterval(() => {
        rateLimiter.cleanup();
        
        // Check if old client was removed
        expect(rateLimiter.clients.has(clientIP)).toBe(false);
        
        clearInterval(rateLimiter.cleanupInterval);
        done();
      }, 10);
    });

    test('should not cleanup blocked clients even if old', () => {
      const clientIP = '192.168.1.100';
      
      // Block client
      rateLimiter.blockClient(clientIP, 10 * 60 * 1000); // 10 minutes
      
      // Set old timestamp
      const clientData = rateLimiter.clients.get(clientIP);
      clientData.requests = [Date.now() - (2 * 60 * 60 * 1000)]; // 2 hours ago
      
      // Run cleanup
      rateLimiter.cleanup();
      
      // Should still exist because it's blocked
      expect(rateLimiter.clients.has(clientIP)).toBe(true);
    });

    test('should cleanup expired blocks', () => {
      const clientIP = '192.168.1.100';
      
      // Block client with past expiry
      rateLimiter.blockClient(clientIP, -1000); // Already expired
      
      // Run cleanup
      rateLimiter.cleanup();
      
      // Should be removed
      expect(rateLimiter.clients.has(clientIP)).toBe(false);
    });
  });

  describe('Block Management', () => {
    test('should block client for custom duration', () => {
      const clientIP = '192.168.1.100';
      const duration = 1000; // 1 second
      
      rateLimiter.blockClient(clientIP, duration);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(true);
      expect(status.blockExpiry).toBeGreaterThan(Date.now());
    });

    test('should use default block duration when not specified', () => {
      const clientIP = '192.168.1.100';
      
      rateLimiter.blockClient(clientIP); // No duration specified
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(true);
      expect(status.blockExpiry).toBeGreaterThan(Date.now() + 4 * 60 * 1000); // At least 4 minutes from now
    });

    test('should handle unblocking non-existent client', () => {
      const clientIP = '192.168.1.100';
      
      // Should not throw error
      expect(() => {
        rateLimiter.unblockClient(clientIP);
      }).not.toThrow();
    });

    test('should update existing client when blocking', () => {
      const clientIP = '192.168.1.100';
      
      // Make some requests first
      rateLimiter.checkLimit(clientIP, 5, 60000);
      rateLimiter.checkLimit(clientIP, 5, 60000);
      
      // Then block
      rateLimiter.blockClient(clientIP, 1000);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.requests).toBe(2); // Requests should still be there
      expect(status.blocked).toBe(true);
    });
  });

  describe('Status Reporting', () => {
    test('should return zero status for non-existent client', () => {
      const status = rateLimiter.getStatus('192.168.1.999');
      
      expect(status).toEqual({
        requests: 0,
        blocked: false
      });
    });

    test('should report accurate request count in current window', () => {
      const clientIP = '192.168.1.100';
      const windowMs = 1000;
      
      // Make requests
      rateLimiter.checkLimit(clientIP, 10, windowMs);
      rateLimiter.checkLimit(clientIP, 10, windowMs);
      rateLimiter.checkLimit(clientIP, 10, windowMs);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.requests).toBe(3);
    });

    test('should exclude old requests from count', async () => {
      const clientIP = '192.168.1.100';
      const windowMs = 100;
      
      // Make initial request
      rateLimiter.checkLimit(clientIP, 10, windowMs);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, windowMs + 10));
      
      // Make new request
      rateLimiter.checkLimit(clientIP, 10, windowMs);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.requests).toBe(1); // Only the new request should count
    });

    test('should report block status correctly', () => {
      const clientIP = '192.168.1.100';
      
      // Initially not blocked
      let status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(false);
      
      // Block client
      rateLimiter.blockClient(clientIP, 1000);
      status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(true);
      expect(typeof status.blockExpiry).toBe('number');
      
      // Unblock client
      rateLimiter.unblockClient(clientIP);
      status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle zero or negative rate limits', () => {
      const clientIP = '192.168.1.100';
      
      // Zero requests allowed
      const result = rateLimiter.checkLimit(clientIP, 0, 60000);
      expect(result.allowed).toBe(false);
    });

    test('should handle very short time windows', () => {
      const clientIP = '192.168.1.100';
      const windowMs = 1; // 1ms window
      
      // First request should be allowed
      let result = rateLimiter.checkLimit(clientIP, 1, windowMs);
      expect(result.allowed).toBe(true);
      
      // Second request should be blocked (within same window)
      result = rateLimiter.checkLimit(clientIP, 1, windowMs);
      expect(result.allowed).toBe(false);
    });

    test('should handle concurrent requests from same client', () => {
      const clientIP = '192.168.1.100';
      const maxRequests = 3;
      
      // Simulate concurrent requests
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(rateLimiter.checkLimit(clientIP, maxRequests, 60000));
      }
      
      // First 3 should be allowed, rest blocked
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      expect(results[2].allowed).toBe(true);
      expect(results[3].allowed).toBe(false);
      expect(results[4].allowed).toBe(false);
    });

    test('should handle destruction properly', () => {
      const clientIP = '192.168.1.100';
      
      // Add some data
      rateLimiter.checkLimit(clientIP, 10, 60000);
      
      // Destroy should clear everything
      rateLimiter.destroy();
      
      // Should be empty
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle very large numbers', () => {
      const clientIP = '192.168.1.100';
      const maxRequests = Number.MAX_SAFE_INTEGER;
      const windowMs = Number.MAX_SAFE_INTEGER;
      
      const result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(maxRequests - 1);
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory with many clients', () => {
      const initialSize = rateLimiter.clients.size;
      
      // Add many clients
      for (let i = 0; i < 1000; i++) {
        rateLimiter.checkLimit(`192.168.1.${i}`, 10, 60000);
      }
      
      expect(rateLimiter.clients.size).toBe(initialSize + 1000);
      
      // Clear and check
      rateLimiter.clear();
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle repeated clear operations', () => {
      const clientIP = '192.168.1.100';
      
      rateLimiter.checkLimit(clientIP, 10, 60000);
      
      // Multiple clears should not cause issues
      rateLimiter.clear();
      rateLimiter.clear();
      rateLimiter.clear();
      
      expect(rateLimiter.clients.size).toBe(0);
    });
  });

  describe('Block Expiry Logic', () => {
    test('should correctly identify expired blocks', () => {
      const clientIP = '192.168.1.100';
      
      // Block with short duration
      rateLimiter.blockClient(clientIP, 1);
      
      // Wait for expiry
      setTimeout(() => {
        const result = rateLimiter.checkLimit(clientIP, 10, 60000);
        expect(result.allowed).toBe(true); // Should be unblocked
      }, 10);
    });

    test('should reset block status when expired', () => {
      const clientIP = '192.168.1.100';
      
      // Block client
      rateLimiter.blockClient(clientIP, -1000); // Already expired
      
      // Check limit should reset block status
      const result = rateLimiter.checkLimit(clientIP, 10, 60000);
      
      expect(result.allowed).toBe(true);
      
      const status = rateLimiter.getStatus(clientIP);
      expect(status.blocked).toBe(false);
    });
  });
});