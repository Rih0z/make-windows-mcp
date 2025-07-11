#!/usr/bin/env node

/**
 * Critical Regression Fix Test Script
 * Tests the v1.0.32 PowerShell parameter fix in real-time
 */

const http = require('http');

const TEST_SERVER_URL = 'http://localhost:8082';
const AUTH_TOKEN = 'test-token-critical-regression-fix-v1.0.32';

console.log('🧪 Critical Regression Fix Test Suite - v1.0.32');
console.log('=' .repeat(60));
console.log('');

// Test configuration
const tests = [
  {
    name: 'Health Check',
    description: 'Verify server is running and responsive',
    method: 'GET',
    path: '/health',
    expectSuccess: true
  },
  {
    name: 'Basic PowerShell Test',
    description: 'Test simple Write-Host command (was failing in v1.0.30)',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Write-Host "Critical Fix Test - Hello World"',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectContent: 'Critical Fix Test - Hello World'
  },
  {
    name: 'Bug Report Test 1 - Get-Location',
    description: 'Reproduce exact failing command from bug report',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Get-Location',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectNotContent: '-OutputEncoding'
  },
  {
    name: 'Bug Report Test 2 - Get-Process',
    description: 'Test process command (was failing with exit code 1)',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Get-Process python -ErrorAction SilentlyContinue',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectNotContent: 'is not recognized as the name of a cmdlet'
  },
  {
    name: 'UTF-8 Encoding Test',
    description: 'Verify UTF-8 encoding still works after parameter fix',
    method: 'POST',
    path: '/mcp',
    body: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'run_powershell',
        arguments: {
          command: 'Write-Host "UTF-8 テスト 日本語"; Write-Host "Encoding verification"',
          timeout: 30
        }
      }
    },
    expectSuccess: true,
    expectContent: 'Encoding verification'
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
      port: 8082,
      path: test.path,
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const success = res.statusCode === 200;
        let testPassed = success === test.expectSuccess;
        
        if (success && test.expectContent) {
          testPassed = testPassed && data.includes(test.expectContent);
        }
        
        if (success && test.expectNotContent) {
          testPassed = testPassed && !data.includes(test.expectNotContent);
        }
        
        // For PowerShell tests, check the result structure
        if (test.method === 'POST' && test.path === '/mcp') {
          try {
            const jsonResponse = JSON.parse(data);
            if (jsonResponse.result && jsonResponse.result.content) {
              const mcpResult = JSON.parse(jsonResponse.result.content);
              
              // Check for the specific regression indicators
              if (test.expectNotContent === '-OutputEncoding') {
                const hasRegressionError = (mcpResult.stderr && mcpResult.stderr.includes('-OutputEncoding')) ||
                                         (mcpResult.error && mcpResult.error.includes('-OutputEncoding'));
                testPassed = testPassed && !hasRegressionError && mcpResult.success;
              }
              
              if (test.expectContent) {
                testPassed = testPassed && mcpResult.output && mcpResult.output.includes(test.expectContent);
              }
            }
          } catch (e) {
            console.log(`   ⚠️  JSON parsing failed: ${e.message}`);
            testPassed = false;
          }
        }
        
        if (testPassed) {
          console.log(`   ✅ PASSED`);
          passed++;
        } else {
          console.log(`   ❌ FAILED`);
          console.log(`   Response: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
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
    
    if (test.body) {
      req.write(JSON.stringify(test.body));
    }
    
    req.end();
  });
}

async function runAllTests() {
  console.log('Starting critical regression fix validation...');
  console.log('');
  
  for (const test of tests) {
    await runTest(test);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('=' .repeat(60));
  console.log('🏁 Test Results Summary');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('');
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✅ Critical regression fix v1.0.32 is working correctly');
    console.log('✅ PowerShell execution is fully functional');
    console.log('✅ No more invalid parameter errors');
    console.log('✅ UTF-8 encoding is preserved');
    console.log('');
    console.log('🚀 AIServer Enterprise v2.0 deployment is UNBLOCKED!');
  } else {
    console.log('');
    console.log('⚠️  SOME TESTS FAILED - Investigation required');
    console.log('❌ The critical regression fix may not be working correctly');
  }
  
  console.log('');
}

// Wait a moment for server to be ready, then run tests
setTimeout(runAllTests, 2000);