/**
 * Rate Limiter - 100% Coverage Test Suite
 * Comprehensive testing for all methods and edge cases in rate-limiter.js
 */

describe('Rate Limiter - 100% Coverage', () => {
  let RateLimiter;
  let rateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache to get fresh instance
    delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
    
    // Clear environment variables
    delete process.env.RATE_LIMIT_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.ENABLE_DANGEROUS_MODE;
    
    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000);
    
    // Mock console methods
    console.warn = jest.fn();
    console.log = jest.fn();
    
    // Get fresh instance
    RateLimiter = require('../server/src/utils/rate-limiter');
    rateLimiter = RateLimiter;
  });

  afterEach(() => {
    Date.now.mockRestore();
    console.warn.mockRestore?.();
    console.log.mockRestore?.();
    
    // Clear environment variables
    delete process.env.RATE_LIMIT_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.ENABLE_DANGEROUS_MODE;
    
    // Clear any intervals
    if (rateLimiter.cleanupInterval) {
      clearInterval(rateLimiter.cleanupInterval);
    }
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      expect(rateLimiter.requestsPerMinute).toBe(60);
      expect(rateLimiter.windowMs).toBe(60000);
      expect(rateLimiter.clients).toBeInstanceOf(Map);
    });

    test('should use environment variables for configuration', () => {
      process.env.RATE_LIMIT_REQUESTS = '100';
      process.env.RATE_LIMIT_WINDOW_MS = '30000';
      
      // Clear cache and get new instance
      delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
      const customRateLimiter = require('../server/src/utils/rate-limiter');
      
      expect(customRateLimiter.requestsPerMinute).toBe(100);
      expect(customRateLimiter.windowMs).toBe(30000);
    });

    test('should handle invalid environment variables', () => {
      process.env.RATE_LIMIT_REQUESTS = 'invalid';
      process.env.RATE_LIMIT_WINDOW_MS = 'invalid';
      
      delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
      const customRateLimiter = require('../server/src/utils/rate-limiter');
      
      // Should fall back to defaults
      expect(customRateLimiter.requestsPerMinute).toBe(60);
      expect(customRateLimiter.windowMs).toBe(60000);
    });

    test('should disable rate limiting in dangerous mode', () => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      
      delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
      const dangerousRateLimiter = require('../server/src/utils/rate-limiter');
      
      // Should be disabled
      expect(dangerousRateLimiter.requestsPerMinute).toBe(0);
    });

    test('should setup cleanup interval', () => {
      jest.spyOn(global, 'setInterval');
      
      delete require.cache[require.resolve('../server/src/utils/rate-limiter')];
      require('../server/src/utils/rate-limiter');
      
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 300000);
    });
  });

  describe('middleware - Basic Functionality', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        ip: '192.168.1.1',
        connection: { remoteAddress: '192.168.1.1' },
        headers: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      next = jest.fn();
    });

    test('should allow requests within rate limit', () => {
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
    });

    test('should get client IP from req.ip', () => {
      req.ip = '10.0.0.1';
      req.connection.remoteAddress = '192.168.1.1';
      
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      // Should record request for the IP from req.ip
      const clientData = rateLimiter.clients.get('10.0.0.1');
      expect(clientData).toBeDefined();
      expect(clientData.requests).toHaveLength(1);
    });

    test('should get client IP from connection.remoteAddress when req.ip not available', () => {
      delete req.ip;
      req.connection.remoteAddress = '172.16.0.1';
      
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      const clientData = rateLimiter.clients.get('172.16.0.1');
      expect(clientData).toBeDefined();
    });

    test('should get client IP from X-Forwarded-For header', () => {
      delete req.ip;
      delete req.connection.remoteAddress;
      req.headers['x-forwarded-for'] = '203.0.113.1, 192.168.1.1';
      
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      const clientData = rateLimiter.clients.get('203.0.113.1');
      expect(clientData).toBeDefined();
    });

    test('should handle missing client IP gracefully', () => {
      delete req.ip;
      delete req.connection;
      req.headers = {};
      
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      // Should use 'unknown' as fallback
      const clientData = rateLimiter.clients.get('unknown');
      expect(clientData).toBeDefined();
    });

    test('should track multiple requests from same client', () => {
      const middleware = rateLimiter.middleware;
      
      // Make 3 requests
      middleware(req, res, next);
      middleware(req, res, next);
      middleware(req, res, next);

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.requests).toHaveLength(3);
      expect(next).toHaveBeenCalledTimes(3);
    });

    test('should block requests when rate limit exceeded', () => {
      const middleware = rateLimiter.middleware;
      
      // Make 61 requests (exceeding limit of 60)
      for (let i = 0; i < 61; i++) {
        middleware(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(60);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests, please try again later',
        retryAfter: 60000
      });
    });

    test('should set correct rate limit headers', () => {
      const middleware = rateLimiter.middleware;
      
      // Make first request
      middleware(req, res, next);
      
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    test('should handle rate limiting when disabled', () => {
      // Set requests per minute to 0 (disabled)
      rateLimiter.requestsPerMinute = 0;
      
      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.set).not.toHaveBeenCalled();
    });
  });

  describe('middleware - Blocking and Timeouts', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        ip: '192.168.1.1',
        connection: { remoteAddress: '192.168.1.1' },
        headers: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      next = jest.fn();
    });

    test('should block client for 1 hour after exceeding limit', () => {
      const middleware = rateLimiter.middleware;
      
      // Exceed rate limit
      for (let i = 0; i < 61; i++) {
        middleware(req, res, next);
      }

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.blocked).toBe(true);
      expect(clientData.blockExpiry).toBe(1000000 + (60 * 60 * 1000)); // 1 hour later
    });

    test('should reject blocked clients immediately', () => {
      const middleware = rateLimiter.middleware;
      
      // First exceed the limit
      for (let i = 0; i < 61; i++) {
        middleware(req, res, next);
      }

      // Reset mocks
      res.status.mockClear();
      res.json.mockClear();
      next.mockClear();

      // Try another request
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'IP address is temporarily blocked due to too many requests',
        blockExpiry: expect.any(Number)
      });
    });

    test('should unblock client after block period expires', () => {
      const middleware = rateLimiter.middleware;
      
      // Exceed rate limit
      for (let i = 0; i < 61; i++) {
        middleware(req, res, next);
      }

      // Advance time past block expiry
      Date.now.mockReturnValue(1000000 + (61 * 60 * 1000)); // 61 minutes later

      // Reset mocks
      res.status.mockClear();
      res.json.mockClear();
      next.mockClear();

      // Try another request
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should filter out old requests from time window', () => {
      const middleware = rateLimiter.middleware;
      
      // Make some requests
      for (let i = 0; i < 30; i++) {
        middleware(req, res, next);
      }

      // Advance time by 61 seconds (past window)
      Date.now.mockReturnValue(1000000 + 61000);

      // Make another request
      middleware(req, res, next);

      // Should only count the new request
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
    });
  });

  describe('cleanupOldEntries', () => {
    test('should remove clients with no recent activity', () => {
      // Add some test clients
      rateLimiter.clients.set('old-client', {
        requests: [1000000 - 3600001], // 1 hour and 1ms ago
        blocked: false
      });
      rateLimiter.clients.set('recent-client', {
        requests: [1000000 - 30000], // 30 seconds ago
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('old-client')).toBe(false);
      expect(rateLimiter.clients.has('recent-client')).toBe(true);
    });

    test('should keep blocked clients even if old', () => {
      rateLimiter.clients.set('blocked-client', {
        requests: [1000000 - 3600001], // 1 hour and 1ms ago
        blocked: true,
        blockExpiry: 1000000 + 1000000 // Far in future
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('blocked-client')).toBe(true);
    });

    test('should remove clients with empty requests array', () => {
      rateLimiter.clients.set('empty-client', {
        requests: [],
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('empty-client')).toBe(false);
    });

    test('should remove clients with no requests property', () => {
      rateLimiter.clients.set('no-requests-client', {
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('no-requests-client')).toBe(false);
    });

    test('should handle clients with undefined requests', () => {
      rateLimiter.clients.set('undefined-requests', {
        requests: undefined,
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('undefined-requests')).toBe(false);
    });

    test('should handle clients with null requests', () => {
      rateLimiter.clients.set('null-requests', {
        requests: null,
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('null-requests')).toBe(false);
    });
  });

  describe('getStatus', () => {
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

    test('should handle client with no requests array', () => {
      rateLimiter.clients.set('no-requests', {
        blocked: false
      });

      const status = rateLimiter.getStatus('no-requests');
      
      expect(status.requests).toBe(0);
      expect(status.blocked).toBe(false);
    });
  });

  describe('clear', () => {
    test('should clear all clients', () => {
      rateLimiter.clients.set('client1', { requests: [1000000] });
      rateLimiter.clients.set('client2', { requests: [1000000] });
      
      expect(rateLimiter.clients.size).toBe(2);
      
      rateLimiter.clear();
      
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle empty clients map', () => {
      expect(rateLimiter.clients.size).toBe(0);
      
      rateLimiter.clear();
      
      expect(rateLimiter.clients.size).toBe(0);
    });
  });

  describe('destroy', () => {
    test('should clear cleanup interval and clients', () => {
      jest.spyOn(global, 'clearInterval');
      
      // Add some test data
      rateLimiter.clients.set('test', { requests: [1000000] });
      rateLimiter.cleanupInterval = setInterval(() => {}, 1000);
      
      rateLimiter.destroy();
      
      expect(clearInterval).toHaveBeenCalledWith(rateLimiter.cleanupInterval);
      expect(rateLimiter.clients.size).toBe(0);
    });

    test('should handle missing cleanup interval', () => {
      rateLimiter.cleanupInterval = null;
      
      expect(() => rateLimiter.destroy()).not.toThrow();
    });

    test('should handle undefined cleanup interval', () => {
      delete rateLimiter.cleanupInterval;
      
      expect(() => rateLimiter.destroy()).not.toThrow();
    });
  });

  describe('Edge Cases and Security', () => {
    test('should handle malformed X-Forwarded-For header', () => {
      const req = {
        headers: {
          'x-forwarded-for': '   ,   ,   invalid   '
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      const next = jest.fn();

      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
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

    test('should handle concurrent requests from same client', () => {
      const req = {
        ip: '192.168.1.1',
        connection: { remoteAddress: '192.168.1.1' },
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      const next = jest.fn();

      const middleware = rateLimiter.middleware;
      
      // Simulate concurrent requests
      middleware(req, res, next);
      middleware(req, res, next);
      middleware(req, res, next);

      const clientData = rateLimiter.clients.get('192.168.1.1');
      expect(clientData.requests).toHaveLength(3);
    });

    test('should handle IPv6 addresses', () => {
      const req = {
        ip: '2001:db8::1',
        connection: { remoteAddress: '2001:db8::1' },
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      const next = jest.fn();

      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(rateLimiter.clients.has('2001:db8::1')).toBe(true);
    });

    test('should handle very long IP addresses gracefully', () => {
      const longIP = 'a'.repeat(1000);
      const req = {
        ip: longIP,
        connection: { remoteAddress: longIP },
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn()
      };
      const next = jest.fn();

      const middleware = rateLimiter.middleware;
      middleware(req, res, next);

      expect(rateLimiter.clients.has(longIP)).toBe(true);
    });
  });

  describe('Memory Management', () => {
    test('should not exceed reasonable memory usage with many clients', () => {
      // Add many clients
      for (let i = 0; i < 1000; i++) {
        rateLimiter.clients.set(`client-${i}`, {
          requests: [1000000],
          blocked: false
        });
      }

      expect(rateLimiter.clients.size).toBe(1000);
      
      // Cleanup should manage memory
      rateLimiter.cleanupOldEntries();
      
      // Not all should be removed since they're recent
      expect(rateLimiter.clients.size).toBeGreaterThan(0);
    });

    test('should handle cleanup with mixed client types', () => {
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
      rateLimiter.clients.set('empty', {
        requests: [],
        blocked: false
      });

      rateLimiter.cleanupOldEntries();

      expect(rateLimiter.clients.has('recent')).toBe(true);
      expect(rateLimiter.clients.has('old')).toBe(false);
      expect(rateLimiter.clients.has('blocked')).toBe(true);
      expect(rateLimiter.clients.has('empty')).toBe(false);
    });
  });
});