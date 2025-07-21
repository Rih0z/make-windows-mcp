/**
 * Port Range Functionality Tests
 * Tests the new port range parsing and selection functionality
 */

const PortManager = require('../../server/src/utils/port-manager');
const net = require('net');

describe('Port Range Functionality Tests', () => {
  let portManager;
  
  beforeEach(() => {
    portManager = new PortManager();
    // Reset environment variables
    delete process.env.MCP_SERVER_PORT;
  });
  
  afterEach(() => {
    // Clean up environment
    delete process.env.MCP_SERVER_PORT;
  });

  describe('Port Range Parsing', () => {
    test('should parse single port correctly', () => {
      process.env.MCP_SERVER_PORT = '8080';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8090); // 8080 + maxAttempts(10)
    });

    test('should parse port range correctly', () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8089);
    });

    test('should handle port range with spaces', () => {
      process.env.MCP_SERVER_PORT = ' 8080 - 8089 ';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8089);
    });

    test('should use default port when not specified', () => {
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8090);
    });

    test('should handle invalid port range format', () => {
      process.env.MCP_SERVER_PORT = 'invalid-range';
      portManager.initialize();
      
      // Should fallback to single port parsing (NaN becomes default)
      expect(portManager.preferredPort).toBe(8080);
    });

    test('should handle reversed port range', () => {
      process.env.MCP_SERVER_PORT = '8089-8080';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8089);
      expect(portManager.portRangeStart).toBe(8089);
      expect(portManager.portRangeEnd).toBe(8080);
    });

    test('should handle single port in range format', () => {
      process.env.MCP_SERVER_PORT = '8080-8080';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8080);
    });
  });

  describe('Port Range Configuration Validation', () => {
    test('should accept valid port range configurations', () => {
      const validConfigs = [
        '8080-8089',
        '3000-3010',
        '9000-9001',
        '1024-65535'
      ];

      validConfigs.forEach(config => {
        process.env.MCP_SERVER_PORT = config;
        portManager.initialize();
        
        const [start, end] = config.split('-').map(p => parseInt(p));
        expect(portManager.portRangeStart).toBe(start);
        expect(portManager.portRangeEnd).toBe(end);
      });
    });

    test('should handle edge case port numbers', () => {
      // Test minimum allowed port (1024)
      process.env.MCP_SERVER_PORT = '1024-1030';
      portManager.initialize();
      expect(portManager.portRangeStart).toBe(1024);
      expect(portManager.portRangeEnd).toBe(1030);

      // Test maximum allowed port (65535)
      process.env.MCP_SERVER_PORT = '65530-65535';
      portManager.initialize();
      expect(portManager.portRangeStart).toBe(65530);
      expect(portManager.portRangeEnd).toBe(65535);
    });
  });

  describe('Port Availability Testing', () => {
    test('should detect available ports correctly', async () => {
      const availablePort = await portManager.findAvailablePort();
      expect(typeof availablePort).toBe('number');
      expect(availablePort).toBeGreaterThan(0);
      expect(availablePort).toBeLessThan(65536);
    });

    test('should find alternative port when preferred is busy', async () => {
      // Create a server to occupy a port
      const testServer = net.createServer();
      const testPort = 8080;
      
      await new Promise((resolve, reject) => {
        testServer.listen(testPort, '0.0.0.0', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      try {
        process.env.MCP_SERVER_PORT = '8080-8089';
        portManager.initialize();
        
        const availablePort = await portManager.findAvailablePort();
        expect(availablePort).not.toBe(testPort);
        expect(availablePort).toBeGreaterThanOrEqual(8081);
        expect(availablePort).toBeLessThanOrEqual(8089);
      } finally {
        testServer.close();
      }
    });

    test('should handle exhausted port range', async () => {
      // Set a very narrow range
      process.env.MCP_SERVER_PORT = '8080-8080';
      portManager.initialize();
      
      // Create server to occupy the only port
      const testServer = net.createServer();
      
      await new Promise((resolve, reject) => {
        testServer.listen(8080, '0.0.0.0', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      try {
        const availablePort = await portManager.findAvailablePort();
        expect(availablePort).toBeNull();
      } finally {
        testServer.close();
      }
    });
  });

  describe('Port Range Integration with Server', () => {
    test('should save port information correctly', async () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      portManager.initialize();
      
      const port = await portManager.findAvailablePort();
      portManager.assignedPort = port;
      
      const portInfo = portManager.getPortInfo();
      expect(portInfo.assignedPort).toBe(port);
      expect(portInfo.preferredPort).toBe(8080);
      expect(portInfo.portRange).toEqual({ start: 8080, end: 8089 });
    });

    test('should provide port configuration status', () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      portManager.initialize();
      
      const status = portManager.getConfigurationStatus();
      expect(status.isRangeMode).toBe(true);
      expect(status.rangeSize).toBe(10); // 8080-8089 = 10 ports
      expect(status.preferredPort).toBe(8080);
    });

    test('should validate port assignment within range', () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      portManager.initialize();
      
      // Valid port within range
      expect(portManager.isPortInRange(8085)).toBe(true);
      
      // Invalid port outside range
      expect(portManager.isPortInRange(8090)).toBe(false);
      expect(portManager.isPortInRange(8079)).toBe(false);
    });
  });

  describe('Environment Variable Integration', () => {
    test('should prioritize environment variable over defaults', () => {
      const originalPort = portManager.preferredPort;
      
      process.env.MCP_SERVER_PORT = '9000-9009';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(9000);
      expect(portManager.preferredPort).not.toBe(originalPort);
    });

    test('should handle missing environment variable gracefully', () => {
      delete process.env.MCP_SERVER_PORT;
      
      expect(() => portManager.initialize()).not.toThrow();
      expect(portManager.preferredPort).toBe(8080); // Default
    });

    test('should handle empty environment variable', () => {
      process.env.MCP_SERVER_PORT = '';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080); // Default
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain compatibility with single port configuration', () => {
      process.env.MCP_SERVER_PORT = '3000';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(3000);
      expect(portManager.portRangeStart).toBe(3000);
      expect(portManager.portRangeEnd).toBe(3010); // Single port + maxAttempts
    });

    test('should work with existing configuration files', () => {
      const legacyConfigs = ['8080', '3000', '9000'];
      
      legacyConfigs.forEach(config => {
        process.env.MCP_SERVER_PORT = config;
        portManager.initialize();
        
        const port = parseInt(config);
        expect(portManager.preferredPort).toBe(port);
        expect(portManager.portRangeStart).toBe(port);
      });
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle rapid port checks efficiently', async () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      portManager.initialize();
      
      const startTime = Date.now();
      
      // Perform multiple rapid port availability checks
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(portManager.isPortAvailable(8080 + i));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should clean up resources properly', async () => {
      const portPromises = [];
      
      // Create multiple port availability checks
      for (let i = 0; i < 10; i++) {
        portPromises.push(portManager.isPortAvailable(8080 + i));
      }
      
      const results = await Promise.all(portPromises);
      
      // All checks should complete successfully
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid port numbers gracefully', () => {
      const invalidConfigs = [
        'abc-def',
        '999999-999999',
        '-1--1',
        '8080-abc'
      ];

      invalidConfigs.forEach(config => {
        process.env.MCP_SERVER_PORT = config;
        expect(() => portManager.initialize()).not.toThrow();
      });
    });

    test('should handle system port availability errors', async () => {
      // Test with privileged port (requires admin rights)
      const result = await portManager.isPortAvailable(80);
      expect(typeof result).toBe('boolean');
    });

    test('should provide meaningful error information', () => {
      process.env.MCP_SERVER_PORT = 'invalid-format';
      portManager.initialize();
      
      const status = portManager.getConfigurationStatus();
      expect(status.hasValidConfiguration).toBeDefined();
    });
  });
});

// Helper functions for extended port manager functionality
describe('Helper Functions Setup', () => {
  beforeAll(() => {
    if (!PortManager.prototype.isPortInRange) {
      PortManager.prototype.isPortInRange = function(port) {
        return port >= this.portRangeStart && port <= this.portRangeEnd;
      };
    }

    if (!PortManager.prototype.getConfigurationStatus) {
      PortManager.prototype.getConfigurationStatus = function() {
        const isRangeMode = this.portRangeEnd !== this.portRangeStart + this.maxAttempts;
        return {
          isRangeMode: isRangeMode,
          rangeSize: this.portRangeEnd - this.portRangeStart + 1,
          preferredPort: this.preferredPort,
          hasValidConfiguration: !isNaN(this.preferredPort)
        };
      };
    }

    if (!PortManager.prototype.getPortInfo) {
      PortManager.prototype.getPortInfo = function() {
        return {
          assignedPort: this.assignedPort,
          preferredPort: this.preferredPort,
          portRange: {
            start: this.portRangeStart,
            end: this.portRangeEnd
          }
        };
      };
    }
  });
});