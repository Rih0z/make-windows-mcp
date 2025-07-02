const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const ping = require('ping');
const helmet = require('helmet');
require('dotenv').config();

const security = require('./utils/security');
const rateLimiter = require('./utils/rate-limiter');
const logger = require('./utils/logger');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb for security

// Access logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.access(req, res, duration);
  });
  
  next();
});

// Rate limiting middleware
app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const maxRequests = parseInt(process.env.RATE_LIMIT_REQUESTS) || 60;
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW) || 60000;
  
  const limitResult = rateLimiter.checkLimit(clientIP, maxRequests, windowMs);
  
  if (!limitResult.allowed) {
    logger.security('Rate limit exceeded', { clientIP, error: limitResult.error });
    return res.status(429).json({ 
      error: limitResult.error,
      retryAfter: limitResult.retryAfter 
    });
  }
  
  res.set('X-RateLimit-Remaining', limitResult.remaining);
  next();
});

// IP whitelist middleware
app.use((req, res, next) => {
  const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [];
  if (allowedIPs.length > 0) {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const isAllowed = allowedIPs.some(allowedIP => {
      // Support CIDR notation
      if (allowedIP.includes('/')) {
        // Simple CIDR check - would need ip-range library for full support
        const [network, bits] = allowedIP.split('/');
        return clientIP.startsWith(network.split('.').slice(0, Math.floor(bits / 8)).join('.'));
      }
      return clientIP === allowedIP;
    });
    
    if (!isAllowed) {
      logger.security('IP access denied', { clientIP, allowedIPs });
      return res.status(403).json({ error: 'Access denied from this IP address' });
    }
  }
  next();
});

// Authentication middleware
app.use((req, res, next) => {
  const authToken = process.env.MCP_AUTH_TOKEN;
  
  // Skip auth for health check
  if (req.path === '/health') {
    return next();
  }
  
  if (authToken && authToken !== 'change-this-to-a-secure-random-token') {
    const providedToken = req.headers.authorization;
    
    if (!providedToken) {
      logger.security('Missing authorization header', { 
        clientIP: req.ip || req.connection.remoteAddress,
        path: req.path 
      });
      return res.status(401).json({ error: 'Authorization header required' });
    }
    
    const token = providedToken.replace('Bearer ', '');
    if (token !== authToken) {
      logger.security('Invalid authorization token', { 
        clientIP: req.ip || req.connection.remoteAddress,
        path: req.path 
      });
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
  }
  
  next();
});

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
  const clientIP = req.ip || req.connection.remoteAddress;
  logger.info('Received MCP request', { 
    clientIP, 
    method: req.body.method, 
    toolName: req.body.params?.name 
  });
  
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
          try {
            const validatedPath = security.validatePath(args.projectPath);
            const configuration = args.configuration || 'Debug';
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              const command = `dotnet build "${validatedPath}" -c ${configuration}`;
              result = await executeRemoteCommand(validatedHost, command);
            } else {
              result = await executeBuild('dotnet', ['build', validatedPath, '-c', configuration]);
            }
            
            logger.info('Build completed', { clientIP, projectPath: validatedPath, configuration });
          } catch (error) {
            logger.security('Build validation failed', { clientIP, error: error.message, args });
            result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
          }
          break;
          
        case 'run_powershell':
          try {
            const validatedCommand = security.validatePowerShellCommand(args.command);
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              result = await executeRemoteCommand(validatedHost, validatedCommand);
            } else {
              result = await executeBuild('powershell', ['-Command', validatedCommand]);
            }
            
            logger.info('PowerShell command executed', { clientIP, command: args.command.substring(0, 100) });
          } catch (error) {
            logger.security('PowerShell validation failed', { clientIP, error: error.message, command: args.command });
            result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
          }
          break;
          
        case 'ping_host':
          try {
            const validatedHost = security.validateIPAddress(args.host);
            result = await pingHost(validatedHost);
            logger.info('Ping executed', { clientIP, host: validatedHost });
          } catch (error) {
            logger.security('Ping validation failed', { clientIP, error: error.message, host: args.host });
            result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
          }
          break;
          
        case 'ssh_command':
          try {
            const validatedCreds = security.validateSSHCredentials(args.host, args.username, args.password);
            const validatedCommand = security.validatePowerShellCommand(args.command);
            result = await executeSSHCommand(validatedCreds.host, validatedCreds.username, validatedCreds.password, validatedCommand);
            logger.info('SSH command executed', { clientIP, host: validatedCreds.host, username: validatedCreds.username });
          } catch (error) {
            logger.security('SSH validation failed', { clientIP, error: error.message, host: args.host });
            result = { content: [{ type: 'text', text: `Validation error: ${error.message}` }] };
          }
          break;
          
        default:
          logger.warn('Unknown tool requested', { clientIP, toolName: name });
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

const PORT = process.env.MCP_SERVER_PORT || 8080;

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MCP server running on http://0.0.0.0:${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  });
}

// Export app for testing
module.exports = app;