#!/usr/bin/env node

/**
 * Test client for Windows MCP Server
 * This script connects to the Windows VM and tests the MCP functionality
 * 
 * Usage: node test-client.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Load test environment
const testEnvPath = path.join(__dirname, 'test.env');
if (fs.existsSync(testEnvPath)) {
  const envContent = fs.readFileSync(testEnvPath, 'utf8');
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

const config = {
  host: process.env.WINDOWS_VM_IP || '100.71.150.41',
  port: process.env.MCP_PORT || 3000,
  authToken: process.env.MCP_AUTH_TOKEN || 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd',
  timeout: parseInt(process.env.TEST_TIMEOUT) || 30000
};

console.log(`🔗 Connecting to Windows MCP Server at ${config.host}:${config.port}`);
console.log('🔑 Using authentication token:', config.authToken.slice(0, 8) + '...');

class MCPTestClient {
  constructor(config) {
    this.config = config;
    this.testResults = [];
  }

  async makeRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        method,
        params
      });

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${this.config.authToken}`
        },
        timeout: this.config.timeout
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({ status: res.statusCode, body: response });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  async runTest(name, testFunction) {
    console.log(`\n🧪 Running test: ${name}`);
    try {
      const result = await testFunction();
      console.log(`✅ ${name}: PASSED`);
      this.testResults.push({ name, status: 'PASSED', result });
      return result;
    } catch (error) {
      console.log(`❌ ${name}: FAILED - ${error.message}`);
      this.testResults.push({ name, status: 'FAILED', error: error.message });
      throw error;
    }
  }

  async testConnection() {
    return this.runTest('Connection Test', async () => {
      const response = await this.makeRequest('tools/list');
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
      }
      return `Connected successfully. Found ${response.body.tools?.length || 0} tools.`;
    });
  }

  async testToolsList() {
    return this.runTest('Tools List', async () => {
      const response = await this.makeRequest('tools/list');
      const tools = response.body.tools;
      const expectedTools = ['build_dotnet', 'run_powershell', 'ping_host', 'ssh_command', 'run_batch', 'mcp_self_build', 'process_manager', 'file_sync'];
      
      const foundTools = tools.map(t => t.name);
      const missingTools = expectedTools.filter(tool => !foundTools.includes(tool));
      
      if (missingTools.length > 0) {
        throw new Error(`Missing tools: ${missingTools.join(', ')}`);
      }
      
      return `All 8 expected tools found: ${foundTools.join(', ')}`;
    });
  }

  async testNewTools() {
    return this.runTest('New Tools (v1.0.6)', async () => {
      // Test mcp_self_build status
      const statusResponse = await this.makeRequest('tools/call', {
        name: 'mcp_self_build',
        arguments: { action: 'status' }
      });
      
      if (statusResponse.status !== 200) {
        throw new Error(`mcp_self_build failed: ${JSON.stringify(statusResponse.body)}`);
      }

      // Test process_manager list
      const processResponse = await this.makeRequest('tools/call', {
        name: 'process_manager',
        arguments: { action: 'list' }
      });
      
      if (processResponse.status !== 200) {
        throw new Error(`process_manager failed: ${JSON.stringify(processResponse.body)}`);
      }

      return 'New tools (mcp_self_build, process_manager) are working correctly';
    });
  }

  async testPowerShell() {
    return this.runTest('PowerShell Command', async () => {
      const response = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'echo "MCP Test Successful"' }
      });
      
      if (response.status !== 200) {
        throw new Error(`PowerShell test failed: ${JSON.stringify(response.body)}`);
      }
      
      const output = response.body.content[0].text;
      if (!output.includes('MCP Test Successful')) {
        throw new Error(`Unexpected output: ${output}`);
      }
      
      return 'PowerShell command executed successfully';
    });
  }

  async testDangerousMode() {
    return this.runTest('Dangerous Mode Check', async () => {
      // Try to run a command that should only work in dangerous mode
      const response = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-Process | Select-Object -First 5' }
      });
      
      if (response.status === 200) {
        return 'Dangerous mode is enabled - full functionality available';
      } else {
        return 'Normal mode active - security restrictions in place';
      }
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Windows MCP Server Test Suite');
    console.log('=' .repeat(50));

    const tests = [
      () => this.testConnection(),
      () => this.testToolsList(),
      () => this.testPowerShell(),
      () => this.testNewTools(),
      () => this.testDangerousMode()
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test();
        passed++;
      } catch (error) {
        failed++;
        // Continue with other tests
      }
    }

    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Summary:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed! MCP Server is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the output above for details.');
    }

    return { passed, failed, results: this.testResults };
  }
}

// Main execution
async function main() {
  try {
    const client = new MCPTestClient(config);
    const results = await client.runAllTests();
    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = MCPTestClient;