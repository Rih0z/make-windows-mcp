/**
 * HTTP Client & PowerShell Enhanced Comprehensive Testing
 * http-client.js, powershell-enhanced.js の完全テストスイート
 */

const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const EventEmitter = require('events');

describe('HTTP Client & PowerShell Enhanced Comprehensive Testing', () => {
  let httpClient, powershellEnhanced;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache
    delete require.cache[require.resolve('../server/src/utils/http-client')];
    delete require.cache[require.resolve('../server/src/utils/powershell-enhanced')];
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock child_process
    jest.spyOn(require('child_process'), 'spawn').mockImplementation();
    
    // Mock HTTP modules
    jest.spyOn(https, 'request').mockImplementation();
    jest.spyOn(http, 'request').mockImplementation();
    
    // Get fresh instances
    httpClient = require('../server/src/utils/http-client');
    powershellEnhanced = require('../server/src/utils/powershell-enhanced');
  });

  afterEach(() => {
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    
    // Restore mocks
    jest.restoreAllMocks();
  });

  describe('HTTP Client Tests', () => {
    test('should make successful GET request', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"success": true}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const result = await httpClient.get('https://api.example.com/data');
      
      expect(result).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ success: true });
    });

    test('should make successful POST request', async () => {
      const mockResponse = {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"id": 123}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const postData = { name: 'test', value: 'data' };
      const result = await httpClient.post('https://api.example.com/create', postData);
      
      expect(result).toBeDefined();
      expect(result.statusCode).toBe(201);
      expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(postData));
    });

    test('should handle request timeout', async () => {
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'timeout') {
            callback();
          }
        }),
        end: jest.fn(),
        write: jest.fn(),
        abort: jest.fn()
      };
      
      https.request.mockImplementation(() => mockRequest);
      
      await expect(httpClient.get('https://slow.example.com', { timeout: 1000 }))
        .rejects.toThrow('Request timeout');
    });

    test('should handle network errors', async () => {
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Network error'));
          }
        }),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation(() => mockRequest);
      
      await expect(httpClient.get('https://invalid.example.com'))
        .rejects.toThrow('Network error');
    });

    test('should handle HTTP error status codes', async () => {
      const mockResponse = {
        statusCode: 404,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"error": "Not found"}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      await expect(httpClient.get('https://api.example.com/notfound'))
        .rejects.toThrow('HTTP 404');
    });

    test('should handle request with custom headers', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"success": true}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        expect(options.headers).toHaveProperty('Authorization');
        expect(options.headers).toHaveProperty('X-Custom-Header');
        callback(mockResponse);
        return mockRequest;
      });
      
      const headers = {
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value'
      };
      
      const result = await httpClient.get('https://api.example.com/data', { headers });
      expect(result.statusCode).toBe(200);
    });

    test('should handle PUT request', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"updated": true}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        expect(options.method).toBe('PUT');
        callback(mockResponse);
        return mockRequest;
      });
      
      const putData = { id: 123, name: 'updated' };
      const result = await httpClient.put('https://api.example.com/update/123', putData);
      
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ updated: true });
    });

    test('should handle DELETE request', async () => {
      const mockResponse = {
        statusCode: 204,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        expect(options.method).toBe('DELETE');
        callback(mockResponse);
        return mockRequest;
      });
      
      const result = await httpClient.delete('https://api.example.com/delete/123');
      expect(result.statusCode).toBe(204);
    });

    test('should handle JSON parsing errors', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('invalid json'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const result = await httpClient.get('https://api.example.com/invalid');
      expect(result.data).toBe('invalid json'); // Should return raw data
    });

    test('should handle large response data', async () => {
      const largeData = 'A'.repeat(1000000); // 1MB of data
      
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(largeData));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const result = await httpClient.get('https://api.example.com/large');
      expect(result.data).toBe(largeData);
    });

    test('should handle concurrent requests', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"success": true}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(httpClient.get(`https://api.example.com/data${i}`));
      }
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.statusCode).toBe(200);
      });
    });
  });

  describe('PowerShell Enhanced Tests', () => {
    test('should execute simple PowerShell command', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Get-Date');
      
      // Simulate successful execution
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('2023-01-01 12:00:00'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toContain('2023-01-01');
    });

    test('should handle PowerShell command with error', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Get-InvalidCommand');
      
      // Simulate error execution
      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Command not found'));
        mockProcess.emit('close', 1);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not found');
    });

    test('should handle command timeout', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Start-Sleep -Seconds 10', { timeout: 1000 });
      
      // Don't emit close event to simulate timeout
      
      await expect(promise).rejects.toThrow('Command timeout');
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    test('should execute command with parameters', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.executeWithParams('Get-Process', ['-Name', 'powershell']);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Process list'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-Name', 'powershell']),
        expect.any(Object)
      );
    });

    test('should handle PowerShell script execution', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const script = `
        $date = Get-Date
        Write-Output "Current date: $date"
      `;
      
      const promise = powershellEnhanced.executeScript(script);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Current date: 2023-01-01'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toContain('Current date');
    });

    test('should handle PowerShell execution policy', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Get-ExecutionPolicy');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('RemoteSigned'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-ExecutionPolicy', 'Bypass']),
        expect.any(Object)
      );
    });

    test('should handle PowerShell output encoding', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Write-Output "Unicode: 日本語"');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Unicode: 日本語', 'utf8'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toContain('日本語');
    });

    test('should handle PowerShell streaming output', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const outputChunks = [];
      const promise = powershellEnhanced.executeStreaming('Get-Process', (chunk) => {
        outputChunks.push(chunk);
      });
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Process 1\n'));
        mockProcess.stdout.emit('data', Buffer.from('Process 2\n'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(outputChunks).toHaveLength(2);
    });

    test('should handle PowerShell background job', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const jobId = powershellEnhanced.startBackgroundJob('Start-Sleep -Seconds 5');
      
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    test('should handle PowerShell module import', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.executeWithModule('ActiveDirectory', 'Get-ADUser -Filter *');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('User list'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-Command', expect.stringContaining('Import-Module ActiveDirectory')]),
        expect.any(Object)
      );
    });

    test('should handle PowerShell error stream', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Write-Error "Test error"');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Some output'));
        mockProcess.stderr.emit('data', Buffer.from('Test error'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true); // Exit code 0
      expect(result.output).toContain('Some output');
      expect(result.error).toContain('Test error');
    });

    test('should handle PowerShell with environment variables', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const env = { TEST_VAR: 'test_value' };
      const promise = powershellEnhanced.execute('$env:TEST_VAR', { env });
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('test_value'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toContain('test_value');
    });

    test('should handle PowerShell working directory', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promise = powershellEnhanced.execute('Get-Location', { cwd: 'C:\\test' });
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('C:\\test'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await promise;
      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'powershell',
        expect.any(Array),
        expect.objectContaining({ cwd: 'C:\\test' })
      );
    });
  });

  describe('Integration Tests', () => {
    test('should use HTTP client to fetch data and process with PowerShell', async () => {
      // Mock HTTP response
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"data": "test"}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      // Mock PowerShell process
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      // Execute integration test
      const httpResult = await httpClient.get('https://api.example.com/data');
      const psPromise = powershellEnhanced.execute(`Write-Output "${httpResult.data.data}"`);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('test'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const psResult = await psPromise;
      
      expect(httpResult.data).toEqual({ data: 'test' });
      expect(psResult.success).toBe(true);
      expect(psResult.output).toContain('test');
    });

    test('should handle error scenarios in integration', async () => {
      // Mock HTTP error
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Network error'));
          }
        }),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation(() => mockRequest);
      
      // Mock PowerShell error
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      try {
        await httpClient.get('https://invalid.example.com');
      } catch (error) {
        const psPromise = powershellEnhanced.execute(`Write-Error "${error.message}"`);
        
        setTimeout(() => {
          mockProcess.stderr.emit('data', Buffer.from('Network error'));
          mockProcess.emit('close', 1);
        }, 10);
        
        const psResult = await psPromise;
        expect(psResult.success).toBe(false);
        expect(psResult.error).toContain('Network error');
      }
    });
  });

  describe('Performance and Load Tests', () => {
    test('should handle high-volume HTTP requests', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('{"id": 1}'));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(httpClient.get(`https://api.example.com/data${i}`));
      }
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result.statusCode).toBe(200);
      });
    });

    test('should handle concurrent PowerShell executions', async () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      spawn.mockReturnValue(mockProcess);
      
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(powershellEnhanced.execute(`Write-Output "Test ${i}"`));
      }
      
      // Simulate all processes completing
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Test output'));
        mockProcess.emit('close', 0);
      }, 10);
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    test('should handle memory pressure gracefully', async () => {
      const largeData = JSON.stringify({ data: 'A'.repeat(100000) });
      
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(largeData));
          } else if (event === 'end') {
            callback();
          }
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn(),
        write: jest.fn()
      };
      
      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });
      
      const result = await httpClient.get('https://api.example.com/large');
      expect(result.data).toBeDefined();
      expect(result.data.data.length).toBe(100000);
    });
  });
});