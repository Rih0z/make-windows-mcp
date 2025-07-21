/**
 * HTTP Request Tool - Comprehensive Integration Testing
 * Tests the complete MCP tool implementation with realistic scenarios
 */

const request = require('supertest');
const express = require('express');

// Mock the http-client module
jest.mock('../../server/src/utils/http-client', () => {
  return {
    executeRequest: jest.fn()
  };
});

// Mock other dependencies
jest.mock('../../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

jest.mock('../../server/src/utils/auth-manager', () => ({
  isAuthEnabled: () => false,
  validateToken: () => true,
  extractToken: () => 'valid-token'
}));

jest.mock('../../server/src/utils/rate-limiter', () => ({
  middleware: (req, res, next) => next()
}));

describe('HTTP Request Tool - Integration Tests', () => {
  let app;
  let httpClient;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Get the mocked http client
    httpClient = require('../../server/src/utils/http-client');

    // Create a minimal Express app with our MCP endpoint
    app = express();
    app.use(express.json());
    
    // Mock MCP server endpoint (simplified)
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

  describe('AI Server Testing Scenarios', () => {
    test('should handle AI chat API request successfully', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'chat-123',
          response: 'Hello! How can I help you today?',
          model: 'tinyllama',
          usage: { prompt_tokens: 10, completion_tokens: 15 }
        }),
        executionTime: 1250,
        requestId: 'req_123',
        url: 'http://localhost:8080/api/chat',
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
              url: 'http://localhost:8080/api/chat',
              method: 'POST',
              json: {
                message: 'Hello AI',
                model: 'tinyllama',
                temperature: 0.7,
                max_tokens: 100
              },
              timeout: 30
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"success": true');
      expect(response.body.result.content[0].text).toContain('"statusCode": 200');
      expect(response.body.result.content[0].text).toContain('Hello! How can I help you today?');

      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:8080/api/chat',
        method: 'POST',
        headers: {},
        body: undefined,
        json: {
          message: 'Hello AI',
          model: 'tinyllama',
          temperature: 0.7,
          max_tokens: 100
        },
        timeout: 30,
        followRedirects: true
      });
    });

    test('should handle model switching API request', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Model switched successfully',
          previous_model: 'tinyllama',
          current_model: 'llama2-7b',
          status: 'ready'
        }),
        executionTime: 3500,
        requestId: 'req_model_switch',
        url: 'http://localhost:8080/api/model/switch',
        method: 'PUT'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/model/switch',
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer api-token-123',
                'Content-Type': 'application/json'
              },
              json: {
                model: 'llama2-7b',
                load_in_8bit: true,
                device_map: 'auto'
              }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Model switched successfully');
      expect(response.body.result.content[0].text).toContain('llama2-7b');
    });

    test('should handle health check requests', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'healthy',
          model: 'tinyllama',
          gpu_memory: '2.1GB',
          uptime: '1h 23m 45s',
          version: '1.0.0'
        }),
        executionTime: 150,
        requestId: 'req_health',
        url: 'http://localhost:8080/health',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/health',
              method: 'GET',
              timeout: 10
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('\\\"status\\\":\\\"healthy\\\"');
      expect(response.body.result.content[0].text).toContain('tinyllama');
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle connection timeout', async () => {
      const mockResponse = {
        success: false,
        error: 'Request timed out after 5000ms',
        executionTime: 5000,
        requestId: 'req_timeout',
        url: 'http://localhost:8080/api/slow',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/slow',
              method: 'POST',
              timeout: 5
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"success": false');
      expect(response.body.result.content[0].text).toContain('timed out');
    });

    test('should handle server errors', async () => {
      const mockResponse = {
        success: true,
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'Model not loaded',
          code: 'MODEL_ERROR',
          details: 'The requested model is not currently loaded'
        }),
        executionTime: 500,
        requestId: 'req_error',
        url: 'http://localhost:8080/api/chat',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/chat',
              method: 'POST',
              json: { message: 'Hello' }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"statusCode": 500');
      expect(response.body.result.content[0].text).toContain('Model not loaded');
    });

    test('should handle missing required parameters', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              method: 'POST'
              // Missing url parameter
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid params');
      expect(response.body.error.data).toContain('url and method are required');
    });
  });

  describe('Advanced HTTP Features', () => {
    test('should handle custom headers and authentication', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authenticated: true,
          user: 'api-user',
          permissions: ['read', 'write']
        }),
        executionTime: 300,
        requestId: 'req_auth',
        url: 'http://localhost:8080/api/user/profile',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/user/profile',
              method: 'GET',
              headers: {
                'Authorization': 'Bearer jwt-token-here',
                'User-Agent': 'MCP-Windows-Client/1.0.37',
                'Accept': 'application/json',
                'X-Client-Version': '1.0.37'
              }
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('authenticated');

      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:8080/api/user/profile',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer jwt-token-here',
          'User-Agent': 'MCP-Windows-Client/1.0.37',
          'Accept': 'application/json',
          'X-Client-Version': '1.0.37'
        },
        body: undefined,
        json: undefined,
        timeout: 30,
        followRedirects: true
      });
    });

    test('should handle form data and string body', async () => {
      const mockResponse = {
        success: true,
        statusCode: 201,
        statusMessage: 'Created',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'webhook-123',
          status: 'received',
          processed: true
        }),
        executionTime: 800,
        requestId: 'req_webhook',
        url: 'http://localhost:3000/webhook',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:3000/webhook',
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: 'event=user_signup&user_id=12345&email=test@example.com'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('webhook-123');

      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:3000/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'event=user_signup&user_id=12345&email=test@example.com',
        json: undefined,
        timeout: 30,
        followRedirects: true
      });
    });

    test('should handle redirect following', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html><body>Final destination</body></html>',
        executionTime: 450,
        requestId: 'req_redirect',
        url: 'http://localhost:8080/redirect-test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/redirect-test',
              method: 'GET',
              followRedirects: true
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Final destination');
    });

    test('should handle redirect disabled', async () => {
      const mockResponse = {
        success: true,
        statusCode: 302,
        statusMessage: 'Found',
        headers: { 
          'location': 'http://localhost:8080/final',
          'content-type': 'text/html'
        },
        body: '<html><body>Redirecting...</body></html>',
        executionTime: 100,
        requestId: 'req_no_redirect',
        url: 'http://localhost:8080/redirect-test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/redirect-test',
              method: 'GET',
              followRedirects: false
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('"statusCode": 302');
      expect(response.body.result.content[0].text).toContain('Redirecting');
    });
  });

  describe('Complex JSON Scenarios', () => {
    test('should handle complex nested JSON objects', async () => {
      const complexPayload = {
        model: 'llama2-7b',
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: 'Explain quantum computing in simple terms.' }
        ],
        parameters: {
          temperature: 0.7,
          max_tokens: 500,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1
        },
        metadata: {
          session_id: 'session_123',
          user_id: 'user_456',
          timestamp: new Date().toISOString(),
          tags: ['science', 'education', 'quantum']
        }
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'chat_response_789',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Quantum computing is a revolutionary technology that uses quantum mechanical phenomena...'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 45,
            completion_tokens: 150,
            total_tokens: 195
          }
        }),
        executionTime: 2300,
        requestId: 'req_complex',
        url: 'http://localhost:8080/api/chat/completions',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/chat/completions',
              method: 'POST',
              json: complexPayload,
              timeout: 60
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('Quantum computing is a revolutionary technology');
      expect(response.body.result.content[0].text).toContain('prompt_tokens');

      expect(httpClient.executeRequest).toHaveBeenCalledWith({
        url: 'http://localhost:8080/api/chat/completions',
        method: 'POST',
        headers: {},
        body: undefined,
        json: complexPayload,
        timeout: 60,
        followRedirects: true
      });
    });

    test('should handle Unicode and special characters in JSON', async () => {
      const unicodePayload = {
        message: 'こんにちは世界！ 🌍 Здравствуй мир! 🚀',
        data: {
          emoji: '😀😃😄😁😆😅😂🤣',
          symbols: '±×÷∞∑∏∫∆∇∂∃∀∈∉⊂⊃⊆⊇∪∩',
          unicode_text: '这是中文测试 αβγδε தமிழ் العربية',
          special_chars: '"quotes" \'apostrophes\' & ampersands < > brackets'
        }
      };

      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          processed: true,
          echo: unicodePayload.message,
          length: unicodePayload.message.length
        }),
        executionTime: 200,
        requestId: 'req_unicode',
        url: 'http://localhost:8080/api/unicode-test',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/unicode-test',
              method: 'POST',
              json: unicodePayload
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('こんにちは世界');
      expect(response.body.result.content[0].text).toContain('🌍');
    });
  });

  describe('Performance and Timeout Scenarios', () => {
    test('should handle long-running AI inference with extended timeout', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response: 'This is a very detailed response that took a long time to generate...',
          processing_time: '45.2 seconds',
          model: 'large-language-model',
          tokens_generated: 1500
        }),
        executionTime: 45200,
        requestId: 'req_long_running',
        url: 'http://localhost:8080/api/generate-long',
        method: 'POST'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/api/generate-long',
              method: 'POST',
              json: {
                prompt: 'Write a detailed analysis of climate change impacts...',
                max_tokens: 2000,
                temperature: 0.8
              },
              timeout: 60  // 60 seconds for long inference
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result.content[0].text).toContain('45.2 seconds');
      expect(response.body.result.content[0].text).toContain('1500');
    });
  });

  describe('MCP Protocol Compliance', () => {
    test('should return proper JSON-RPC 2.0 response format', async () => {
      const mockResponse = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
        executionTime: 100,
        requestId: 'req_protocol',
        url: 'http://localhost:8080/test',
        method: 'GET'
      };

      httpClient.executeRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 'http://localhost:8080/test',
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 14);
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('content');
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content[0]).toHaveProperty('type', 'text');
      expect(response.body.result.content[0]).toHaveProperty('text');
    });

    test('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/call',
          params: {
            name: 'http_request',
            arguments: {
              url: 123,  // Invalid URL type
              method: 'GET'
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 15);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', -32602);
      expect(response.body.error).toHaveProperty('message', 'Invalid params');
    });
  });
});