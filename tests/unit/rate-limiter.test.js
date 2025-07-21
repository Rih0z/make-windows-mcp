const rateLimiter = require('../../server/src/utils/rate-limiter');

describe('Rate Limiter', () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  afterAll(() => {
    rateLimiter.destroy();
  });

  test('should allow requests within limit', () => {
    const clientIP = '192.168.1.100';
    const maxRequests = 5;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests; i++) {
      const result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(maxRequests - i - 1);
    }
  });

  test('should block requests when limit exceeded', () => {
    const clientIP = '192.168.1.100';
    const maxRequests = 3;
    const windowMs = 60000;

    // Use up the limit
    for (let i = 0; i < maxRequests; i++) {
      const result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
      expect(result.allowed).toBe(true);
    }

    // Next request should be blocked
    const blockedResult = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.error).toContain('Rate limit exceeded');
    expect(blockedResult.retryAfter).toBe(300); // 5 minutes
  });

  test('should handle multiple clients independently', () => {
    const client1 = '192.168.1.100';
    const client2 = '192.168.1.101';
    const maxRequests = 2;
    const windowMs = 60000;

    // Client 1 uses up limit
    for (let i = 0; i < maxRequests; i++) {
      const result = rateLimiter.checkLimit(client1, maxRequests, windowMs);
      expect(result.allowed).toBe(true);
    }

    // Client 1 is blocked
    const client1Blocked = rateLimiter.checkLimit(client1, maxRequests, windowMs);
    expect(client1Blocked.allowed).toBe(false);

    // Client 2 should still be allowed
    const client2Result = rateLimiter.checkLimit(client2, maxRequests, windowMs);
    expect(client2Result.allowed).toBe(true);
  });

  test('should reset after time window', async () => {
    const clientIP = '192.168.1.100';
    const maxRequests = 2;
    const windowMs = 100; // Very short window for testing

    // Use up the limit
    for (let i = 0; i < maxRequests; i++) {
      const result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
      expect(result.allowed).toBe(true);
    }

    // Should be blocked (rate limit creates 5-minute block)
    const blockedResult = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(blockedResult.allowed).toBe(false);

    // Manually unblock to test window reset behavior
    rateLimiter.unblockClient(clientIP);
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, windowMs + 10));

    // Should be allowed again
    const allowedResult = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(allowedResult.allowed).toBe(true);
  });

  test('should manually block and unblock clients', () => {
    const clientIP = '192.168.1.100';
    const maxRequests = 10;
    const windowMs = 60000;

    // Should initially be allowed
    let result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(result.allowed).toBe(true);

    // Manually block client
    rateLimiter.blockClient(clientIP, 1000);

    // Should now be blocked
    result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(result.allowed).toBe(false);

    // Manually unblock
    rateLimiter.unblockClient(clientIP);

    // Should be allowed again
    result = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    expect(result.allowed).toBe(true);
  });

  test('should provide accurate status information', () => {
    const clientIP = '192.168.1.100';
    const maxRequests = 5;
    const windowMs = 60000;

    // Initial status
    let status = rateLimiter.getStatus(clientIP);
    expect(status.requests).toBe(0);
    expect(status.blocked).toBe(false);

    // Make some requests
    for (let i = 0; i < 3; i++) {
      rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
    }

    status = rateLimiter.getStatus(clientIP);
    expect(status.requests).toBe(3);
    expect(status.blocked).toBe(false);

    // Block client
    rateLimiter.blockClient(clientIP);
    status = rateLimiter.getStatus(clientIP);
    expect(status.blocked).toBe(true);
    expect(typeof status.blockExpiry).toBe('number');
  });
});