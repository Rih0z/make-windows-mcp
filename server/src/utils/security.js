const path = require('path');

class SecurityValidator {
  constructor() {
    this.allowedCommands = [
      'dotnet', 'powershell', 'cmd', 'ping', 'ipconfig', 'dir', 'ls',
      'get-process', 'get-service', 'get-childitem', 'get-winevent',
      'test-connection', 'get-vm', 'start-vm', 'stop-vm', 'checkpoint-vm',
      'docker', 'kubectl', 'git', 'echo', 'write-host', 'write-output',
      'find-regkey', 'format-table', 'remove-item', 'set-location',
      'invoke-command', 'start-process'
    ];
    
    // Development mode commands (loaded from environment)
    this.devCommands = process.env.ALLOWED_DEV_COMMANDS ? 
      process.env.ALLOWED_DEV_COMMANDS.split(',').map(cmd => cmd.trim().toLowerCase()) :
      ['tasklist', 'netstat', 'type', 'python', 'pip', 'node', 'npm', 'git', 'if', 'for', 'findstr', 'echo', 'set', 'call', 'start', 'cd', 'cmd', '&'];
    
    // Allowed operators in development mode
    this.devOperators = ['&&', '||', '|', '>', '>>', '<', '2>', '2>&1', ';', '&'];
    
    this.dangerousPatterns = [
      /[\`]/g,                       // Backtick command substitution only
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

    // Check if development mode is enabled
    const isDevelopmentMode = process.env.ENABLE_DEV_COMMANDS === 'true';
    
    // Handle command chaining (&&, ||, |) in development mode
    if (isDevelopmentMode) {
      // Split command by operators while preserving them
      const commandParts = this.parseCommandChain(command);
      
      // Validate each part of the command chain
      for (const part of commandParts) {
        if (part.type === 'command') {
          this.validateDevCommand(part.value);
        }
      }
      
      // Return sanitized command
      return this.sanitizeCommand(command);
    }
    
    // Extract the base command for non-dev mode
    const cleanCommand = command.trim().replace(/^[\$\(]+/, '');
    const firstWord = cleanCommand.split(/\s+/)[0].toLowerCase();
    
    // Already handled in development mode above

    // Check for dangerous patterns (for non-dev commands)
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous command detected: ${pattern.source}`);
      }
    }

    // Check if command starts with allowed commands
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
   * Parse command chain into parts
   */
  parseCommandChain(command) {
    const parts = [];
    const operators = ['&&', '||', '|', '>', '>>', '<', '2>', '2>&1', ';'];
    let currentPart = '';
    let i = 0;
    
    while (i < command.length) {
      let foundOperator = false;
      
      // Check for operators
      for (const op of operators) {
        if (command.substr(i, op.length) === op) {
          if (currentPart.trim()) {
            parts.push({ type: 'command', value: currentPart.trim() });
            currentPart = '';
          }
          parts.push({ type: 'operator', value: op });
          i += op.length;
          foundOperator = true;
          break;
        }
      }
      
      if (!foundOperator) {
        currentPart += command[i];
        i++;
      }
    }
    
    if (currentPart.trim()) {
      parts.push({ type: 'command', value: currentPart.trim() });
    }
    
    return parts;
  }

  /**
   * Validate a single development command
   */
  validateDevCommand(command) {
    // Extract the base command
    const cleanCommand = command.trim().replace(/^[\$\(]+/, '');
    const firstWord = cleanCommand.split(/\s+/)[0].toLowerCase();
    
    // Remove .exe extension for comparison
    const baseCommand = firstWord.replace(/\.exe$/i, '');
    
    // Check if it's a direct batch file execution
    const isBatchFile = firstWord.toLowerCase().endsWith('.bat') || firstWord.toLowerCase().endsWith('.cmd');
    
    // Check if it's an allowed dev command or a batch file
    if (!this.devCommands.includes(baseCommand) && !isBatchFile) {
      // Check if it's a batch file execution with a command
      if (cleanCommand.toLowerCase().includes('.bat') || cleanCommand.toLowerCase().includes('.cmd')) {
        // Batch files are allowed if 'call' or 'start' is in devCommands
        if (!this.devCommands.includes('call') && !this.devCommands.includes('start')) {
          throw new Error(`Command not allowed in development mode: ${firstWord}`);
        }
      } else {
        throw new Error(`Command not allowed in development mode: ${firstWord}`);
      }
    }
    
    // Check paths
    const devPaths = process.env.DEV_COMMAND_PATHS ?
      process.env.DEV_COMMAND_PATHS.split(',').map(p => p.trim().toLowerCase()) :
      ['c:\\builds\\', 'c:\\projects\\', 'c:\\dev\\'];
    
    // Extract paths from the command
    const pathPattern = /[a-zA-Z]:\\[^"\s]*/g;
    const commandPaths = command.match(pathPattern) || [];
    
    // If command contains paths, verify they're within allowed dev paths
    if (commandPaths.length > 0) {
      const allPathsAllowed = commandPaths.every(cmdPath => {
        const normalizedCmdPath = cmdPath.toLowerCase();
        return devPaths.some(devPath => normalizedCmdPath.startsWith(devPath));
      });
      
      if (!allPathsAllowed) {
        throw new Error(`Development command must operate within allowed paths: ${process.env.DEV_COMMAND_PATHS}`);
      }
    }
    
    // Validate batch files are in allowed paths
    if (command.toLowerCase().includes('.bat') || command.toLowerCase().includes('.cmd')) {
      const batchPattern = /([a-zA-Z]:\\[^"\s]*\.(bat|cmd))/gi;
      const batchFiles = command.match(batchPattern) || [];
      
      const allBatchFilesAllowed = batchFiles.every(batchFile => {
        const normalizedPath = batchFile.toLowerCase();
        return devPaths.some(devPath => normalizedPath.startsWith(devPath));
      });
      
      if (!allBatchFilesAllowed) {
        throw new Error('Batch files must be within allowed development paths');
      }
    }
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

  /**
   * Validate batch file path
   * Used by run_batch tool to ensure batch files are in allowed directories
   */
  validateBatchFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Batch file path is required');
    }

    // Check if it's a .bat or .cmd file
    if (!filePath.toLowerCase().endsWith('.bat') && !filePath.toLowerCase().endsWith('.cmd')) {
      throw new Error('Only .bat and .cmd files are allowed');
    }

    // First check for directory traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new Error('Directory traversal detected in batch file path');
    }

    // Normalize path to prevent directory traversal
    const normalized = filePath.replace(/\//g, '\\');
    const normalizedPath = path.win32.normalize(normalized);
    
    // Check again after normalization
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      throw new Error('Directory traversal detected in batch file path');
    }

    // Get allowed batch directories from environment
    const allowedBatchDirs = process.env.ALLOWED_BATCH_DIRS ? 
      process.env.ALLOWED_BATCH_DIRS.split(';').map(dir => dir.trim()) :
      ['C:\\builds\\', 'C:\\builds\\AIServer\\', 'C:\\Users\\Public\\', 'C:\\temp\\'];

    // Check if batch file is in allowed directories (case-insensitive)
    const normalizedBatchPath = normalizedPath.toLowerCase();
    let isAllowedPath = false;
    
    for (const dir of allowedBatchDirs) {
      // Ensure directory ends with backslash for proper comparison
      const normalizedAllowedDir = path.win32.normalize(dir).toLowerCase();
      const dirWithSlash = normalizedAllowedDir.endsWith('\\') ? normalizedAllowedDir : normalizedAllowedDir + '\\';
      
      if (normalizedBatchPath.startsWith(dirWithSlash)) {
        isAllowedPath = true;
        break;
      }
    }

    if (!isAllowedPath) {
      throw new Error(`Batch file must be in one of the allowed directories: ${allowedBatchDirs.join(', ')}`);
    }

    return normalizedPath;
  }
}

module.exports = new SecurityValidator();