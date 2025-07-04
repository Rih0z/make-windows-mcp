#!/usr/bin/env node

/**
 * Detailed test client for Windows MCP Server
 * This script provides comprehensive testing and server information
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
  timeout: parseInt(process.env.TEST_TIMEOUT) || 5000
};

class DetailedMCPClient {
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

  async getServerInfo() {
    console.log('🔍 Gathering Server Information...');
    console.log('=' .repeat(50));

    try {
      // Get tools list
      const toolsResponse = await this.makeRequest('tools/list');
      if (toolsResponse.status === 200) {
        const tools = toolsResponse.body.tools;
        console.log(`📋 Available Tools (${tools.length}):`);
        tools.forEach((tool, index) => {
          console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
        });
      }

      // Test PowerShell version command
      console.log('\n🔧 System Information:');
      const psVersionResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: '$PSVersionTable.PSVersion' }
      });
      
      if (psVersionResponse.status === 200) {
        console.log('  PowerShell Version:', psVersionResponse.body.content[0].text.trim());
      }

      // Test .NET version
      const dotnetResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'dotnet --version' }
      });
      
      if (dotnetResponse.status === 200) {
        console.log('  .NET Version:', dotnetResponse.body.content[0].text.trim());
      }

      // Test hostname
      const hostnameResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'hostname' }
      });
      
      if (hostnameResponse.status === 200) {
        console.log('  Hostname:', hostnameResponse.body.content[0].text.trim());
      }

      // Test Windows version
      const winVersionResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: '(Get-CimInstance Win32_OperatingSystem).Caption' }
      });
      
      if (winVersionResponse.status === 200) {
        console.log('  Windows Version:', winVersionResponse.body.content[0].text.trim());
      }

    } catch (error) {
      console.error('❌ Error gathering server info:', error.message);
    }
  }

  async testUpdatedTools() {
    console.log('\n🆕 Testing for v1.0.6 Features...');
    console.log('=' .repeat(50));

    const newTools = ['mcp_self_build', 'process_manager', 'file_sync'];
    
    for (const toolName of newTools) {
      try {
        const response = await this.makeRequest('tools/call', {
          name: toolName,
          arguments: { action: 'status' }
        });
        
        if (response.status === 200) {
          console.log(`✅ ${toolName}: Available`);
        } else {
          console.log(`❌ ${toolName}: Not available (${response.body?.content?.[0]?.text || 'Unknown error'})`);
        }
      } catch (error) {
        console.log(`❌ ${toolName}: Error - ${error.message}`);
      }
    }
  }

  async testServerUpdate() {
    console.log('\n🔄 Testing Server Update Capability...');
    console.log('=' .repeat(50));

    try {
      // Check if update capability exists
      const updateResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Test-Path "C:\\mcp-server\\update-from-git.ps1"' }
      });
      
      if (updateResponse.status === 200) {
        const hasUpdateScript = updateResponse.body.content[0].text.trim() === 'True';
        
        if (hasUpdateScript) {
          console.log('✅ Update script found at C:\\mcp-server\\update-from-git.ps1');
          console.log('📋 Server can be updated using:');
          console.log('   @windows-build-server run_powershell command="C:\\mcp-server\\update-from-git.ps1"');
        } else {
          console.log('❌ Update script not found');
        }
      }

      // Check current server directory structure
      const dirResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-ChildItem "C:\\mcp-server" | Select-Object Name' }
      });
      
      if (dirResponse.status === 200) {
        console.log('\n📁 Current server directory contents:');
        console.log(dirResponse.body.content[0].text);
      }

    } catch (error) {
      console.error('❌ Error testing update capability:', error.message);
    }
  }

  async suggestNextSteps() {
    console.log('\n💡 Suggested Next Steps:');
    console.log('=' .repeat(50));
    
    console.log('1. 🔄 Update the server to v1.0.6:');
    console.log('   @windows-build-server run_powershell command="C:\\mcp-server\\update-from-git.ps1"');
    
    console.log('\n2. 🔍 Verify the update:');
    console.log('   @windows-build-server run_powershell command="npm --version"');
    console.log('   @windows-build-server run_powershell command="cd C:\\mcp-server && npm run dangerous"');
    
    console.log('\n3. 🧪 Test new features:');
    console.log('   node test-client.js  # Run this test again');
    
    console.log('\n4. 🚀 Use new v1.0.6 features:');
    console.log('   @windows-build-server mcp_self_build action="status"');
    console.log('   @windows-build-server process_manager action="list"');
    console.log('   @windows-build-server file_sync source="C:\\temp" destination="C:\\backup"');

    console.log('\n⚠️  Note: New tools require the server to be updated to v1.0.6');
  }

  async run() {
    console.log('🔍 Windows MCP Server Detailed Analysis');
    console.log(`🔗 Connecting to: ${this.config.host}:${this.config.port}`);
    console.log('=' .repeat(50));

    await this.getServerInfo();
    await this.testUpdatedTools();
    await this.testServerUpdate();
    await this.suggestNextSteps();

    console.log('\n✅ Analysis Complete');
  }
}

// Main execution
async function main() {
  try {
    const client = new DetailedMCPClient(config);
    await client.run();
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DetailedMCPClient;