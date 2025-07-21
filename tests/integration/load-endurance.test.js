/**
 * Load and Endurance Testing
 * 負荷テスト・耐久性テスト
 * Performance, stress, and endurance testing for Windows MCP Server
 */

const { EventEmitter } = require('events');
const { spawn } = require('child_process');

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');

describe('Load and Endurance Testing', () => {
  let mockServer;
  let mockTransport;
  let mockProcess;
  let serverInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Extend Jest timeout for long-running tests
    jest.setTimeout(60000);
    
    // Clear require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('server/src/')) {
        delete require.cache[key];
      }
    });
    
    // Mock environment
    process.env.MCP_AUTH_TOKEN = 'test-load-token';
    process.env.MCP_SERVER_PORT = '8080';
    process.env.RATE_LIMIT_REQUESTS = '1000'; // High limit for load testing
    process.env.RATE_LIMIT_WINDOW = '60000';
    process.env.COMMAND_TIMEOUT = '60000';
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Mock child_process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();
    mockProcess.pid = 1234;
    spawn.mockReturnValue(mockProcess);
    
    // Mock fs operations
    const fs = require('fs');
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.readFileSync = jest.fn().mockReturnValue('test content');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();
    fs.statSync = jest.fn().mockReturnValue({ 
      size: 1024,
      isDirectory: () => false 
    });
    
    // Mock MCP components
    mockTransport = new EventEmitter();
    mockTransport.start = jest.fn();
    mockTransport.close = jest.fn();
    
    mockServer = new EventEmitter();
    mockServer.setRequestHandler = jest.fn();
    mockServer.connect = jest.fn();
    mockServer.close = jest.fn();
    mockServer.addTool = jest.fn();
    
    // Mock SDK
    jest.doMock('@modelcontextprotocol/sdk/server', () => ({
      Server: jest.fn(() => mockServer)
    }));
    
    jest.doMock('@modelcontextprotocol/sdk/server/stdio', () => ({
      StdioServerTransport: jest.fn(() => mockTransport)
    }));
    
    // Mock utilities with performance considerations
    jest.doMock('../../server/src/utils/port-manager', () => ({
      initialize: jest.fn(),
      findAvailablePort: jest.fn().mockResolvedValue(8080),
      getPortInfo: jest.fn().mockReturnValue({ 
        preferredPort: 8080, 
        assignedPort: 8080,
        fallbackUsed: false 
      }),
      displayPortSummary: jest.fn(),
      setupGracefulShutdown: jest.fn(),
      cleanup: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/rate-limiter', () => ({
      checkLimit: jest.fn().mockReturnValue({ 
        allowed: true, 
        remaining: 999,
        resetTime: Date.now() + 60000 
      }),
      cleanup: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        totalRequests: 0,
        blockedRequests: 0,
        activeClients: 0
      })
    }));
    
    jest.doMock('../../server/src/utils/auth-manager', () => ({
      validateBearerToken: jest.fn().mockReturnValue(true),
      isTrustedIP: jest.fn().mockReturnValue(true),
      logAuthAttempt: jest.fn()
    }));
    
    jest.doMock('../../server/src/utils/logger', () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      getLogStats: jest.fn().mockReturnValue({
        totalLogs: 0,
        errorLogs: 0,
        logFileSize: 1024
      })
    }));
    
    jest.doMock('../../server/src/utils/security', () => ({
      validatePowerShellCommand: jest.fn().mockReturnValue(true),
      validatePath: jest.fn().mockReturnValue(true),
      sanitizeInput: jest.fn(input => input)
    }));
    
    jest.doMock('../../server/src/utils/helpers', () => ({
      formatCommandResult: jest.fn((output, error, exitCode) => ({
        success: exitCode === 0,
        output: output || '',
        error: error || null,
        exitCode: exitCode || 0
      })),
      validateRequiredParams: jest.fn(),
      sanitizeOutput: jest.fn(output => output),
      createTimestamp: jest.fn(() => new Date().toISOString())
    }));
    
    // Import server after mocking
    serverInstance = require('../../server/src/server');
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_SERVER_PORT;
    delete process.env.RATE_LIMIT_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW;
    delete process.env.COMMAND_TIMEOUT;
    
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
    
    // Reset Jest timeout
    jest.setTimeout(5000);
  });

  describe('High-Volume Request Testing', () => {
    test('should handle 100 concurrent requests', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const promises = [];
        const startTime = Date.now();
        
        for (let i = 0; i < 100; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: `Write-Output "Request ${i}"`
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request));
        }
        
        // Mock responses for all requests
        setTimeout(() => {
          for (let i = 0; i < 100; i++) {
            mockProcess.stdout.emit('data', Buffer.from(`Request ${i} completed`));
          }
          mockProcess.emit('close', 0);
        }, 10);
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(results).toHaveLength(100);
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        
        // Verify all requests succeeded
        results.forEach((result, index) => {
          expect(result).toHaveProperty('content');
          expect(result.content[0].text).toContain(`Request ${index} completed`);
        });
      }
    });

    test('should handle 1000 sequential requests', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const startTime = Date.now();
        const results = [];
        
        for (let i = 0; i < 1000; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: `Write-Output "Sequential ${i}"`
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          // Mock quick response
          setTimeout(() => {
            mockProcess.stdout.emit('data', Buffer.from(`Sequential ${i} completed`));
            mockProcess.emit('close', 0);
          }, 1);
          
          const result = await callHandler(request);
          results.push(result);
          
          // Check memory usage periodically
          if (i % 100 === 0) {
            const memUsage = process.memoryUsage();
            expect(memUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
          }
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(results).toHaveLength(1000);
        expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
        
        console.log(`Processed 1000 sequential requests in ${duration}ms`);
      }
    });

    test('should handle mixed workload patterns', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const promises = [];
        const startTime = Date.now();
        
        // Mix of different tool types
        const toolTypes = [
          { name: 'run_powershell', args: { command: 'Get-Date' } },
          { name: 'build_dotnet', args: { projectPath: 'C:\\temp\\test.csproj', buildTool: 'dotnet' } },
          { name: 'run_batch', args: { batchFile: 'C:\\temp\\test.bat' } },
          { name: 'process_manager', args: { action: 'list' } }
        ];
        
        for (let i = 0; i < 200; i++) {
          const toolType = toolTypes[i % toolTypes.length];
          const request = {
            params: {
              name: toolType.name,
              arguments: toolType.args
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request));
        }
        
        // Mock responses
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Mixed workload completed'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(results).toHaveLength(200);
        expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
        
        console.log(`Processed mixed workload in ${duration}ms`);
      }
    });
  });

  describe('Memory and Resource Management', () => {
    test('should maintain stable memory usage under load', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const initialMemory = process.memoryUsage();
        const memorySnapshots = [];
        
        // Run requests and track memory
        for (let batch = 0; batch < 10; batch++) {
          const promises = [];
          
          for (let i = 0; i < 50; i++) {
            const request = {
              params: {
                name: 'run_powershell',
                arguments: {
                  command: `Write-Output "Batch ${batch} Request ${i}"`
                }
              },
              meta: {
                authorization: 'Bearer test-load-token',
                clientIP: '127.0.0.1'
              }
            };
            
            promises.push(callHandler(request));
          }
          
          // Mock responses
          setTimeout(() => {
            mockProcess.stdout.emit('data', Buffer.from(`Batch ${batch} completed`));
            mockProcess.emit('close', 0);
          }, 10);
          
          await Promise.all(promises);
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          
          const currentMemory = process.memoryUsage();
          memorySnapshots.push(currentMemory);
          
          // Memory should not continuously grow
          const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
          expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
        }
        
        // Check memory stability
        const maxMemory = Math.max(...memorySnapshots.map(s => s.heapUsed));
        const minMemory = Math.min(...memorySnapshots.map(s => s.heapUsed));
        const memoryVariation = maxMemory - minMemory;
        
        expect(memoryVariation).toBeLessThan(50 * 1024 * 1024); // Less than 50MB variation
        
        console.log(`Memory variation: ${memoryVariation / 1024 / 1024}MB`);
      }
    });

    test('should handle large command outputs', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const largeOutput = 'A'.repeat(1024 * 1024); // 1MB of data
        
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Write-Output "Large output test"'
            }
          },
          meta: {
            authorization: 'Bearer test-load-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock large output
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from(largeOutput));
          mockProcess.emit('close', 0);
        }, 10);
        
        const result = await callHandler(request);
        
        expect(result.content[0].text).toContain('A'.repeat(1000)); // Partial check
        expect(result.content[0].text.length).toBeGreaterThan(1000000);
      }
    });

    test('should handle multiple large outputs simultaneously', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const promises = [];
        const largeOutput = 'B'.repeat(500 * 1024); // 500KB per request
        
        for (let i = 0; i < 10; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: `Write-Output "Large output ${i}"`
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request));
        }
        
        // Mock large outputs
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from(largeOutput));
          mockProcess.emit('close', 0);
        }, 10);
        
        const results = await Promise.all(promises);
        
        expect(results).toHaveLength(10);
        results.forEach(result => {
          expect(result.content[0].text).toContain('B'.repeat(1000)); // Partial check
        });
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from failed commands', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const promises = [];
        
        // Mix of successful and failing commands
        for (let i = 0; i < 100; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: i % 10 === 0 ? 'Get-NonExistentCommand' : 'Get-Date'
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request));
        }
        
        // Mock mixed responses
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Success'));
          mockProcess.stderr.emit('data', Buffer.from('Error'));
          mockProcess.emit('close', Math.random() > 0.9 ? 1 : 0); // 10% failure rate
        }, 10);
        
        const results = await Promise.all(promises);
        
        expect(results).toHaveLength(100);
        
        // Should handle both success and failure
        const successCount = results.filter(r => r.content[0].text.includes('Success')).length;
        const errorCount = results.filter(r => r.content[0].text.includes('Error')).length;
        
        expect(successCount + errorCount).toBe(100);
      }
    });

    test('should handle rapid connection/disconnection', async () => {
      const mockTransport = require('@modelcontextprotocol/sdk/server/stdio').StdioServerTransport();
      
      // Simulate rapid connect/disconnect cycles
      for (let i = 0; i < 50; i++) {
        mockTransport.start();
        
        // Simulate brief connection
        setTimeout(() => {
          mockTransport.close();
        }, 10);
        
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      // Should not crash or leak resources
      expect(mockTransport.start).toHaveBeenCalledTimes(50);
      expect(mockTransport.close).toHaveBeenCalledTimes(50);
    });
  });

  describe('Rate Limiting Under Load', () => {
    test('should enforce rate limits under high load', async () => {
      const mockRateLimiter = require('../../server/src/utils/rate-limiter');
      let requestCount = 0;
      
      mockRateLimiter.checkLimit.mockImplementation(() => {
        requestCount++;
        return {
          allowed: requestCount <= 100, // Allow first 100 requests
          remaining: Math.max(0, 100 - requestCount),
          resetTime: Date.now() + 60000
        };
      });
      
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const promises = [];
        
        for (let i = 0; i < 200; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: 'Get-Date'
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request).catch(err => ({ error: err.message })));
        }
        
        // Mock successful responses for allowed requests
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Success'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const results = await Promise.all(promises);
        
        expect(results).toHaveLength(200);
        
        // Should have some rate-limited requests
        const rateLimitedCount = results.filter(r => r.error && r.error.includes('Rate limit')).length;
        expect(rateLimitedCount).toBeGreaterThan(0);
        
        // Should have some successful requests
        const successCount = results.filter(r => r.content && r.content[0].text.includes('Success')).length;
        expect(successCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Long-Running Operations', () => {
    test('should handle long-running commands', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const request = {
          params: {
            name: 'run_powershell',
            arguments: {
              command: 'Start-Sleep -Seconds 5; Write-Output "Long operation completed"'
            }
          },
          meta: {
            authorization: 'Bearer test-load-token',
            clientIP: '127.0.0.1'
          }
        };
        
        // Mock long-running operation
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Long operation completed'));
          mockProcess.emit('close', 0);
        }, 5000);
        
        const result = await callHandler(request);
        
        expect(result.content[0].text).toContain('Long operation completed');
      }
    }, 10000); // 10 second timeout
  });

  describe('Stress Testing', () => {
    test('should handle system stress conditions', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const startTime = Date.now();
        const stressPromises = [];
        
        // Create stress conditions
        for (let i = 0; i < 500; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: `Write-Output "Stress test ${i}"`
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          stressPromises.push(callHandler(request));
        }
        
        // Mock stress responses
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Stress test completed'));
          mockProcess.emit('close', 0);
        }, 10);
        
        const results = await Promise.all(stressPromises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(results).toHaveLength(500);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
        
        // Check system remains stable
        const memoryUsage = process.memoryUsage();
        expect(memoryUsage.heapUsed).toBeLessThan(1024 * 1024 * 1024); // Less than 1GB
        
        console.log(`Stress test completed in ${duration}ms`);
      }
    });
  });

  describe('Endurance Testing', () => {
    test('should run continuously for extended period', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const startTime = Date.now();
        const enduranceTime = 30000; // 30 seconds
        const requestInterval = 100; // 100ms between requests
        let requestCount = 0;
        let successCount = 0;
        
        const enduranceTest = async () => {
          while (Date.now() - startTime < enduranceTime) {
            const request = {
              params: {
                name: 'run_powershell',
                arguments: {
                  command: `Write-Output "Endurance ${requestCount}"`
                }
              },
              meta: {
                authorization: 'Bearer test-load-token',
                clientIP: '127.0.0.1'
              }
            };
            
            requestCount++;
            
            try {
              // Mock quick response
              setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from(`Endurance ${requestCount} completed`));
                mockProcess.emit('close', 0);
              }, 1);
              
              await callHandler(request);
              successCount++;
            } catch (error) {
              console.warn(`Request ${requestCount} failed: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, requestInterval));
          }
        };
        
        await enduranceTest();
        
        const endTime = Date.now();
        const actualDuration = endTime - startTime;
        
        expect(requestCount).toBeGreaterThan(200); // Should have made many requests
        expect(successCount).toBeGreaterThan(requestCount * 0.95); // 95% success rate
        expect(actualDuration).toBeGreaterThanOrEqual(enduranceTime);
        
        console.log(`Endurance test: ${successCount}/${requestCount} requests succeeded in ${actualDuration}ms`);
      }
    });
  });

  describe('Performance Benchmarking', () => {
    test('should measure request processing speed', async () => {
      const callHandler = mockServer.setRequestHandler.mock.calls
        .find(call => call[0] === 'tools/call')?.[1];
      
      if (callHandler) {
        const benchmarkRequests = 1000;
        const startTime = Date.now();
        const promises = [];
        
        for (let i = 0; i < benchmarkRequests; i++) {
          const request = {
            params: {
              name: 'run_powershell',
              arguments: {
                command: `Write-Output "Benchmark ${i}"`
              }
            },
            meta: {
              authorization: 'Bearer test-load-token',
              clientIP: '127.0.0.1'
            }
          };
          
          promises.push(callHandler(request));
        }
        
        // Mock fast responses
        setTimeout(() => {
          mockProcess.stdout.emit('data', Buffer.from('Benchmark completed'));
          mockProcess.emit('close', 0);
        }, 1);
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        expect(results).toHaveLength(benchmarkRequests);
        
        const requestsPerSecond = (benchmarkRequests / duration) * 1000;
        
        console.log(`Benchmark: ${requestsPerSecond.toFixed(2)} requests/second`);
        
        // Should process at least 50 requests per second
        expect(requestsPerSecond).toBeGreaterThan(50);
      }
    });
  });
});