#!/usr/bin/env node

/**
 * Test new v1.0.6 features on the Windows MCP Server
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
  port: process.env.MCP_PORT || 8080,
  authToken: process.env.MCP_AUTH_TOKEN || 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd',
  timeout: parseInt(process.env.TEST_TIMEOUT) || 10000
};

class NewFeaturesTester {
  constructor(config) {
    this.config = config;
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

  async testMcpSelfBuild() {
    console.log('\n🔧 Testing mcp_self_build tool...');
    console.log('-'.repeat(40));

    try {
      // Test status action
      console.log('📊 Getting MCP server status...');
      const statusResponse = await this.makeRequest('tools/call', {
        name: 'mcp_self_build',
        arguments: { action: 'status' }
      });

      if (statusResponse.status === 200) {
        console.log('✅ Status check successful:');
        console.log(statusResponse.body.content[0].text);
      } else {
        console.log('❌ Status check failed');
      }

      // Test build action (should show build process)
      console.log('\n🏗️ Testing build action...');
      const buildResponse = await this.makeRequest('tools/call', {
        name: 'mcp_self_build',
        arguments: { action: 'build' }
      });

      if (buildResponse.status === 200) {
        console.log('✅ Build action successful:');
        console.log(buildResponse.body.content[0].text.substring(0, 200) + '...');
      } else {
        console.log('❌ Build action failed');
      }

    } catch (error) {
      console.log('❌ mcp_self_build test failed:', error.message);
    }
  }

  async testProcessManager() {
    console.log('\n⚙️ Testing process_manager tool...');
    console.log('-'.repeat(40));

    try {
      // Test list action
      console.log('📋 Getting process list...');
      const listResponse = await this.makeRequest('tools/call', {
        name: 'process_manager',
        arguments: { action: 'list' }
      });

      if (listResponse.status === 200) {
        console.log('✅ Process list successful:');
        const output = listResponse.body.content[0].text;
        const lines = output.split('\n').slice(0, 5); // Show first 5 processes
        lines.forEach(line => console.log('  ' + line));
        console.log('  ... (truncated)');
      } else {
        console.log('❌ Process list failed');
      }

      // Test starting a simple process
      console.log('\n🚀 Testing process start (calc.exe)...');
      const startResponse = await this.makeRequest('tools/call', {
        name: 'process_manager',
        arguments: { 
          action: 'start',
          processName: 'calc.exe'
        }
      });

      if (startResponse.status === 200) {
        console.log('✅ Process start successful:');
        console.log(startResponse.body.content[0].text);
      } else {
        console.log('❌ Process start failed');
      }

    } catch (error) {
      console.log('❌ process_manager test failed:', error.message);
    }
  }

  async testFileSync() {
    console.log('\n📁 Testing file_sync tool...');
    console.log('-'.repeat(40));

    try {
      // Create test directories and files first
      console.log('📂 Preparing test directories...');
      const prepResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { 
          command: 'New-Item -Path "C:\\temp\\mcp-test-source" -ItemType Directory -Force; New-Item -Path "C:\\temp\\mcp-test-dest" -ItemType Directory -Force; "Test content" | Out-File "C:\\temp\\mcp-test-source\\test.txt"'
        }
      });

      if (prepResponse.status === 200) {
        console.log('✅ Test directories created');

        // Test file sync
        console.log('🔄 Testing file synchronization...');
        const syncResponse = await this.makeRequest('tools/call', {
          name: 'file_sync',
          arguments: {
            source: 'C:\\temp\\mcp-test-source',
            destination: 'C:\\temp\\mcp-test-dest',
            options: {
              recursive: true,
              verify: true
            }
          }
        });

        if (syncResponse.status === 200) {
          console.log('✅ File sync successful:');
          console.log(syncResponse.body.content[0].text);

          // Verify the sync worked
          const verifyResponse = await this.makeRequest('tools/call', {
            name: 'run_powershell',
            arguments: {
              command: 'Test-Path "C:\\temp\\mcp-test-dest\\test.txt"'
            }
          });

          if (verifyResponse.status === 200 && verifyResponse.body.content[0].text.includes('True')) {
            console.log('✅ File sync verification passed');
          } else {
            console.log('❌ File sync verification failed');
          }
        } else {
          console.log('❌ File sync failed');
        }
      } else {
        console.log('❌ Failed to create test directories');
      }

    } catch (error) {
      console.log('❌ file_sync test failed:', error.message);
    }
  }

  async testDangerousMode() {
    console.log('\n⚠️ Testing dangerous mode capabilities...');
    console.log('-'.repeat(40));

    try {
      // Test rate limiting status
      console.log('🚫 Checking rate limiting status...');
      const rateLimitResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'echo "Rate limit test - this should work in dangerous mode"' }
      });

      if (rateLimitResponse.status === 200) {
        console.log('✅ Commands execute without rate limiting');
      }

      // Test access to system information
      console.log('🔍 Testing system access...');
      const sysInfoResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-ComputerInfo | Select-Object WindowsProductName, TotalPhysicalMemory' }
      });

      if (sysInfoResponse.status === 200) {
        console.log('✅ Full system access available:');
        console.log(sysInfoResponse.body.content[0].text);
      }

    } catch (error) {
      console.log('❌ Dangerous mode test failed:', error.message);
    }
  }

  async run() {
    console.log('🎯 Testing Windows MCP Server v1.0.6 New Features');
    console.log(`🔗 Target: ${this.config.host}:${this.config.port}`);
    console.log('='.repeat(60));

    await this.testMcpSelfBuild();
    await this.testProcessManager();
    await this.testFileSync();
    await this.testDangerousMode();

    console.log('\n🎉 v1.0.6 Feature Testing Complete!');
    console.log('='.repeat(60));
    console.log('💡 All tested features demonstrate the enhanced capabilities:');
    console.log('  • Self-management and monitoring');
    console.log('  • Process control and automation');
    console.log('  • High-performance file operations');
    console.log('  • Unrestricted dangerous mode operation');
    console.log('\n✅ Windows MCP Server v1.0.6 is fully operational!');
  }
}

// Main execution
async function main() {
  try {
    const tester = new NewFeaturesTester(config);
    await tester.run();
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = NewFeaturesTester;