#!/usr/bin/env node

/**
 * Investigate the current state of the Windows MCP Server
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

class ServerInvestigator {
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

  async investigateServerVersion() {
    console.log('🔍 Investigating Server Version and State...');
    console.log('='.repeat(60));

    try {
      // Check package.json version
      console.log('📦 Checking package.json version...');
      const packageResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-Content "C:\\mcp-server\\package.json" | ConvertFrom-Json | Select-Object version' }
      });

      if (packageResponse.status === 200) {
        console.log('Server package.json version:');
        console.log(packageResponse.body.content[0].text);
      }

      // Check server.js content for new tools
      console.log('\n🔧 Checking for new tools in server.js...');
      const toolsCheckResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Select-String -Path "C:\\mcp-server\\server.js" -Pattern "mcp_self_build|process_manager|file_sync" | Select-Object -First 5' }
      });

      if (toolsCheckResponse.status === 200) {
        console.log('Tools found in server.js:');
        console.log(toolsCheckResponse.body.content[0].text);
      }

      // Check if server is running with new version
      console.log('\n🚀 Checking running server process...');
      const processResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-Process node | Where-Object { $_.CommandLine -like "*server.js*" } | Select-Object Id, CommandLine' }
      });

      if (processResponse.status === 200) {
        console.log('Running server processes:');
        console.log(processResponse.body.content[0].text);
      }

      // Check server logs
      console.log('\n📝 Checking recent server logs...');
      const logsResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'Get-ChildItem "C:\\mcp-server\\logs" -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 3 | ForEach-Object { "=== " + $_.Name + " ==="; Get-Content $_.FullName -Tail 5; "" }' }
      });

      if (logsResponse.status === 200) {
        console.log('Recent log entries:');
        console.log(logsResponse.body.content[0].text);
      }

    } catch (error) {
      console.log('❌ Investigation failed:', error.message);
    }
  }

  async checkGitStatus() {
    console.log('\n📚 Checking Git Repository Status...');
    console.log('-'.repeat(40));

    try {
      // Check git status
      const gitStatusResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'cd C:\\mcp-server; git status --porcelain; git log --oneline -5' }
      });

      if (gitStatusResponse.status === 200) {
        console.log('Git status and recent commits:');
        console.log(gitStatusResponse.body.content[0].text);
      }

      // Check current branch
      const branchResponse = await this.makeRequest('tools/call', {
        name: 'run_powershell',
        arguments: { command: 'cd C:\\mcp-server; git branch --show-current' }
      });

      if (branchResponse.status === 200) {
        console.log('\nCurrent branch:');
        console.log(branchResponse.body.content[0].text);
      }

    } catch (error) {
      console.log('❌ Git check failed:', error.message);
    }
  }

  async suggestUpdateStrategy() {
    console.log('\n💡 Update Strategy Recommendations...');
    console.log('-'.repeat(40));

    console.log('Based on the investigation, here are the recommended steps:');
    console.log('');
    console.log('1. 🔄 Update the server code:');
    console.log('   @windows-build-server run_powershell command="cd C:\\mcp-server && git pull origin main"');
    console.log('');
    console.log('2. 📦 Update dependencies:');
    console.log('   @windows-build-server run_powershell command="cd C:\\mcp-server && npm install"');
    console.log('');
    console.log('3. 🔄 Restart the server:');
    console.log('   @windows-build-server run_powershell command="cd C:\\mcp-server && npm run dangerous"');
    console.log('');
    console.log('4. ✅ Verify the update:');
    console.log('   node test-new-features.js');
    console.log('');
    console.log('Alternative manual update:');
    console.log('1. Stop the current server process');
    console.log('2. Download the latest code from GitHub');
    console.log('3. Replace the server files');
    console.log('4. Restart with the new version');
  }

  async run() {
    console.log('🕵️ Windows MCP Server Investigation');
    console.log(`🔗 Target: ${this.config.host}:${this.config.port}`);
    console.log('='.repeat(60));

    await this.investigateServerVersion();
    await this.checkGitStatus();
    await this.suggestUpdateStrategy();

    console.log('\n✅ Investigation Complete');
  }
}

// Main execution
async function main() {
  try {
    const investigator = new ServerInvestigator(config);
    await investigator.run();
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ServerInvestigator;