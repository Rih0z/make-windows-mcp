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
const authManager = require('./utils/auth-manager');
const PortManager = require('./utils/port-manager');
const portManager = new PortManager();
const helpGenerator = require('./utils/help-generator');
const powershellExecutor = require('./utils/powershell-enhanced');
const httpClient = require('./utils/http-client');
const ProjectDetector = require('./utils/project-detector');
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
  if (process.env.NORDVPN_ENABLED === 'true' && !process.env.REMOTE_PASSWORD) {
    warnings.push('REMOTE_PASSWORD must be set when NORDVPN_ENABLED is true');
  }
  
  // Validate numeric environment variables
  const numericVars = {
    MCP_SERVER_PORT: { default: getNumericEnv('DEFAULT_SERVER_PORT', 8080), min: 1, max: 65535 },
    RATE_LIMIT_REQUESTS: { default: 60, min: 1, max: 1000 },
    RATE_LIMIT_WINDOW: { default: 60000, min: 1000, max: 600000 },
    COMMAND_TIMEOUT: { default: 1800000, min: 1000, max: 3600000 },
    SSH_TIMEOUT: { default: 30000, min: 1000, max: 300000 },
    POWERSHELL_DEFAULT_TIMEOUT: { default: 300, min: 1, max: 3600 },
    POWERSHELL_MAX_TIMEOUT: { default: 1800, min: 1, max: 7200 },
    DOTNET_BUILD_TIMEOUT: { default: 600000, min: 60000, max: 3600000 },
    CPP_BUILD_TIMEOUT: { default: 600000, min: 60000, max: 3600000 },
    DEFAULT_SERVER_PORT: { default: 8080, min: 1, max: 65535 },
    PHP_SERVE_PORT: { default: 8000, min: 1, max: 65535 },
    SSH_PORT: { default: 22, min: 1, max: 65535 },
    FILE_ENCODING_MAX_UPLOAD: { default: 52428800, min: 1048576, max: 104857600 },
    HTTP_REQUEST_TIMEOUT: { default: 30000, min: 1000, max: 300000 },
    HTTP_MAX_TIMEOUT: { default: 300000, min: 60000, max: 600000 },
    HTTP_MAX_REDIRECTS: { default: 5, min: 0, max: 10 }
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
// Enhanced JSON parsing with robust error handling for complex commands
function validateAndParseJsonRpc(body) {
  try {
    // Pre-process body to handle escaped characters properly
    const sanitized = body.toString()
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');

    const parsed = JSON.parse(sanitized);
    
    // Validate JSONRPC structure
    if (!parsed.jsonrpc || parsed.jsonrpc !== '2.0') {
      throw new Error('Missing or invalid jsonrpc field');
    }
    
    if (!parsed.method) {
      throw new Error('Missing method field');
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`JSON parsing failed: ${error.message}\nBody preview: ${body.toString().substring(0, 200)}...`);
  }
}

app.use(express.json({ 
  limit: '10mb', // Increased for large batch files
  verify: (req, res, buf) => {
    try {
      // Basic JSON validation - detailed validation happens later
      JSON.parse(buf);
    } catch (e) {
      // Enhanced error with more context
      const preview = buf.toString().substring(0, 200);
      logger.error('JSON parse error in middleware', { 
        clientIP: getClientIP(req), 
        error: e.message,
        bodyPreview: preview
      });
      throw new SyntaxError(`Invalid JSON structure: ${e.message}. Body preview: ${preview}...`);
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

// Secure Authentication middleware using AuthManager
app.use((req, res, next) => {
  const clientIP = getClientIP(req);
  
  // Skip auth for health check and auth management endpoints
  if (req.path === '/health' || req.path.startsWith('/auth/') || req.path.startsWith('/config/')) {
    return next();
  }
  
  // Check if authentication is enabled
  if (!authManager.isAuthEnabled()) {
    return next();
  }
  
  // Get authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.security('Missing authorization header', { 
      clientIP,
      path: req.path 
    });
    return res.status(401).json({
      error: {
        code: 'AUTH_HEADER_MISSING',
        message: 'Authorization header is required',
        details: {
          timestamp: new Date().toISOString(),
          expectedFormat: 'Authorization: Bearer <token>',
          suggestion: 'Include Authorization header with Bearer token format',
          clientIP: clientIP
        }
      }
    });
  }
  
  // Extract token using secure method
  const token = authManager.extractToken(authHeader);
  
  if (!token) {
    logger.security('Invalid authorization header format', { 
      clientIP,
      path: req.path,
      headerFormat: authHeader.substring(0, 20) + '...'
    });
    return res.status(401).json({
      error: {
        code: 'AUTH_HEADER_FORMAT_INVALID',
        message: 'Invalid authorization header format',
        details: {
          timestamp: new Date().toISOString(),
          receivedFormat: authHeader.substring(0, 20) + '...',
          expectedFormat: 'Authorization: Bearer <32-character-token>',
          suggestions: [
            'Ensure header starts with "Bearer " (note the space)',
            'Verify token is provided after "Bearer "',
            'Check for extra spaces or special characters'
          ],
          clientIP: clientIP
        }
      }
    });
  }
  
  // Validate token using secure comparison
  if (!authManager.validateToken(token)) {
    logger.security('Invalid authorization token', { 
      clientIP,
      path: req.path,
      expectedPartial: authManager.getExpectedTokenPartial(),
      receivedPartial: authManager.getPartialToken(token),
      tokenLength: { 
        expected: authManager.getExpectedTokenLength(), 
        received: token.length 
      }
    });
    
    // Development mode hint
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Token validation failed - check .env files on both server and client');
    }
    
    return res.status(401).json({
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authentication token is invalid',
        details: {
          timestamp: new Date().toISOString(),
          tokenComparison: {
            expectedLength: authManager.getExpectedTokenLength(),
            receivedLength: token.length,
            expectedPartial: authManager.getExpectedTokenPartial(),
            receivedPartial: authManager.getPartialToken(token)
          },
          suggestions: [
            'Verify the MCP_AUTH_TOKEN environment variable matches on server and client',
            'Check for extra spaces or newlines in the token',
            'Ensure the token is exactly 32 characters long',
            'Try regenerating the token with: openssl rand -hex 32'
          ],
          debugEndpoints: {
            authStatus: '/auth/status',
            configValidation: '/config/validate'
          },
          clientIP: clientIP
        }
      }
    });
  }
  
  // Authentication successful
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
      port: getNumericEnv('MCP_SERVER_PORT', getNumericEnv('DEFAULT_SERVER_PORT', 8080))
    }
  });
});

// Authentication status endpoint
app.get('/auth/status', (req, res) => {
  const clientIP = getClientIP(req);
  const authHeader = req.headers.authorization;
  
  // Extract token for validation
  const extractedToken = authManager.extractToken(authHeader);
  const isValidToken = authManager.validateToken(extractedToken);
  
  const authStatus = {
    timestamp: new Date().toISOString(),
    authEnabled: authManager.isAuthEnabled(),
    tokenProvided: !!extractedToken,
    tokenValid: isValidToken,
    clientIP: clientIP
  };
  
  // Add debug information if auth is enabled
  if (authManager.isAuthEnabled()) {
    authStatus.debug = {
      expectedTokenLength: authManager.getExpectedTokenLength(),
      providedTokenLength: extractedToken ? extractedToken.length : 0,
      expectedTokenPartial: authManager.getExpectedTokenPartial(),
      providedTokenPartial: authManager.getPartialToken(extractedToken),
      headerFormat: authHeader ? 'present' : 'missing'
    };
  }
  
  // Log the authentication check
  logger.info('Authentication status check', {
    clientIP,
    authEnabled: authStatus.authEnabled,
    tokenValid: authStatus.tokenValid,
    tokenProvided: authStatus.tokenProvided
  });
  
  res.json(authStatus);
});

// Configuration validation endpoint
app.get('/config/validate', (req, res) => {
  const clientIP = getClientIP(req);
  
  const config = {
    timestamp: new Date().toISOString(),
    server: {
      version: require('../package.json').version,
      nodeVersion: process.version,
      platform: process.platform
    },
    authentication: {
      enabled: authManager.isAuthEnabled(),
      tokenConfigured: !!process.env.MCP_AUTH_TOKEN,
      tokenLength: authManager.getExpectedTokenLength()
    },
    security: {
      dangerousMode: process.env.ENABLE_DANGEROUS_MODE === 'true',
      devCommands: process.env.ENABLE_DEV_COMMANDS === 'true',
      allowedIPs: process.env.ALLOWED_IPS || 'all',
      httpsEnabled: process.env.ENABLE_HTTPS === 'true'
    },
    networking: {
      port: getNumericEnv('MCP_SERVER_PORT', getNumericEnv('DEFAULT_SERVER_PORT', 8080)),
      rateLimiting: {
        enabled: getNumericEnv('RATE_LIMIT_REQUESTS', 60) > 0,
        requestsPerWindow: getNumericEnv('RATE_LIMIT_REQUESTS', 60),
        windowMs: getNumericEnv('RATE_LIMIT_WINDOW', 60000)
      }
    },
    paths: {
      allowedBuildPaths: process.env.ALLOWED_BUILD_PATHS || 'not configured',
      allowedBatchDirs: process.env.ALLOWED_BATCH_DIRS || 'not configured'
    }
  };
  
  // Validate configuration issues
  const issues = [];
  
  if (config.authentication.enabled && config.authentication.tokenLength < 16) {
    issues.push('Authentication token is too short (minimum 16 characters recommended)');
  }
  
  if (config.security.dangerousMode) {
    issues.push('DANGEROUS MODE is enabled - not recommended for production');
  }
  
  if (!config.authentication.enabled && process.env.NODE_ENV === 'production') {
    issues.push('Authentication is disabled in production environment');
  }
  
  config.validation = {
    status: issues.length === 0 ? 'valid' : 'warnings',
    issues: issues
  };
  
  logger.info('Configuration validation requested', { clientIP, issues: issues.length });
  
  res.json(config);
});

// Enhanced authentication refresh endpoint
app.post('/auth/refresh', (req, res) => {
  const clientIP = getClientIP(req);
  const authHeader = req.headers.authorization;
  
  if (!authManager.isAuthEnabled()) {
    return res.json({
      status: 'authentication_disabled',
      message: 'Authentication is not enabled on this server',
      timestamp: new Date().toISOString()
    });
  }
  
  const extractedToken = authManager.extractToken(authHeader);
  const isValidToken = authManager.validateToken(extractedToken);
  
  if (!isValidToken) {
    logger.security('Authentication refresh failed - invalid token', {
      clientIP,
      providedTokenPartial: authManager.getPartialToken(extractedToken)
    });
    
    return res.status(401).json({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Current authentication token is invalid',
        details: {
          timestamp: new Date().toISOString(),
          expectedTokenLength: authManager.getExpectedTokenLength(),
          providedTokenLength: extractedToken ? extractedToken.length : 0,
          suggestion: 'Verify the token in your environment configuration'
        }
      }
    });
  }
  
  // Token is valid - in this implementation, we don't actually refresh since tokens don't expire
  // But we provide confirmation and session information
  logger.info('Authentication refresh successful', { clientIP });
  
  res.json({
    status: 'token_valid',
    message: 'Authentication token is valid and active',
    timestamp: new Date().toISOString(),
    session: {
      tokenValid: true,
      serverUptime: process.uptime(),
      lastValidation: new Date().toISOString()
    }
  });
});

// Advanced authentication debug endpoint (development mode only)
app.post('/auth/debug', (req, res) => {
  const clientIP = getClientIP(req);
  
  // Only available in development mode for security
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      error: 'Debug endpoint only available in development mode'
    });
  }
  
  const authHeader = req.headers.authorization;
  const extractedToken = authManager.extractToken(authHeader);
  const diagnostics = authManager.generateDiagnostics(extractedToken, authHeader);
  
  // Add detailed environment analysis
  diagnostics.environment = {
    nodeEnv: process.env.NODE_ENV,
    authToken: {
      configured: !!process.env.MCP_AUTH_TOKEN,
      length: process.env.MCP_AUTH_TOKEN ? process.env.MCP_AUTH_TOKEN.length : 0,
      startsWithExpected: process.env.MCP_AUTH_TOKEN ? process.env.MCP_AUTH_TOKEN.startsWith('J') : false // Based on the example token
    },
    requestDetails: {
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      method: req.method,
      path: req.path
    }
  };
  
  // Add step-by-step validation process
  diagnostics.validationSteps = [
    { step: 1, name: 'Header Extraction', passed: !!authHeader },
    { step: 2, name: 'Bearer Format Check', passed: authHeader && authHeader.toLowerCase().startsWith('bearer ') },
    { step: 3, name: 'Token Extraction', passed: !!extractedToken },
    { step: 4, name: 'Token Length Check', passed: extractedToken && extractedToken.length === authManager.getExpectedTokenLength() },
    { step: 5, name: 'Token Content Validation', passed: authManager.validateToken(extractedToken) }
  ];
  
  logger.info('Authentication debug requested', { 
    clientIP, 
    stepsFailure: diagnostics.validationSteps.filter(s => !s.passed).map(s => s.name) 
  });
  
  res.json(diagnostics);
});

// Session health endpoint
app.get('/auth/health', (req, res) => {
  const sessionHealth = authManager.getSessionHealth();
  res.json(sessionHealth);
});

// Dynamic Help System Endpoints - Implements CLAUDE.md 第13条
app.get('/help/tools', (req, res) => {
  const clientIP = getClientIP(req);
  
  try {
    // Get current tools configuration (this will be dynamic)
    const mockTools = []; // We'll populate this with actual tools from the server
    
    // For now, we'll read the tools from the server configuration
    // This is a simplified version - in reality we'd get this from the MCP tools definition
    const documentation = helpGenerator.generateToolDocumentation(mockTools);
    
    logger.info('Help documentation requested', { clientIP });
    
    res.json({
      title: 'Windows MCP Build Server - Tool Documentation',
      version: require('../package.json').version,
      timestamp: new Date().toISOString(),
      documentation
    });
  } catch (error) {
    logger.error('Help generation failed', { clientIP, error: error.message });
    res.status(500).json({ error: 'Failed to generate help documentation' });
  }
});

// Category-specific help
app.get('/help/category/:category', (req, res) => {
  const clientIP = getClientIP(req);
  const category = req.params.category;
  
  const validCategories = ['build', 'system', 'files', 'network', 'management', 'auth'];
  
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      error: 'Invalid category',
      validCategories
    });
  }
  
  try {
    const mockTools = []; // Will be populated with actual tools
    const documentation = helpGenerator.generateToolDocumentation(mockTools);
    const categoryDocs = documentation.categories[category];
    
    if (!categoryDocs) {
      return res.status(404).json({ error: `No tools found in category: ${category}` });
    }
    
    logger.info('Category help requested', { clientIP, category });
    
    res.json({
      category,
      ...categoryDocs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Category help generation failed', { clientIP, category, error: error.message });
    res.status(500).json({ error: 'Failed to generate category help' });
  }
});

// Quick reference endpoint
app.get('/help/quick', (req, res) => {
  const clientIP = getClientIP(req);
  
  const quickHelp = {
    timestamp: new Date().toISOString(),
    server: 'Windows MCP Build Server',
    version: require('../package.json').version,
    
    essentialCommands: {
      'Check server status': 'GET /health',
      'List all tools': 'POST /mcp with method: tools/list',
      'Get help': 'GET /help/tools',
      'Check authentication': 'GET /auth/status'
    },
    
    categories: helpGenerator.categories,
    
    commonExamples: {
      'Build .NET project': {
        method: 'tools/call',
        tool: 'build_dotnet',
        example: {
          projectPath: 'C:/builds/MyProject/MyProject.csproj',
          configuration: 'Release'
        }
      },
      'Run PowerShell': {
        method: 'tools/call', 
        tool: 'run_powershell',
        example: {
          command: 'Get-Process'
        }
      },
      'Encode file': {
        method: 'tools/call',
        tool: 'encode_file_base64',
        example: {
          filePath: 'C:/builds/output/file.pdf'
        }
      }
    },
    
    troubleshooting: {
      authError: 'Check /auth/status and verify MCP_AUTH_TOKEN',
      buildError: 'Ensure project path is in allowed directories',
      permissionError: 'Check security mode and command permissions'
    }
  };
  
  logger.info('Quick help requested', { clientIP });
  res.json(quickHelp);
});

// New feature notification endpoint
app.get('/help/whats-new', (req, res) => {
  const clientIP = getClientIP(req);
  const currentVersion = require('../package.json').version;
  
  const whatsNew = {
    timestamp: new Date().toISOString(),
    currentVersion,
    
    latestFeatures: {
      'v1.0.28': {
        date: '2025-07-11',
        category: 'Authentication Enhancement',
        features: [
          {
            name: 'Session Management API',
            description: 'New endpoints: /auth/status, /auth/refresh, /auth/health',
            usage: 'GET /auth/status - Check authentication state'
          },
          {
            name: 'Enhanced Error Messages',
            description: 'Detailed error codes and debugging suggestions',
            usage: 'Authentication errors now include specific solutions'
          },
          {
            name: 'Debug Endpoints',
            description: 'Development mode debugging with /auth/debug',
            usage: 'POST /auth/debug - Detailed authentication analysis'
          }
        ]
      },
      'v1.0.27': {
        date: '2025-07-11',
        category: 'File Operations',
        features: [
          {
            name: 'PDF Base64 Encoding',
            description: 'New encode_file_base64 tool for file verification',
            usage: 'Perfect for verifying PDF orientation and content'
          },
          {
            name: 'Preview Mode',
            description: 'Get file metadata without full Base64 encoding',
            usage: 'Use options.preview: true for metadata only'
          }
        ]
      },
      'v1.0.26': {
        date: '2025-07-11', 
        category: 'Smart Connection',
        features: [
          {
            name: 'Server Auto-Discovery',
            description: 'Automatic port detection and connection',
            usage: 'Set MCP_SERVER_PORT=auto for hands-free connections'
          },
          {
            name: 'Smart Port Management',
            description: 'Automatic port conflict resolution',
            usage: 'No more EADDRINUSE errors - automatic fallback'
          }
        ]
      }
    },
    
    gettingStarted: {
      newUsers: [
        '1. Check server status: GET /health',
        '2. List all tools: POST /mcp method=tools/list',
        '3. Get quick help: GET /help/quick',
        '4. Try a command: POST /mcp method=tools/call'
      ],
      tryTheseNew: [
        {
          feature: 'Authentication Status',
          command: 'GET /auth/status',
          description: 'Check your authentication configuration'
        },
        {
          feature: 'PDF Encoding',
          command: 'tools/call encode_file_base64',
          description: 'Encode PDF files for verification'
        },
        {
          feature: 'Quick Reference',
          command: 'GET /help/quick',
          description: 'Get instant tool examples'
        }
      ]
    },
    
    upgradeNotes: {
      breaking: [],
      improvements: [
        'All authentication errors now include detailed diagnostics',
        'Client connections are now fully automatic',
        'Help system provides real-time usage examples'
      ],
      migration: 'No migration required - all changes are backward compatible'
    }
  };
  
  logger.info('What\'s new requested', { clientIP, version: currentVersion });
  res.json(whatsNew);
});

// Feature notification for specific versions
app.get('/help/whats-new/:version', (req, res) => {
  const clientIP = getClientIP(req);
  const requestedVersion = req.params.version;
  
  const versionFeatures = {
    'v1.0.28': {
      title: 'Enterprise Authentication System Enhancement',
      summary: 'Complete authentication system overhaul with enterprise-grade features',
      newTools: [],
      newEndpoints: ['/auth/status', '/auth/refresh', '/auth/health', '/auth/debug', '/config/validate'],
      improvements: [
        'Structured error responses with detailed diagnostics',
        'Real-time authentication status checking',
        'Development mode debugging capabilities',
        'Session health monitoring'
      ]
    },
    'v1.0.27': {
      title: 'PDF File Verification System',
      summary: 'Base64 encoding tools for PDF content verification',
      newTools: ['encode_file_base64'],
      newEndpoints: [],
      improvements: [
        'PDF content verification for image orientation fixes',
        'Preview mode for large file metadata',
        'Configurable file size limits'
      ]
    },
    'v1.0.26': {
      title: 'Smart Server Discovery System',
      summary: 'Automatic connection without manual port configuration',
      newTools: [],
      newEndpoints: [],
      improvements: [
        'Automatic server discovery and connection',
        'Port conflict resolution',
        'Zero-configuration client setup'
      ]
    }
  };
  
  const versionInfo = versionFeatures[requestedVersion];
  
  if (!versionInfo) {
    return res.status(404).json({
      error: 'Version not found',
      availableVersions: Object.keys(versionFeatures)
    });
  }
  
  logger.info('Version-specific features requested', { clientIP, version: requestedVersion });
  
  res.json({
    version: requestedVersion,
    timestamp: new Date().toISOString(),
    ...versionInfo
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
  
  // Use the already-parsed request body directly
  const { method, params, id } = req.body;
  
  try {
    if (method === 'initialize') {
      // MCP protocol initialization with welcome message (CLAUDE.md 第13条)
      const serverInfo = {
        name: 'windows-mcp-server',
        version: require('../package.json').version,
        authConfigured: authManager.isAuthEnabled(),
        dangerousMode: process.env.ENABLE_DANGEROUS_MODE === 'true'
      };
      
      const welcomeMessage = helpGenerator.generateWelcomeMessage(serverInfo);
      
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
            ...serverInfo,
            welcomeMessage,
            helpEndpoints: {
              comprehensive: '/help/tools',
              quickReference: '/help/quick',
              categories: '/help/category/{category}',
              authentication: '/auth/status'
            }
          },
          // 第13条完全実装: 初期化時の即座機能通知
          immediateNotification: {
            message: '🎉 MCP Connection Successful! Python Virtual Environment Support Available!',
            criticalFeatures: {
              '🐍 Python Testing Ready': 'build_python tool with virtual environment auto-creation',
              '🔨 Multi-Language Builds': '.NET, Java, Python, Node.js, Go, Rust, C++, Ruby',
              '⚡ Windows Automation': 'PowerShell execution with security controls',
              '📋 Help Available': 'Use tools/list or visit /help/tools for detailed examples'
            },
            quickStart: 'build_python: {"projectPath": "C:/project", "commands": ["test"], "useVirtualEnv": true}',
            version: serverInfo.version,
            totalTools: 10
          }
        }
      });
      
      logger.info('MCP initialization completed with welcome message', { 
        clientIP: getClientIP(req),
        version: serverInfo.version
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
      // Enhanced tools/list with help information (CLAUDE.md 第13条)
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
                  description: `Command timeout in seconds (default: ${getNumericEnv('POWERSHELL_DEFAULT_TIMEOUT', 300)}, max: ${getNumericEnv('POWERSHELL_MAX_TIMEOUT', 1800)})`,
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
                  description: `Target installation path (default: ${process.env.MCP_SERVER_PATH || 'C:\\mcp-server'})`
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
            description: 'Build and test Python applications with virtual environment support',
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
                useVirtualEnv: {
                  type: 'boolean',
                  description: 'Automatically use/create virtual environment (default: true)'
                },
                venvName: {
                  type: 'string',
                  description: 'Virtual environment directory name (default: ".venv")'
                },
                virtualEnv: {
                  type: 'string',
                  description: 'DEPRECATED: Use venvName instead. Path to existing virtual environment'
                },
                pythonVersion: {
                  type: 'string',
                  description: 'Python version requirement (e.g., "3.9", ">=3.8")'
                },
                installDeps: {
                  type: 'boolean',
                  description: 'Install dependencies before running commands (default: true)'
                },
                requirements: {
                  type: 'string',
                  description: 'Requirements file path (default: auto-detect requirements.txt, requirements-dev.txt, etc.)'
                },
                extraPackages: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Additional packages to install (e.g., ["pytest", "pytest-asyncio"])'
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
          },
          {
            name: 'encode_file_base64',
            description: 'Encode files to Base64 format with comprehensive security validation for PDF verification and file content analysis',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: { 
                  type: 'string',
                  description: 'Absolute path to file to encode (must be in allowed directories)'
                },
                options: {
                  type: 'object',
                  properties: {
                    maxSizeBytes: { 
                      type: 'number', 
                      description: `Maximum file size in bytes (default: 10MB, max: ${getNumericEnv('FILE_ENCODING_MAX_UPLOAD', 52428800)})`,
                      minimum: 1,
                      maximum: 52428800
                    },
                    allowedExtensions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Allowed file extensions (default: [".pdf", ".txt", ".docx", ".png", ".jpg", ".jpeg"])'
                    },
                    preview: {
                      type: 'boolean',
                      description: 'Return preview info only (metadata without full Base64 content)'
                    }
                  }
                }
              },
              required: ['filePath']
            }
          },
          {
            name: 'http_request',
            description: 'Execute HTTP requests bypassing PowerShell limitations - perfect for AI server testing and JSON API calls',
            inputSchema: {
              type: 'object',
              properties: {
                url: { 
                  type: 'string', 
                  description: 'Target URL (supports localhost for AI server testing)'
                },
                method: { 
                  type: 'string', 
                  enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
                  description: 'HTTP method'
                },
                headers: { 
                  type: 'object', 
                  description: 'HTTP headers as key-value pairs'
                },
                body: { 
                  type: 'string', 
                  description: 'Request body as string'
                },
                json: { 
                  type: 'object', 
                  description: 'Auto-serialize JSON object (sets Content-Type: application/json)'
                },
                timeout: { 
                  type: 'number', 
                  default: 30, 
                  minimum: 1,
                  maximum: 300,
                  description: 'Timeout in seconds (default: 30, max: 300)'
                },
                followRedirects: {
                  type: 'boolean',
                  default: true,
                  description: 'Follow HTTP redirects automatically'
                }
              },
              required: ['url', 'method']
            }
          },
          {
            name: 'http_json_request',
            description: 'Specialized HTTP JSON request tool designed for AI chat API testing - eliminates PowerShell escaping issues',
            inputSchema: {
              type: 'object',
              properties: {
                url: { 
                  type: 'string', 
                  description: 'Target URL (optimized for localhost AI servers like http://localhost:8090/api/chat)'
                },
                method: { 
                  type: 'string', 
                  enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                  default: 'POST',
                  description: 'HTTP method (defaults to POST for AI chat)'
                },
                jsonPayload: { 
                  type: 'object', 
                  description: 'JSON payload object - automatically serialized and escaped (e.g., {"message":"Hello AI","model":"tinyllama"})'
                },
                headers: { 
                  type: 'object', 
                  description: 'Additional HTTP headers (Content-Type: application/json is automatic)'
                },
                timeout: { 
                  type: 'number', 
                  default: 30, 
                  minimum: 1,
                  maximum: 300,
                  description: 'Timeout in seconds for AI server response'
                }
              },
              required: ['url', 'jsonPayload']
            }
          },
          {
            name: 'environment_info',
            description: 'Display Windows MCP environment information and optimal project recommendations',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { 
                  type: 'string', 
                  description: 'Optional: Path to project directory for project-specific analysis and recommendations'
                },
                includeSystemInfo: {
                  type: 'boolean',
                  default: true,
                  description: 'Include Windows system information (.NET SDKs, PowerShell version, etc.)'
                },
                analyzeProject: {
                  type: 'boolean',
                  default: false,
                  description: 'Analyze project type and provide build environment recommendations'
                }
              }
            }
          }
        ],
        
        // Enhanced welcome message and help information (CLAUDE.md 第13条完全実装)
        welcomeMessage: helpGenerator.generateWelcomeMessage({
          version: require('../package.json').version,
          authConfigured: authManager.isAuthEnabled(),
          dangerousMode: process.env.ENABLE_DANGEROUS_MODE === 'true',
          tools: 11
        }),
        
        helpInfo: {
          message: '🎉 All 11 tools available! Environment info and project analysis included in v1.0.44!',
          featuredCapabilities: {
            '🐍 Python Virtual Environments': 'build_python: Auto-creates .venv, installs deps, runs pytest/unittest',
            '🔨 Multi-Language Builds': '.NET, Java, Python, Node.js, Go, Rust, C++, Ruby, Docker',
            '⚡ PowerShell Execution': 'Full Windows automation with timeout controls',
            '📁 File Operations': 'Base64 encoding, file sync, large file transfers',
            '🌐 HTTP Client': 'Direct API testing with JSON support, bypasses PowerShell limitations'
          },
          quickStart: {
            'Python Testing': 'build_python: {"projectPath": "C:/project", "commands": ["test"], "useVirtualEnv": true}',
            'Build .NET': 'build_dotnet: {"projectPath": "C:/project.csproj", "configuration": "Release"}',
            'Run Commands': 'run_powershell: {"command": "Get-Process"}',
            'AI Chat Testing': 'http_request: {"url": "http://localhost:8080/api/chat", "method": "POST", "json": {"message": "Hello AI", "model": "tinyllama"}}',
            'Get Detailed Help': 'Visit /help/tools for comprehensive examples with Python venv'
          },
          helpEndpoints: {
            '/help/quick': 'Quick reference and common examples',
            '/help/tools': 'Complete tool documentation',
            '/help/category/build': 'Build tools documentation',
            '/help/category/system': 'System tools documentation',
            '/help/category/files': 'File operation tools',
            '/auth/status': 'Check authentication status'
          },
          totalTools: 9, // Updated count for v1.0.28
          categories: helpGenerator.categories
        }
        }
      });
      
      logger.info('Tools list requested with help information', { 
        clientIP: getClientIP(req),
        toolCount: 9
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
            
            // Fixed directory structure: <BUILD_BASE_DIR>\<project-name>\release
            const buildBaseDir = process.env.BUILD_BASE_DIR || 'C:\\build';
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
            // CRITICAL UPDATE: Enhanced PowerShell execution with UTF-8 and streaming support
            if (!args.command) {
              throw new Error('Command is required for PowerShell execution');
            }

            const dangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
            const startTime = Date.now();
            
            // Enhanced command validation
            let validatedCommand;
            if (dangerousMode) {
              validatedCommand = args.command;
              logger.security('DANGEROUS MODE: Unrestricted PowerShell execution', { 
                clientIP, 
                command: args.command.substring(0, 100),
                fullCommand: args.command.length
              });
            } else {
              // Validate command using security module
              const validation = powershellExecutor.validateCommand(args.command);
              if (!validation.isValid) {
                throw new Error(`Command validation failed: ${validation.warnings.join(', ')}`);
              }
              
              // Enhanced PowerShell validation for enterprise environments
              const isEnterpriseMode = process.env.ENABLE_ENTERPRISE_DEV_MODE === 'true';
              const enhancedPowerShell = process.env.ENABLE_ENHANCED_POWERSHELL === 'true';
              
              if (isEnterpriseMode || enhancedPowerShell) {
                try {
                  validatedCommand = security.validateEnhancedPowerShell(args.command);
                  logger.info('Enterprise PowerShell validation successful', { 
                    clientIP, 
                    commandLength: args.command.length,
                    enhancedFeatures: true
                  });
                } catch (enterpriseError) {
                  // Fallback to standard validation if enterprise fails
                  logger.warn('Enterprise validation failed, falling back to standard', { 
                    clientIP, 
                    error: enterpriseError.message 
                  });
                  validatedCommand = security.validatePowerShellCommand(args.command);
                }
              } else {
                validatedCommand = security.validatePowerShellCommand(args.command);
              }
            }
            
            // Enhanced timeout handling with dotnet-aware defaults
            const maxAllowedTimeout = getNumericEnv('MAX_ALLOWED_TIMEOUT', 3600000); // 60 minutes max
            let defaultTimeout = getNumericEnv('POWERSHELL_DEFAULT_TIMEOUT', 300) * 1000; // Use PowerShell default timeout in milliseconds
            
            // Increase default timeout for dotnet commands (initial compilation can be slow)
            if (validatedCommand.toLowerCase().includes('dotnet')) {
              defaultTimeout = Math.max(defaultTimeout, getNumericEnv('DOTNET_BUILD_TIMEOUT', 600000)); // Use .NET build timeout
            }
            
            const requestedTimeoutMs = args.timeout ? 
              Math.min(parseInt(args.timeout) * 1000, maxAllowedTimeout) : 
              defaultTimeout;

            // Execution options
            const execOptions = {
              timeout: requestedTimeoutMs,
              streaming: args.streaming || false,
              workingDirectory: args.workingDirectory || null
            };

            // Handle remote execution
            if (args.remoteHost) {
              const validatedHost = security.validateIPAddress(args.remoteHost);
              result = await executeRemoteCommand(validatedHost, validatedCommand);
            } else {
              // Execute with enhanced PowerShell executor (UTF-8 + streaming)
              const execResult = await powershellExecutor.executePowerShellCommand(
                validatedCommand, 
                execOptions
              );

              // Create enhanced response with detailed information
              const response = {
                success: execResult.success,
                exitCode: execResult.exitCode,
                executionTime: execResult.executionTime,
                timestamp: execResult.timestamp,
                processId: execResult.processId,
                command: execResult.command,
                workingDirectory: execResult.workingDirectory
              };

              // Include output based on success/failure
              if (execResult.success) {
                response.output = execResult.stdout;
                if (execResult.stderr && execResult.stderr.trim()) {
                  response.warnings = execResult.stderr;
                }
              } else {
                response.error = {
                  code: 'POWERSHELL_EXECUTION_FAILED',
                  message: `PowerShell command failed with exit code ${execResult.exitCode}`,
                  details: {
                    stdout: execResult.stdout,
                    stderr: execResult.stderr,
                    exitCode: execResult.exitCode,
                    signal: execResult.signal,
                    executionTime: execResult.executionTime,
                    command: execResult.command,
                    workingDirectory: execResult.workingDirectory,
                    suggestions: [
                      'Check command syntax and permissions',
                      'Verify file paths and accessibility',
                      'Review PowerShell execution policy settings',
                      'Check for Japanese characters in file paths (encoding issue)'
                    ]
                  }
                };
              }

              // Include streaming data if requested
              if (args.streaming && execResult.streamingData) {
                response.streamingData = execResult.streamingData;
              }

              result = createTextResult(JSON.stringify(response, null, 2));
            }
            
            logger.info('Enhanced PowerShell command executed', { 
              clientIP, 
              command: args.command.substring(0, 100),
              success: result.success !== false,
              executionTime: Date.now() - startTime,
              dangerousMode,
              streaming: args.streaming || false,
              timeout: requestedTimeoutMs
            });

          } catch (error) {
            // Enhanced error reporting for PowerShell failures
            const errorResponse = {
              error: {
                code: 'POWERSHELL_COMMAND_ERROR',
                message: error.message,
                details: {
                  command: args.command?.substring(0, 200) + (args.command?.length > 200 ? '...' : ''),
                  timestamp: new Date().toISOString(),
                  clientIP,
                  suggestions: [
                    'Check command syntax and special character escaping',
                    'Verify PowerShell execution permissions',
                    'Use proper JSON escaping for complex commands',
                    'Consider using batch file execution for complex scripts'
                  ],
                  helpEndpoints: {
                    documentation: '/help/category/system',
                    troubleshooting: '/help/quick'
                  }
                }
              }
            };

            logger.error('PowerShell command failed with enhanced error', { 
              clientIP, 
              command: args.command?.substring(0, 100),
              error: error.message,
              timestamp: new Date().toISOString()
            });

            result = createTextResult(JSON.stringify(errorResponse, null, 2));
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
            const targetPath = args.targetPath || process.env.MCP_SERVER_PATH || 'C:\\mcp-server';
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

        case 'encode_file_base64':
          try {
            if (!args.filePath) {
              throw new Error('filePath is required');
            }

            // Check if dangerous mode is enabled
            const dangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';

            // Security validation
            const filePath = dangerousMode ? args.filePath : security.validateBuildPath(args.filePath);
            const options = args.options || {};
            
            // Set defaults from environment or options
            const envMaxSize = getNumericEnv('FILE_ENCODING_MAX_SIZE', 10485760); // 10MB default
            const envExtensions = process.env.FILE_ENCODING_ALLOWED_EXTENSIONS 
              ? process.env.FILE_ENCODING_ALLOWED_EXTENSIONS.split(',').map(ext => ext.trim())
              : ['.pdf', '.txt', '.docx', '.png', '.jpg', '.jpeg'];
            
            const maxSizeBytes = options.maxSizeBytes || envMaxSize;
            const allowedExtensions = options.allowedExtensions || envExtensions;
            const previewOnly = options.preview || false;
            
            // Check file exists
            if (!fs.existsSync(filePath)) {
              throw new Error(`File not found: ${filePath}`);
            }
            
            // Get file stats
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            const fileName = path.basename(filePath);
            const fileExtension = path.extname(filePath).toLowerCase();
            
            // Validate file size
            if (fileSize > maxSizeBytes) {
              throw new Error(`File size ${fileSize} bytes exceeds maximum allowed size ${maxSizeBytes} bytes`);
            }
            
            // Validate file extension
            if (!allowedExtensions.includes(fileExtension)) {
              throw new Error(`File extension '${fileExtension}' not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
            }
            
            // Log security event
            logger.security('File encoding requested', {
              clientIP,
              filePath,
              fileSize,
              fileExtension,
              previewOnly,
              dangerousMode
            });
            
            if (previewOnly) {
              // Return metadata only
              result = createTextResult(JSON.stringify({
                fileName,
                fileSize,
                fileExtension,
                lastModified: stats.mtime.toISOString(),
                isReadable: true,
                preview: true
              }, null, 2));
            } else {
              // Read and encode file
              const fileBuffer = fs.readFileSync(filePath);
              const base64Content = fileBuffer.toString('base64');
              
              // Create response with metadata
              const response = {
                content: [{
                  type: 'text',
                  text: base64Content
                }],
                fileName,
                fileSize,
                fileExtension,
                lastModified: stats.mtime.toISOString(),
                encoded: true,
                encoding: 'base64'
              };
              
              result = createTextResult(JSON.stringify(response));
            }
            
            logger.info('File encoding completed', { 
              clientIP, 
              filePath,
              fileSize,
              encoded: !previewOnly
            });
            
          } catch (error) {
            logger.error('File encoding failed', { 
              clientIP, 
              filePath: args.filePath, 
              error: error.message 
            });
            result = handleValidationError(error, 'File encoding', logger, clientIP, { filePath: args.filePath });
          }
          break;

        case 'http_request':
          try {
            if (!args.url || !args.method) {
              throw new Error('url and method are required');
            }

            const startTime = Date.now();
            
            // Log the request initiation
            logger.info('HTTP request initiated', {
              clientIP,
              url: args.url,
              method: args.method,
              hasHeaders: !!args.headers,
              hasBody: !!(args.body || args.json),
              timeout: args.timeout || 30
            });

            // Execute HTTP request using httpClient
            const httpResult = await httpClient.executeRequest({
              url: args.url,
              method: args.method,
              headers: args.headers || {},
              body: args.body,
              json: args.json,
              timeout: args.timeout || 30,
              followRedirects: args.followRedirects !== false
            });

            const executionTime = Date.now() - startTime;

            if (httpResult.success) {
              // Try to parse JSON response if applicable
              let parsedBody = null;
              const contentType = httpResult.headers['content-type'] || '';
              
              if (contentType.includes('application/json') && httpResult.body) {
                try {
                  parsedBody = JSON.parse(httpResult.body);
                } catch (parseError) {
                  logger.warn('Failed to parse JSON response', { 
                    requestId: httpResult.requestId, 
                    error: parseError.message 
                  });
                }
              }

              const responseData = {
                success: true,
                statusCode: httpResult.statusCode,
                statusMessage: httpResult.statusMessage,
                headers: httpResult.headers,
                body: httpResult.body,
                json: parsedBody,
                executionTime: httpResult.executionTime,
                requestId: httpResult.requestId,
                timestamp: new Date().toISOString()
              };

              result = createTextResult(JSON.stringify(responseData, null, 2));

              logger.info('HTTP request completed successfully', {
                clientIP,
                requestId: httpResult.requestId,
                statusCode: httpResult.statusCode,
                executionTime: httpResult.executionTime,
                responseSize: httpResult.body ? httpResult.body.length : 0
              });

            } else {
              // Handle request failure
              const errorData = {
                success: false,
                error: httpResult.error,
                executionTime: httpResult.executionTime,
                requestId: httpResult.requestId,
                timestamp: new Date().toISOString(),
                url: args.url,
                method: args.method
              };

              result = createTextResult(JSON.stringify(errorData, null, 2));

              logger.error('HTTP request failed', {
                clientIP,
                requestId: httpResult.requestId,
                error: httpResult.error,
                executionTime: httpResult.executionTime,
                url: args.url,
                method: args.method
              });
            }

          } catch (error) {
            logger.error('HTTP request execution failed', {
              clientIP,
              url: args.url,
              method: args.method,
              error: error.message
            });
            result = handleValidationError(error, 'HTTP request', logger, clientIP, { 
              url: args.url, 
              method: args.method 
            });
          }
          break;

        case 'http_json_request':
          try {
            if (!args.url || !args.jsonPayload) {
              throw new Error('url and jsonPayload are required');
            }

            const startTime = Date.now();
            
            // Log the JSON request initiation
            logger.info('HTTP JSON request initiated', {
              clientIP,
              url: args.url,
              method: args.method || 'POST',
              hasJsonPayload: !!args.jsonPayload,
              hasHeaders: !!args.headers,
              timeout: args.timeout || 30
            });

            // Prepare headers with automatic Content-Type
            const headers = {
              'Content-Type': 'application/json',
              ...(args.headers || {})
            };

            // Execute HTTP request using httpClient with JSON payload
            const httpResult = await httpClient.executeRequest({
              url: args.url,
              method: args.method || 'POST',
              headers: headers,
              json: args.jsonPayload, // Use the json parameter for proper serialization
              timeout: args.timeout || 30,
              followRedirects: false // Usually false for API endpoints
            });

            const executionTime = Date.now() - startTime;

            if (httpResult.success) {
              // Try to parse JSON response
              let parsedBody = null;
              const contentType = httpResult.headers['content-type'] || '';
              
              if (contentType.includes('application/json') && httpResult.body) {
                try {
                  parsedBody = JSON.parse(httpResult.body);
                } catch (parseError) {
                  logger.warn('Failed to parse JSON response', { 
                    requestId: httpResult.requestId, 
                    error: parseError.message 
                  });
                }
              }

              const responseData = {
                success: true,
                statusCode: httpResult.statusCode,
                statusMessage: httpResult.statusMessage,
                headers: httpResult.headers,
                body: httpResult.body,
                json: parsedBody,
                executionTime: executionTime,
                url: args.url,
                method: args.method || 'POST'
              };

              logger.info('HTTP JSON request completed successfully', {
                clientIP,
                url: args.url,
                method: args.method || 'POST',
                statusCode: httpResult.statusCode,
                executionTime,
                responseBodyLength: httpResult.body ? httpResult.body.length : 0,
                hasJsonResponse: !!parsedBody
              });

              result = createTextResult(JSON.stringify(responseData, null, 2));
            } else {
              const errorResponse = {
                success: false,
                error: httpResult.error,
                statusCode: httpResult.statusCode,
                statusMessage: httpResult.statusMessage,
                executionTime: executionTime,
                url: args.url,
                method: args.method || 'POST',
                timestamp: new Date().toISOString()
              };

              logger.error('HTTP JSON request failed', {
                clientIP,
                url: args.url,
                method: args.method || 'POST',
                error: httpResult.error,
                statusCode: httpResult.statusCode,
                executionTime
              });

              result = createTextResult(JSON.stringify(errorResponse, null, 2));
            }
          } catch (error) {
            logger.error('HTTP JSON request exception', { 
              clientIP, 
              error: error.message,
              url: args.url,
              method: args.method || 'POST'
            });
            
            result = handleValidationError(error, 'HTTP JSON request', logger, clientIP, { 
              url: args.url, 
              method: args.method || 'POST',
              hasJsonPayload: !!args.jsonPayload
            });
          }
          break;

        case 'environment_info':
          try {
            const startTime = Date.now();
            const info = [];
            
            // Basic environment information
            info.push('🔧 Windows MCP Server Environment');
            info.push('═'.repeat(50));
            info.push(`📅 Timestamp: ${new Date().toISOString()}`);
            info.push(`🌐 Client IP: ${clientIP}`);
            info.push(`⚙️  Server Version: v${require('../package.json').version}`);
            info.push(`🖥️  Platform: Windows (${process.platform})`);
            info.push(`📦 Node.js: ${process.version}`);
            info.push('');

            // Windows environment details
            if (args.includeSystemInfo !== false) {
              info.push('🏗️  Windows Build Environment');
              info.push('─'.repeat(30));
              
              try {
                // PowerShell version check
                const psVersionResult = await executeBuild('powershell.exe', [
                  '-Command', '$PSVersionTable.PSVersion.ToString()'
                ]);
                if (psVersionResult.success) {
                  info.push(`💙 PowerShell: ${psVersionResult.output.trim()}`);
                }

                // .NET SDK versions
                const dotnetResult = await executeBuild('dotnet.exe', ['--list-sdks']);
                if (dotnetResult.success && dotnetResult.output) {
                  const sdks = dotnetResult.output.trim().split('\n').slice(0, 3);
                  info.push(`🔷 .NET SDKs: ${sdks.length} installed`);
                  sdks.forEach(sdk => info.push(`   • ${sdk.trim()}`));
                }

                // Windows SDK check
                const winSdkResult = await executeBuild('powershell.exe', [
                  '-Command', 'Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Microsoft SDKs\\Windows\\*" | Select-Object -ExpandProperty ProductVersion -ErrorAction SilentlyContinue | Sort-Object -Unique'
                ]);
                if (winSdkResult.success && winSdkResult.output.trim()) {
                  const winSdks = winSdkResult.output.trim().split('\n').slice(0, 3);
                  info.push(`🪟 Windows SDKs: ${winSdks.length} found`);
                  winSdks.forEach(sdk => info.push(`   • ${sdk.trim()}`));
                }

              } catch (systemError) {
                info.push(`⚠️  System info query failed: ${systemError.message}`);
              }
              
              info.push('');
            }

            // Available build tools
            info.push('🛠️  Available Build Tools');
            info.push('─'.repeat(25));
            info.push('• build_dotnet - .NET applications (WPF, WinForms, WinUI, Core)');
            info.push('• build_python - Python applications with virtual environments');
            info.push('• build_java - Java applications (Maven, Gradle)');
            info.push('• build_nodejs - Node.js applications and React/Vue projects');
            info.push('• build_go - Go applications and modules');
            info.push('• build_rust - Rust applications using Cargo');
            info.push('• build_cpp - C++ applications with MSVC/MinGW');
            info.push('• run_powershell - Direct PowerShell command execution');
            info.push('• run_batch - Windows batch file execution');
            info.push('• http_json_request - AI chat API testing without escaping');
            info.push('');

            // Connection status
            info.push('🌐 Connection Status');
            info.push('─'.repeat(20));
            info.push('✅ MCP Server: Active and responding');
            info.push(`🔐 Authentication: ${authManager.isAuthEnabled() ? 'Enabled' : 'Disabled'}`);
            info.push(`⚡ Dangerous Mode: ${process.env.ENABLE_DANGEROUS_MODE === 'true' ? '🟡 Enabled' : '🟢 Disabled'}`);
            info.push(`📝 Rate Limiting: ${process.env.ENABLE_DANGEROUS_MODE === 'true' ? 'Bypassed' : 'Active'}`);
            info.push('');

            // Project analysis (optional)
            if (args.analyzeProject && args.projectPath) {
              const detector = new ProjectDetector();
              const detection = await detector.detectProject(args.projectPath);
              
              info.push('🔍 Project Analysis');
              info.push('─'.repeat(20));
              info.push(detector.generateReport(detection));
              info.push('');
            }

            // Environment recommendations
            info.push('💡 Environment Recommendations');
            info.push('─'.repeat(30));
            info.push('🎯 For WPF/WinForms/WinUI: This Windows environment is OPTIMAL');
            info.push('🎯 For .NET Core/Standard: Cross-platform compatible');
            info.push('🎯 For Xamarin/MAUI: Consider macOS for iOS development');
            info.push('🎯 For Docker apps: Use container-based builds');
            info.push('');

            // Usage examples
            info.push('📋 Quick Usage Examples');
            info.push('─'.repeat(25));
            info.push('🔨 Build WPF app: build_dotnet project_path="C:/MyWpfApp.csproj" configuration="Release"');
            info.push('🐍 Python with venv: build_python project_path="C:/MyPython" action="test" create_venv="true"');
            info.push('🌐 Test AI server: http_json_request url="http://localhost:8090/api/chat" jsonPayload={"message":"Hello"}');
            info.push('⚡ Run PowerShell: run_powershell command="Get-Process | Where-Object {$_.ProcessName -like \'*python*\'}"');
            
            const executionTime = Date.now() - startTime;

            logger.info('Environment info generated', {
              clientIP,
              includeSystemInfo: args.includeSystemInfo !== false,
              analyzeProject: !!args.analyzeProject,
              projectPath: args.projectPath || 'none',
              executionTime
            });

            result = createTextResult(info.join('\n'));
          } catch (error) {
            logger.error('Environment info generation failed', {
              clientIP,
              error: error.message
            });
            result = handleValidationError(error, 'Environment info', logger, clientIP, args);
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

            // Enhanced Python environment validation for enterprise development
            const isEnterpriseMode = process.env.ENABLE_ENTERPRISE_DEV_MODE === 'true';
            const pythonEnhanced = process.env.ENABLE_PYTHON_ENV_MANAGEMENT === 'true';
            
            // Use specialized validation for Python builds
            const buildTool = security.validatePythonBuild(args.projectPath, args.buildTool);
            const validatedPath = args.projectPath; // Already validated in validatePythonBuild
            
            // Enhanced Python environment setup for enterprise environments
            let pythonEnvironment = null;
            if (isEnterpriseMode || pythonEnhanced) {
              try {
                const testCommand = 'python -m pytest tests/';
                pythonEnvironment = security.validatePythonEnvironment(validatedPath, testCommand);
                logger.info('Enterprise Python environment validated', { 
                  clientIP, 
                  projectPath: validatedPath,
                  pythonPath: pythonEnvironment.pythonPath,
                  enhancedMode: true
                });
              } catch (enterpriseError) {
                logger.warn('Enterprise Python validation failed, using standard mode', { 
                  clientIP, 
                  error: enterpriseError.message 
                });
              }
            }
            
            // Virtual environment settings
            const useVirtualEnv = args.useVirtualEnv !== false; // Default to true
            const venvName = args.venvName || args.virtualEnv || '.venv';
            const venvPath = path.join(validatedPath, venvName);
            const installDeps = args.installDeps !== false; // Default to true
            
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
            
            let results = [];
            const commands = args.commands || ['install', 'test'];
            
            // Create virtual environment if needed and using pip
            if (useVirtualEnv && finalBuildTool === 'pip') {
              const fs = require('fs');
              if (!fs.existsSync(venvPath)) {
                logger.info('Creating virtual environment', { venvPath });
                const createVenvResult = await executeBuild('python', ['-m', 'venv', venvName], {
                  workingDirectory: validatedPath,
                  timeout: 60000 // 1 minute for venv creation
                });
                if (!createVenvResult.success) {
                  throw new Error(`Failed to create virtual environment: ${createVenvResult.error}`);
                }
                results.push('✓ Created virtual environment: ' + venvName);
              } else {
                results.push('✓ Using existing virtual environment: ' + venvName);
              }
            }
            
            // Determine Python and pip executables based on virtual environment
            let pythonExe = 'python';
            let pipExe = 'pip';
            
            if (useVirtualEnv && finalBuildTool === 'pip') {
              // Use virtual environment executables
              if (process.platform === 'win32') {
                pythonExe = path.join(venvPath, 'Scripts', 'python.exe');
                pipExe = path.join(venvPath, 'Scripts', 'pip.exe');
              } else {
                pythonExe = path.join(venvPath, 'bin', 'python');
                pipExe = path.join(venvPath, 'bin', 'pip');
              }
            }
            
            // Install dependencies if needed
            if (installDeps && finalBuildTool === 'pip') {
              // Auto-detect requirements file
              const fs = require('fs');
              let reqFile = args.requirements;
              if (!reqFile) {
                const possibleFiles = ['requirements.txt', 'requirements-dev.txt', 'dev-requirements.txt', 'test-requirements.txt'];
                for (const file of possibleFiles) {
                  if (fs.existsSync(path.join(validatedPath, file))) {
                    reqFile = file;
                    break;
                  }
                }
              }
              
              if (reqFile && fs.existsSync(path.join(validatedPath, reqFile))) {
                const installResult = await executeBuild(pipExe, ['install', '-r', reqFile], {
                  workingDirectory: validatedPath,
                  timeout: getNumericEnv('COMMAND_TIMEOUT', 600000) // 10 minutes for package installation
                });
                if (!installResult.success) {
                  throw new Error(`Failed to install dependencies: ${installResult.error}`);
                }
                results.push(`✓ Installed dependencies from ${reqFile}`);
              }
              
              // Install extra packages if specified
              if (args.extraPackages && args.extraPackages.length > 0) {
                const installResult = await executeBuild(pipExe, ['install', ...args.extraPackages], {
                  workingDirectory: validatedPath,
                  timeout: getNumericEnv('COMMAND_TIMEOUT', 300000) // 5 minutes for package installation
                });
                if (!installResult.success) {
                  throw new Error(`Failed to install extra packages: ${installResult.error}`);
                }
                results.push(`✓ Installed extra packages: ${args.extraPackages.join(', ')}`);
              }
            }
            
            // Execute commands
            for (const cmd of commands) {
              let command = '';
              let commandArgs = [];
              
              if (finalBuildTool === 'pip') {
                if (cmd === 'install') {
                  if (!installDeps) {
                    // Only run if not already done above
                    const reqFile = args.requirements || 'requirements.txt';
                    command = pipExe;
                    commandArgs = ['install', '-r', reqFile];
                  } else {
                    continue; // Skip, already handled above
                  }
                } else if (cmd === 'test') {
                  const testRunner = args.testRunner || 'pytest';
                  if (useVirtualEnv) {
                    // Use test runner from virtual environment
                    if (process.platform === 'win32') {
                      command = path.join(venvPath, 'Scripts', testRunner + '.exe');
                    } else {
                      command = path.join(venvPath, 'bin', testRunner);
                    }
                  } else {
                    command = testRunner;
                  }
                  commandArgs = [];
                } else if (cmd === 'build') {
                  command = pythonExe;
                  commandArgs = ['setup.py', 'build'];
                } else {
                  // Custom command
                  command = pythonExe;
                  commandArgs = ['-m', cmd];
                }
              } else if (finalBuildTool === 'poetry') {
                command = 'poetry';
                commandArgs = [cmd];
              } else if (finalBuildTool === 'conda') {
                command = 'conda';
                commandArgs = [cmd];
              } else if (finalBuildTool === 'pipenv') {
                command = 'pipenv';
                commandArgs = [cmd];
              }
              
              if (command) {
                const buildOptions = {
                  workingDirectory: validatedPath,
                  timeout: getNumericEnv('COMMAND_TIMEOUT', 1800000)
                };
                
                // Enhanced Python environment for enterprise development
                if (pythonEnvironment && pythonEnvironment.pythonPath) {
                  buildOptions.environment = {
                    ...process.env,
                    PYTHONPATH: pythonEnvironment.pythonPath
                  };
                  logger.info('Applied enterprise PYTHONPATH', { 
                    clientIP, 
                    pythonPath: pythonEnvironment.pythonPath,
                    command: cmd
                  });
                }
                
                if (args.remoteHost) {
                  const validatedHost = security.validateIPAddress(args.remoteHost);
                  buildOptions.remoteHost = validatedHost;
                }
                
                // Validate the final command for security
                const fullCommand = `${command} ${commandArgs.join(' ')}`;
                security.validateBuildCommand(fullCommand);
                
                // Execute command
                const cmdResult = await executeBuild(command, commandArgs, buildOptions);
                
                if (!cmdResult.success) {
                  throw new Error(`Python ${cmd} failed: ${cmdResult.output || cmdResult.error}`);
                }
                
                results.push(`✓ Executed ${cmd}: ${cmdResult.output}`);
              }
            }
            
            result = createTextResult(`Python build completed successfully:\n\n${results.join('\n')}`);
            
            logger.info('Python build executed', { 
              clientIP, 
              buildTool: finalBuildTool,
              projectPath: validatedPath,
              useVirtualEnv,
              venvName,
              commands
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
              timeout: getNumericEnv('CPP_BUILD_TIMEOUT', 600000) // C++ build timeout
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
              timeout: getNumericEnv('COMMAND_TIMEOUT', 600000) // Default timeout for Android builds
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
                commandArgs.push('-S', `localhost:${getNumericEnv('PHP_SERVE_PORT', 8000)}`, '-t', 'public');
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
      port: getNumericEnv('SSH_PORT', 22),
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

// Smart server startup with automatic port detection
async function startServer() {
  // Initialize port manager
  portManager.initialize();
  
  // Setup graceful shutdown
  portManager.setupGracefulShutdown();
  
  // Find available port
  let assignedPort;
  try {
    assignedPort = await portManager.findAvailablePort();
  } catch (error) {
    console.error('❌ Failed to find available port:', error.message);
    process.exit(1);
  }
  
  // Start server on assigned port
  const server = app.listen(assignedPort, '0.0.0.0', async () => {
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
    
    // Show dangerous mode in startup banner
    const isDangerousMode = process.env.ENABLE_DANGEROUS_MODE === 'true';
    
    // Debug environment variables
    console.log('🔍 Debug Environment Variables:');
    console.log(`   • ENABLE_DANGEROUS_MODE: "${process.env.ENABLE_DANGEROUS_MODE}"`);
    console.log(`   • NODE_ENV: "${process.env.NODE_ENV}"`);
    console.log(`   • isDangerousMode: ${isDangerousMode}`);
    console.log('');
    
    // Display port allocation summary
    portManager.displayPortSummary();
    
    if (isDangerousMode) {
      console.log('🔥🔥🔥 MCP SERVER v' + version + ' - DANGEROUS MODE 🔥🔥🔥');
      console.log(`🔥 Running on http://0.0.0.0:${assignedPort} (UNRESTRICTED)`);
      console.log(`🔥 Health: http://0.0.0.0:${assignedPort}/health`);
      console.log(`🔥 Endpoint: http://0.0.0.0:${assignedPort}/mcp`);
      console.log(`🔥 Command Timeout: ${timeoutMinutes} minutes (${timeoutSeconds}s)`);
    } else {
      console.log(`\nWindows MCP Server v${version}`);
      console.log(`Running on http://0.0.0.0:${assignedPort}`);
      console.log(`Health check: http://0.0.0.0:${assignedPort}/health`);
      console.log(`MCP endpoint: http://0.0.0.0:${assignedPort}/mcp`);
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
    console.log(`   • Port: ${assignedPort}`);
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
            console.log(`  http://${ip.trim()}:${assignedPort}`);
          });
          
          // Check for VPN IPs
          const { stdout: interfaceInfo } = await execPromise('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -match \'VPN|NordVPN|OpenVPN|WireGuard|Tailscale|ZeroTier\'} | Select-Object -ExpandProperty IPAddress"');
          const vpnIps = interfaceInfo.trim().split('\n').filter(ip => ip);
          
          if (vpnIps.length > 0) {
            console.log('\n⚠️  VPN detected! Use these IPs if connecting through VPN:');
            vpnIps.forEach(ip => {
              console.log(`  http://${ip.trim()}:${assignedPort}`);
            });
          }
        }
      }
    } catch (err) {
      // Silently ignore errors in IP detection
    }
  });
  
  return server;
}

// Only start server if not in test environment  
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

// Export app for testing
module.exports = app;