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
const crypto = require('./utils/crypto');
const { getClientIP, createTextResult, handleValidationError, getNumericEnv, createDirCommand } = require('./utils/helpers');

// Validate critical environment variables
function validateEnvironment() {
  const warnings = [];
  
  // Check for production security settings
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.MCP_AUTH_TOKEN || process.env.MCP_AUTH_TOKEN === 'change-this-to-a-secure-random-token') {
      warnings.push('MCP_AUTH_TOKEN must be set to a secure value in production');
    }
    
    if (!process.env.ALLOWED_IPS) {
      warnings.push('ALLOWED_IPS should be configured in production for security');
    }
  }
  
  // Check SSH credentials if remote features are enabled
  if (process.env.NORDVPN_ENABLED === 'true') {
    if (!process.env.REMOTE_PASSWORD) {
      warnings.push('REMOTE_PASSWORD must be set when NORDVPN_ENABLED is true');
    }
  }
  
  // Validate numeric environment variables
  const numericVars = {
    MCP_SERVER_PORT: { default: 8080, min: 1, max: 65535 },
    RATE_LIMIT_REQUESTS: { default: 60, min: 1, max: 1000 },
    RATE_LIMIT_WINDOW: { default: 60000, min: 1000, max: 600000 },
    COMMAND_TIMEOUT: { default: 300000, min: 1000, max: 3600000 },
    SSH_TIMEOUT: { default: 30000, min: 1000, max: 300000 }
  };
  
  for (const [varName, config] of Object.entries(numericVars)) {
    const value = process.env[varName];
    if (value) {
      const parsed = parseInt(value);
      if (isNaN(parsed) || parsed < config.min || parsed > config.max) {
        warnings.push(`${varName} must be a number between ${config.min} and ${config.max}`);
      }
    }
  }
  
  if (warnings.length > 0) {
    logger.warn('Environment configuration warnings:', { warnings });
    warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  }
  
  return warnings;
}

// Validate environment on startup
const envWarnings = validateEnvironment();

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
  const clientIP = getClientIP(req);
  const maxRequests = getNumericEnv('RATE_LIMIT_REQUESTS', 60);
  const windowMs = getNumericEnv('RATE_LIMIT_WINDOW', 60000);
  
  // Skip rate limiting if disabled (maxRequests = 0) or dangerous mode is enabled
  if (maxRequests === 0 || process.env.ENABLE_DANGEROUS_MODE === 'true') {
    if (process.env.ENABLE_DANGEROUS_MODE === 'true') {
      logger.security('DANGEROUS MODE: Rate limiting bypassed', { clientIP });
    }
    return next();
  }
  
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
    const clientIP = getClientIP(req);
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
        clientIP: getClientIP(req),
        path: req.path 
      });
      return res.status(401).json({ error: 'Authorization header required' });
    }
    
    const token = providedToken.replace('Bearer ', '');
    if (token !== authToken) {
      // Log partial tokens for debugging without exposing full token
      const expectedPartial = authToken.substring(0, 4) + '...' + authToken.substring(authToken.length - 4);
      const receivedPartial = token.length >= 8 ? 
        token.substring(0, 4) + '...' + token.substring(token.length - 4) : 
        'too short';
      
      logger.security('Invalid authorization token', { 
        clientIP: getClientIP(req),
        path: req.path,
        expectedPartial,
        receivedPartial,
        tokenLength: { expected: authToken.length, received: token.length }
      });
      
      // Development mode hint
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Token validation failed - check .env files on both server and client');
      }
      
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
  const clientIP = getClientIP(req);
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
          },
          {
            name: 'run_batch',
            description: 'Execute batch file in allowed directories',
            inputSchema: {
              type: 'object',
              properties: {
                batchFile: { 
                  type: 'string',
                  description: 'Path to batch file (must be in allowed directories defined by ALLOWED_BATCH_DIRS)'
                },
                workingDirectory: {
                  type: 'string',
                  description: 'Working directory for batch execution'
                }
              },
              required: ['batchFile']
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
            
            // Extract project name from path
            const projectName = validatedPath.split('\\').pop().replace('.csproj', '');
            
            // Fixed directory structure: C:\build\<project-name>\release
            const buildBaseDir = 'C:\\build';
            const projectDir = `${buildBaseDir}\\${projectName}`;
            const releaseDir = `${projectDir}\\release`;
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              // Create directories and build on remote host
              const commands = [
                `if not exist "${projectDir}" mkdir "${projectDir}"`,
                `if not exist "${releaseDir}" mkdir "${releaseDir}"`,
                `dotnet build "${validatedPath}" -c ${configuration} -o "${releaseDir}"`
              ];
              const command = commands.join(' && ');
              result = await executeRemoteCommand(validatedHost, command);
            } else {
              // Create project directory structure
              await executeBuild('cmd.exe', ['/c', createDirCommand(projectDir)]);
              await executeBuild('cmd.exe', ['/c', createDirCommand(releaseDir)]);
              
              // Copy project to build directory (preserving repository structure)
              const projectSourceDir = validatedPath.substring(0, validatedPath.lastIndexOf('\\'));
              await executeBuild('xcopy.exe', [
                projectSourceDir,
                projectDir,
                '/E', '/I', '/Y', '/Q'
              ]);
              
              // Build project with output to release directory
              result = await executeBuild('dotnet.exe', [
                'build', 
                validatedPath, 
                '-c', configuration,
                '-o', releaseDir
              ]);
              
              // Add output path to result
              const originalText = result.content[0].text;
              result.content[0].text = `${originalText}\n\nProject repository saved to: ${projectDir}\nRelease output saved to: ${releaseDir}`;
            }
            
            logger.info('Build completed', { 
              clientIP, 
              projectPath: validatedPath, 
              configuration, 
              projectDir,
              releaseDir 
            });
          } catch (error) {
            result = handleValidationError(error, 'Build', logger, clientIP, { args });
          }
          break;
          
        case 'run_powershell':
          try {
            // Check if dangerous mode is enabled
            const dangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
            
            let validatedCommand;
            if (dangerousMode) {
              // In dangerous mode, skip validation but log warning
              validatedCommand = args.command;
              logger.security('DANGEROUS MODE: Unrestricted command execution', { 
                clientIP, 
                command: args.command.substring(0, 100),
                fullCommand: args.command
              });
            } else {
              // Normal mode with security validation
              validatedCommand = security.validatePowerShellCommand(args.command);
            }
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              result = await executeRemoteCommand(validatedHost, validatedCommand);
            } else {
              // Use proper PowerShell arguments without shell
              result = await executeBuild('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy', 'Bypass',
                '-Command', validatedCommand
              ]);
            }
            
            logger.info('PowerShell command executed', { 
              clientIP, 
              command: args.command.substring(0, 100),
              dangerousMode 
            });
          } catch (error) {
            result = handleValidationError(error, 'PowerShell', logger, clientIP, { command: args.command });
          }
          break;
          
        case 'ping_host':
          try {
            const validatedHost = security.validateIPAddress(args.host);
            result = await pingHost(validatedHost);
            logger.info('Ping executed', { clientIP, host: validatedHost });
          } catch (error) {
            result = handleValidationError(error, 'Ping', logger, clientIP, { host: args.host });
          }
          break;
          
        case 'ssh_command':
          try {
            const validatedCreds = security.validateSSHCredentials(args.host, args.username, args.password);
            
            // Check if dangerous mode is enabled for SSH commands too
            const dangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
            let validatedCommand;
            
            if (dangerousMode) {
              validatedCommand = args.command;
              logger.security('DANGEROUS MODE: Unrestricted SSH command execution', { 
                clientIP, 
                host: validatedCreds.host,
                command: args.command.substring(0, 100),
                fullCommand: args.command
              });
            } else {
              validatedCommand = security.validatePowerShellCommand(args.command);
            }
            
            result = await executeSSHCommand(validatedCreds.host, validatedCreds.username, validatedCreds.password, validatedCommand);
            logger.info('SSH command executed', { 
              clientIP, 
              host: validatedCreds.host, 
              username: validatedCreds.username,
              dangerousMode 
            });
          } catch (error) {
            result = handleValidationError(error, 'SSH', logger, clientIP, { host: args.host });
          }
          break;
          
        case 'run_batch':
          try {
            // Check if dangerous mode is enabled
            const dangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
            let validatedPath;
            
            if (dangerousMode) {
              // In dangerous mode, allow any path
              if (!args.batchFile || typeof args.batchFile !== 'string') {
                throw new Error('Batch file path is required');
              }
              validatedPath = args.batchFile;
              logger.security('DANGEROUS MODE: Unrestricted batch file execution', { 
                clientIP, 
                batchFile: args.batchFile,
                workingDirectory: args.workingDirectory
              });
            } else {
              // Use the new validateBatchFilePath function from security module
              validatedPath = security.validateBatchFilePath(args.batchFile);
            }
            
            const workingDir = args.workingDirectory || validatedPath.substring(0, validatedPath.lastIndexOf('\\'));
            
            // Execute the batch file
            result = await executeBuild('cmd.exe', ['/c', `cd /d "${workingDir}" && "${validatedPath}"`]);
            
            logger.info('Batch file executed', { 
              clientIP, 
              batchFile: validatedPath,
              workingDirectory: workingDir 
            });
          } catch (error) {
            result = handleValidationError(error, 'Batch execution', logger, clientIP, { batchFile: args.batchFile });
          }
          break;
          
        default:
          logger.warn('Unknown tool requested', { clientIP, toolName: name });
          result = createTextResult(`Unknown tool: ${name}`);
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
  return new Promise((resolve, reject) => {
    // Remove shell: true to prevent command injection
    const process = spawn(command, args);
    let output = '';
    let error = '';
    let processExited = false;

    // Add timeout handling
    const timeout = getNumericEnv('COMMAND_TIMEOUT', 300000); // 5 minutes default
    const timer = setTimeout(() => {
      if (!processExited) {
        process.kill('SIGTERM');
        setTimeout(() => {
          if (!processExited) {
            process.kill('SIGKILL');
          }
        }, 5000);
        reject(new Error(`Command timed out after ${timeout}ms`));
      }
    }, timeout);

    // Handle stdout safely
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
    }

    // Handle stderr safely
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
    }

    process.on('error', (err) => {
      clearTimeout(timer);
      processExited = true;
      resolve(createTextResult(`Process error: ${err.message}`));
    });

    process.on('close', (code) => {
      clearTimeout(timer);
      processExited = true;
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
    return createTextResult(
      `Ping result for ${host}:\nAlive: ${result.alive}\nTime: ${result.time}ms\nStatus: ${result.output}`
    );
  } catch (error) {
    return createTextResult(`Ping failed for ${host}: ${error.message}`);
  }
}

async function executeSSHCommand(host, username, password, command) {
  return new Promise((resolve) => {
    const conn = new Client();
    let output = '';
    let connectionTimeout;
    
    // Log connection attempt with hashed credentials
    logger.info('SSH connection attempt', {
      host,
      username,
      passwordHash: crypto.hashForLogging(password)
    });
    
    // Set connection timeout
    connectionTimeout = setTimeout(() => {
      conn.end();
      resolve(createTextResult(`SSH connection timeout to ${host}`));
    }, getNumericEnv('SSH_TIMEOUT', 30000));
    
    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          resolve(createTextResult(`SSH Error: ${err.message}`));
          return;
        }
        
        stream.on('close', (code, signal) => {
          conn.end();
          resolve(createTextResult(`SSH Command completed (code: ${code}):\n${output}`));
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
      port: 22,
      readyTimeout: getNumericEnv('SSH_TIMEOUT', 30000)
    });
    
    conn.on('error', (err) => {
      clearTimeout(connectionTimeout);
      logger.error('SSH connection error', { host, error: err.message });
      resolve(createTextResult(`Connection failed to ${host}: ${err.message}`));
    });
  });
}

async function executeRemoteCommand(host, command) {
  const username = process.env.REMOTE_USERNAME || 'Administrator';
  let password = process.env.REMOTE_PASSWORD;
  
  if (!password) {
    return createTextResult('Error: REMOTE_PASSWORD environment variable not set');
  }
  
  // Decrypt password if encrypted
  try {
    password = crypto.decrypt(password);
  } catch (error) {
    logger.error('Failed to decrypt remote password', { error: error.message });
    return createTextResult('Error: Failed to decrypt remote password');
  }
  
  return await executeSSHCommand(host, username, password, command);
}

const PORT = getNumericEnv('MCP_SERVER_PORT', 8080);

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Show dangerous mode in startup banner
  const isDangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
  
  app.listen(PORT, '0.0.0.0', async () => {
    // Get version from package.json
    const packageJson = require('./package.json');
    const version = packageJson.version || '1.0.0';
    
    if (isDangerousMode) {
      console.log('\n🔥🔥🔥 MCP SERVER v' + version + ' - DANGEROUS MODE 🔥🔥🔥');
      console.log(`🔥 Running on http://0.0.0.0:${PORT} (UNRESTRICTED)`);
      console.log(`🔥 Health: http://0.0.0.0:${PORT}/health`);
      console.log(`🔥 Endpoint: http://0.0.0.0:${PORT}/mcp`);
    } else {
      console.log(`\nWindows MCP Server v${version}`);
      console.log(`Running on http://0.0.0.0:${PORT}`);
      console.log(`Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    }
    
    // Display dangerous mode warning if enabled
    if (process.env.ENABLE_DANGEROUS_MODE === 'true') {
      console.log('\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️');
      console.log('');
      console.log('    🔥🔥🔥 DANGEROUS MODE ACTIVE - ALL SECURITY DISABLED 🔥🔥🔥');
      console.log('');
      console.log('    💀 ANY COMMAND CAN BE EXECUTED INCLUDING:');
      console.log('       • System file deletion (del /f /s /q C:\\*)');
      console.log('       • User account manipulation (net user)');
      console.log('       • Registry modification (reg delete)');
      console.log('       • Service termination (sc stop)');
      console.log('       • Network reconfiguration');
      console.log('       • Remote system shutdown');
      console.log('');
      console.log('    🚨 RATE LIMITING: DISABLED');
      console.log('    🚨 PATH RESTRICTIONS: DISABLED');
      console.log('    🚨 COMMAND VALIDATION: DISABLED');
      console.log('');
      console.log('    ⚡ USE ONLY IN FULLY TRUSTED ENVIRONMENTS ⚡');
      console.log('');
      console.log('⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n');
      
      // Also log to security log
      logger.security('DANGEROUS MODE ACTIVATED', {
        mode: 'DANGEROUS',
        allSecurityBypassed: true,
        startTime: new Date().toISOString()
      });
    }
    
    // Display available IP addresses
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);
      
      if (process.platform === 'win32') {
        const { stdout } = await execPromise('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike \'*Loopback*\' -and $_.IPAddress -ne \'127.0.0.1\'} | Select-Object -ExpandProperty IPAddress"');
        const ips = stdout.trim().split('\n').filter(ip => ip);
        
        if (ips.length > 0) {
          console.log('\nYour server is accessible at:');
          ips.forEach(ip => {
            console.log(`  http://${ip.trim()}:${PORT}`);
          });
          
          // Check for VPN IPs
          const { stdout: interfaceInfo } = await execPromise('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -match \'VPN|NordVPN|OpenVPN|WireGuard|Tailscale|ZeroTier\'} | Select-Object -ExpandProperty IPAddress"');
          const vpnIps = interfaceInfo.trim().split('\n').filter(ip => ip);
          
          if (vpnIps.length > 0) {
            console.log('\n⚠️  VPN detected! Use these IPs if connecting through VPN:');
            vpnIps.forEach(ip => {
              console.log(`  http://${ip.trim()}:${PORT}`);
            });
          }
        }
      }
    } catch (err) {
      // Silently ignore errors in IP detection
    }
  });
}

// Export app for testing
module.exports = app;