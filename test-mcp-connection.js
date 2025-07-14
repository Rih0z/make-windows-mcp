#!/usr/bin/env node

/**
 * MCP Connection and Build Test Script - v1.0.32
 * Validates MCP protocol connection and build command execution
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const MCP_SERVER_URL = 'http://localhost:8080'; // Default production port
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'test-token-12345';

console.log('🔗 MCP Connection and Build Test - v1.0.32');
console.log('=' .repeat(60));
console.log(`📡 Server: ${MCP_SERVER_URL}`);
console.log(`🔐 Auth: ${AUTH_TOKEN ? 'Token Set' : 'No Token'}`);
console.log('');

// Test cases for MCP connection and build operations
const tests = [
  {
    name: 'MCP Protocol - Health Check',
    description: 'Verify server responds and is healthy',
    method: 'GET',
    path: '/health',
    expectSuccess: true,
    expectContent: 'ok'
  },
  {
    name: 'MCP Protocol - Tools List',
    description: 'Verify MCP tools/list endpoint works',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    },
    expectSuccess: true,
    expectContent: 'tools'
  },
  {
    name: 'PowerShell Execution - Basic Test',
    description: 'Test PowerShell execution after v1.0.32 fix',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Write-Host "MCP Connection Test Successful"; Get-Date',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectContent: 'MCP Connection Test Successful'
  },
  {
    name: 'Build Command - .NET Version Check',
    description: 'Test .NET build environment availability',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'dotnet --version',
          timeout: 60
        }
      }
    },
    expectSuccess: true,
    expectContent: null // Just needs to succeed
  },
  {
    name: 'Build Command - Directory Navigation',
    description: 'Test build directory navigation',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Test-Path C:\\\\; Get-Location; Write-Host "Directory navigation successful"',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectContent: 'Directory navigation successful'
  },
  {
    name: 'Build Tool - build_dotnet Availability',
    description: 'Test that build_dotnet tool is available',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'build_dotnet',
        arguments: {
          projectPath: 'test-project.csproj' // This will fail but tests tool availability
        }
      }
    },
    expectSuccess: false, // Expected to fail but tool should be recognized
    expectNotContent: 'Unknown tool'
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
      port: 8080, // Default production port
      path: test.path,
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
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
        
        // For GET requests (health check)
        if (test.method === 'GET') {
          if (test.expectContent && success) {
            testPassed = testPassed && data.includes(test.expectContent);
          }
          details = data.substring(0, 100);
        }
        
        // For POST requests (MCP protocol)
        if (test.method === 'POST') {
          try {
            const jsonResponse = JSON.parse(data);
            
            // Check for MCP protocol compliance
            if (jsonResponse.jsonrpc !== '2.0') {
              testPassed = false;
              details = 'Invalid JSON-RPC response';
            } else if (jsonResponse.error && test.expectSuccess) {
              testPassed = false;
              details = `MCP Error: ${jsonResponse.error.message || jsonResponse.error}`;
            } else if (jsonResponse.result) {
              // For tools/list
              if (test.expectContent === 'tools' && jsonResponse.result.tools) {
                testPassed = true;
                details = `Found ${jsonResponse.result.tools.length} tools`;
              }
              // For tools/call
              else if (jsonResponse.result.content) {
                try {
                  const toolResult = JSON.parse(jsonResponse.result.content);
                  
                  // Check for the v1.0.32 regression fix
                  const hasRegressionError = (toolResult.stderr && toolResult.stderr.includes('-OutputEncoding')) ||
                                           (toolResult.error && JSON.stringify(toolResult.error).includes('-OutputEncoding'));
                  
                  if (hasRegressionError) {
                    testPassed = false;
                    details = 'REGRESSION DETECTED: Invalid PowerShell parameters still present';
                  } else if (test.expectContent && toolResult.output) {
                    testPassed = testPassed && toolResult.output.includes(test.expectContent);
                    details = toolResult.success ? 'Command executed successfully' : `Exit code: ${toolResult.exitCode}`;
                  } else if (!test.expectSuccess && toolResult.success === false) {
                    // Expected failure (like invalid project path)
                    testPassed = true;
                    details = 'Expected failure occurred';
                  } else if (test.expectSuccess) {
                    testPassed = toolResult.success === true;
                    details = toolResult.success ? 'Command succeeded' : `Failed: ${toolResult.stderr || 'Unknown error'}`;
                  }
                  
                  if (test.expectNotContent && toolResult.output) {
                    testPassed = testPassed && !toolResult.output.includes(test.expectNotContent);
                  }
                } catch (e) {
                  details = `Tool result parsing failed: ${e.message}`;
                  testPassed = false;
                }
              }
            } else if (!test.expectSuccess && jsonResponse.error) {
              // Check if it's the expected type of error
              if (test.expectNotContent && !JSON.stringify(jsonResponse.error).includes(test.expectNotContent)) {
                testPassed = true;
                details = 'Tool recognized but failed as expected';
              }
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
          console.log(`   Response: ${data.substring(0, 300)}${data.length > 300 ? '...' : ''}`);
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
  console.log('Starting MCP connection and build tests...');
  console.log('');
  
  for (const test of tests) {
    await runTest(test);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('=' .repeat(60));
  console.log('🏁 MCP Connection Test Results');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('');
    console.log('🎉 ALL MCP CONNECTION TESTS PASSED!');
    console.log('✅ MCP protocol communication working');
    console.log('✅ PowerShell execution functional');
    console.log('✅ Build tools available');
    console.log('✅ v1.0.32 regression fix confirmed');
    console.log('');
    console.log('🚀 Ready for production builds!');
  } else {
    console.log('');
    console.log('⚠️  SOME TESTS FAILED');
    console.log('❌ MCP connection or build functionality issues detected');
    console.log('🔧 Check server status and configuration');
  }
  
  console.log('');
  
  // Return exit code for CI/CD
  process.exit(failed > 0 ? 1 : 0);
}

// Start tests
runAllTests();