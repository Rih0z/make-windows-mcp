const path = require('path');

class SecurityValidator {
  constructor() {
    this.allowedCommands = [
      'dotnet', 'powershell', 'cmd', 'ping', 'ipconfig', 'dir', 'ls',
      'get-process', 'get-service', 'get-childitem', 'get-winevent',
      'test-connection', 'get-vm', 'start-vm', 'stop-vm', 'checkpoint-vm',
      'docker', 'kubectl', 'git', 'echo', 'write-host', 'write-output',
      'find-regkey', 'format-table', 'remove-item', 'set-location',
      'invoke-command', 'start-process', 'stop-process', 'wait-process',
      // Enhanced file operations for development workflow
      'new-item', 'set-content', 'add-content', 'get-content', 'test-path',
      'out-file', 'select-string', 'measure-object', 'where-object',
      // Multi-language build tools
      'mvn', 'maven', 'gradle', 'gradlew', 'java', 'javac',
      'python', 'pip', 'poetry', 'conda', 'pipenv', 'pytest',
      'node', 'npm', 'yarn', 'pnpm', 'npx', 'tsc',
      // Additional language build tools
      'go', 'cargo', 'rustc', 'cmake', 'make', 'msbuild', 'ninja',
      'docker', 'docker-compose', 'g++', 'gcc', 'clang',
      // Phase 3 language build tools
      'kotlin', 'kotlinc', 'swift', 'swiftc', 'composer', 'php', 'artisan',
      'bundle', 'ruby', 'rails', 'rake', 'gem', 'rspec', 'minitest'
    ];
    
    // Development mode commands (loaded from environment)
    this.devCommands = process.env.ALLOWED_DEV_COMMANDS ? 
      process.env.ALLOWED_DEV_COMMANDS.split(',').map(cmd => cmd.trim().toLowerCase()) :
      ['tasklist', 'netstat', 'type', 'git', 'if', 'for', 'findstr', 'echo', 'set', 'call', 'start', 'cd', 'cmd', '&'];
    
    // Allowed operators in development mode
    this.devOperators = ['&&', '||', '|', '>', '>>', '<', '2>', '2>&1', ';', '&'];
    
    // Enhanced dangerous patterns with improved Here-String support
    this.dangerousPatterns = [
      /(?<!@['"])[`](?!['"@])/g,     // Backtick command substitution (excluding Here-String @"...`...@")
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

    // Extended command length limit for improved development workflow
    const maxLength = process.env.MAX_COMMAND_LENGTH ? parseInt(process.env.MAX_COMMAND_LENGTH) : 8192;
    if (command.length > maxLength) {
      throw new Error(`Command too long: maximum ${maxLength} characters allowed`);
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

    // Allow localhost and development server ranges (for CI/CD and testing)
    const allowedLocalRanges = [
      /^127\./,                    // Loopback (localhost)
      /^::1$/,                     // IPv6 loopback
      /^localhost$/i               // localhost hostname
    ];

    // Check if this is an allowed local development IP
    const isAllowedLocal = allowedLocalRanges.some(range => range.test(ip));
    if (isAllowedLocal) {
      return ip; // Allow localhost connections for development
    }

    // Block dangerous private IP ranges (excluding allowed localhost)
    const blockedRanges = [
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

  /**
   * Validate Java build tool and project file
   */
  validateJavaBuild(projectPath, buildTool) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate file extension
    const validExtensions = ['.xml', '.gradle', '.kts'];
    const hasValidExtension = validExtensions.some(ext => projectPath.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      throw new Error('Invalid Java project file. Expected pom.xml, build.gradle, or build.gradle.kts');
    }

    // Validate build tool
    if (buildTool && !['maven', 'gradle', 'auto'].includes(buildTool)) {
      throw new Error('Invalid build tool. Expected: maven, gradle, or auto');
    }

    // Auto-detect if not specified
    if (!buildTool || buildTool === 'auto') {
      if (projectPath.endsWith('pom.xml')) {
        return 'maven';
      } else if (projectPath.endsWith('build.gradle') || projectPath.endsWith('build.gradle.kts')) {
        return 'gradle';
      } else {
        throw new Error('Cannot auto-detect build tool from file extension');
      }
    }

    return buildTool;
  }

  /**
   * Validate Python build tool and project directory
   */
  validatePythonBuild(projectPath, buildTool) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate build tool
    const validBuildTools = ['pip', 'poetry', 'conda', 'pipenv', 'auto'];
    if (buildTool && !validBuildTools.includes(buildTool)) {
      throw new Error(`Invalid Python build tool. Expected: ${validBuildTools.join(', ')}`);
    }

    return buildTool || 'auto';
  }

  /**
   * Validate Node.js build tool and project directory
   */
  validateNodeBuild(projectPath, packageManager) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate package manager
    const validPackageManagers = ['npm', 'yarn', 'pnpm', 'auto'];
    if (packageManager && !validPackageManagers.includes(packageManager)) {
      throw new Error(`Invalid Node.js package manager. Expected: ${validPackageManagers.join(', ')}`);
    }

    return packageManager || 'auto';
  }

  /**
   * Validate build command for security
   */
  validateBuildCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid build command: must be a non-empty string');
    }

    // Check against dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Dangerous pattern detected in build command: ${command}`);
      }
    }

    // Extract the first word (the actual command)
    const firstWord = command.trim().split(/\s+/)[0].toLowerCase();
    
    // Check if the command is allowed
    const allAllowedCommands = [
      ...this.allowedCommands,
      ...(process.env.ENABLE_DEV_COMMANDS === 'true' ? this.devCommands : [])
    ];

    if (!allAllowedCommands.includes(firstWord)) {
      throw new Error(`Build command not allowed: ${firstWord}`);
    }

    return command;
  }

  /**
   * Validate Go build parameters
   */
  validateGoBuild(projectPath, action) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate Go action
    const validActions = ['build', 'test', 'run', 'install', 'clean', 'mod', 'vet', 'fmt'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid Go action. Expected: ${validActions.join(', ')}`);
    }

    return { projectPath, action };
  }

  /**
   * Validate Rust build parameters
   */
  validateRustBuild(projectPath, action) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate Rust action
    const validActions = ['build', 'test', 'run', 'check', 'clippy', 'fmt', 'doc', 'clean', 'update'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid Rust action. Expected: ${validActions.join(', ')}`);
    }

    return { projectPath, action };
  }

  /**
   * Validate C++ build parameters
   */
  validateCppBuild(projectPath, buildSystem) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate build system
    const validBuildSystems = ['cmake', 'msbuild', 'make', 'ninja'];
    if (!validBuildSystems.includes(buildSystem)) {
      throw new Error(`Invalid build system. Expected: ${validBuildSystems.join(', ')}`);
    }

    return { projectPath, buildSystem };
  }

  /**
   * Validate Docker build parameters
   */
  validateDockerBuild(contextPath, imageName) {
    // Validate context path
    this.validatePath(contextPath);
    
    // Validate Docker image name format
    // Basic validation for Docker image naming conventions
    if (!imageName || typeof imageName !== 'string') {
      throw new Error('Image name is required and must be a string');
    }

    // Docker image name validation (simplified)
    if (!/^[a-z0-9]([a-z0-9\-_\.]*[a-z0-9])?(\:[a-zA-Z0-9]([a-zA-Z0-9\-_\.]*[a-zA-Z0-9])?)?$/.test(imageName.toLowerCase())) {
      throw new Error('Invalid image name format. Use lowercase letters, numbers, hyphens, underscores, and dots.');
    }

    return { contextPath, imageName };
  }

  /**
   * Validate cross-compilation parameters
   */
  validateCrossCompilation(targetOS, targetArch) {
    const validOS = ['windows', 'linux', 'darwin', 'freebsd'];
    const validArch = ['amd64', 'arm64', '386', 'arm'];

    if (targetOS && !validOS.includes(targetOS)) {
      throw new Error(`Invalid target OS. Expected: ${validOS.join(', ')}`);
    }

    if (targetArch && !validArch.includes(targetArch)) {
      throw new Error(`Invalid target architecture. Expected: ${validArch.join(', ')}`);
    }

    return { targetOS, targetArch };
  }

  /**
   * Validate build flags and options for security
   */
  validateBuildFlags(flags) {
    if (!Array.isArray(flags)) {
      throw new Error('Build flags must be an array');
    }

    // Check for dangerous flags
    const dangerousFlagPatterns = [
      /--privileged/i,
      /--cap-add/i,
      /--security-opt/i,
      /--volume.*\/:/,
      /--mount.*type=bind/i,
      /-v.*\/:/,
      /--rm/i, // Potentially dangerous in automated contexts
      /--network.*host/i
    ];

    for (const flag of flags) {
      if (typeof flag !== 'string') {
        throw new Error('All build flags must be strings');
      }

      // Check against dangerous patterns
      for (const pattern of dangerousFlagPatterns) {
        if (pattern.test(flag)) {
          throw new Error(`Dangerous build flag detected: ${flag}`);
        }
      }

      // Check for command injection attempts
      if (flag.includes('$(') || flag.includes('`') || flag.includes(';')) {
        throw new Error(`Potentially dangerous characters in build flag: ${flag}`);
      }
    }

    return flags;
  }

  /**
   * Validate environment variables for builds
   */
  validateBuildEnvironment(env) {
    if (!env || typeof env !== 'object') {
      return env;
    }

    // List of sensitive environment variables that should not be overridden
    const protectedVars = [
      'PATH', 'HOME', 'USER', 'USERNAME', 'USERPROFILE',
      'SYSTEMROOT', 'WINDIR', 'PROGRAMFILES'
    ];

    for (const [key, value] of Object.entries(env)) {
      // Check if trying to override protected variables
      if (protectedVars.includes(key.toUpperCase())) {
        throw new Error(`Cannot override protected environment variable: ${key}`);
      }

      // Validate values for potential injection
      if (typeof value === 'string') {
        if (value.includes('$(') || value.includes('`') || value.includes(';')) {
          throw new Error(`Potentially dangerous characters in environment variable ${key}: ${value}`);
        }
      }
    }

    return env;
  }

  /**
   * Validate Kotlin/Android build parameters
   */
  validateKotlinBuild(projectPath, projectType) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate project type
    const validProjectTypes = ['android', 'jvm', 'native', 'multiplatform'];
    if (!validProjectTypes.includes(projectType)) {
      throw new Error(`Invalid project type. Expected: ${validProjectTypes.join(', ')}`);
    }

    return { projectPath, projectType };
  }

  /**
   * Validate Swift build parameters
   */
  validateSwiftBuild(projectPath, action) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate Swift action
    const validActions = ['build', 'test', 'run', 'package', 'clean'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid Swift action. Expected: ${validActions.join(', ')}`);
    }

    return { projectPath, action };
  }

  /**
   * Validate PHP build parameters
   */
  validatePhpBuild(projectPath, action) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate PHP action
    const validActions = ['install', 'update', 'test', 'build', 'artisan', 'serve'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid PHP action. Expected: ${validActions.join(', ')}`);
    }

    return { projectPath, action };
  }

  /**
   * Validate Ruby build parameters
   */
  validateRubyBuild(projectPath, action) {
    // Validate project path
    this.validatePath(projectPath);
    
    // Validate Ruby action
    const validActions = ['install', 'update', 'exec', 'test', 'build', 'rails', 'rake'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid Ruby action. Expected: ${validActions.join(', ')}`);
    }

    return { projectPath, action };
  }

  /**
   * Enhanced error reporting with suggestions
   */
  createDetailedError(originalError, command, suggestions = []) {
    let errorMessage = originalError;
    
    // Add specific suggestions based on error type
    if (originalError.includes('Command not allowed')) {
      suggestions.push('Try using development mode: ENABLE_DEV_COMMANDS=true');
      suggestions.push('Check allowed commands list in security.js');
    }
    
    if (originalError.includes('Directory traversal')) {
      suggestions.push('Use absolute paths within allowed directories');
      suggestions.push('Check ALLOWED_BUILD_PATHS environment variable');
    }
    
    if (originalError.includes('Dangerous command detected')) {
      suggestions.push('Use alternative safe commands');
      suggestions.push('Consider using batch execution for complex operations');
    }
    
    if (suggestions.length > 0) {
      errorMessage += '\n\nSuggestions:\n' + suggestions.map(s => `  • ${s}`).join('\n');
    }
    
    return new Error(errorMessage);
  }

  /**
   * Validate batch command execution
   */
  validateBatchCommands(commands) {
    if (!Array.isArray(commands)) {
      throw new Error('Batch commands must be an array');
    }
    
    if (commands.length > 50) {
      throw new Error('Too many commands in batch: maximum 50 allowed');
    }
    
    const validatedCommands = [];
    for (const command of commands) {
      try {
        const validatedCommand = this.validatePowerShellCommand(command);
        validatedCommands.push(validatedCommand);
      } catch (error) {
        throw this.createDetailedError(
          `Batch validation failed at command: "${command.substring(0, 100)}..."\n${error.message}`,
          command,
          ['Fix the failing command', 'Remove the problematic command from batch']
        );
      }
    }
    
    return validatedCommands;
  }

  /**
   * Validate process management operations
   */
  validateProcessManagement(processIdentifier, action) {
    // Valid actions for process management
    const validActions = ['stop', 'wait', 'list', 'get'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid process action: ${action}`);
    }

    // If stopping by name, ensure it's not a critical system process
    const protectedProcesses = [
      'system', 'smss', 'csrss', 'wininit', 'winlogon', 
      'services', 'lsass', 'svchost', 'explorer'
    ];
    
    if (action === 'stop' && typeof processIdentifier === 'string') {
      const processName = processIdentifier.toLowerCase().replace('.exe', '');
      if (protectedProcesses.includes(processName)) {
        throw new Error(`Cannot stop protected system process: ${processIdentifier}`);
      }
    }

    // If using process ID, ensure it's a valid number
    if (action === 'stop' && !isNaN(processIdentifier)) {
      const pid = parseInt(processIdentifier);
      if (pid <= 0 || pid > 999999) {
        throw new Error(`Invalid process ID: ${processIdentifier}`);
      }
    }

    return { processIdentifier, action };
  }

  /**
   * Enhanced project-based security for development workflow
   */
  validateProjectWorkflow(projectPath, workflowType = 'default') {
    this.validatePath(projectPath);
    
    const allowedWorkflows = ['default', 'fastapi', 'django', 'flask', 'nodejs', 'react', 'vue'];
    if (!allowedWorkflows.includes(workflowType)) {
      throw new Error(`Invalid workflow type. Supported: ${allowedWorkflows.join(', ')}`);
    }
    
    // Define project-specific allowed operations
    const workflowPermissions = {
      fastapi: ['uvicorn', 'pytest', 'pip', 'python'],
      django: ['python', 'manage.py', 'pytest', 'pip'],
      flask: ['flask', 'python', 'pytest', 'pip'],
      nodejs: ['node', 'npm', 'yarn', 'pnpm'],
      react: ['npm', 'yarn', 'pnpm', 'webpack', 'vite'],
      vue: ['npm', 'yarn', 'pnpm', 'vue-cli']
    };
    
    return {
      projectPath,
      workflowType,
      allowedCommands: workflowPermissions[workflowType] || []
    };
  }
}

module.exports = new SecurityValidator();