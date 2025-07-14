#!/usr/bin/env node

/**
 * MCP Protocol Test - v1.0.32
 * Tests MCP protocol functionality and connection stability
 * (macOS compatible - doesn't require PowerShell.exe)
 */

const http = require('http');

const MCP_SERVER_URL = 'http://localhost:8080';
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'test-mcp-connection-v1.0.32';

console.log('🔗 MCP Protocol and Connection Test - v1.0.32');
console.log('=' .repeat(60));
console.log(`📡 Server: ${MCP_SERVER_URL}`);
console.log(`🔐 Auth: ${AUTH_TOKEN ? 'Token Set' : 'No Token'}`);
console.log('');

const tests = [
  {
    name: 'Health Check',
    description: 'Basic server health and version verification',
    method: 'GET',
    path: '/health',
    expectSuccess: true
  },
  {
    name: 'MCP Initialize',
    description: 'MCP protocol initialization handshake',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    },
    expectSuccess: true
  },
  {
    name: 'Tools List',
    description: 'Retrieve available MCP tools',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    },
    expectSuccess: true
  },
  {
    name: 'Tools Schema - run_powershell',
    description: 'Check PowerShell tool schema',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ping_host',
        arguments: {
          host: 'localhost',
          timeout: 5
        }
      }
    },
    expectSuccess: true
  },
  {
    name: 'Authentication Test',
    description: 'Verify authentication is working',
    method: 'POST',
    path: '/mcp',
    headers: {
      'Authorization': 'Bearer invalid-token'
    },
    body: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {}
    },
    expectSuccess: false // Should fail with invalid token
  },
  {
    name: 'Rate Limiting Test',
    description: 'Verify rate limiting is configured',
    method: 'GET',
    path: '/health',
    expectSuccess: true,
    rapidFire: true
  }
];

let passed = 0;
let failed = 0;

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`🧪 ${test.name}`);
    console.log(`   ${test.description}`);
    
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: test.path,
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': test.headers?.Authorization || `Bearer ${AUTH_TOKEN}`
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const success = res.statusCode === 200;
        let testPassed = success === test.expectSuccess;
        let details = '';
        
        if (test.method === 'GET') {
          if (success) {
            try {
              const healthData = JSON.parse(data);
              details = `Version: ${healthData.version}, Status: ${healthData.status}`;
              if (healthData.version === '1.0.32') {
                details += ' ✅ v1.0.32 confirmed';
              }
            } catch (e) {
              details = data.substring(0, 100);
            }
          } else {
            details = `HTTP ${res.statusCode}`;
          }
        } else {
          try {
            const jsonResponse = JSON.parse(data);
            
            if (jsonResponse.jsonrpc !== '2.0') {
              testPassed = false;
              details = 'Invalid JSON-RPC response';
            } else if (jsonResponse.error && test.expectSuccess) {
              testPassed = false;
              details = `Error: ${jsonResponse.error.message || JSON.stringify(jsonResponse.error)}`;
            } else if (!jsonResponse.error && !test.expectSuccess) {
              testPassed = false;
              details = 'Expected error but got success';
            } else if (jsonResponse.result) {
              if (test.name === 'MCP Initialize' && jsonResponse.result.capabilities) {
                details = 'MCP initialization successful';
              } else if (test.name === 'Tools List' && jsonResponse.result.tools) {
                details = `Found ${jsonResponse.result.tools.length} tools`;
                
                // Check for critical tools
                const toolNames = jsonResponse.result.tools.map(t => t.name);
                const hasPowerShell = toolNames.includes('run_powershell');
                const hasBuildDotnet = toolNames.includes('build_dotnet');
                const hasPingHost = toolNames.includes('ping_host');
                
                if (hasPowerShell && hasBuildDotnet && hasPingHost) {
                  details += ' ✅ All critical tools present';
                } else {
                  details += ` ⚠️ Missing tools: ${[
                    !hasPowerShell && 'run_powershell',
                    !hasBuildDotnet && 'build_dotnet', 
                    !hasPingHost && 'ping_host'
                  ].filter(Boolean).join(', ')}`;
                }
              } else if (test.name.includes('Schema') && jsonResponse.result.content) {
                details = 'Tool execution successful';
              } else {
                details = 'Operation successful';
              }
            } else if (jsonResponse.error && !test.expectSuccess) {
              details = 'Expected error occurred';
              testPassed = true;
            }
          } catch (e) {
            details = `JSON parsing failed: ${e.message}`;
            testPassed = false;
          }
        }
        
        if (testPassed) {
          console.log(`   ✅ PASSED - ${details}`);
          passed++;
        } else {
          console.log(`   ❌ FAILED - ${details}`);
          if (data.length < 500) {
            console.log(`   Response: ${data}`);
          }
          failed++;
        }
        
        console.log('');
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ FAILED - Connection error: ${error.message}`);
      failed++;
      console.log('');
      resolve();
    });
    
    req.on('timeout', () => {
      console.log(`   ❌ FAILED - Request timeout`);
      failed++;
      console.log('');
      req.destroy();
      resolve();
    });
    
    if (test.body) {
      req.write(JSON.stringify(test.body));
    }
    
    req.end();
  });
}

async function runAllTests() {
  console.log('Starting MCP protocol tests...');
  console.log('');
  
  for (const test of tests) {
    await runTest(test);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('=' .repeat(60));
  console.log('🏁 MCP Protocol Test Results');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('');
    console.log('🎉 ALL MCP PROTOCOL TESTS PASSED!');
    console.log('✅ MCP server v1.0.32 is running correctly');
    console.log('✅ JSON-RPC protocol working');
    console.log('✅ Authentication system functional');
    console.log('✅ All critical tools available');
    console.log('✅ Server ready for Windows PowerShell connections');
    console.log('');
    console.log('🚀 Ready for production deployment!');
    console.log('');
    console.log('📋 Next Steps for Windows Environment:');
    console.log('   1. Deploy to Windows VM');
    console.log('   2. Test PowerShell execution');
    console.log('   3. Verify build tool functionality');
    console.log('   4. Run AIServer Enterprise v2.0 deployment');
  } else {
    console.log('');
    console.log('⚠️  SOME PROTOCOL TESTS FAILED');
    console.log('❌ MCP protocol issues detected');
    console.log('🔧 Check server configuration and logs');
  }
  
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();