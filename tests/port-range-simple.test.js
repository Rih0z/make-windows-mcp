/**
 * Port Range Simple Tests
 * Basic validation of port range functionality
 */

describe('Port Range Configuration Tests', () => {
  let PortManager;
  
  beforeAll(() => {
    // Import PortManager
    PortManager = require('../server/src/utils/port-manager');
  });

  beforeEach(() => {
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
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
    });

    test('should parse port range correctly', () => {
      process.env.MCP_SERVER_PORT = '8080-8089';
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8089);
    });

    test('should handle port range with spaces', () => {
      process.env.MCP_SERVER_PORT = ' 8080 - 8089 ';
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8089);
    });

    test('should use default port when not specified', () => {
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
    });

    test('should handle invalid port range format gracefully', () => {
      process.env.MCP_SERVER_PORT = 'invalid-range';
      const portManager = new PortManager();
      
      expect(() => portManager.initialize()).not.toThrow();
      expect(portManager.preferredPort).toBe(8080);
    });
  });

  describe('Port Availability Testing', () => {
    test('should detect available ports correctly', async () => {
      const portManager = new PortManager();
      portManager.initialize();
      
      const availablePort = await portManager.findAvailablePort();
      expect(typeof availablePort).toBe('number');
      expect(availablePort).toBeGreaterThan(0);
      expect(availablePort).toBeLessThan(65536);
    }, 10000);

    test('should validate port availability method exists', () => {
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(typeof portManager.isPortAvailable).toBe('function');
      expect(typeof portManager.findAvailablePort).toBe('function');
    });
  });

  describe('Configuration Validation', () => {
    test('should accept valid port range configurations', () => {
      const validConfigs = [
        '8080-8089',
        '3000-3010',
        '9000-9001'
      ];

      validConfigs.forEach(config => {
        process.env.MCP_SERVER_PORT = config;
        const portManager = new PortManager();
        portManager.initialize();
        
        const [start, end] = config.split('-').map(p => parseInt(p));
        expect(portManager.portRangeStart).toBe(start);
        expect(portManager.portRangeEnd).toBe(end);
      });
    });

    test('should maintain backward compatibility with single port', () => {
      process.env.MCP_SERVER_PORT = '3000';
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(3000);
      expect(portManager.portRangeStart).toBe(3000);
    });
  });

  describe('Environment Variable Integration', () => {
    test('should prioritize environment variable over defaults', () => {
      process.env.MCP_SERVER_PORT = '9000-9009';
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(9000);
      expect(portManager.portRangeStart).toBe(9000);
      expect(portManager.portRangeEnd).toBe(9009);
    });

    test('should handle missing environment variable gracefully', () => {
      delete process.env.MCP_SERVER_PORT;
      const portManager = new PortManager();
      
      expect(() => portManager.initialize()).not.toThrow();
      expect(portManager.preferredPort).toBe(8080); // Default
    });

    test('should handle empty environment variable', () => {
      process.env.MCP_SERVER_PORT = '';
      const portManager = new PortManager();
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080); // Default
    });
  });
});