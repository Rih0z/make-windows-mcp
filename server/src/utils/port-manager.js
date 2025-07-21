/**
 * Port Manager - Automatic port detection and allocation
 * Handles port conflicts by finding available ports automatically
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

class PortManager {
  constructor() {
    this.preferredPort = null;
    this.assignedPort = null;
    this.maxAttempts = 10;
    this.portRangeStart = 8080;
    this.portRangeEnd = 8090;
    this.portInfoFile = path.join(__dirname, '..', '..', 'server-port.json');
  }
  
  /**
   * Initialize with preferred port from environment
   * Supports both single port (8080) and range (8080-8089)
   */
  initialize() {
    const portConfig = process.env.MCP_SERVER_PORT || '8080';
    
    if (portConfig.includes('-')) {
      // Range format: "8080-8089"
      const [startPort, endPort] = portConfig.split('-').map(p => parseInt(p.trim()));
      this.preferredPort = isNaN(startPort) ? 8080 : startPort;
      this.portRangeStart = isNaN(startPort) ? 8080 : startPort;
      this.portRangeEnd = isNaN(endPort) ? 8090 : endPort;
    } else {
      // Single port format: "8080"
      const parsedPort = parseInt(portConfig);
      this.preferredPort = isNaN(parsedPort) ? 8080 : parsedPort;
      this.portRangeStart = this.preferredPort;
      this.portRangeEnd = this.preferredPort + this.maxAttempts;
    }
  }
  
  /**
   * Check if a port is available
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, '0.0.0.0', () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(false);
      });
    });
  }
  
  /**
   * Find an available port starting from preferred port
   * @returns {Promise<number>} - Available port number
   */
  async findAvailablePort() {
    console.log(`🔍 Searching for available port starting from ${this.preferredPort}...`);
    
    for (let port = this.portRangeStart; port <= this.portRangeEnd; port++) {
      const available = await this.isPortAvailable(port);
      
      if (available) {
        this.assignedPort = port;
        
        if (port === this.preferredPort) {
          console.log(`✅ Using preferred port: ${port}`);
        } else {
          console.log(`⚠️  Preferred port ${this.preferredPort} in use, using fallback port: ${port}`);
        }
        
        // Save port information for client reference
        await this.savePortInfo(port);
        
        return port;
      } else {
        console.log(`❌ Port ${port} is in use, trying next...`);
      }
    }
    
    throw new Error(`No available ports found in range ${this.portRangeStart}-${this.portRangeEnd}`);
  }
  
  /**
   * Save port information to file for client reference
   * @param {number} port - Assigned port number
   */
  async savePortInfo(port) {
    const portInfo = {
      assignedPort: port,
      preferredPort: this.preferredPort,
      timestamp: new Date().toISOString(),
      serverVersion: '1.0.43',
      fallbackUsed: port !== this.preferredPort
    };
    
    try {
      await fs.promises.writeFile(
        this.portInfoFile, 
        JSON.stringify(portInfo, null, 2),
        'utf8'
      );
      console.log(`📝 Port information saved to ${this.portInfoFile}`);
    } catch (error) {
      console.warn(`⚠️  Could not save port info: ${error.message}`);
    }
  }
  
  /**
   * Get current port information
   * @returns {Object} - Port information object
   */
  getPortInfo() {
    return {
      preferredPort: this.preferredPort,
      assignedPort: this.assignedPort,
      fallbackUsed: this.assignedPort !== this.preferredPort,
      portRange: `${this.portRangeStart}-${this.portRangeEnd}`
    };
  }
  
  /**
   * Display port allocation summary
   */
  displayPortSummary() {
    const info = this.getPortInfo();
    
    console.log('\n📊 Port Allocation Summary:');
    console.log('═'.repeat(40));
    console.log(`   • Preferred Port: ${info.preferredPort}`);
    console.log(`   • Assigned Port: ${info.assignedPort}`);
    console.log(`   • Fallback Used: ${info.fallbackUsed ? '⚠️  Yes' : '✅ No'}`);
    console.log(`   • Search Range: ${info.portRange}`);
    console.log('═'.repeat(40));
    
    if (info.fallbackUsed) {
      console.log(`💡 Tip: Stop processes using port ${info.preferredPort} to use preferred port`);
    }
    
    console.log('');
  }
  
  /**
   * Read saved port information
   * @returns {Object|null} - Saved port information or null
   */
  async readSavedPortInfo() {
    try {
      const data = await fs.promises.readFile(this.portInfoFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  
  /**
   * Clean up port information file
   */
  async cleanup() {
    try {
      await fs.promises.unlink(this.portInfoFile);
      console.log('🧹 Port information file cleaned up');
    } catch {
      // File doesn't exist or can't be deleted, ignore
    }
  }
  
  /**
   * Setup graceful shutdown to cleanup port info
   */
  setupGracefulShutdown() {
    const cleanup = async () => {
      console.log('\n🔄 Shutting down server...');
      await this.cleanup();
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGQUIT', cleanup);
  }
}

// Export singleton instance
module.exports = PortManager;