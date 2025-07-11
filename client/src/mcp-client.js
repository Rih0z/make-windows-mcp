#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables - check multiple locations
const possibleEnvPaths = [
  path.join(__dirname, '..', '.env'),           // client/.env
  path.join(__dirname, '..', '..', '.env'),     // root .env
  path.join(process.cwd(), '.env')              // current directory .env
];

let envPath = null;
for (const p of possibleEnvPaths) {
  if (fs.existsSync(p)) {
    envPath = p;
    break;
  }
}

if (!envPath) {
  console.error('Error: .env file not found.');
  console.error('Please create .env file in one of these locations:');
  possibleEnvPaths.forEach(p => console.error(`  - ${p}`));
  console.error('\nYou can copy .env.example to .env and configure it.');
  process.exit(1);
}

require('dotenv').config({ path: envPath });

// Validate required environment variables
const WINDOWS_VM_IP = process.env.WINDOWS_VM_IP;
const MCP_SERVER_PORT = process.env.MCP_SERVER_PORT || '8080';
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!WINDOWS_VM_IP) {
  console.error('Error: WINDOWS_VM_IP not set in .env file');
  process.exit(1);
}

// Try to read server port information
let actualPort = MCP_SERVER_PORT;
try {
  const portInfoPath = path.join(__dirname, '..', '..', 'server', 'server-port.json');
  const portInfo = JSON.parse(fs.readFileSync(portInfoPath, 'utf8'));
  
  if (portInfo.assignedPort) {
    actualPort = portInfo.assignedPort;
    
    if (portInfo.fallbackUsed) {
      console.log(`ℹ️  Server is using fallback port ${actualPort} (preferred ${portInfo.preferredPort} was in use)`);
    }
  }
} catch {
  // Port info file not found or invalid, use default
  console.log(`ℹ️  Using default port ${actualPort} (no server port info available)`);
}

// Build the MCP server URL
const protocol = process.env.ENABLE_HTTPS === 'true' ? 'https' : 'http';
const serverUrl = `${protocol}://${WINDOWS_VM_IP}:${actualPort}/mcp`;

// Build arguments
const args = ['-y', 'mcp-remote', serverUrl];

// Add --allow-http flag for HTTP connections
if (protocol === 'http') {
  args.push('--allow-http');
}

// Add auth header if token is set
if (MCP_AUTH_TOKEN && MCP_AUTH_TOKEN !== 'change-this-to-a-secure-random-token') {
  args.push('--header', `Authorization: Bearer ${MCP_AUTH_TOKEN}`);
}

console.log(`Connecting to Windows MCP Server at ${serverUrl}...`);

const mcpProcess = spawn('npx', args, {
  stdio: 'inherit',
  env: process.env
});

mcpProcess.on('error', (err) => {
  console.error('Failed to start MCP client:', err);
  process.exit(1);
});

mcpProcess.on('exit', (code) => {
  process.exit(code || 0);
});