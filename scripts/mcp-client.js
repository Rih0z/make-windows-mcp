#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env file not found. Please copy .env.example to .env and configure it.');
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

// Build the MCP server URL
const protocol = process.env.ENABLE_HTTPS === 'true' ? 'https' : 'http';
const serverUrl = `${protocol}://${WINDOWS_VM_IP}:${MCP_SERVER_PORT}/mcp`;

// Build arguments
const args = ['-y', 'mcp-remote', serverUrl];

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