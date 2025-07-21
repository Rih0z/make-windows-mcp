/**
 * HTTP Client Utility - Enterprise-grade HTTP request handling
 * Bypasses PowerShell JSON limitations for reliable API testing
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

class HttpClient {
  constructor() {
    this.defaultTimeout = parseInt(process.env.HTTP_REQUEST_TIMEOUT) || 30000;
    this.maxTimeout = parseInt(process.env.HTTP_MAX_TIMEOUT) || 300000;
    this.maxRedirects = parseInt(process.env.HTTP_MAX_REDIRECTS) || 5;
    this.allowedDomains = this.parseAllowedDomains();
    this.isLocalhostOnly = process.env.HTTP_LOCALHOST_ONLY === 'true';
  }

  /**
   * Parse allowed domains from environment
   */
  parseAllowedDomains() {
    const domains = process.env.HTTP_ALLOWED_DOMAINS;
    if (!domains) {
      return ['localhost', '127.0.0.1', '::1']; // Default to localhost only
    }
    return domains.split(',').map(domain => domain.trim().toLowerCase());
  }

  /**
   * Validate URL for security
   */
  validateUrl(urlString) {
    try {
      const url = new URL(urlString);
      
      // Protocol validation
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported protocol: ${url.protocol}`);
      }

      // Domain validation
      const hostname = url.hostname.toLowerCase();
      
      if (this.isLocalhostOnly) {
        const localhostPatterns = ['localhost', '127.0.0.1', '::1'];
        if (!localhostPatterns.includes(hostname)) {
          throw new Error('Only localhost requests are allowed in localhost-only mode');
        }
      } else {
        // Check against allowed domains
        const isAllowed = this.allowedDomains.some(allowed => {
          if (allowed === '*') return true;
          if (allowed.startsWith('*.')) {
            const domain = allowed.substring(2);
            return hostname === domain || hostname.endsWith('.' + domain);
          }
          return hostname === allowed;
        });

        if (!isAllowed) {
          throw new Error(`Domain not allowed: ${hostname}. Allowed domains: ${this.allowedDomains.join(', ')}`);
        }
      }

      // Port validation
      if (url.port && !this.isPortAllowed(parseInt(url.port))) {
        throw new Error(`Port not allowed: ${url.port}`);
      }

      return url;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid URL format: ${urlString}`);
      }
      throw error;
    }
  }

  /**
   * Check if port is allowed
   */
  isPortAllowed(port) {
    const allowedPorts = process.env.HTTP_ALLOWED_PORTS;
    if (!allowedPorts) {
      // Enhanced default allowed ports for development servers
      // Includes common AI server, web development, and testing ports
      const defaultPorts = [
        80, 443,                    // Standard web ports
        3000, 3001,                 // React, Node.js dev servers
        4000, 5000,                 // Development servers
        8000, 8080, 8090, 8888,     // AI servers, web servers, proxies
        5173, 5174,                 // Vite dev servers
        7000, 9000,                 // Additional development ports
        6000, 6001,                 // Jest, testing servers
        4200,                       // Angular dev server
        8983,                       // Solr
        9200, 9300                  // Elasticsearch
      ];
      return defaultPorts.includes(port);
    }
    
    const ports = allowedPorts.split(',').map(p => parseInt(p.trim()));
    return ports.includes(port);
  }

  /**
   * Validate HTTP method
   */
  validateMethod(method) {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    const upperMethod = method.toUpperCase();
    
    if (!allowedMethods.includes(upperMethod)) {
      throw new Error(`HTTP method not allowed: ${method}`);
    }
    
    return upperMethod;
  }

  /**
   * Validate and sanitize headers
   */
  validateHeaders(headers) {
    if (!headers || typeof headers !== 'object') {
      return {};
    }

    const sanitizedHeaders = {};
    const forbiddenHeaders = ['host', 'content-length', 'connection', 'upgrade'];
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (forbiddenHeaders.includes(lowerKey)) {
        logger.warn(`Forbidden header ignored: ${key}`);
        continue;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        logger.warn(`Invalid header value type for ${key}: ${typeof value}`);
        continue;
      }

      sanitizedHeaders[key] = String(value);
    }

    return sanitizedHeaders;
  }

  /**
   * Validate timeout
   */
  validateTimeout(timeout) {
    if (timeout === undefined || timeout === null) {
      return this.defaultTimeout;
    }

    const timeoutMs = typeof timeout === 'number' ? timeout * 1000 : parseInt(timeout) * 1000;
    
    if (isNaN(timeoutMs) || timeoutMs < 1000 || timeoutMs > this.maxTimeout) {
      throw new Error(`Timeout must be between 1 and ${this.maxTimeout / 1000} seconds`);
    }

    return timeoutMs;
  }

  /**
   * Process request body
   */
  processBody(body, json, headers) {
    let processedBody = '';
    const processedHeaders = { ...headers };

    if (json && typeof json === 'object') {
      try {
        processedBody = JSON.stringify(json);
        processedHeaders['Content-Type'] = 'application/json';
      } catch (error) {
        throw new Error(`Failed to serialize JSON: ${error.message}`);
      }
    } else if (body) {
      processedBody = String(body);
    }

    if (processedBody) {
      processedHeaders['Content-Length'] = Buffer.byteLength(processedBody);
    }

    return { body: processedBody, headers: processedHeaders };
  }

  /**
   * Execute HTTP request with comprehensive error handling
   */
  async executeRequest(options) {
    const {
      url: urlString,
      method = 'GET',
      headers = {},
      body,
      json,
      timeout = 30,
      followRedirects = true
    } = options;

    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Validation
      const url = this.validateUrl(urlString);
      const validMethod = this.validateMethod(method);
      const validHeaders = this.validateHeaders(headers);
      const validTimeout = this.validateTimeout(timeout);
      const { body: processedBody, headers: finalHeaders } = this.processBody(body, json, validHeaders);

      logger.info('HTTP request initiated', {
        requestId,
        method: validMethod,
        url: url.href,
        timeout: validTimeout,
        hasBody: !!processedBody
      });

      // Execute request
      const result = await this.performRequest({
        url,
        method: validMethod,
        headers: finalHeaders,
        body: processedBody,
        timeout: validTimeout,
        followRedirects,
        requestId
      });

      const executionTime = Date.now() - startTime;

      logger.info('HTTP request completed', {
        requestId,
        statusCode: result.statusCode,
        executionTime,
        responseSize: result.body ? result.body.length : 0
      });

      return {
        success: true,
        statusCode: result.statusCode,
        statusMessage: result.statusMessage,
        headers: result.headers,
        body: result.body,
        executionTime,
        requestId,
        url: url.href,
        method: validMethod
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('HTTP request failed', {
        requestId,
        error: error.message,
        executionTime,
        url: urlString,
        method
      });

      return {
        success: false,
        error: error.message,
        executionTime,
        requestId,
        url: urlString,
        method
      };
    }
  }

  /**
   * Perform the actual HTTP request
   */
  performRequest(options) {
    const { url, method, headers, body, timeout, followRedirects, requestId } = options;

    return new Promise((resolve, reject) => {
      const httpModule = url.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
        timeout
      };

      const req = httpModule.request(requestOptions, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          // Handle redirects
          if (followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            if (location) {
              logger.info('Following redirect', { requestId, location, statusCode: res.statusCode });
              
              try {
                const redirectUrl = new URL(location, url);
                return this.performRequest({
                  ...options,
                  url: redirectUrl
                }).then(resolve).catch(reject);
              } catch (error) {
                reject(new Error(`Invalid redirect URL: ${location}`));
                return;
              }
            }
          }

          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: responseBody
          });
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });

      // Send body if present
      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Parse response as JSON if possible
   */
  parseResponseJson(responseBody, contentType) {
    if (!responseBody) return null;
    
    if (contentType && contentType.includes('application/json')) {
      try {
        return JSON.parse(responseBody);
      } catch (error) {
        logger.warn('Failed to parse response as JSON', { error: error.message });
        return null;
      }
    }
    
    return null;
  }

  /**
   * Get request statistics
   */
  getStats() {
    return {
      defaultTimeout: this.defaultTimeout,
      maxTimeout: this.maxTimeout,
      maxRedirects: this.maxRedirects,
      allowedDomains: this.allowedDomains,
      isLocalhostOnly: this.isLocalhostOnly,
      configuredAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
module.exports = new HttpClient();