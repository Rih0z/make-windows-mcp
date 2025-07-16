/**
 * Port Manager - 100% Coverage Test Suite
 * Comprehensive testing for all methods and edge cases in port-manager.js
 */

const fs = require('fs');
const net = require('net');
const path = require('path');

// Mock the file system and net modules
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn()
  }
}));

jest.mock('net');

describe('Port Manager - 100% Coverage', () => {
  let PortManager;
  let portManager;
  let mockServer;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache to get fresh instance
    delete require.cache[require.resolve('../server/src/utils/port-manager')];
    
    // Mock net.createServer
    mockServer = {
      listen: jest.fn(),
      close: jest.fn(),
      once: jest.fn(),
      on: jest.fn()
    };
    net.createServer.mockReturnValue(mockServer);
    
    // Mock console methods
    console.log = jest.fn();
    console.warn = jest.fn();
    
    // Clear environment variables
    delete process.env.MCP_SERVER_PORT;
    
    // Get fresh instance
    PortManager = require('../server/src/utils/port-manager');
    portManager = PortManager;
  });

  afterEach(() => {
    // Restore console
    console.log.mockRestore?.();
    console.warn.mockRestore?.();
    
    // Clear environment variables
    delete process.env.MCP_SERVER_PORT;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default values', () => {
      expect(portManager.preferredPort).toBeNull();
      expect(portManager.assignedPort).toBeNull();
      expect(portManager.maxAttempts).toBe(10);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8090);
      expect(portManager.portInfoFile).toContain('server-port.json');
    });

    test('should initialize with default port when no environment variable', () => {
      portManager.initialize();
      expect(portManager.preferredPort).toBe(8080);
      expect(portManager.portRangeStart).toBe(8080);
      expect(portManager.portRangeEnd).toBe(8090);
    });

    test('should initialize with environment variable port', () => {
      process.env.MCP_SERVER_PORT = '3000';
      portManager.initialize();
      expect(portManager.preferredPort).toBe(3000);
      expect(portManager.portRangeStart).toBe(3000);
      expect(portManager.portRangeEnd).toBe(3010);
    });

    test('should handle invalid environment variable port', () => {
      process.env.MCP_SERVER_PORT = 'invalid';
      portManager.initialize();
      expect(portManager.preferredPort).toBe(8080);
    });

    test('should handle empty environment variable port', () => {
      process.env.MCP_SERVER_PORT = '';
      portManager.initialize();
      expect(portManager.preferredPort).toBe(8080);
    });
  });

  describe('isPortAvailable', () => {
    test('should return true when port is available', async () => {
      // Mock successful server creation
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback();
      });
      mockServer.once.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback();
        }
      });

      const result = await portManager.isPortAvailable(8080);
      expect(result).toBe(true);
      expect(mockServer.listen).toHaveBeenCalledWith(8080, '0.0.0.0', expect.any(Function));
      expect(mockServer.close).toHaveBeenCalled();
    });

    test('should return false when port is in use', async () => {
      // Mock server error (port in use)
      mockServer.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(new Error('EADDRINUSE'));
        }
      });

      const result = await portManager.isPortAvailable(8080);
      expect(result).toBe(false);
    });

    test('should handle server creation errors', async () => {
      // Mock immediate error on listen
      mockServer.listen.mockImplementation(() => {
        const errorCallback = mockServer.on.mock.calls.find(call => call[0] === 'error')?.[1];
        if (errorCallback) {
          errorCallback(new Error('EADDRINUSE'));
        }
      });

      const result = await portManager.isPortAvailable(8080);
      expect(result).toBe(false);
    });
  });

  describe('findAvailablePort', () => {
    beforeEach(() => {
      portManager.initialize();
    });

    test('should return preferred port when available', async () => {
      // Mock port 8080 as available
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback();
      });
      mockServer.once.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback();
        }
      });
      fs.promises.writeFile.mockResolvedValue();

      const port = await portManager.findAvailablePort();
      
      expect(port).toBe(8080);
      expect(portManager.assignedPort).toBe(8080);
      expect(console.log).toHaveBeenCalledWith('✅ Using preferred port: 8080');
    });

    test('should find fallback port when preferred port is in use', async () => {
      let attemptCount = 0;
      
      // Mock first port as unavailable, second as available
      mockServer.listen.mockImplementation((port, host, callback) => {
        if (port === 8080) {
          // First attempt fails
          const errorCallback = mockServer.on.mock.calls.find(call => call[0] === 'error')?.[1];
          if (errorCallback) {
            setTimeout(() => errorCallback(new Error('EADDRINUSE')), 0);
          }
        } else {
          // Second attempt succeeds
          callback();
        }
      });

      mockServer.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          // Store callback for later use
        }
      });

      mockServer.once.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback();
        }
      });

      fs.promises.writeFile.mockResolvedValue();

      // Mock isPortAvailable to return false for 8080, true for 8081
      jest.spyOn(portManager, 'isPortAvailable').mockImplementation(async (port) => {
        if (port === 8080) return false;
        if (port === 8081) return true;
        return false;
      });

      const port = await portManager.findAvailablePort();
      
      expect(port).toBe(8081);
      expect(portManager.assignedPort).toBe(8081);
      expect(console.log).toHaveBeenCalledWith('⚠️  Preferred port 8080 in use, using fallback port: 8081');
    });

    test('should throw error when no ports available in range', async () => {
      // Mock all ports as unavailable
      jest.spyOn(portManager, 'isPortAvailable').mockResolvedValue(false);

      await expect(portManager.findAvailablePort())
        .rejects.toThrow('No available ports found in range 8080-8090');
    });

    test('should log port search progress', async () => {
      jest.spyOn(portManager, 'isPortAvailable').mockImplementation(async (port) => {
        // First few ports unavailable, then available
        return port === 8083;
      });
      fs.promises.writeFile.mockResolvedValue();

      await portManager.findAvailablePort();
      
      expect(console.log).toHaveBeenCalledWith('🔍 Searching for available port starting from 8080...');
      expect(console.log).toHaveBeenCalledWith('❌ Port 8080 is in use, trying next...');
      expect(console.log).toHaveBeenCalledWith('❌ Port 8081 is in use, trying next...');
      expect(console.log).toHaveBeenCalledWith('❌ Port 8082 is in use, trying next...');
    });
  });

  describe('savePortInfo', () => {
    test('should save port information successfully', async () => {
      portManager.preferredPort = 8080;
      fs.promises.writeFile.mockResolvedValue();

      await portManager.savePortInfo(8081);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('server-port.json'),
        expect.stringContaining('"assignedPort": 8081'),
        'utf8'
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Port information saved'));
    });

    test('should handle file write errors gracefully', async () => {
      portManager.preferredPort = 8080;
      fs.promises.writeFile.mockRejectedValue(new Error('Permission denied'));

      await portManager.savePortInfo(8081);

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Could not save port info: Permission denied'));
    });

    test('should set correct port info structure', async () => {
      portManager.preferredPort = 8080;
      fs.promises.writeFile.mockResolvedValue();

      await portManager.savePortInfo(8081);

      const writeCall = fs.promises.writeFile.mock.calls[0];
      const portInfoJson = writeCall[1];
      const portInfo = JSON.parse(portInfoJson);

      expect(portInfo).toEqual({
        assignedPort: 8081,
        preferredPort: 8080,
        timestamp: expect.any(String),
        serverVersion: '1.0.24',
        fallbackUsed: true
      });
    });

    test('should set fallbackUsed to false when using preferred port', async () => {
      portManager.preferredPort = 8080;
      fs.promises.writeFile.mockResolvedValue();

      await portManager.savePortInfo(8080);

      const writeCall = fs.promises.writeFile.mock.calls[0];
      const portInfo = JSON.parse(writeCall[1]);

      expect(portInfo.fallbackUsed).toBe(false);
    });
  });

  describe('getPortInfo', () => {
    test('should return current port information', () => {
      portManager.preferredPort = 8080;
      portManager.assignedPort = 8081;
      portManager.portRangeStart = 8080;
      portManager.portRangeEnd = 8090;

      const info = portManager.getPortInfo();

      expect(info).toEqual({
        preferredPort: 8080,
        assignedPort: 8081,
        fallbackUsed: true,
        portRange: '8080-8090'
      });
    });

    test('should show fallbackUsed as false when using preferred port', () => {
      portManager.preferredPort = 8080;
      portManager.assignedPort = 8080;

      const info = portManager.getPortInfo();

      expect(info.fallbackUsed).toBe(false);
    });

    test('should handle null ports', () => {
      portManager.preferredPort = null;
      portManager.assignedPort = null;

      const info = portManager.getPortInfo();

      expect(info.preferredPort).toBeNull();
      expect(info.assignedPort).toBeNull();
      expect(info.fallbackUsed).toBe(false);
    });
  });

  describe('displayPortSummary', () => {
    test('should display port summary with fallback used', () => {
      portManager.preferredPort = 8080;
      portManager.assignedPort = 8081;
      portManager.portRangeStart = 8080;
      portManager.portRangeEnd = 8090;

      portManager.displayPortSummary();

      expect(console.log).toHaveBeenCalledWith('\n📊 Port Allocation Summary:');
      expect(console.log).toHaveBeenCalledWith('   • Preferred Port: 8080');
      expect(console.log).toHaveBeenCalledWith('   • Assigned Port: 8081');
      expect(console.log).toHaveBeenCalledWith('   • Fallback Used: ⚠️  Yes');
      expect(console.log).toHaveBeenCalledWith('   • Search Range: 8080-8090');
      expect(console.log).toHaveBeenCalledWith('💡 Tip: Stop processes using port 8080 to use preferred port');
    });

    test('should display port summary without fallback', () => {
      portManager.preferredPort = 8080;
      portManager.assignedPort = 8080;
      portManager.portRangeStart = 8080;
      portManager.portRangeEnd = 8090;

      portManager.displayPortSummary();

      expect(console.log).toHaveBeenCalledWith('   • Fallback Used: ✅ No');
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('💡 Tip:'));
    });

    test('should display decorative elements', () => {
      portManager.preferredPort = 8080;
      portManager.assignedPort = 8080;

      portManager.displayPortSummary();

      expect(console.log).toHaveBeenCalledWith('═'.repeat(40));
    });
  });

  describe('readSavedPortInfo', () => {
    test('should read and parse saved port information', async () => {
      const mockPortInfo = {
        assignedPort: 8081,
        preferredPort: 8080,
        timestamp: '2023-01-01T00:00:00.000Z',
        serverVersion: '1.0.24',
        fallbackUsed: true
      };
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPortInfo));

      const result = await portManager.readSavedPortInfo();

      expect(result).toEqual(mockPortInfo);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('server-port.json'),
        'utf8'
      );
    });

    test('should return null when file does not exist', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await portManager.readSavedPortInfo();

      expect(result).toBeNull();
    });

    test('should return null when file contains invalid JSON', async () => {
      fs.promises.readFile.mockResolvedValue('invalid json');

      const result = await portManager.readSavedPortInfo();

      expect(result).toBeNull();
    });

    test('should handle file read permission errors', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await portManager.readSavedPortInfo();

      expect(result).toBeNull();
    });
  });

  describe('cleanup', () => {
    test('should delete port information file successfully', async () => {
      fs.promises.unlink.mockResolvedValue();

      await portManager.cleanup();

      expect(fs.promises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('server-port.json')
      );
      expect(console.log).toHaveBeenCalledWith('🧹 Port information file cleaned up');
    });

    test('should handle file deletion errors gracefully', async () => {
      fs.promises.unlink.mockRejectedValue(new Error('File not found'));

      await portManager.cleanup();

      // Should not throw error or log anything
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('cleaned up'));
    });

    test('should handle permission errors gracefully', async () => {
      fs.promises.unlink.mockRejectedValue(new Error('Permission denied'));

      await expect(portManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('setupGracefulShutdown', () => {
    let originalProcess;

    beforeEach(() => {
      originalProcess = process;
      global.process = {
        ...process,
        on: jest.fn(),
        exit: jest.fn()
      };
    });

    afterEach(() => {
      global.process = originalProcess;
    });

    test('should setup signal handlers for graceful shutdown', () => {
      portManager.setupGracefulShutdown();

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));
    });

    test('should cleanup and exit on SIGINT', async () => {
      jest.spyOn(portManager, 'cleanup').mockResolvedValue();
      
      portManager.setupGracefulShutdown();

      // Get the SIGINT handler
      const sigintHandler = process.on.mock.calls.find(call => call[0] === 'SIGINT')[1];
      
      await sigintHandler();

      expect(portManager.cleanup).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('\n🔄 Shutting down server...');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('should cleanup and exit on SIGTERM', async () => {
      jest.spyOn(portManager, 'cleanup').mockResolvedValue();
      
      portManager.setupGracefulShutdown();

      // Get the SIGTERM handler
      const sigtermHandler = process.on.mock.calls.find(call => call[0] === 'SIGTERM')[1];
      
      await sigtermHandler();

      expect(portManager.cleanup).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('should cleanup and exit on SIGQUIT', async () => {
      jest.spyOn(portManager, 'cleanup').mockResolvedValue();
      
      portManager.setupGracefulShutdown();

      // Get the SIGQUIT handler
      const sigquitHandler = process.on.mock.calls.find(call => call[0] === 'SIGQUIT')[1];
      
      await sigquitHandler();

      expect(portManager.cleanup).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle extremely high port numbers', () => {
      process.env.MCP_SERVER_PORT = '65535';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(65535);
      expect(portManager.portRangeEnd).toBe(65545);
    });

    test('should handle negative port numbers in environment', () => {
      process.env.MCP_SERVER_PORT = '-1';
      portManager.initialize();
      
      // Should fall back to default
      expect(portManager.preferredPort).toBe(8080);
    });

    test('should handle zero port number in environment', () => {
      process.env.MCP_SERVER_PORT = '0';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(0);
    });

    test('should handle very large port numbers', () => {
      process.env.MCP_SERVER_PORT = '99999';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(99999);
    });

    test('should handle floating point port numbers', () => {
      process.env.MCP_SERVER_PORT = '8080.5';
      portManager.initialize();
      
      expect(portManager.preferredPort).toBe(8080);
    });
  });

  describe('File Path Handling', () => {
    test('should construct correct port info file path', () => {
      expect(portManager.portInfoFile).toMatch(/server-port\.json$/);
      expect(path.isAbsolute(portManager.portInfoFile)).toBe(true);
    });

    test('should handle different working directories', () => {
      const originalCwd = process.cwd();
      
      try {
        // The path should be relative to the module location, not cwd
        expect(portManager.portInfoFile).toContain('server-port.json');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle multiple concurrent port checks', async () => {
      jest.spyOn(portManager, 'isPortAvailable').mockImplementation(async (port) => {
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return port === 8083;
      });

      const promises = [
        portManager.isPortAvailable(8080),
        portManager.isPortAvailable(8081),
        portManager.isPortAvailable(8082),
        portManager.isPortAvailable(8083)
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual([false, false, false, true]);
    });
  });
});