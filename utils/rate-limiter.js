class RateLimiter {
  constructor() {
    this.clients = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  /**
   * Check if client has exceeded rate limits
   */
  checkLimit(clientIP, maxRequests = 60, windowMs = 60000) {
    const now = Date.now();
    const clientData = this.clients.get(clientIP) || { requests: [], blocked: false, blockExpiry: 0 };

    // Check if client is currently blocked
    if (clientData.blocked && now < clientData.blockExpiry) {
      return {
        allowed: false,
        error: 'Rate limit exceeded. Client is temporarily blocked.',
        retryAfter: Math.ceil((clientData.blockExpiry - now) / 1000)
      };
    }

    // Reset block status if expired
    if (clientData.blocked && now >= clientData.blockExpiry) {
      clientData.blocked = false;
      clientData.requests = [];
    }

    // Filter requests within the current window
    clientData.requests = clientData.requests.filter(timestamp => now - timestamp < windowMs);

    // Check if limit exceeded
    if (clientData.requests.length >= maxRequests) {
      // Block client for 5 minutes
      clientData.blocked = true;
      clientData.blockExpiry = now + (5 * 60 * 1000);
      
      this.clients.set(clientIP, clientData);
      
      return {
        allowed: false,
        error: 'Rate limit exceeded. Client blocked for 5 minutes.',
        retryAfter: 300
      };
    }

    // Add current request
    clientData.requests.push(now);
    this.clients.set(clientIP, clientData);

    return {
      allowed: true,
      remaining: maxRequests - clientData.requests.length
    };
  }

  /**
   * Cleanup old client data
   */
  cleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [clientIP, clientData] of this.clients.entries()) {
      // Remove expired blocks
      if (clientData.blocked && clientData.blockExpiry < now) {
        this.clients.delete(clientIP);
        continue;
      }
      
      // Remove clients with no recent activity
      const lastRequest = Math.max(...clientData.requests, 0);
      if (now - lastRequest > oneHour && !clientData.blocked) {
        this.clients.delete(clientIP);
      }
    }
  }

  /**
   * Get current status for a client
   */
  getStatus(clientIP) {
    const clientData = this.clients.get(clientIP);
    if (!clientData) {
      return { requests: 0, blocked: false };
    }

    const now = Date.now();
    const windowMs = 60000;
    const activeRequests = clientData.requests.filter(timestamp => now - timestamp < windowMs);

    return {
      requests: activeRequests.length,
      blocked: clientData.blocked && now < clientData.blockExpiry,
      blockExpiry: clientData.blockExpiry
    };
  }

  /**
   * Manually block a client
   */
  blockClient(clientIP, durationMs = 5 * 60 * 1000) {
    const clientData = this.clients.get(clientIP) || { requests: [], blocked: false, blockExpiry: 0 };
    clientData.blocked = true;
    clientData.blockExpiry = Date.now() + durationMs;
    this.clients.set(clientIP, clientData);
  }

  /**
   * Unblock a client
   */
  unblockClient(clientIP) {
    const clientData = this.clients.get(clientIP);
    if (clientData) {
      clientData.blocked = false;
      clientData.blockExpiry = 0;
      this.clients.set(clientIP, clientData);
    }
  }

  /**
   * Clear all rate limit data
   */
  clear() {
    this.clients.clear();
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

module.exports = new RateLimiter();