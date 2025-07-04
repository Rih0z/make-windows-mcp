#!/usr/bin/env node

/**
 * テスト用クライアントスクリプト - run_batchツール
 * Windows MCP Server の run_batch ツールをテストします
 */

const https = require('https');
const http = require('http');

// テスト設定
const CONFIG = {
  WINDOWS_VM_IP: process.env.WINDOWS_VM_IP || '100.71.150.41',
  MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN || 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd',
  MCP_SERVER_PORT: process.env.MCP_SERVER_PORT || '8080',
  TEST_TIMEOUT: 30000 // 30秒
};

/**
 * MCPサーバーにリクエストを送信
 */
function sendMCPRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ method, params });
    
    const options = {
      hostname: CONFIG.WINDOWS_VM_IP,
      port: CONFIG.MCP_SERVER_PORT,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${CONFIG.MCP_AUTH_TOKEN}`
      },
      timeout: CONFIG.TEST_TIMEOUT
    };

    const protocol = CONFIG.MCP_SERVER_PORT === '443' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: result });
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
      reject(new Error('Request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * サーバーのヘルスチェック
 */
async function healthCheck() {
  try {
    console.log('🔍 Checking server health...');
    const options = {
      hostname: CONFIG.WINDOWS_VM_IP,
      port: CONFIG.MCP_SERVER_PORT,
      path: '/health',
      method: 'GET',
      timeout: CONFIG.TEST_TIMEOUT
    };

    const protocol = CONFIG.MCP_SERVER_PORT === '443' ? https : http;
    
    return new Promise((resolve, reject) => {
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log('✅ Server is healthy:', result.status);
            resolve(result);
          } catch (error) {
            reject(new Error(`Health check failed: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timed out'));
      });

      req.end();
    });
  } catch (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
}

/**
 * 利用可能なツール一覧を取得
 */
async function listTools() {
  console.log('📋 Getting available tools...');
  const response = await sendMCPRequest('tools/list');
  
  if (response.statusCode === 200) {
    console.log('✅ Available tools:');
    response.data.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    return response.data.tools;
  } else {
    throw new Error(`Failed to get tools: ${response.statusCode}`);
  }
}

/**
 * run_batchツールのテスト
 */
async function testRunBatch() {
  console.log('\n🧪 Testing run_batch tool...');
  
  const testCases = [
    {
      name: 'Valid batch file in allowed directory',
      batchFile: 'C:\\builds\\AIServer\\release\\start.bat',
      expectSuccess: true
    },
    {
      name: 'Valid batch file with working directory',
      batchFile: 'C:\\builds\\test.bat',
      workingDirectory: 'C:\\builds\\AIServer',
      expectSuccess: true
    },
    {
      name: 'Valid cmd file in temp directory',
      batchFile: 'C:\\temp\\setup.cmd',
      expectSuccess: true
    },
    {
      name: 'Invalid file extension',
      batchFile: 'C:\\builds\\script.ps1',
      expectSuccess: false,
      expectedError: 'Only .bat and .cmd files are allowed'
    },
    {
      name: 'Unauthorized directory',
      batchFile: 'C:\\Windows\\System32\\malware.bat',
      expectSuccess: false,
      expectedError: 'Batch file must be in one of the allowed directories'
    },
    {
      name: 'Directory traversal attempt',
      batchFile: 'C:\\builds\\..\\..\\Windows\\System32\\cmd.bat',
      expectSuccess: false,
      expectedError: 'Directory traversal detected'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n  🔬 Testing: ${testCase.name}`);
    
    try {
      const params = {
        name: 'run_batch',
        arguments: {
          batchFile: testCase.batchFile
        }
      };
      
      if (testCase.workingDirectory) {
        params.arguments.workingDirectory = testCase.workingDirectory;
      }

      const response = await sendMCPRequest('tools/call', params);
      
      if (testCase.expectSuccess) {
        if (response.statusCode === 200 && !response.data.content[0].text.includes('Validation error')) {
          console.log(`    ✅ Success: ${response.data.content[0].text.substring(0, 100)}...`);
        } else {
          console.log(`    ❌ Unexpected error: ${response.data.content[0].text}`);
        }
      } else {
        if (response.data.content[0].text.includes('Validation error')) {
          if (testCase.expectedError && response.data.content[0].text.includes(testCase.expectedError)) {
            console.log(`    ✅ Expected error correctly caught: ${testCase.expectedError}`);
          } else {
            console.log(`    ⚠️  Error caught but message differs: ${response.data.content[0].text}`);
          }
        } else {
          console.log(`    ❌ Expected validation error but got: ${response.data.content[0].text}`);
        }
      }
    } catch (error) {
      console.log(`    ❌ Request failed: ${error.message}`);
    }
  }
}

/**
 * 環境変数設定のテスト
 */
async function testEnvironmentConfiguration() {
  console.log('\n🔧 Testing environment configuration...');
  
  // 現在の環境変数設定を表示
  console.log('Current configuration:');
  console.log(`  WINDOWS_VM_IP: ${CONFIG.WINDOWS_VM_IP}`);
  console.log(`  MCP_SERVER_PORT: ${CONFIG.MCP_SERVER_PORT}`);
  console.log(`  MCP_AUTH_TOKEN: ${CONFIG.MCP_AUTH_TOKEN ? '***configured***' : 'NOT SET'}`);
  
  // デフォルト許可ディレクトリの表示
  console.log('\nDefault allowed batch directories:');
  console.log('  - C:\\builds\\');
  console.log('  - C:\\builds\\AIServer\\');
  console.log('  - C:\\Users\\Public\\');
  console.log('  - C:\\temp\\');
  
  console.log('\nTo customize allowed directories, set ALLOWED_BATCH_DIRS in server .env file:');
  console.log('ALLOWED_BATCH_DIRS=C:\\\\builds\\\\;C:\\\\custom\\\\scripts\\\\');
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🚀 Windows MCP Server - run_batch Tool Test');
  console.log('===========================================\n');
  
  try {
    // ヘルスチェック
    await healthCheck();
    
    // ツール一覧取得
    const tools = await listTools();
    
    // run_batchツールが存在することを確認
    const runBatchTool = tools.find(tool => tool.name === 'run_batch');
    if (!runBatchTool) {
      throw new Error('run_batch tool not found in available tools');
    }
    
    console.log(`✅ run_batch tool found: ${runBatchTool.description}`);
    
    // 環境設定テスト
    await testEnvironmentConfiguration();
    
    // run_batchツールのテスト
    await testRunBatch();
    
    console.log('\n🎉 Test completed successfully!');
    console.log('\nTo test with actual batch files:');
    console.log('1. Create test batch files in allowed directories');
    console.log('2. Use the examples from README.md');
    console.log('3. Monitor server logs for execution details');
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみmain関数を実行
if (require.main === module) {
  main();
}

module.exports = {
  sendMCPRequest,
  healthCheck,
  listTools,
  testRunBatch,
  testEnvironmentConfiguration
};