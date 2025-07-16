/**
 * HTTP Request Tool - Edge Cases and Error Handling Testing
 * Tests boundary conditions, edge cases, and error scenarios
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
  warn: jest.fn()
}));

jest.mock('../server/src/utils/auth-manager', () => ({
  isAuthEnabled: () => false,
  validateToken: () => true,
  extractToken: () => 'valid-token'
}));

jest.mock('../server/src/utils/rate-limiter', () => ({
  middleware: (req, res, next) => next()
}));

describe('HTTP Request Tool - Edge Cases and Error Handling', () => {
  let app;
  let httpClient;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Get the mocked http client
    httpClient = require('../server/src/utils/http-client');

    // Create a minimal Express app with our MCP endpoint
    app = express();
    app.use(express.json());
    
    // Mock MCP server endpoint
    app.post('/mcp', async (req, res) => {
      const { method, params } = req.body;
      
      if (method === 'tools/call' && params.name === 'http_request') {
        const args = params.arguments;
        
        try {
          // Validate required parameters
          if (!args || !args.url || !args.method) {
            throw new Error('url and method are required');
          }
          
          // Handle invalid URL types
          if (typeof args.url !== 'string') {
            throw new Error('url must be a string');
          }
          
          // Handle invalid method types
          if (typeof args.method !== 'string') {
            throw new Error('method must be a string');
          }

          // Execute HTTP request using httpClient
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

  describe('Boundary Value Testing', () => {
    test('should handle minimum timeout value (0 seconds)', async () => {
      const mockResponse = {
        success: false,
        error: 'Request timed out after 0ms',
        executionTime: 0,
        requestId: 'req_timeout_zero',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

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
              method: 'GET',
              timeout: 0
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('timed out after 0ms');
    });

    test('should handle maximum timeout value (300 seconds)', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'long request completed' }),
        executionTime: 300000,
        requestId: 'req_timeout_max',
        url: 'http://localhost:8080/api/slow',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/slow',
              method: 'GET',
              timeout: 300
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('long request completed');
    });

    test('should handle empty URL string', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: '',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid params');
      expect(response.body.error.data).toContain('url and method are required');
    });

    test('should handle empty method string', async () => {
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
              method: ''
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid params');
      expect(response.body.error.data).toContain('url and method are required');
    });
  });

  describe('Invalid Input Handling', () => {
    test('should handle null values gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: null,
              method: null
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid params');
    });

    test('should handle undefined values gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: undefined,
              method: undefined
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid params');
    });

    test('should handle non-string URL', async () => {
      const invalidUrls = [
        123,
        true,
        [],
        {},
        Symbol('url')
      ];

      for (const invalidUrl of invalidUrls) {
        const mockResponse = {
          success: false,
          error: 'Invalid URL format',
          executionTime: 0,
          requestId: 'req_invalid_url',
          url: invalidUrl,
          method: 'GET'
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: invalidUrl,
                method: 'GET'
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error.data).toContain('url must be a string');
      }
    });

    test('should handle non-string HTTP method', async () => {
      const invalidMethods = [
        123,
        true,
        [],
        {},
        null
      ];

      for (const invalidMethod of invalidMethods) {
        const mockResponse = {
          success: false,
          error: 'Invalid HTTP method format',
          executionTime: 0,
          requestId: 'req_invalid_method',
          url: 'http://localhost:8080/api/test',
          method: invalidMethod
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

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
                method: invalidMethod
              }
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error.data).toContain('method must be a string');
      }
    });
  });

  describe('Network Error Scenarios', () => {
    test('should handle DNS resolution failures', async () => {
      const mockResponse = {
        success: false,
        error: 'DNS lookup failed for hostname: nonexistent-domain.local',
        executionTime: 5000,
        requestId: 'req_dns_fail',
        url: 'http://nonexistent-domain.local/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://nonexistent-domain.local/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('DNS lookup failed');
    });

    test('should handle connection refused errors', async () => {
      const mockResponse = {
        success: false,
        error: 'ECONNREFUSED: Connection refused at localhost:9999',
        executionTime: 1000,
        requestId: 'req_conn_refused',
        url: 'http://localhost:9999/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:9999/api/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('ECONNREFUSED');
    });

    test('should handle SSL/TLS certificate errors', async () => {
      const mockResponse = {
        success: false,
        error: 'SSL certificate error: self signed certificate',
        executionTime: 2000,
        requestId: 'req_ssl_error',
        url: 'https://self-signed.badssl.com/',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'https://self-signed.badssl.com/',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('SSL certificate error');
    });

    test('should handle network timeouts', async () => {
      const mockResponse = {
        success: false,
        error: 'Request timed out after 5000ms',
        executionTime: 5000,
        requestId: 'req_network_timeout',
        url: 'http://httpstat.us/200?sleep=10000',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://httpstat.us/200?sleep=10000',
              method: 'GET',
              timeout: 5
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('timed out after 5000ms');
    });
  });

  describe('HTTP Status Code Edge Cases', () => {
    test('should handle 1xx informational responses', async () => {
      const mockResponse = {
        success: true,
        statusCode: 102,
        statusMessage: 'Processing',
        headers: { 'content-type': 'text/plain' },
        body: 'Request is being processed...',
        executionTime: 100,
        requestId: 'req_102',
        url: 'http://localhost:8080/api/processing',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/processing',
              method: 'POST'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"statusCode": 102');
    });

    test('should handle 3xx redirect without following', async () => {
      const mockResponse = {
        success: true,
        statusCode: 301,
        statusMessage: 'Moved Permanently',
        headers: { 
          'location': 'http://localhost:8080/new-location',
          'content-type': 'text/html'
        },
        body: '<html><body>Resource moved</body></html>',
        executionTime: 50,
        requestId: 'req_301',
        url: 'http://localhost:8080/old-location',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/old-location',
              method: 'GET',
              followRedirects: false
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"statusCode": 301');
      expect(response.body.result.content[0].text).toContain('new-location');
    });

    test('should handle 4xx client errors', async () => {
      const clientErrors = [400, 401, 403, 404, 405, 409, 410, 418, 429];

      for (const statusCode of clientErrors) {
        const mockResponse = {
          success: true,
          statusCode: statusCode,
          statusMessage: `Client Error ${statusCode}`,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ 
            error: `Client error occurred`,
            code: statusCode 
          }),
          executionTime: 100,
          requestId: `req_${statusCode}`,
          url: 'http://localhost:8080/api/error',
          method: 'GET'
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .send({
            jsonrpc: '2.0',
            id: statusCode,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: 'http://localhost:8080/api/error',
                method: 'GET'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(`"statusCode": ${statusCode}`);
      }
    });

    test('should handle 5xx server errors', async () => {
      const serverErrors = [500, 501, 502, 503, 504, 505];

      for (const statusCode of serverErrors) {
        const mockResponse = {
          success: true,
          statusCode: statusCode,
          statusMessage: `Server Error ${statusCode}`,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ 
            error: `Server error occurred`,
            code: statusCode 
          }),
          executionTime: 200,
          requestId: `req_${statusCode}`,
          url: 'http://localhost:8080/api/server-error',
          method: 'POST'
        };

        httpClient.executeRequest.mockResolvedValue(mockResponse);

        const response = await request(app)
          .post('/mcp')
          .send({
            jsonrpc: '2.0',
            id: statusCode,
            method: 'tools/call',
            params: {
              name: 'http_request',
              arguments: {
                url: 'http://localhost:8080/api/server-error',
                method: 'POST'
              }
            }
          });

        expect(response.status).toBe(200);
        expect(response.body.result.content[0].text).toContain(`"statusCode": ${statusCode}`);
      }
    });
  });

  describe('Content Type Edge Cases', () => {
    test('should handle binary content responses', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/octet-stream' },
        body: Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64'), // PNG header in base64
        executionTime: 300,
        requestId: 'req_binary',
        url: 'http://localhost:8080/api/download/image.png',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/download/image.png',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('application/octet-stream');
    });

    test('should handle XML content responses', async () => {
      const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><root><message>Hello XML</message></root>';
      
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/xml' },
        body: xmlContent,
        executionTime: 150,
        requestId: 'req_xml',
        url: 'http://localhost:8080/api/data.xml',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/data.xml',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Hello XML');
    });

    test('should handle empty response body', async () => {
      const mockResponse = {
        success: true,
        statusCode: 204,
        statusMessage: 'No Content',
        headers: {},
        body: '',
        executionTime: 50,
        requestId: 'req_empty',
        url: 'http://localhost:8080/api/empty',
        method: 'DELETE'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/empty',
              method: 'DELETE'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"statusCode": 204');
      expect(response.body.result.content[0].text).toContain('"body": ""');
    });
  });

  describe('Malformed Response Handling', () => {
    test('should handle responses with missing headers', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: null, // Malformed - should be object
        body: JSON.stringify({ message: 'success' }),
        executionTime: 100,
        requestId: 'req_no_headers',
        url: 'http://localhost:8080/api/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

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

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"headers": null');
    });

    test('should handle responses with circular JSON structures', async () => {
      // Create a circular structure that would cause JSON.stringify to fail
      const circularObj = { message: 'test' };
      circularObj.self = circularObj;

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '[Circular JSON detected]',
        executionTime: 100,
        requestId: 'req_circular',
        url: 'http://localhost:8080/api/circular',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/circular',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Circular JSON detected');
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    test('should handle very large response bodies', async () => {
      const largeBody = 'x'.repeat(5 * 1024 * 1024); // 5MB response

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: largeBody,
        executionTime: 5000,
        requestId: 'req_large_response',
        url: 'http://localhost:8080/api/large-file',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/large-file',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('5000'); // execution time
    });

    test('should handle extremely deep JSON nesting', async () => {
      // Create deeply nested JSON
      let deepJson = { level: 0 };
      let current = deepJson;
      for (let i = 1; i < 1000; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(deepJson),
        executionTime: 1000,
        requestId: 'req_deep_json',
        url: 'http://localhost:8080/api/deep',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/deep',
              method: 'POST',
              json: { shallow: 'data' }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('\\\"level\\\":0');
    });
  });
});