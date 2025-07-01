#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== Claude Code MCP Configuration ===\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('.env file not found. Creating from .env.example...\n');
  
  // Copy .env.example to .env
  fs.copyFileSync(envExamplePath, envPath);
}

// Read current .env content
let envContent = fs.readFileSync(envPath, 'utf8');

// Function to update env variable
function updateEnvVar(key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}`;
  }
}

// Get Windows VM IP
rl.question('Enter your Windows VM IP address: ', (ip) => {
  updateEnvVar('WINDOWS_VM_IP', ip);
  
  rl.question('Enter MCP server port (default: 8080): ', (port) => {
    if (port) {
      updateEnvVar('MCP_SERVER_PORT', port);
    }
    
    rl.question('Enter auth token (optional, press Enter to skip): ', (token) => {
      if (token) {
        updateEnvVar('MCP_AUTH_TOKEN', token);
      }
      
      // Save .env file
      fs.writeFileSync(envPath, envContent);
      console.log('\n.env file updated successfully!');
      
      // Generate claude-code-config.json
      const configPath = path.join(__dirname, '..', 'claude-code-config.json');
      const configTemplate = path.join(__dirname, '..', 'claude-code-config.template.json');
      
      fs.copyFileSync(configTemplate, configPath);
      console.log('\nclaude-code-config.json created!');
      
      console.log('\nNext steps:');
      console.log('1. Run the setup script on Windows VM');
      console.log('2. Add the MCP server to Claude Code:');
      console.log('   claude mcp add --user windows-build-server');
      console.log('\nDone!');
      
      rl.close();
    });
  });
});