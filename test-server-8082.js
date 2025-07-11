#!/usr/bin/env node

/**
 * Test Server for MCP v1.0.32 Critical Regression Fix Validation
 * Runs on port 8082 to avoid conflicts with production server
 */

// Load test environment
require('dotenv').config({ path: '.env.test' });

const path = require('path');
const fs = require('fs');

console.log('🧪 Starting MCP Test Server v1.0.32 on port 8082...');
console.log('📋 Test Environment Configuration:');
console.log(`   Port: ${process.env.MCP_SERVER_PORT || 8082}`);
console.log(`   Dangerous Mode: ${process.env.ENABLE_DANGEROUS_MODE}`);
console.log(`   Dev Commands: ${process.env.ENABLE_DEV_COMMANDS}`);
console.log(`   Auth Token: ${process.env.MCP_AUTH_TOKEN ? 'Set' : 'Not Set'}`);
console.log('');

// Verify critical fix is in place
const powershellEnhancedPath = path.join(__dirname, 'server', 'src', 'utils', 'powershell-enhanced.js');
if (fs.existsSync(powershellEnhancedPath)) {
  const content = fs.readFileSync(powershellEnhancedPath, 'utf8');
  
  // Check for the invalid parameters that caused the regression
  const hasInvalidParams = content.includes('-OutputEncoding') && content.includes('-InputFormat');
  
  if (hasInvalidParams) {
    console.log('❌ CRITICAL: Invalid PowerShell parameters still present!');
    console.log('   The regression fix has not been properly applied.');
    process.exit(1);
  } else {
    console.log('✅ VERIFIED: Invalid PowerShell parameters removed');
    console.log('   Regression fix is properly applied in powershell-enhanced.js');
  }
} else {
  console.log('⚠️  Warning: powershell-enhanced.js not found at expected location');
}

console.log('');
console.log('🚀 Starting server...');

// Import and start the fixed server
try {
  require('./server/src/server');
  console.log(`✅ MCP Test Server v1.0.32 running on port ${process.env.MCP_SERVER_PORT || 8082}`);
  console.log('');
  console.log('🧪 Ready for testing:');
  console.log('   Health Check: http://localhost:8082/health');
  console.log('   MCP Endpoint: http://localhost:8082/mcp');
  console.log('   Auth Header: Authorization: Bearer test-token-critical-regression-fix-v1.0.32');
  console.log('');
  console.log('📋 Test Commands:');
  console.log('   Basic: curl -H "Authorization: Bearer test-token-critical-regression-fix-v1.0.32" http://localhost:8082/health');
  console.log('   PowerShell: Use MCP client with run_powershell tool');
  console.log('');
} catch (error) {
  console.error('❌ Failed to start test server:', error.message);
  process.exit(1);
}