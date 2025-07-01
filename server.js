const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const ping = require('ping');
require('dotenv').config();

const app = express();

// セキュリティミドルウェア
app.use((req, res, next) => {
  const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];
  if (allowedIPs.length > 0) {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({ error: 'Access denied from this IP' });
    }
  }
  next();
});

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(express.json({ limit: '10mb' }));

// リモートホスト設定
const REMOTE_HOSTS = {
  nordvpn: {
    enabled: process.env.NORDVPN_ENABLED === 'true',
    hosts: process.env.NORDVPN_HOSTS ? process.env.NORDVPN_HOSTS.split(',') : []
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'windows-build-server',
    remoteHosts: REMOTE_HOSTS
  });
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  console.log('Received MCP request:', JSON.stringify(req.body, null, 2));
  
  const { method, params } = req.body;
  
  try {
    if (method === 'tools/list') {
      res.json({
        tools: [
          {
            name: 'build_dotnet',
            description: 'Build a .NET application',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string' },
                configuration: { type: 'string' },
                remoteHost: { type: 'string', description: 'Optional remote host IP (NordVPN mesh)' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'run_powershell',
            description: 'Execute PowerShell commands',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                remoteHost: { type: 'string', description: 'Optional remote host IP (NordVPN mesh)' }
              },
              required: ['command']
            }
          },
          {
            name: 'ping_host',
            description: 'Check connectivity to remote host',
            inputSchema: {
              type: 'object',
              properties: {
                host: { type: 'string' }
              },
              required: ['host']
            }
          },
          {
            name: 'ssh_command',
            description: 'Execute command on remote Windows via SSH',
            inputSchema: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                username: { type: 'string' },
                password: { type: 'string' },
                command: { type: 'string' }
              },
              required: ['host', 'username', 'password', 'command']
            }
          }
        ]
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      
      switch (name) {
        case 'build_dotnet':
          if (args.remoteHost) {
            result = await executeRemoteCommand(args.remoteHost, `dotnet build "${args.projectPath}" -c ${args.configuration || 'Debug'}`);
          } else {
            result = await executeBuild('dotnet', ['build', args.projectPath, '-c', args.configuration || 'Debug']);
          }
          break;
        case 'run_powershell':
          if (args.remoteHost) {
            result = await executeRemoteCommand(args.remoteHost, args.command);
          } else {
            result = await executeBuild('powershell', ['-Command', args.command]);
          }
          break;
        case 'ping_host':
          result = await pingHost(args.host);
          break;
        case 'ssh_command':
          result = await executeSSHCommand(args.host, args.username, args.password, args.command);
          break;
        default:
          result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
      }
      
      res.json(result);
    } else {
      res.json({ error: `Unknown method: ${method}` });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function executeBuild(command, args) {
  return new Promise((resolve) => {
    const process = spawn(command, args, { shell: true });
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      resolve({
        content: [{
          type: 'text',
          text: `Exit code: ${code}\n\nOutput:\n${output}\n\nErrors:\n${error}`
        }]
      });
    });
  });
}

async function pingHost(host) {
  try {
    const result = await ping.promise.probe(host);
    return {
      content: [{
        type: 'text',
        text: `Ping result for ${host}:\nAlive: ${result.alive}\nTime: ${result.time}ms\nStatus: ${result.output}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Ping failed for ${host}: ${error.message}`
      }]
    };
  }
}

async function executeSSHCommand(host, username, password, command) {
  return new Promise((resolve) => {
    const conn = new Client();
    let output = '';
    
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          resolve({
            content: [{
              type: 'text',
              text: `SSH Error: ${err.message}`
            }]
          });
          return;
        }
        
        stream.on('close', (code, signal) => {
          conn.end();
          resolve({
            content: [{
              type: 'text',
              text: `SSH Command completed (code: ${code}):\n${output}`
            }]
          });
        }).on('data', (data) => {
          output += data.toString();
        }).stderr.on('data', (data) => {
          output += `STDERR: ${data.toString()}`;
        });
      });
    }).connect({
      host: host,
      username: username,
      password: password,
      port: 22
    });
    
    conn.on('error', (err) => {
      resolve({
        content: [{
          type: 'text',
          text: `Connection failed to ${host}: ${err.message}`
        }]
      });
    });
  });
}

async function executeRemoteCommand(host, command) {
  const username = process.env.REMOTE_USERNAME || 'Administrator';
  const password = process.env.REMOTE_PASSWORD;
  
  if (!password) {
    return {
      content: [{
        type: 'text',
        text: 'Error: REMOTE_PASSWORD environment variable not set'
      }]
    };
  }
  
  return await executeSSHCommand(host, username, password, command);
}

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server running on http://0.0.0.0:${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
});