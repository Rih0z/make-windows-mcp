/**
 * MCP Server Discovery - Automatic server detection and connection
 * No manual port configuration required!
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class ServerDiscovery {
  constructor(vmIP, authToken) {
    this.vmIP = vmIP;
    this.authToken = authToken;
    this.commonPorts = [8081, 8080, 8082, 8083, 8084, 8085];
    this.timeout = 3000; // 3 seconds per port
  }

  /**
   * Test if a specific port has an MCP server
   * @param {number} port - Port to test
   * @returns {Promise<Object>} - Server info or null
   */
  async testPort(port) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, this.timeout);

      // Test health endpoint first (faster)
      const healthReq = http.request({
        hostname: this.vmIP,
        port: port,
        path: '/health',
        method: 'GET',
        timeout: this.timeout
      }, (res) => {
        clearTimeout(timeout);
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            if (health.status === 'ok') {
              // Test MCP endpoint
              this.testMCPEndpoint(port).then(mcpInfo => {
                resolve({
                  port,
                  health,
                  mcp: mcpInfo,
                  url: `http://${this.vmIP}:${port}`
                });
              }).catch(() => {
                resolve({
                  port,
                  health,
                  mcp: null,
                  url: `http://${this.vmIP}:${port}`
                });
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      healthReq.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      healthReq.on('timeout', () => {
        clearTimeout(timeout);
        healthReq.destroy();
        resolve(null);
      });

      healthReq.end();
    });
  }

  /**
   * Test MCP endpoint specifically
   * @param {number} port - Port to test
   * @returns {Promise<Object>} - MCP server info
   */
  async testMCPEndpoint(port) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'discovery-client', version: '1.0' }
        },
        id: 1
      });

      const req = http.request({
        hostname: this.vmIP,
        port: port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.result && response.result.serverInfo) {
              resolve(response.result.serverInfo);
            } else {
              reject(new Error('Invalid MCP response'));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Discover all available MCP servers
   * @returns {Promise<Array>} - Array of discovered servers
   */
  async discoverServers() {
    console.log(`🔍 Discovering MCP servers on ${this.vmIP}...`);
    console.log(`📡 Scanning ports: ${this.commonPorts.join(', ')}`);
    
    const promises = this.commonPorts.map(port => this.testPort(port));
    const results = await Promise.all(promises);
    
    const servers = results.filter(result => result !== null);
    
    if (servers.length === 0) {
      console.log('❌ No MCP servers found');
      return [];
    }
    
    // Sort by preference (8081 first, then 8080, etc.)
    servers.sort((a, b) => {
      const preferenceOrder = [8081, 8080, 8082, 8083, 8084, 8085];
      return preferenceOrder.indexOf(a.port) - preferenceOrder.indexOf(b.port);
    });
    
    return servers;
  }

  /**
   * Get the best server to connect to
   * @returns {Promise<Object>} - Best server info
   */
  async getBestServer() {
    const servers = await this.discoverServers();
    
    if (servers.length === 0) {
      throw new Error('No MCP servers found. Please start a server first.');
    }

    const bestServer = servers[0];
    
    console.log(`\n✅ Found ${servers.length} MCP server(s):`);
    servers.forEach((server, index) => {
      const badge = index === 0 ? '👑 SELECTED' : '  ';
      const mcpInfo = server.mcp ? `v${server.mcp.version}` : 'Unknown';
      console.log(`${badge} Port ${server.port}: ${mcpInfo}`);
    });
    
    if (servers.length > 1) {
      console.log(`\n💡 Using port ${bestServer.port} (highest priority)`);
    }
    
    return bestServer;
  }

  /**
   * Read saved port info if available
   * @returns {Object|null} - Saved port info
   */
  readSavedPortInfo() {
    try {
      const portInfoPath = path.join(__dirname, '..', '..', 'server', 'server-port.json');
      const portInfo = JSON.parse(fs.readFileSync(portInfoPath, 'utf8'));
      
      if (portInfo.assignedPort) {
        console.log(`📋 Found saved port info: ${portInfo.assignedPort}`);
        return portInfo;
      }
    } catch {
      // File doesn't exist or is invalid
    }
    return null;
  }

  /**
   * Smart connection with fallback
   * @returns {Promise<Object>} - Connection info
   */
  async smartConnect() {
    console.log('🚀 Smart MCP Server Connection Starting...\n');
    
    // Try saved port info first
    const savedInfo = this.readSavedPortInfo();
    if (savedInfo) {
      console.log(`🎯 Trying saved port ${savedInfo.assignedPort}...`);
      
      try {
        const serverInfo = await this.testPort(savedInfo.assignedPort);
        if (serverInfo && serverInfo.mcp) {
          console.log(`✅ Connected to saved server on port ${savedInfo.assignedPort}`);
          return {
            port: savedInfo.assignedPort,
            url: `http://${this.vmIP}:${savedInfo.assignedPort}/mcp`,
            serverInfo: serverInfo.mcp,
            source: 'saved'
          };
        }
      } catch {
        console.log(`⚠️  Saved port ${savedInfo.assignedPort} not responding`);
      }
    }
    
    // Fall back to discovery
    console.log('🔍 Performing full server discovery...');
    const bestServer = await this.getBestServer();
    
    return {
      port: bestServer.port,
      url: `http://${this.vmIP}:${bestServer.port}/mcp`,
      serverInfo: bestServer.mcp,
      source: 'discovery'
    };
  }
}

module.exports = ServerDiscovery;