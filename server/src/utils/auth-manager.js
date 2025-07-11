/**
 * Authentication Manager - Secure and stable token management
 * Fixes the issue of token invalidation within the same session
 */

class AuthManager {
  constructor() {
    // Initialize auth token once at startup
    this.authToken = null;
    this.isEnabled = false;
    this.initializeAuth();
    
    // Freeze the instance to prevent modification
    Object.freeze(this);
  }
  
  /**
   * Initialize authentication configuration
   * Called once at server startup
   */
  initializeAuth() {
    const token = process.env.MCP_AUTH_TOKEN;
    
    if (token && token !== 'change-this-to-a-secure-random-token') {
      this.authToken = token;
      this.isEnabled = true;
      console.log('🔐 Authentication enabled with secure token');
    } else {
      this.isEnabled = false;
      console.log('⚠️  Authentication disabled - no valid token provided');
    }
  }
  
  /**
   * Extract and normalize Bearer token from authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} - Extracted token or null
   */
  extractToken(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }
    
    // Trim and normalize
    let token = authHeader.trim();
    
    // Remove Bearer prefix (case-insensitive)
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.substring(7).trim();
    } else if (token.toLowerCase() === 'bearer') {
      // Handle case where header is just "Bearer" without token
      return null;
    }
    
    // Return null for empty tokens
    return token.length > 0 ? token : null;
  }
  
  /**
   * Validate authentication token
   * @param {string} providedToken - Token from request header
   * @returns {boolean} - True if valid, false otherwise
   */
  validateToken(providedToken) {
    if (!this.isEnabled) {
      return true; // Auth disabled, allow all requests
    }
    
    if (!providedToken || typeof providedToken !== 'string') {
      return false;
    }
    
    // Use constant-time comparison to prevent timing attacks
    return this.secureCompare(providedToken, this.authToken);
  }
  
  /**
   * Secure string comparison to prevent timing attacks
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} - True if strings match
   */
  secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
  
  /**
   * Get partial token for debugging (safe for logs)
   * @param {string} token - Full token
   * @returns {string} - Partial token for logging
   */
  getPartialToken(token) {
    if (!token || typeof token !== 'string') {
      return 'null';
    }
    
    if (token.length < 8) {
      return 'too short';
    }
    
    return token.substring(0, 4) + '...' + token.substring(token.length - 4);
  }
  
  /**
   * Check if authentication is enabled
   * @returns {boolean} - True if auth is enabled
   */
  isAuthEnabled() {
    return this.isEnabled;
  }
  
  /**
   * Get expected token length for validation
   * @returns {number} - Expected token length
   */
  getExpectedTokenLength() {
    return this.authToken ? this.authToken.length : 0;
  }
  
  /**
   * Get expected token partial for debugging
   * @returns {string} - Expected token partial
   */
  getExpectedTokenPartial() {
    return this.authToken ? this.getPartialToken(this.authToken) : 'none';
  }

  /**
   * Generate comprehensive authentication diagnostics
   * @param {string} providedToken - Token from request
   * @param {string} authHeader - Full authorization header
   * @returns {Object} - Diagnostic information
   */
  generateDiagnostics(providedToken, authHeader) {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      authEnabled: this.isEnabled,
      serverInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime()
      }
    };

    if (this.isEnabled) {
      diagnostics.tokenAnalysis = {
        expected: {
          length: this.getExpectedTokenLength(),
          partial: this.getExpectedTokenPartial(),
          type: typeof this.authToken
        },
        received: {
          length: providedToken ? providedToken.length : 0,
          partial: this.getPartialToken(providedToken),
          type: typeof providedToken
        },
        headerAnalysis: {
          provided: !!authHeader,
          length: authHeader ? authHeader.length : 0,
          startsWithBearer: authHeader ? authHeader.toLowerCase().startsWith('bearer ') : false,
          format: authHeader ? authHeader.substring(0, 10) + '...' : 'missing'
        }
      };

      // Character-by-character comparison for debugging
      if (providedToken && this.authToken && providedToken.length === this.authToken.length) {
        const differences = [];
        for (let i = 0; i < providedToken.length; i++) {
          if (providedToken[i] !== this.authToken[i]) {
            differences.push({
              position: i,
              expected: this.authToken.charCodeAt(i),
              received: providedToken.charCodeAt(i)
            });
          }
        }
        diagnostics.tokenAnalysis.characterDifferences = differences.slice(0, 5); // Only show first 5 differences for security
      }
    }

    return diagnostics;
  }

  /**
   * Get session health information
   * @returns {Object} - Session health data
   */
  getSessionHealth() {
    return {
      timestamp: new Date().toISOString(),
      authEnabled: this.isEnabled,
      serverUptime: Math.floor(process.uptime()),
      tokenConfigured: !!this.authToken,
      memoryUsage: process.memoryUsage(),
      instanceHealth: 'stable'
    };
  }
}

// Export singleton instance
module.exports = new AuthManager();