/**
 * Rate Limiter - Fixed Coverage Test Suite  
 * Tests based on actual implementation in rate-limiter.js
 */

describe('Rate Limiter - Fixed Coverage', () => {
  let rateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache to get fresh instance
    delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
    
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
    
    // Get fresh instance
    rateLimiter = require('../server/src/utils/rate-limiter');
    
    // Clear any existing client data
    rateLimiter.clear();
  });

  afterEach(() => {
    Date.now.mockRestore();
    if (rateLimiter.cleanupInterval) {
      clearInterval(rateLimiter.cleanupInterval);
    }
    rateLimiter.clear();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with clients Map', () => {
      expect(rateLimiter.clients).toBeInstanceOf(Map);
    });

    test('should setup cleanup interval', () => {
      expect(rateLimiter.cleanupInterval).toBeDefined();
    });
  });

  describe('checkLimit Method', () => {
    test('should allow requests within rate limit', () => {
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    test('should track multiple requests from same client', () => {
      // Make 3 requests
      rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(57); // 60 - 3 = 57
    });

    test('should block requests when rate limit exceeded', () => {
      // Make 60 requests (at limit)
      for (let i = 0; i < 60; i++) {
        rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      }

      // 61st request should be blocked
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.retryAfter).toBe(300); // 5 minutes
    });

    test('should handle blocked client on subsequent requests', () => {
      // First exceed the limit
      for (let i = 0; i < 61; i++) {
        rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      }

      // Try another request immediately
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Rate limit exceeded. Client is temporarily blocked.');
    });

    test('should unblock client after block period expires', () => {
      // Exceed rate limit
      for (let i = 0; i < 61; i++) {
        rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      }

      // Advance time past block expiry (5 minutes + 1 second)
      Date.now.mockReturnValue(1000000 + (5 * 60 * 1000) + 1000);

      // Try another request
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      expect(result.allowed).toBe(true);
    });

    test('should filter out old requests from time window', () => {
      // Make some requests
      rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      // Advance time by 61 seconds (past window)
      Date.now.mockReturnValue(1000000 + 61000);

      // Make another request
      const result = rateLimiter.checkLimit('192.168.1.1', 60, 60000);

      // Should only count the new request
      expect(result.remaining).toBe(59);
    });

    test('should handle different clients independently', () => {
      // Client 1 makes requests
      for (let i = 0; i < 50; i++) {
        rateLimiter.checkLimit('192.168.1.1', 60, 60000);
      }

      // Client 2 should start fresh
      const result = rateLimiter.checkLimit('192.168.1.2', 60, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    test('should use default parameters when not specified', () => {
      const result = rateLimiter.checkLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // Default 60 - 1
    });
  });

  describe('cleanup Method', () => {
    test('should remove clients with no recent activity', () => {
      // Add some test clients with old requests
      rateLimiter.clients.set('old-client', {
        requests: [1000000 - 3600001], // 1 hour and 1ms ago
        blocked: false
      });
      rateLimiter.clients.set('recent-client', {
        requests: [1000000 - 30000], // 30 seconds ago
        blocked: false
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('old-client')).toBe(false);
      expect(rateLimiter.clients.has('recent-client')).toBe(true);
    });

    test('should keep blocked clients even if old', () => {
      rateLimiter.clients.set('blocked-client', {
        requests: [1000000 - 3600001], // 1 hour and 1ms ago
        blocked: true,
        blockExpiry: 1000000 + 1000000 // Far in future
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('blocked-client')).toBe(true);
    });

    test('should remove clients with empty requests array', () => {
      rateLimiter.clients.set('empty-client', {
        requests: [],
        blocked: false
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('empty-client')).toBe(false);
    });

    test('should remove clients with no requests property', () => {
      rateLimiter.clients.set('no-requests-client', {
        blocked: false
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('no-requests-client')).toBe(false);
    });

    test('should remove expired blocks', () => {
      rateLimiter.clients.set('expired-block', {
        requests: [],
        blocked: true,
        blockExpiry: 1000000 - 1000 // 1 second ago
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('expired-block')).toBe(false);
    });
  });

  describe('getStatus Method', () => {
    test('should return default status for unknown client', () => {
      const status = rateLimiter.getStatus('unknown-client');
      
      expect(status).toEqual({
        requests: 0,
        blocked: false
      });
    });

    test('should return current status for known client', () => {
      rateLimiter.clients.set('test-client', {
        requests: [1000000 - 30000, 1000000 - 10000, 1000000], // 3 recent requests
        blocked: false
      });

      const status = rateLimiter.getStatus('test-client');
      
      expect(status.requests).toBe(3);
      expect(status.blocked).toBe(false);
    });

    test('should filter out old requests when calculating status', () => {
      rateLimiter.clients.set('test-client', {
        requests: [
          1000000 - 70000, // 70 seconds ago (outside window)
          1000000 - 30000, // 30 seconds ago (inside window)
          1000000 - 10000  // 10 seconds ago (inside window)
        ],
        blocked: false
      });

      const status = rateLimiter.getStatus('test-client');
      
      expect(status.requests).toBe(2); // Only 2 requests in window
    });

    test('should return blocked status for blocked client', () => {
      rateLimiter.clients.set('blocked-client', {
        requests: [],
        blocked: true,
        blockExpiry: 1000000 + 3600000 // 1 hour from now
      });

      const status = rateLimiter.getStatus('blocked-client');
      
      expect(status.blocked).toBe(true);
      expect(status.blockExpiry).toBe(1000000 + 3600000);
    });

    test('should return unblocked status for expired block', () => {
      rateLimiter.clients.set('expired-block-client', {
        requests: [],
        blocked: true,
        blockExpiry: 1000000 - 1000 // 1 second ago
      });

      const status = rateLimiter.getStatus('expired-block-client');
      
      expect(status.blocked).toBe(false);
    });
  });

  describe('blockClient Method', () => {
    test('should block a client manually', () => {
      rateLimiter.blockClient('192.168.1.1', 60000); // 1 minute

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.blocked).toBe(true);
      expect(clientData.blockExpiry).toBe(1000000 + 60000);
    });

    test('should use default duration when not specified', () => {
      rateLimiter.blockClient('192.168.1.1');

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.blocked).toBe(true);
      expect(clientData.blockExpiry).toBe(1000000 + (5 * 60 * 1000)); // 5 minutes
    });

    test('should create new client data if not exists', () => {
      rateLimiter.blockClient('new-client', 30000);

      expect(rateLimiter.clients.has('new-client')).toBe(true);
      const clientData = rateLimiter.clients.get('new-client');
      expect(clientData.blocked).toBe(true);
      expect(clientData.requests).toEqual([]);
    });
  });

  describe('unblockClient Method', () => {
    test('should unblock a blocked client', () => {
      // First block the client
      rateLimiter.blockClient('192.168.1.1', 60000);
      
      // Then unblock
      rateLimiter.unblockClient('192.168.1.1');

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.blocked).toBe(false);
      expect(clientData.blockExpiry).toBe(0);
    });

    test('should handle unblocking non-existent client', () => {
      expect(() => rateLimiter.unblockClient('non-existent')).not.toThrow();
    });
  });

  describe('clear Method', () => {
    test('should clear all clients', () => {
      rateLimiter.clients.set('client1', { requests: [1000000] });
      rateLimiter.clients.set('client2', { requests: [1000000] });
      
      expect(rateLimiter.clients.size).toBe(2);
      
      rateLimiter.clear();
      
      expect(rateLimiter.clients.size).toBe(0);
    });
  });

  describe('destroy Method', () => {
    test('should clear cleanup interval and clients', () => {
      jest.spyOn(global, 'clearInterval');
      
      // Add some test data
      rateLimiter.clients.set('test', { requests: [1000000] });
      
      rateLimiter.destroy();
      
      expect(clearInterval).toHaveBeenCalledWith(rateLimiter.cleanupInterval);
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle missing cleanup interval', () => {
      rateLimiter.cleanupInterval = null;
      
      expect(() => rateLimiter.destroy()).not.toThrow();
    });
  });

  describe('Edge Cases and Integration', () => {
    test('should handle concurrent requests from same client', () => {
      // Simulate concurrent requests
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(rateLimiter.checkLimit('192.168.1.1', 60, 60000));
      }

      // All should be allowed
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });

      // Check final count
      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.requests).toHaveLength(5);
    });

    test('should handle IPv6 addresses', () => {
      const result = rateLimiter.checkLimit('2001:db8::1', 60, 60000);
      
      expect(result.allowed).toBe(true);
      expect(rateLimiter.clients.has('2001:db8::1')).toBe(true);
    });

    test('should handle very long IP addresses', () => {
      const longIP = 'a'.repeat(1000);
      const result = rateLimiter.checkLimit(longIP, 60, 60000);
      
      expect(result.allowed).toBe(true);
      expect(rateLimiter.clients.has(longIP)).toBe(true);
    });

    test('should handle extremely large numbers of requests efficiently', () => {
      const clientData = {
        requests: [],
        blocked: false
      };
      
      // Add 1000 old requests
      for (let i = 0; i < 1000; i++) {
        clientData.requests.push(1000000 - 70000); // All outside window
      }
      
      rateLimiter.clients.set('heavy-client', clientData);
      
      const status = rateLimiter.getStatus('heavy-client');
      
      expect(status.requests).toBe(0); // All requests filtered out
    });

    test('should integrate checkLimit with cleanup properly', () => {
      // Create client with old requests
      rateLimiter.checkLimit('test-client', 60, 60000);
      
      // Advance time to make requests old
      Date.now.mockReturnValue(1000000 + 3600001); // 1 hour + 1ms later
      
      // Cleanup should remove old clients
      rateLimiter.cleanup();
      
      expect(rateLimiter.clients.has('test-client')).toBe(false);
    });

    test('should handle mixed client types in cleanup', () => {
      // Add various types of clients
      rateLimiter.clients.set('recent', {
        requests: [1000000 - 1000],
        blocked: false
      });
      rateLimiter.clients.set('old', {
        requests: [1000000 - 3600001],
        blocked: false
      });
      rateLimiter.clients.set('blocked', {
        requests: [1000000 - 3600001],
        blocked: true,
        blockExpiry: 1000000 + 1000000
      });

      rateLimiter.cleanup();

      expect(rateLimiter.clients.has('recent')).toBe(true);
      expect(rateLimiter.clients.has('old')).toBe(false);
      expect(rateLimiter.clients.has('blocked')).toBe(true);
    });
  });
});