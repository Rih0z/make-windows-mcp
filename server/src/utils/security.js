const path = require('path');

class SecurityValidator {
  constructor() {
    this.allowedCommands = [
      'dotnet', 'powershell', 'cmd', 'ping', 'ipconfig', 'dir', 'ls',
      'get-process', 'get-service', 'get-childitem', 'get-winevent',
      'test-connection', 'get-vm', 'start-vm', 'stop-vm', 'checkpoint-vm',
      'docker', 'kubectl', 'git', 'echo', 'write-host', 'write-output',
      'find-regkey', 'format-table', 'remove-item'
    ];
    
    this.dangerousPatterns = [
      /[\&\`]/g,                     // Command substitution (allow ; and | for PowerShell)
      /rm\s+-rf/gi,                  // Dangerous delete commands
      /del\s+\/[sf]/gi,              // Windows delete commands
      /format\s+[c-z]:/gi,           // Format commands
      /\bshutdown\b/gi,              // Shutdown commands (word boundary)
      /\breboot\b/gi,                // Reboot commands (word boundary)
      /net\s+user.*\/add/gi,         // User creation
      /reg\s+add/gi,                 // Registry modification
      /schtasks.*\/create/gi,        // Task scheduler
      /wmic.*process.*call.*create/gi // WMIC process creation
    ];
  }

  /**
   * Validate and sanitize PowerShell command
   */
  validatePowerShellCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command: must be a non-empty string');
    }

    if (command.length > 2048) {
      throw new Error('Command too long: maximum 2048 characters allowed');
    }

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command detected: ${pattern.source}`);
      }
    }

    // Check if command starts with allowed commands
    // Handle PowerShell variables and expressions
    const cleanCommand = command.trim().replace(/^[\$\(]+/, '');
    const firstWord = cleanCommand.split(/\s+/)[0].toLowerCase();
    const isAllowed = this.allowedCommands.some(cmd => 
      firstWord === cmd.toLowerCase() || 
      firstWord.startsWith(cmd.toLowerCase() + '.') ||
      command.trim().startsWith('$') || // Allow PowerShell variables
      command.trim().startsWith('(')    // Allow PowerShell expressions
    );

    if (!isAllowed) {
      throw new Error(`Command not allowed: ${firstWord}`);
    }

    return this.sanitizeCommand(command);
  }

  /**
   * Sanitize command by escaping special characters
   */
  sanitizeCommand(command) {
    // Remove null bytes and control characters
    let sanitized = command.replace(/[\x00-\x1f\x7f]/g, '');
    
    // Escape single quotes by doubling them
    sanitized = sanitized.replace(/'/g, "''");
    
    return sanitized;
  }

  /**
   * Validate file path
   */
  validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid path: must be a non-empty string');
    }

    // First check for directory traversal attempts in the original path
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new Error('Directory traversal detected in path');
    }
    
    // Normalize path to prevent directory traversal (handle both / and \ separators)
    const normalized = filePath.replace(/\//g, '\\');
    const normalizedPath = path.win32.normalize(normalized);
    
    // Check again after normalization
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      throw new Error('Directory traversal detected in path');
    }

    // Validate against allowed build paths
    const allowedPaths = process.env.ALLOWED_BUILD_PATHS ? 
      process.env.ALLOWED_BUILD_PATHS.split(',').map(p => p.trim()) : 
      ['C:\\projects\\', 'Z:\\', 'C:\\build\\'];

    const isAllowed = allowedPaths.some(allowedPath => {
      const normalizedAllowed = path.win32.normalize(allowedPath.replace(/\//g, '\\'));
      return normalizedPath.toLowerCase().startsWith(normalizedAllowed.toLowerCase());
    });

    if (!isAllowed) {
      throw new Error(`Path not in allowed directories: ${normalizedPath}`);
    }

    return normalizedPath;
  }

  /**
   * Validate IP address
   */
  validateIPAddress(ip) {
    if (!ip || typeof ip !== 'string') {
      throw new Error('Invalid IP address format');
    }

    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      throw new Error('Invalid IP address format');
    }

    // Block private IP ranges that shouldn't be accessed
    const blockedRanges = [
      /^127\./,          // Loopback
      /^169\.254\./,     // Link-local
      /^224\./,          // Multicast
      /^0\./             // Reserved
    ];

    for (const range of blockedRanges) {
      if (range.test(ip)) {
        throw new Error(`Access to IP range blocked: ${ip}`);
      }
    }

    return ip;
  }

  /**
   * Validate SSH credentials
   */
  validateSSHCredentials(host, username, password) {
    this.validateIPAddress(host);
    
    if (!username || typeof username !== 'string' || username.length === 0 || username.length > 64) {
      throw new Error('Invalid username');
    }

    if (!password || typeof password !== 'string' || password.length === 0 || password.length > 128) {
      throw new Error('Invalid password');
    }

    // Check for dangerous characters in credentials
    const dangerousChars = /[\x00-\x1f\x7f;'"\\`\t\r\n]|--/;
    if (dangerousChars.test(username) || dangerousChars.test(password)) {
      throw new Error('Invalid characters in credentials');
    }
    
    // Check for SQL injection patterns in username
    const sqlPatterns = [/union\s+select/gi, /drop\s+table/gi, /insert\s+into/gi, /or\s+['"]?1['"]?\s*=\s*['"]?1/gi];
    for (const pattern of sqlPatterns) {
      if (pattern.test(username) || pattern.test(password)) {
        throw new Error('Invalid characters in credentials');
      }
    }

    return { host, username, password };
  }
}

module.exports = new SecurityValidator();