const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const ping = require('ping');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
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
    COMMAND_TIMEOUT: { default: 1800000, min: 1000, max: 3600000 },
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
// JSON parsing with error handling
app.use(express.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new SyntaxError('Invalid JSON');
    }
  }
}));

// JSON parse error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('JSON parse error', { clientIP: getClientIP(req), error: err.message });
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error: Invalid JSON was received by the server'
      }
    });
  }
  next(err);
});

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
    
    // Robust token extraction - handle various Bearer formats
    let token = providedToken.trim();
    
    // Remove Bearer prefix (case-insensitive, handle multiple spaces)
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.substring(7).trim(); // Remove 'bearer ' (7 chars) and trim spaces
    }
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
  const commandTimeout = getNumericEnv('COMMAND_TIMEOUT', 1800000);
  const timeoutMinutes = Math.round(commandTimeout / 60000);
  
  // Get version from package.json
  let version = 'unknown';
  try {
    const packageJson = require('../package.json');
    version = packageJson.version;
  } catch (error) {
    logger.warn('Could not read version from package.json', { error: error.message });
  }

  res.json({ 
    status: 'ok', 
    server: 'windows-build-server',
    version: version,
    remoteHosts: REMOTE_HOSTS,
    configuration: {
      commandTimeout: commandTimeout,
      timeoutMinutes: timeoutMinutes,
      dangerousMode: process.env.ENABLE_DANGEROUS_MODE === 'true',
      devCommands: process.env.ENABLE_DEV_COMMANDS === 'true',
      authConfigured: !!process.env.MCP_AUTH_TOKEN,
      port: getNumericEnv('MCP_SERVER_PORT', 8080)
    }
  });
});

// JSONRPC request validation middleware
function validateJSONRPC(req, res, next) {
  // Check if jsonrpc field is "2.0"
  if (req.body.jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32600,
        message: 'Invalid Request: jsonrpc must be "2.0"'
      }
    });
  }
  
  // Check if method is present and is a string
  if (!req.body.method || typeof req.body.method !== 'string') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32600,
        message: 'Invalid Request: method is required and must be a string'
      }
    });
  }
  
  // Check if id is present (can be string, number, or null)
  if (req.body.id === undefined) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request: id is required'
      }
    });
  }
  
  next();
}

// MCP endpoint
app.post('/mcp', validateJSONRPC, async (req, res) => {
  const clientIP = getClientIP(req);
  logger.info('Received MCP request', { 
    clientIP, 
    method: req.body.method, 
    toolName: req.body.params?.name 
  });
  
  const { method, params, id } = req.body;
  
  try {
    if (method === 'initialize') {
      // MCP protocol initialization
      res.json({
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: 'windows-mcp-server',
            version: '1.0.23'
          }
        }
      });
    } else if (method === 'shutdown') {
      // MCP protocol shutdown
      res.json({
        jsonrpc: '2.0',
        id: id,
        result: {}
      });
      logger.info('MCP shutdown requested', { clientIP });
    } else if (method === 'ping') {
      // MCP protocol ping/pong for health check
      res.json({
        jsonrpc: '2.0',
        id: id,
        result: { status: 'pong' }
      });
    } else if (method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id: id,
        result: {
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
            description: 'Execute PowerShell commands with optional timeout',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                remoteHost: { type: 'string', description: 'Optional remote host IP (NordVPN mesh)' },
                timeout: { 
                  type: 'number', 
                  description: 'Command timeout in seconds (default: 300, max: 1800)',
                  minimum: 1,
                  maximum: 1800
                }
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
          },
          {
            name: 'mcp_self_build',
            description: 'Build, test, and install/update the MCP server itself',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string',
                  enum: ['build', 'test', 'install', 'update', 'start', 'stop', 'status'],
                  description: 'Action to perform on the MCP server'
                },
                targetPath: {
                  type: 'string',
                  description: 'Target installation path (default: C:\\mcp-server)'
                },
                options: {
                  type: 'object',
                  properties: {
                    skipTests: { type: 'boolean', description: 'Skip running tests' },
                    forceDangerous: { type: 'boolean', description: 'Force dangerous mode on installation' },
                    autoStart: { type: 'boolean', description: 'Auto-start after installation' }
                  }
                }
              },
              required: ['action']
            }
          },
          {
            name: 'process_manager',
            description: 'Manage Windows processes and services',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string',
                  enum: ['start', 'stop', 'restart', 'status', 'list', 'kill'],
                  description: 'Process management action'
                },
                processName: {
                  type: 'string',
                  description: 'Process or service name'
                },
                options: {
                  type: 'object',
                  properties: {
                    force: { type: 'boolean', description: 'Force kill process' },
                    asService: { type: 'boolean', description: 'Manage as Windows service' },
                    waitTime: { type: 'number', description: 'Wait time in seconds' }
                  }
                }
              },
              required: ['action']
            }
          },
          {
            name: 'file_sync',
            description: 'Synchronize files and directories between locations',
            inputSchema: {
              type: 'object',
              properties: {
                source: { 
                  type: 'string',
                  description: 'Source path (file or directory)'
                },
                destination: {
                  type: 'string',
                  description: 'Destination path'
                },
                options: {
                  type: 'object',
                  properties: {
                    recursive: { type: 'boolean', description: 'Recursive copy for directories' },
                    overwrite: { type: 'boolean', description: 'Overwrite existing files' },
                    pattern: { type: 'string', description: 'File pattern filter (e.g., *.js)' },
                    excludePattern: { type: 'string', description: 'Exclude pattern' },
                    verify: { type: 'boolean', description: 'Verify file integrity after copy' }
                  }
                }
              },
              required: ['source', 'destination']
            }
          },
          {
            name: 'build_java',
            description: 'Build Java applications using Maven or Gradle',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to project file (pom.xml, build.gradle, or build.gradle.kts)'
                },
                buildTool: {
                  type: 'string',
                  enum: ['maven', 'gradle', 'auto'],
                  description: 'Build tool to use (auto-detected if not specified)'
                },
                goals: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Maven goals (e.g., ["clean", "compile", "test"])'
                },
                tasks: {
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Gradle tasks (e.g., ["clean", "build", "test"])'
                },
                profiles: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Maven profiles to activate'
                },
                properties: {
                  type: 'object',
                  description: 'Build properties (e.g., {"maven.test.skip": "false"})'
                },
                useWrapper: {
                  type: 'boolean',
                  description: 'Use Gradle wrapper (gradlew) instead of gradle command'
                },
                javaHome: {
                  type: 'string',
                  description: 'JAVA_HOME path override'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'build_python',
            description: 'Build and test Python applications',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to Python project directory'
                },
                buildTool: {
                  type: 'string',
                  enum: ['pip', 'poetry', 'conda', 'pipenv', 'auto'],
                  description: 'Build tool to use (auto-detected if not specified)'
                },
                commands: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Commands to execute (e.g., ["install", "test", "build"])'
                },
                virtualEnv: {
                  type: 'string',
                  description: 'Virtual environment path or name'
                },
                pythonVersion: {
                  type: 'string',
                  description: 'Python version requirement (e.g., "3.9", ">=3.8")'
                },
                requirements: {
                  type: 'string',
                  description: 'Requirements file path (default: requirements.txt)'
                },
                testRunner: {
                  type: 'string',
                  enum: ['pytest', 'unittest', 'nose2', 'tox'],
                  description: 'Test runner to use'
                },
                outputDir: {
                  type: 'string',
                  description: 'Output directory for build artifacts'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'build_node',
            description: 'Build Node.js/TypeScript applications',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to Node.js project directory (containing package.json)'
                },
                packageManager: {
                  type: 'string',
                  enum: ['npm', 'yarn', 'pnpm', 'auto'],
                  description: 'Package manager to use (auto-detected if not specified)'
                },
                scripts: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Package.json scripts to run (e.g., ["build", "test", "lint"])'
                },
                nodeVersion: {
                  type: 'string',
                  description: 'Node.js version requirement (e.g., "18", ">=16")'
                },
                environment: {
                  type: 'string',
                  enum: ['development', 'production', 'test'],
                  description: 'Build environment'
                },
                installDeps: {
                  type: 'boolean',
                  description: 'Install dependencies before building (default: true)'
                },
                outputDir: {
                  type: 'string',
                  description: 'Output directory for build artifacts (default: dist)'
                },
                typeCheck: {
                  type: 'boolean',
                  description: 'Run TypeScript type checking'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'build_go',
            description: 'Build Go applications with module support and cross-compilation',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to Go project directory (containing go.mod)'
                },
                action: {
                  type: 'string',
                  enum: ['build', 'test', 'run', 'install', 'clean', 'mod', 'vet', 'fmt'],
                  description: 'Go action to perform'
                },
                outputPath: {
                  type: 'string',
                  description: 'Output path for build artifacts'
                },
                targetOS: {
                  type: 'string',
                  enum: ['windows', 'linux', 'darwin', 'freebsd'],
                  description: 'Target operating system for cross-compilation'
                },
                targetArch: {
                  type: 'string',
                  enum: ['amd64', 'arm64', '386', 'arm'],
                  description: 'Target architecture for cross-compilation'
                },
                buildFlags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Additional build flags (e.g., ["-ldflags", "-s -w"])'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Build tags to include'
                },
                modAction: {
                  type: 'string',
                  enum: ['download', 'tidy', 'verify', 'init'],
                  description: 'Go module action (when action is "mod")'
                },
                coverage: {
                  type: 'boolean',
                  description: 'Enable test coverage (for test action)'
                },
                verbose: {
                  type: 'boolean',
                  description: 'Enable verbose output'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath', 'action']
            }
          },
          {
            name: 'build_rust',
            description: 'Build Rust applications using Cargo',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to Rust project directory (containing Cargo.toml)'
                },
                action: {
                  type: 'string',
                  enum: ['build', 'test', 'run', 'check', 'clippy', 'fmt', 'doc', 'clean', 'update'],
                  description: 'Cargo action to perform'
                },
                release: {
                  type: 'boolean',
                  description: 'Build in release mode with optimizations'
                },
                target: {
                  type: 'string',
                  description: 'Target triple for cross-compilation (e.g., x86_64-pc-windows-msvc)'
                },
                features: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Features to enable during build'
                },
                allFeatures: {
                  type: 'boolean',
                  description: 'Enable all available features'
                },
                noDefaultFeatures: {
                  type: 'boolean',
                  description: 'Disable default features'
                },
                testName: {
                  type: 'string',
                  description: 'Specific test name to run'
                },
                allTargets: {
                  type: 'boolean',
                  description: 'Apply action to all targets (for clippy/test)'
                },
                denyWarnings: {
                  type: 'boolean',
                  description: 'Treat warnings as errors (for clippy)'
                },
                outputDir: {
                  type: 'string',
                  description: 'Target directory for build artifacts'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath', 'action']
            }
          },
          {
            name: 'build_cpp',
            description: 'Build C/C++ applications using CMake, MSBuild, or Make',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string',
                  description: 'Path to C++ project directory or solution file'
                },
                buildSystem: {
                  type: 'string',
                  enum: ['cmake', 'msbuild', 'make', 'ninja'],
                  description: 'Build system to use'
                },
                buildType: {
                  type: 'string',
                  enum: ['Debug', 'Release', 'RelWithDebInfo', 'MinSizeRel'],
                  description: 'Build configuration type'
                },
                generator: {
                  type: 'string',
                  description: 'CMake generator (e.g., "Visual Studio 17 2022", "Ninja")'
                },
                buildDir: {
                  type: 'string',
                  description: 'Build directory path (default: build)'
                },
                configuration: {
                  type: 'string',
                  description: 'MSBuild configuration (Debug/Release)'
                },
                platform: {
                  type: 'string',
                  description: 'MSBuild platform (x86/x64/ARM64)'
                },
                target: {
                  type: 'string',
                  description: 'Specific target to build'
                },
                parallel: {
                  type: 'boolean',
                  description: 'Enable parallel builds'
                },
                verbose: {
                  type: 'boolean',
                  description: 'Enable verbose build output'
                },
                cmakeOptions: {
                  type: 'object',
                  description: 'CMake cache variables (-D options)'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['projectPath', 'buildSystem']
            }
          },
          {
            name: 'build_docker',
            description: 'Build Docker images with advanced options',
            inputSchema: {
              type: 'object',
              properties: {
                contextPath: { 
                  type: 'string',
                  description: 'Docker build context path'
                },
                imageName: {
                  type: 'string',
                  description: 'Docker image name and tag (e.g., myapp:latest)'
                },
                dockerfile: {
                  type: 'string',
                  description: 'Path to Dockerfile (default: Dockerfile)'
                },
                buildArgs: {
                  type: 'object',
                  description: 'Build arguments as key-value pairs'
                },
                target: {
                  type: 'string',
                  description: 'Multi-stage build target'
                },
                platform: {
                  type: 'string',
                  description: 'Target platform (e.g., linux/amd64)'
                },
                noCache: {
                  type: 'boolean',
                  description: 'Disable build cache'
                },
                pull: {
                  type: 'boolean',
                  description: 'Always pull base images'
                },
                squash: {
                  type: 'boolean',
                  description: 'Squash newly built layers into a single layer'
                },
                labels: {
                  type: 'object',
                  description: 'Metadata labels for the image'
                },
                secrets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Build secrets (format: id=mysecret,src=/path/to/secret)'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP (NordVPN mesh)' 
                }
              },
              required: ['contextPath', 'imageName']
            }
          },
          {
            name: 'build_kotlin',
            description: 'Build Kotlin/Android projects with Gradle',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string', 
                  description: 'Path to Kotlin/Android project directory'
                },
                projectType: {
                  type: 'string',
                  enum: ['android', 'jvm', 'native', 'multiplatform'],
                  description: 'Type of Kotlin project'
                },
                buildVariant: {
                  type: 'string',
                  description: 'Android build variant (e.g., debug, release)'
                },
                tasks: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Gradle tasks to execute'
                },
                buildType: {
                  type: 'string',
                  description: 'Build type for native projects'
                },
                target: {
                  type: 'string',
                  description: 'Target platform for native/multiplatform'
                },
                signingConfig: {
                  type: 'object',
                  properties: {
                    storeFile: { type: 'string' },
                    storePassword: { type: 'string' },
                    keyAlias: { type: 'string' },
                    keyPassword: { type: 'string' }
                  },
                  description: 'Android signing configuration'
                },
                gradleOptions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Additional Gradle options'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP'
                }
              },
              required: ['projectPath', 'projectType']
            }
          },
          {
            name: 'build_swift',
            description: 'Build Swift packages and iOS/macOS applications',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string', 
                  description: 'Path to Swift project directory'
                },
                action: {
                  type: 'string',
                  enum: ['build', 'test', 'run', 'package', 'clean'],
                  description: 'Swift build action'
                },
                configuration: {
                  type: 'string',
                  enum: ['debug', 'release'],
                  description: 'Build configuration'
                },
                platform: {
                  type: 'string',
                  description: 'Target platform (iOS, macOS, tvOS, watchOS, windows)'
                },
                arch: {
                  type: 'string',
                  description: 'Target architecture'
                },
                enableCodeCoverage: {
                  type: 'boolean',
                  description: 'Enable code coverage for tests'
                },
                parallel: {
                  type: 'boolean',
                  description: 'Enable parallel testing'
                },
                package: {
                  type: 'string',
                  description: 'Specific package to build in workspace'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP'
                }
              },
              required: ['projectPath', 'action']
            }
          },
          {
            name: 'build_php',
            description: 'Build PHP applications with Composer and run tests',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string', 
                  description: 'Path to PHP project directory'
                },
                action: {
                  type: 'string',
                  enum: ['install', 'update', 'test', 'build', 'artisan', 'serve'],
                  description: 'PHP build action'
                },
                packageManager: {
                  type: 'string',
                  enum: ['composer', 'pear'],
                  description: 'Package manager'
                },
                noDev: {
                  type: 'boolean',
                  description: 'Skip development dependencies'
                },
                optimize: {
                  type: 'boolean',
                  description: 'Optimize autoloader'
                },
                testFramework: {
                  type: 'string',
                  enum: ['phpunit', 'phpspec', 'codeception', 'behat'],
                  description: 'Testing framework'
                },
                coverage: {
                  type: 'boolean',
                  description: 'Generate code coverage'
                },
                testSuite: {
                  type: 'string',
                  description: 'Specific test suite to run'
                },
                artisanCommand: {
                  type: 'string',
                  description: 'Laravel Artisan command'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP'
                }
              },
              required: ['projectPath', 'action']
            }
          },
          {
            name: 'build_ruby',
            description: 'Build Ruby/Rails applications with Bundler',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string', 
                  description: 'Path to Ruby project directory'
                },
                action: {
                  type: 'string',
                  enum: ['install', 'update', 'exec', 'test', 'build', 'rails', 'rake'],
                  description: 'Ruby build action'
                },
                withoutGroups: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Groups to exclude from installation'
                },
                deployment: {
                  type: 'boolean',
                  description: 'Install in deployment mode'
                },
                railsCommand: {
                  type: 'string',
                  description: 'Rails command to execute'
                },
                railsEnv: {
                  type: 'string',
                  enum: ['development', 'test', 'production'],
                  description: 'Rails environment'
                },
                rakeTask: {
                  type: 'string',
                  description: 'Rake task to execute'
                },
                testFramework: {
                  type: 'string',
                  enum: ['rspec', 'minitest', 'test-unit'],
                  description: 'Testing framework'
                },
                parallel: {
                  type: 'boolean',
                  description: 'Run tests in parallel'
                },
                format: {
                  type: 'string',
                  description: 'Test output format'
                },
                gemspec: {
                  type: 'string',
                  description: 'Gemspec file for building gem'
                },
                remoteHost: { 
                  type: 'string', 
                  description: 'Optional remote host IP'
                }
              },
              required: ['projectPath', 'action']
            }
          }
        ]
        }
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
              // Get timeout from args or use default
              const maxAllowedTimeout = getNumericEnv('MAX_ALLOWED_TIMEOUT', 3600000) / 1000; // Default 60 minutes
              const requestedTimeout = args.timeout ? 
                Math.min(parseInt(args.timeout), maxAllowedTimeout) : // Cap at MAX_ALLOWED_TIMEOUT
                getNumericEnv('COMMAND_TIMEOUT', 1800000) / 1000; // Default 30 minutes
              
              const timeoutMs = requestedTimeout * 1000;
              
              // Use proper PowerShell arguments without shell
              result = await executeBuild('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy', 'Bypass',
                '-Command', validatedCommand
              ], {
                timeout: timeoutMs
              });
            }
            
            logger.info('PowerShell command executed', { 
              clientIP, 
              command: args.command.substring(0, 100),
              dangerousMode,
              timeout: args.timeout || getNumericEnv('COMMAND_TIMEOUT', 1800000) / 1000
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
          
        case 'mcp_self_build':
          try {
            const action = args.action;
            const targetPath = args.targetPath || 'C:\\mcp-server';
            const options = args.options || {};
            
            switch (action) {
              case 'build':
                // Build the MCP server from source
                result = await executeBuild('npm', ['run', 'build:all'], {
                  cwd: process.cwd()
                });
                break;
                
              case 'test':
                // Run tests with optional skip
                if (options.skipTests) {
                  result = createTextResult('Tests skipped by option');
                } else {
                  const testResult = await executeBuild('npm', ['test'], {
                    cwd: process.cwd()
                  });
                  const coverageResult = await executeBuild('npm', ['run', 'test:coverage'], {
                    cwd: process.cwd()
                  });
                  result = createTextResult(`Tests:\n${testResult.content[0].text}\n\nCoverage:\n${coverageResult.content[0].text}`);
                }
                break;
                
              case 'install':
                // Install MCP server (new installation)
                const setupScript = path.join(process.cwd(), 'setup-windows-vm.ps1');
                const psCommand = `Set-Location -Path "${process.cwd()}"; .\\setup-windows-vm.ps1 -TargetPath "${targetPath}"${options.forceDangerous ? ' -EnableDangerous' : ''}`;
                
                if (dangerousMode) {
                  result = await executeBuild('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-Command', psCommand]);
                } else {
                  result = createTextResult('Installation requires dangerous mode to be enabled');
                }
                
                if (options.autoStart && result.success) {
                  // Auto-start after installation
                  const startResult = await executeBuild('powershell.exe', [
                    '-ExecutionPolicy', 'Bypass',
                    '-Command', `Start-Process -FilePath "${targetPath}\\start-mcp-server.bat" -WorkingDirectory "${targetPath}"`
                  ]);
                  result = createTextResult(`${result.content[0].text}\n\nAuto-start: ${startResult.content[0].text}`);
                }
                break;
                
              case 'update':
                // Update MCP server from GitHub
                if (dangerousMode) {
                  const updateScript = path.join(targetPath, 'server', 'setup', 'update-from-git.ps1');
                  const updateCommand = `Set-Location -Path "${targetPath}"; powershell -ExecutionPolicy Bypass -File "${updateScript}"`;
                  
                  result = await executeBuild('powershell.exe', [
                    '-ExecutionPolicy', 'Bypass',
                    '-Command', updateCommand
                  ], {
                    timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000), // 30 minutes for update
                    workingDirectory: targetPath
                  });
                  
                  if (options.autoStart && result.success) {
                    // Auto-restart after successful update
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    const restartResult = await executeBuild('powershell.exe', [
                      '-ExecutionPolicy', 'Bypass',
                      '-Command', `Set-Location -Path "${targetPath}"; npm run dangerous`
                    ], {
                      workingDirectory: targetPath
                    });
                    result = createTextResult(`${result.content[0].text}\n\nAuto-restart: ${restartResult.content[0].text}`);
                  }
                } else {
                  result = createTextResult('Update requires dangerous mode to be enabled. Use run_powershell with "npm run update" instead.');
                }
                break;
                
              case 'start':
                // Start MCP server
                const startBat = path.join(targetPath, 'start-mcp-server.bat');
                result = await executeBuild('cmd.exe', ['/c', `start /B "" "${startBat}"`]);
                break;
                
              case 'stop':
                // Stop MCP server
                result = await executeBuild('taskkill', ['/F', '/IM', 'node.exe', '/FI', 'WINDOWTITLE eq MCP Server*']);
                break;
                
              case 'status':
                // Check MCP server status
                const statusResult = await executeBuild('tasklist', ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV']);
                const isRunning = statusResult.content[0].text.includes('node.exe');
                result = createTextResult(`MCP Server status: ${isRunning ? 'Running' : 'Stopped'}\n\n${statusResult.content[0].text}`);
                break;
                
              default:
                result = createTextResult(`Unknown action: ${action}`);
            }
            
            logger.info('MCP self-build action executed', { 
              clientIP, 
              action,
              targetPath,
              options 
            });
          } catch (error) {
            result = handleValidationError(error, 'MCP self-build', logger, clientIP, { action: args.action });
          }
          break;
          
        case 'process_manager':
          try {
            const action = args.action;
            const processName = args.processName;
            const options = args.options || {};
            
            switch (action) {
              case 'start':
                if (options.asService) {
                  result = await executeBuild('net', ['start', processName]);
                } else {
                  result = await executeBuild('start', ['""', processName], { shell: true });
                }
                break;
                
              case 'stop':
                if (options.asService) {
                  result = await executeBuild('net', ['stop', processName]);
                } else {
                  const killArgs = options.force ? ['/F', '/IM', `${processName}.exe`] : ['/IM', `${processName}.exe`];
                  result = await executeBuild('taskkill', killArgs);
                }
                break;
                
              case 'restart':
                if (options.asService) {
                  await executeBuild('net', ['stop', processName]);
                  if (options.waitTime) {
                    await new Promise(resolve => setTimeout(resolve, options.waitTime * 1000));
                  }
                  result = await executeBuild('net', ['start', processName]);
                } else {
                  result = createTextResult('Restart only supported for services');
                }
                break;
                
              case 'status':
                if (options.asService) {
                  result = await executeBuild('sc', ['query', processName]);
                } else {
                  result = await executeBuild('tasklist', ['/FI', `IMAGENAME eq ${processName}.exe`, '/FO', 'CSV']);
                }
                break;
                
              case 'list':
                if (options.asService) {
                  result = await executeBuild('sc', ['query', 'type=', 'service', 'state=', 'all']);
                } else {
                  result = await executeBuild('tasklist', ['/FO', 'CSV']);
                }
                break;
                
              case 'kill':
                const pid = processName; // In this case, processName is actually PID
                result = await executeBuild('taskkill', options.force ? ['/F', '/PID', pid] : ['/PID', pid]);
                break;
                
              default:
                result = createTextResult(`Unknown action: ${action}`);
            }
            
            logger.info('Process manager action executed', { 
              clientIP, 
              action,
              processName,
              options 
            });
          } catch (error) {
            result = handleValidationError(error, 'Process manager', logger, clientIP, { action: args.action });
          }
          break;
          
        case 'file_sync':
          try {
            const source = dangerousMode ? args.source : security.validateBuildPath(args.source);
            const destination = dangerousMode ? args.destination : security.validateBuildPath(args.destination);
            const options = args.options || {};
            
            // Build robocopy command
            const robocopyArgs = [source, destination];
            
            if (options.pattern) {
              robocopyArgs.push(options.pattern);
            } else {
              robocopyArgs.push('*.*');
            }
            
            // Add robocopy flags
            const flags = [];
            if (options.recursive) flags.push('/E'); // Copy subdirectories including empty ones
            if (!options.overwrite) flags.push('/XC', '/XN', '/XO'); // Exclude changed, newer, older files
            if (options.excludePattern) flags.push('/XF', options.excludePattern);
            if (options.verify) flags.push('/V'); // Verify after copy
            
            // Add retry and wait options
            flags.push('/R:3', '/W:10'); // Retry 3 times, wait 10 seconds
            
            robocopyArgs.push(...flags);
            
            result = await executeBuild('robocopy', robocopyArgs);
            
            // Robocopy returns 0-7 for success, 8+ for errors
            const exitCode = result.exitCode || 0;
            if (exitCode >= 8) {
              result = createTextResult(`File sync failed with code ${exitCode}:\n${result.content[0].text}`);
            } else {
              result = createTextResult(`File sync completed successfully:\n${result.content[0].text}`);
            }
            
            logger.info('File sync executed', { 
              clientIP, 
              source,
              destination,
              options 
            });
          } catch (error) {
            result = handleValidationError(error, 'File sync', logger, clientIP, { source: args.source, destination: args.destination });
          }
          break;

        case 'build_java':
          try {
            if (!args.projectPath) {
              throw new Error('projectPath is required');
            }

            // Use specialized validation for Java builds
            const buildTool = security.validateJavaBuild(args.projectPath, args.buildTool);
            const validatedPath = args.projectPath; // Already validated in validateJavaBuild
            
            const projectDir = validatedPath.substring(0, validatedPath.lastIndexOf('\\'));
            let command = '';
            let commandArgs = [];
            
            if (buildTool === 'maven') {
              command = 'mvn';
              const goals = args.goals || ['compile'];
              commandArgs = [...goals];
              
              // Add profiles
              if (args.profiles && args.profiles.length > 0) {
                commandArgs.push(`-P${args.profiles.join(',')}`);
              }
              
              // Add properties
              if (args.properties) {
                for (const [key, value] of Object.entries(args.properties)) {
                  commandArgs.push(`-D${key}=${value}`);
                }
              }
            } else if (buildTool === 'gradle') {
              command = args.useWrapper ? 'gradlew' : 'gradle';
              const tasks = args.tasks || ['build'];
              commandArgs = [...tasks];
              
              // Add properties
              if (args.properties) {
                for (const [key, value] of Object.entries(args.properties)) {
                  commandArgs.push(`-D${key}=${value}`);
                }
              }
            }
            
            // Set JAVA_HOME if specified
            const buildOptions = {
              workingDirectory: projectDir,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000)
            };
            
            if (args.javaHome) {
              buildOptions.env = { ...process.env, JAVA_HOME: args.javaHome };
            }
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }
            
            // Validate the final command for security
            const fullCommand = `${command} ${commandArgs.join(' ')}`;
            security.validateBuildCommand(fullCommand);
            
            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);
            
            if (!result.success) {
              throw new Error(`Java build failed: ${result.output || result.error}`);
            }
            
            result = createTextResult(`Java build completed successfully:\n${result.output}`);
            
            logger.info('Java build executed', { 
              clientIP, 
              buildTool,
              projectPath: validatedPath,
              command: `${command} ${commandArgs.join(' ')}`
            });
          } catch (error) {
            result = handleValidationError(error, 'Java build', logger, clientIP, { projectPath: args.projectPath });
          }
          break;

        case 'build_python':
          try {
            if (!args.projectPath) {
              throw new Error('projectPath is required');
            }

            // Use specialized validation for Python builds
            const buildTool = security.validatePythonBuild(args.projectPath, args.buildTool);
            const validatedPath = args.projectPath; // Already validated in validatePythonBuild
            
            // Auto-detect build tool if needed
            let finalBuildTool = buildTool;
            if (buildTool === 'auto') {
              const fs = require('fs');
              if (fs.existsSync(path.join(validatedPath, 'pyproject.toml'))) {
                finalBuildTool = 'poetry';
              } else if (fs.existsSync(path.join(validatedPath, 'Pipfile'))) {
                finalBuildTool = 'pipenv';
              } else if (fs.existsSync(path.join(validatedPath, 'environment.yml'))) {
                finalBuildTool = 'conda';
              } else {
                finalBuildTool = 'pip';
              }
            }
            
            let command = '';
            let commandArgs = [];
            const commands = args.commands || ['install'];
            
            // Build command based on tool
            if (finalBuildTool === 'pip') {
              command = 'pip';
              for (const cmd of commands) {
                if (cmd === 'install') {
                  const reqFile = args.requirements || 'requirements.txt';
                  commandArgs.push('install', '-r', reqFile);
                } else if (cmd === 'test') {
                  const testRunner = args.testRunner || 'pytest';
                  command = testRunner;
                  commandArgs = [];
                } else {
                  commandArgs.push(cmd);
                }
              }
            } else if (finalBuildTool === 'poetry') {
              command = 'poetry';
              commandArgs = [...commands];
            } else if (finalBuildTool === 'conda') {
              command = 'conda';
              commandArgs = [...commands];
            } else if (finalBuildTool === 'pipenv') {
              command = 'pipenv';
              commandArgs = [...commands];
            }
            
            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000)
            };
            
            // Set virtual environment if specified
            if (args.virtualEnv) {
              buildOptions.env = { ...process.env, VIRTUAL_ENV: args.virtualEnv };
            }
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }
            
            // Validate the final command for security
            const fullCommand = `${command} ${commandArgs.join(' ')}`;
            security.validateBuildCommand(fullCommand);
            
            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);
            
            if (!result.success) {
              throw new Error(`Python build failed: ${result.output || result.error}`);
            }
            
            result = createTextResult(`Python build completed successfully:\n${result.output}`);
            
            logger.info('Python build executed', { 
              clientIP, 
              buildTool,
              projectPath: validatedPath,
              command: `${command} ${commandArgs.join(' ')}`
            });
          } catch (error) {
            result = handleValidationError(error, 'Python build', logger, clientIP, { projectPath: args.projectPath });
          }
          break;

        case 'build_node':
          try {
            if (!args.projectPath) {
              throw new Error('projectPath is required');
            }

            // Use specialized validation for Node.js builds
            const packageManager = security.validateNodeBuild(args.projectPath, args.packageManager);
            const validatedPath = args.projectPath; // Already validated in validateNodeBuild
            
            // Auto-detect package manager if needed
            let finalPackageManager = packageManager;
            if (packageManager === 'auto') {
              const fs = require('fs');
              if (fs.existsSync(path.join(validatedPath, 'yarn.lock'))) {
                finalPackageManager = 'yarn';
              } else if (fs.existsSync(path.join(validatedPath, 'pnpm-lock.yaml'))) {
                finalPackageManager = 'pnpm';
              } else {
                finalPackageManager = 'npm';
              }
            }
            
            const scripts = args.scripts || ['build'];
            const installDeps = args.installDeps !== false; // Default to true
            const environment = args.environment || 'production';
            
            let commands = [];
            
            // Install dependencies first if requested
            if (installDeps) {
              if (finalPackageManager === 'npm') {
                commands.push(['npm', ['install']]);
              } else if (finalPackageManager === 'yarn') {
                commands.push(['yarn', ['install']]);
              } else if (finalPackageManager === 'pnpm') {
                commands.push(['pnpm', ['install']]);
              }
            }
            
            // Add script commands
            for (const script of scripts) {
              if (finalPackageManager === 'npm') {
                commands.push(['npm', ['run', script]]);
              } else if (finalPackageManager === 'yarn') {
                commands.push(['yarn', [script]]);
              } else if (finalPackageManager === 'pnpm') {
                commands.push(['pnpm', ['run', script]]);
              }
            }
            
            // TypeScript type checking if requested
            if (args.typeCheck) {
              commands.push(['npx', ['tsc', '--noEmit']]);
            }
            
            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000),
              env: { ...process.env, NODE_ENV: environment }
            };
            
            if (args.nodeVersion) {
              buildOptions.env.NODE_VERSION = args.nodeVersion;
            }
            
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }
            
            // Execute commands sequentially
            let finalResult = null;
            for (const [command, commandArgs] of commands) {
              // Validate each command for security
              const fullCommand = `${command} ${commandArgs.join(' ')}`;
              security.validateBuildCommand(fullCommand);
              
              finalResult = await executeBuild(command, commandArgs, buildOptions);
              if (!finalResult.success) {
                throw new Error(`Node.js build failed at ${command}: ${finalResult.output || finalResult.error}`);
              }
            }
            
            result = createTextResult(`Node.js build completed successfully:\n${finalResult.output}`);
            
            logger.info('Node.js build executed', { 
              clientIP, 
              packageManager: finalPackageManager,
              projectPath: validatedPath,
              scripts,
              environment
            });
          } catch (error) {
            result = handleValidationError(error, 'Node.js build', logger, clientIP, { projectPath: args.projectPath });
          }
          break;

        case 'build_go':
          try {
            if (!args.projectPath || !args.action) {
              throw new Error('projectPath and action are required');
            }

            // Validate project path and action
            const validatedPath = security.validatePath(args.projectPath);
            const validActions = ['build', 'test', 'run', 'install', 'clean', 'mod', 'vet', 'fmt'];
            if (!validActions.includes(args.action)) {
              throw new Error(`Invalid Go action. Expected: ${validActions.join(', ')}`);
            }

            let command = 'go';
            let commandArgs = [args.action];
            
            // Handle different Go actions
            if (args.action === 'build') {
              if (args.outputPath) {
                commandArgs.push('-o', args.outputPath);
              }
              if (args.buildFlags && args.buildFlags.length > 0) {
                commandArgs.push(...args.buildFlags);
              }
              if (args.tags && args.tags.length > 0) {
                commandArgs.push('-tags', args.tags.join(','));
              }
            } else if (args.action === 'test') {
              if (args.verbose) {
                commandArgs.push('-v');
              }
              if (args.coverage) {
                commandArgs.push('-cover');
              }
              commandArgs.push('./...');
            } else if (args.action === 'mod') {
              if (!args.modAction) {
                throw new Error('modAction is required when action is "mod"');
              }
              const validModActions = ['download', 'tidy', 'verify', 'init'];
              if (!validModActions.includes(args.modAction)) {
                throw new Error(`Invalid mod action. Expected: ${validModActions.join(', ')}`);
              }
              commandArgs = ['mod', args.modAction];
            } else if (args.action === 'vet' || args.action === 'fmt') {
              commandArgs.push('./...');
            }

            // Build environment with cross-compilation support
            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000),
              env: { ...process.env }
            };

            // Cross-compilation support
            if (args.targetOS) {
              buildOptions.env.GOOS = args.targetOS;
            }
            if (args.targetArch) {
              buildOptions.env.GOARCH = args.targetArch;
            }

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Validate the final command for security
            const fullCommand = `${command} ${commandArgs.join(' ')}`;
            security.validateBuildCommand(fullCommand);

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Go ${args.action} failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Go ${args.action} completed successfully:\n${result.output}`);

            logger.info('Go build executed', { 
              clientIP, 
              action: args.action,
              projectPath: validatedPath,
              command: fullCommand,
              crossCompilation: args.targetOS || args.targetArch ? `${args.targetOS || 'current'}/${args.targetArch || 'current'}` : null
            });
          } catch (error) {
            result = handleValidationError(error, 'Go build', logger, clientIP, { projectPath: args.projectPath, action: args.action });
          }
          break;

        case 'build_rust':
          try {
            if (!args.projectPath || !args.action) {
              throw new Error('projectPath and action are required');
            }

            // Validate project path and action
            const validatedPath = security.validatePath(args.projectPath);
            const validActions = ['build', 'test', 'run', 'check', 'clippy', 'fmt', 'doc', 'clean', 'update'];
            if (!validActions.includes(args.action)) {
              throw new Error(`Invalid Rust action. Expected: ${validActions.join(', ')}`);
            }

            let command = 'cargo';
            let commandArgs = [args.action];
            
            // Handle different Cargo actions
            if (args.action === 'build' || args.action === 'test' || args.action === 'check') {
              if (args.release) {
                commandArgs.push('--release');
              }
              if (args.target) {
                commandArgs.push('--target', args.target);
              }
              if (args.features && args.features.length > 0) {
                commandArgs.push('--features', args.features.join(','));
              }
              if (args.allFeatures) {
                commandArgs.push('--all-features');
              }
              if (args.noDefaultFeatures) {
                commandArgs.push('--no-default-features');
              }
            }

            // Test-specific options
            if (args.action === 'test') {
              if (args.testName) {
                commandArgs.push(args.testName);
              }
            }

            // Clippy-specific options
            if (args.action === 'clippy') {
              if (args.allTargets) {
                commandArgs.push('--all-targets');
              }
              if (args.denyWarnings) {
                commandArgs.push('--', '-D', 'warnings');
              }
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000)
            };

            // Set target directory if specified
            if (args.outputDir) {
              buildOptions.env = { ...process.env, CARGO_TARGET_DIR: args.outputDir };
            }

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Validate the final command for security
            const fullCommand = `${command} ${commandArgs.join(' ')}`;
            security.validateBuildCommand(fullCommand);

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Rust ${args.action} failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Rust ${args.action} completed successfully:\n${result.output}`);

            logger.info('Rust build executed', { 
              clientIP, 
              action: args.action,
              projectPath: validatedPath,
              command: fullCommand,
              release: args.release,
              target: args.target
            });
          } catch (error) {
            result = handleValidationError(error, 'Rust build', logger, clientIP, { projectPath: args.projectPath, action: args.action });
          }
          break;

        case 'build_cpp':
          try {
            if (!args.projectPath || !args.buildSystem) {
              throw new Error('projectPath and buildSystem are required');
            }

            // Validate project path and build system
            const validatedPath = security.validatePath(args.projectPath);
            const validBuildSystems = ['cmake', 'msbuild', 'make', 'ninja'];
            if (!validBuildSystems.includes(args.buildSystem)) {
              throw new Error(`Invalid build system. Expected: ${validBuildSystems.join(', ')}`);
            }

            let commands = [];

            if (args.buildSystem === 'cmake') {
              const buildDir = args.buildDir || 'build';
              
              // Configure step
              let configureArgs = ['-S', '.', '-B', buildDir];
              
              if (args.generator) {
                configureArgs.push('-G', args.generator);
              }
              if (args.buildType) {
                configureArgs.push(`-DCMAKE_BUILD_TYPE=${args.buildType}`);
              }
              if (args.cmakeOptions) {
                for (const [key, value] of Object.entries(args.cmakeOptions)) {
                  configureArgs.push(`-D${key}=${value}`);
                }
              }
              
              commands.push(['cmake', configureArgs]);
              
              // Build step
              let buildArgs = ['--build', buildDir];
              if (args.target) {
                buildArgs.push('--target', args.target);
              }
              if (args.parallel) {
                buildArgs.push('--parallel');
              }
              if (args.verbose) {
                buildArgs.push('--verbose');
              }
              
              commands.push(['cmake', buildArgs]);
              
            } else if (args.buildSystem === 'msbuild') {
              let msbuildArgs = [validatedPath];
              
              if (args.configuration) {
                msbuildArgs.push(`/p:Configuration=${args.configuration}`);
              }
              if (args.platform) {
                msbuildArgs.push(`/p:Platform=${args.platform}`);
              }
              if (args.target) {
                msbuildArgs.push(`/t:${args.target}`);
              }
              if (args.parallel) {
                msbuildArgs.push('/m');
              }
              if (args.verbose) {
                msbuildArgs.push('/v:detailed');
              }
              
              commands.push(['msbuild', msbuildArgs]);
              
            } else if (args.buildSystem === 'make') {
              let makeArgs = [];
              
              if (args.target) {
                makeArgs.push(args.target);
              }
              if (args.parallel) {
                makeArgs.push('-j');
              }
              
              commands.push(['make', makeArgs]);
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 600000) // Longer timeout for C++ builds
            };

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Execute commands sequentially
            let finalResult = null;
            for (const [command, commandArgs] of commands) {
              // Validate each command for security
              const fullCommand = `${command} ${commandArgs.join(' ')}`;
              security.validateBuildCommand(fullCommand);
              
              finalResult = await executeBuild(command, commandArgs, buildOptions);
              if (!finalResult.success) {
                throw new Error(`C++ build failed at ${command}: ${finalResult.output || finalResult.error}`);
              }
            }

            result = createTextResult(`C++ build completed successfully:\n${finalResult.output}`);

            logger.info('C++ build executed', { 
              clientIP, 
              buildSystem: args.buildSystem,
              projectPath: validatedPath,
              buildType: args.buildType,
              configuration: args.configuration
            });
          } catch (error) {
            result = handleValidationError(error, 'C++ build', logger, clientIP, { projectPath: args.projectPath, buildSystem: args.buildSystem });
          }
          break;

        case 'build_docker':
          try {
            if (!args.contextPath || !args.imageName) {
              throw new Error('contextPath and imageName are required');
            }

            // Validate context path and image name
            const validatedPath = security.validatePath(args.contextPath);
            
            // Basic image name validation
            if (!/^[a-z0-9]([a-z0-9\-_\.]*[a-z0-9])?(\:[a-zA-Z0-9]([a-zA-Z0-9\-_\.]*[a-zA-Z0-9])?)?$/.test(args.imageName.toLowerCase())) {
              throw new Error('Invalid image name format');
            }

            let command = 'docker';
            let commandArgs = ['build', '-t', args.imageName];
            
            // Add build options
            if (args.dockerfile) {
              commandArgs.push('-f', args.dockerfile);
            }
            
            if (args.buildArgs) {
              for (const [key, value] of Object.entries(args.buildArgs)) {
                commandArgs.push('--build-arg', `${key}=${value}`);
              }
            }
            
            if (args.target) {
              commandArgs.push('--target', args.target);
            }
            
            if (args.platform) {
              commandArgs.push('--platform', args.platform);
            }
            
            if (args.noCache) {
              commandArgs.push('--no-cache');
            }
            
            if (args.pull) {
              commandArgs.push('--pull');
            }
            
            if (args.squash) {
              commandArgs.push('--squash');
            }
            
            if (args.labels) {
              for (const [key, value] of Object.entries(args.labels)) {
                commandArgs.push('--label', `${key}=${value}`);
              }
            }
            
            if (args.secrets && args.secrets.length > 0) {
              for (const secret of args.secrets) {
                commandArgs.push('--secret', secret);
              }
            }
            
            // Add context path (always last)
            commandArgs.push('.');

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000) // Default 30 minutes for Docker builds
            };

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Validate the final command for security
            const fullCommand = `${command} ${commandArgs.join(' ')}`;
            security.validateBuildCommand(fullCommand);

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Docker build failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Docker build completed successfully:\n${result.output}`);

            logger.info('Docker build executed', { 
              clientIP, 
              imageName: args.imageName,
              contextPath: validatedPath,
              command: fullCommand,
              dockerfile: args.dockerfile,
              target: args.target
            });
          } catch (error) {
            result = handleValidationError(error, 'Docker build', logger, clientIP, { contextPath: args.contextPath, imageName: args.imageName });
          }
          break;

        case 'build_kotlin':
          try {
            if (!args.projectPath || !args.projectType) {
              throw new Error('projectPath and projectType are required');
            }

            // Validate project path and type
            const validatedPath = security.validatePath(args.projectPath);
            const validatedProject = security.validateKotlinBuild(validatedPath, args.projectType);

            let command;
            let commandArgs = [];

            // Determine Gradle wrapper or command
            const gradlewPath = path.join(validatedPath, 'gradlew.bat');
            const gradlewExists = await fs.promises.access(gradlewPath).then(() => true).catch(() => false);
            command = gradlewExists ? gradlewPath : 'gradle';

            // Build command based on project type
            switch (args.projectType) {
              case 'android':
                // Android specific build
                if (args.tasks && args.tasks.length > 0) {
                  commandArgs.push(...args.tasks);
                } else if (args.buildVariant) {
                  commandArgs.push(`assemble${args.buildVariant.charAt(0).toUpperCase() + args.buildVariant.slice(1)}`);
                } else {
                  commandArgs.push('assemble');
                }

                // Add signing configuration if provided
                if (args.signingConfig) {
                  if (args.signingConfig.storeFile) {
                    commandArgs.push(`-Pandroid.injected.signing.store.file=${args.signingConfig.storeFile}`);
                  }
                  if (args.signingConfig.storePassword) {
                    const password = args.signingConfig.storePassword.startsWith('encrypted:') ?
                      crypto.decrypt(args.signingConfig.storePassword.substring(10)) :
                      args.signingConfig.storePassword;
                    commandArgs.push(`-Pandroid.injected.signing.store.password=${password}`);
                  }
                  if (args.signingConfig.keyAlias) {
                    commandArgs.push(`-Pandroid.injected.signing.key.alias=${args.signingConfig.keyAlias}`);
                  }
                  if (args.signingConfig.keyPassword) {
                    const keyPassword = args.signingConfig.keyPassword.startsWith('encrypted:') ?
                      crypto.decrypt(args.signingConfig.keyPassword.substring(10)) :
                      args.signingConfig.keyPassword;
                    commandArgs.push(`-Pandroid.injected.signing.key.password=${keyPassword}`);
                  }
                }
                break;

              case 'native':
                // Kotlin/Native build
                commandArgs.push('build');
                if (args.target) {
                  commandArgs.push(`-Ptarget=${args.target}`);
                }
                if (args.buildType) {
                  commandArgs.push(`-PbuildType=${args.buildType}`);
                }
                break;

              case 'multiplatform':
                // Kotlin Multiplatform build
                if (args.tasks && args.tasks.length > 0) {
                  commandArgs.push(...args.tasks);
                } else {
                  commandArgs.push('build');
                }
                if (args.target) {
                  commandArgs.push(`-Ptarget=${args.target}`);
                }
                break;

              case 'jvm':
              default:
                // Standard JVM build
                if (args.tasks && args.tasks.length > 0) {
                  commandArgs.push(...args.tasks);
                } else {
                  commandArgs.push('build');
                }
                break;
            }

            // Add Gradle options
            if (args.gradleOptions && args.gradleOptions.length > 0) {
              commandArgs.push(...security.validateBuildFlags(args.gradleOptions));
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 600000) // 10 minutes for Android builds
            };

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Kotlin build failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Kotlin build completed successfully:\n${result.output}`);

            logger.info('Kotlin build executed', { 
              clientIP, 
              projectPath: validatedPath,
              projectType: args.projectType,
              buildVariant: args.buildVariant,
              tasks: args.tasks
            });
          } catch (error) {
            result = handleValidationError(error, 'Kotlin build', logger, clientIP, { projectPath: args.projectPath, projectType: args.projectType });
          }
          break;

        case 'build_swift':
          try {
            if (!args.projectPath || !args.action) {
              throw new Error('projectPath and action are required');
            }

            // Validate project path and action
            const validatedPath = security.validatePath(args.projectPath);
            const validatedAction = security.validateSwiftBuild(validatedPath, args.action);

            const command = 'swift';
            let commandArgs = [validatedAction.action];

            // Add configuration
            if (args.configuration) {
              commandArgs.push('-c', args.configuration);
            }

            // Action-specific options
            switch (validatedAction.action) {
              case 'build':
                if (args.package) {
                  commandArgs.push('--package-path', args.package);
                }
                if (args.arch) {
                  commandArgs.push('--arch', args.arch);
                }
                break;

              case 'test':
                if (args.enableCodeCoverage) {
                  commandArgs.push('--enable-code-coverage');
                }
                if (args.parallel) {
                  commandArgs.push('--parallel');
                }
                break;

              case 'run':
                // Run specific arguments can be added here
                break;

              case 'package':
                // Package specific options
                break;

              case 'clean':
                // No additional arguments for clean
                break;
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000) // 5 minutes
            };

            // Add platform-specific environment variables if needed
            if (args.platform) {
              buildOptions.env = {
                ...process.env,
                SWIFT_PLATFORM: args.platform
              };
            }

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Swift ${args.action} failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Swift ${args.action} completed successfully:\n${result.output}`);

            logger.info('Swift build executed', { 
              clientIP, 
              projectPath: validatedPath,
              action: args.action,
              configuration: args.configuration,
              platform: args.platform
            });
          } catch (error) {
            result = handleValidationError(error, 'Swift build', logger, clientIP, { projectPath: args.projectPath, action: args.action });
          }
          break;

        case 'build_php':
          try {
            if (!args.projectPath || !args.action) {
              throw new Error('projectPath and action are required');
            }

            // Validate project path and action
            const validatedPath = security.validatePath(args.projectPath);
            const validatedAction = security.validatePhpBuild(validatedPath, args.action);

            let command;
            let commandArgs = [];

            // Determine package manager
            const packageManager = args.packageManager || 'composer';

            switch (validatedAction.action) {
              case 'install':
                command = packageManager;
                commandArgs.push('install');
                if (args.noDev) {
                  commandArgs.push('--no-dev');
                }
                if (args.optimize) {
                  commandArgs.push('--optimize-autoloader');
                }
                break;

              case 'update':
                command = packageManager;
                commandArgs.push('update');
                if (args.noDev) {
                  commandArgs.push('--no-dev');
                }
                break;

              case 'test':
                // Determine test framework
                const testFramework = args.testFramework || 'phpunit';
                const vendorBinPath = path.join(validatedPath, 'vendor', 'bin', testFramework);
                const vendorBinExists = await fs.promises.access(vendorBinPath).then(() => true).catch(() => false);
                
                command = vendorBinExists ? vendorBinPath : testFramework;
                
                if (testFramework === 'phpunit') {
                  if (args.coverage) {
                    commandArgs.push('--coverage-text');
                  }
                  if (args.testSuite) {
                    commandArgs.push(`--testsuite=${args.testSuite}`);
                  }
                } else if (testFramework === 'phpspec') {
                  commandArgs.push('run');
                  if (args.format) {
                    commandArgs.push('--format', args.format);
                  }
                }
                break;

              case 'artisan':
                command = 'php';
                commandArgs.push('artisan', args.artisanCommand || 'list');
                break;

              case 'serve':
                command = 'php';
                commandArgs.push('-S', 'localhost:8000', '-t', 'public');
                break;

              case 'build':
                // Custom build script
                command = packageManager;
                commandArgs.push('run', 'build');
                break;
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000) // 5 minutes
            };

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`PHP ${args.action} failed: ${result.output || result.error}`);
            }

            result = createTextResult(`PHP ${args.action} completed successfully:\n${result.output}`);

            logger.info('PHP build executed', { 
              clientIP, 
              projectPath: validatedPath,
              action: args.action,
              packageManager: packageManager,
              testFramework: args.testFramework
            });
          } catch (error) {
            result = handleValidationError(error, 'PHP build', logger, clientIP, { projectPath: args.projectPath, action: args.action });
          }
          break;

        case 'build_ruby':
          try {
            if (!args.projectPath || !args.action) {
              throw new Error('projectPath and action are required');
            }

            // Validate project path and action
            const validatedPath = security.validatePath(args.projectPath);
            const validatedAction = security.validateRubyBuild(validatedPath, args.action);

            let command;
            let commandArgs = [];
            let buildEnv = { ...process.env };

            switch (validatedAction.action) {
              case 'install':
                command = 'bundle';
                commandArgs.push('install');
                if (args.withoutGroups && args.withoutGroups.length > 0) {
                  commandArgs.push('--without', args.withoutGroups.join(' '));
                }
                if (args.deployment) {
                  commandArgs.push('--deployment');
                }
                break;

              case 'update':
                command = 'bundle';
                commandArgs.push('update');
                break;

              case 'exec':
                command = 'bundle';
                commandArgs.push('exec');
                if (args.command) {
                  commandArgs.push(...args.command.split(' '));
                }
                break;

              case 'test':
                const testFramework = args.testFramework || 'rspec';
                command = testFramework;
                
                if (testFramework === 'rspec') {
                  if (args.parallel) {
                    command = 'parallel_rspec';
                  }
                  if (args.format) {
                    commandArgs.push('--format', args.format);
                  }
                } else if (testFramework === 'minitest') {
                  command = 'ruby';
                  commandArgs.push('-Itest');
                }
                break;

              case 'rails':
                command = 'rails';
                if (args.railsCommand) {
                  commandArgs.push(...args.railsCommand.split(' '));
                }
                if (args.railsEnv) {
                  buildEnv.RAILS_ENV = args.railsEnv;
                }
                break;

              case 'rake':
                command = 'rake';
                if (args.rakeTask) {
                  commandArgs.push(args.rakeTask);
                }
                break;

              case 'build':
                command = 'gem';
                commandArgs.push('build');
                if (args.gemspec) {
                  commandArgs.push(args.gemspec);
                } else {
                  // Find gemspec file
                  const gemspecPath = path.join(validatedPath, '*.gemspec');
                  commandArgs.push(gemspecPath);
                }
                break;
            }

            const buildOptions = {
              workingDirectory: validatedPath,
              env: buildEnv,
              timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000) // 5 minutes
            };

            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              buildOptions.remoteHost = validatedHost;
            }

            // Execute build
            result = await executeBuild(command, commandArgs, buildOptions);

            if (!result.success) {
              throw new Error(`Ruby ${args.action} failed: ${result.output || result.error}`);
            }

            result = createTextResult(`Ruby ${args.action} completed successfully:\n${result.output}`);

            logger.info('Ruby build executed', { 
              clientIP, 
              projectPath: validatedPath,
              action: args.action,
              testFramework: args.testFramework,
              railsEnv: args.railsEnv
            });
          } catch (error) {
            result = handleValidationError(error, 'Ruby build', logger, clientIP, { projectPath: args.projectPath, action: args.action });
          }
          break;
          
        default:
          logger.warn('Unknown tool requested', { clientIP, toolName: name });
          result = createTextResult(`Unknown tool: ${name}`);
      }
      
      res.json({
        jsonrpc: '2.0',
        id: id,
        result: result
      });
    } else {
      res.json({
        jsonrpc: '2.0',
        id: id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

async function executeBuild(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Prepare spawn options
    const spawnOptions = {
      cwd: options.workingDirectory || process.cwd(),
      env: options.env || process.env
    };
    
    // Remove shell: true to prevent command injection
    const childProcess = spawn(command, args, spawnOptions);
    let output = '';
    let error = '';
    let processExited = false;

    // Add timeout handling
    const timeout = options.timeout || getNumericEnv('COMMAND_TIMEOUT', 1800000); // 30 minutes default
    const timer = setTimeout(() => {
      if (!processExited) {
        childProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!processExited) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
        const timeoutError = new Error(`Command timed out after ${timeout/1000} seconds`);
        timeoutError.code = 'ETIMEDOUT';
        timeoutError.timeout = timeout;
        reject(timeoutError);
      }
    }, timeout);

    // Handle stdout safely
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
    }

    // Handle stderr safely
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        error += data.toString();
      });
    }

    childProcess.on('error', (err) => {
      clearTimeout(timer);
      processExited = true;
      resolve(createTextResult(`Process error: ${err.message}`));
    });

    childProcess.on('close', (code, signal) => {
      clearTimeout(timer);
      processExited = true;
      
      const result = {
        success: code === 0 && !signal,
        output: output,
        error: error,
        exitCode: code,
        signal: signal,
        content: [{
          type: 'text',
          text: `${output}${error ? '\n\nErrors:\n' + error : ''}`
        }]
      };
      
      if (signal) {
        result.content[0].text = `Process terminated by signal: ${signal}\n${result.content[0].text}`;
        result.success = false;
      } else if (code !== 0 && !options.ignoreExitCode) {
        result.content[0].text = `Process failed with code ${code}:\n${result.content[0].text}`;
        result.success = false;
      }
      
      resolve(result);
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
    let version = 'unknown';
    try {
      const packageJson = require('../../package.json');
      version = packageJson.version || 'unknown';
    } catch (error) {
      // Try server package.json as fallback
      try {
        const serverPackageJson = require('../package.json');
        version = serverPackageJson.version || 'unknown';
      } catch (e) {
        logger.warn('Could not read version from package.json', { error: e.message });
      }
    }
    
    // Get current timeout settings
    const commandTimeout = getNumericEnv('COMMAND_TIMEOUT', 1800000);
    const timeoutMinutes = Math.round(commandTimeout / 60000);
    const timeoutSeconds = Math.round(commandTimeout / 1000);
    
    // Debug environment variables
    console.log('\n🔍 Debug Environment Variables:');
    console.log(`   • ENABLE_DANGEROUS_MODE: "${process.env.ENABLE_DANGEROUS_MODE}"`);
    console.log(`   • NODE_ENV: "${process.env.NODE_ENV}"`);
    console.log(`   • isDangerousMode: ${isDangerousMode}`);
    console.log('');
    
    if (isDangerousMode) {
      console.log('\n🔥🔥🔥 MCP SERVER v' + version + ' - DANGEROUS MODE 🔥🔥🔥');
      console.log(`🔥 Running on http://0.0.0.0:${PORT} (UNRESTRICTED)`);
      console.log(`🔥 Health: http://0.0.0.0:${PORT}/health`);
      console.log(`🔥 Endpoint: http://0.0.0.0:${PORT}/mcp`);
      console.log(`🔥 Command Timeout: ${timeoutMinutes} minutes (${timeoutSeconds}s)`);
    } else {
      console.log(`\nWindows MCP Server v${version}`);
      console.log(`Running on http://0.0.0.0:${PORT}`);
      console.log(`Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
      console.log(`Command Timeout: ${timeoutMinutes} minutes (${timeoutSeconds}s)`);
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
        startTime: new Date().toISOString(),
        commandTimeout: commandTimeout
      });
    }
    
    // Display configuration summary
    console.log('\n📋 Configuration Summary:');
    console.log(`   • Version: ${version}`);
    console.log(`   • Port: ${PORT}`);
    console.log(`   • Command Timeout: ${timeoutMinutes} minutes (${commandTimeout}ms)`);
    console.log(`   • Dangerous Mode: ${isDangerousMode ? '🔥 ENABLED' : '✅ DISABLED'}`);
    
    // Check actual rate limiting status
    const maxRequests = getNumericEnv('RATE_LIMIT_REQUESTS', 60);
    const isRateLimitingDisabled = maxRequests === 0 || isDangerousMode;
    console.log(`   • Rate Limiting: ${isRateLimitingDisabled ? '❌ DISABLED' : '✅ ENABLED'}`);
    
    // Check actual dev commands status
    const isDevCommandsEnabled = process.env.ENABLE_DEV_COMMANDS === 'true';
    console.log(`   • Dev Commands: ${isDevCommandsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    
    console.log(`   • Authentication: ${process.env.MCP_AUTH_TOKEN ? '✅ CONFIGURED' : '⚠️  NOT SET'}`);
    console.log('');
    
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