/**
 * Enhanced PowerShell Execution with UTF-8 encoding and streaming support
 * Resolves character encoding issues and provides real-time output for long-running commands
 */

const { spawn } = require('child_process');
const logger = require('./logger');

class PowerShellExecutor {
  constructor() {
    this.activeProcesses = new Map();
    this.processCounter = 0;
  }

  /**
   * Preprocess command for enhanced JSON handling and here-string support
   * @param {string} command - Original PowerShell command
   * @param {Object} options - Processing options
   * @returns {string} - Enhanced PowerShell command
   */
  preprocessCommand(command, options = {}) {
    const {
      enableJsonEscaping = process.env.ENABLE_ENHANCED_JSON_ESCAPING === 'true',
      enableHereStrings = process.env.ENABLE_POWERSHELL_HERE_STRINGS === 'true',
      complexityLevel = parseInt(process.env.COMMAND_COMPLEXITY_LEVEL || '3')
    } = options;

    let processedCommand = command;

    // Enhanced JSON escaping for AI server API testing
    if (enableJsonEscaping) {
      processedCommand = this.enhanceJsonEscaping(processedCommand);
    }

    // Here-string support for complex JSON payloads
    if (enableHereStrings) {
      processedCommand = this.convertToHereStrings(processedCommand);
    }

    // Bash-style operator conversion for cross-platform compatibility
    if (complexityLevel >= 4) {
      processedCommand = this.convertBashOperators(processedCommand);
    }

    return processedCommand;
  }

  /**
   * Enhance JSON escaping for AI API testing
   * @param {string} command - Command with JSON strings
   * @returns {string} - Command with enhanced JSON escaping
   */
  enhanceJsonEscaping(command) {
    // Pattern to find JSON-like strings in Invoke-WebRequest -Body parameters
    const jsonBodyPattern = /-Body\s+"([^"]+)"/gi;
    
    return command.replace(jsonBodyPattern, (match, jsonStr) => {
      try {
        // Try to parse and re-stringify to ensure proper escaping
        const parsed = JSON.parse(jsonStr.replace(/\\"/g, '"'));
        const properJson = JSON.stringify(parsed).replace(/"/g, '\\"');
        return match.replace(jsonStr, properJson);
      } catch (error) {
        // If parsing fails, apply basic escaping improvements
        const improved = jsonStr
          .replace(/([^\\])"/g, '$1\\"')  // Escape unescaped quotes
          .replace(/\\\\\\/g, '\\');       // Fix over-escaped backslashes
        return match.replace(jsonStr, improved);
      }
    });
  }

  /**
   * Convert complex JSON to PowerShell here-strings
   * @param {string} command - Command with embedded JSON
   * @returns {string} - Command using here-strings
   */
  convertToHereStrings(command) {
    // Pattern to identify complex JSON strings (containing nested quotes or objects)
    const complexJsonPattern = /-Body\s+"(\{[^}]*"[^}]*\}[^}]*)"(?=\s|$)/gi;
    
    return command.replace(complexJsonPattern, (match, jsonStr) => {
      // Convert to here-string format
      const cleanJson = jsonStr.replace(/\\"/g, '"');
      const hereStringVersion = `$jsonBody = @"\n${cleanJson}\n"@; $jsonBody`;
      
      // Replace in the command
      return match.replace(`"${jsonStr}"`, '$jsonBody') + `\n${hereStringVersion}`;
    });
  }

  /**
   * Convert Bash-style operators to PowerShell equivalents
   * @param {string} command - Command with Bash operators
   * @returns {string} - PowerShell-compatible command
   */
  convertBashOperators(command) {
    return command
      // Convert && to PowerShell semicolon chaining with error checking
      .replace(/\s*&&\s*/g, '; if ($LASTEXITCODE -eq 0) { ')
      // Convert || to PowerShell error handling
      .replace(/\s*\|\|\s*/g, ' } else { ')
      // Close any opened conditional blocks
      .replace(/$/g, (match, offset, string) => {
        const openBraces = (string.match(/if \(\$LASTEXITCODE -eq 0\) \{/g) || []).length;
        return ' }'.repeat(openBraces) + match;
      });
  }

  /**
   * Execute PowerShell command with enhanced encoding and error handling
   * @param {string} command - PowerShell command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result with detailed information
   */
  async executePowerShellCommand(command, options = {}) {
    const { 
      timeout = 300000, // 5 minutes default
      streaming = false,
      workingDirectory = null,
      onStream = null,
      enhancedMode = process.env.ENABLE_ENHANCED_POWERSHELL === 'true'
    } = options;

    const processId = ++this.processCounter;
    const startTime = Date.now();

    // Preprocess command for enhanced JSON handling if enabled
    const processedCommand = enhancedMode ? 
      this.preprocessCommand(command, options) : command;

    // Fixed PowerShell arguments - removed invalid parameters
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', `
        # Force UTF-8 encoding for all output
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
        [Console]::InputEncoding = [System.Text.Encoding]::UTF8;
        $OutputEncoding = [System.Text.Encoding]::UTF8;
        
        # Set working directory if specified
        ${workingDirectory ? `Set-Location -Path '${workingDirectory}';` : ''}
        
        # Execute the actual command
        try {
          ${processedCommand}
        } catch {
          Write-Error "PowerShell execution failed: $($_.Exception.Message)";
          exit 1;
        }
      `
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', args, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          'POWERSHELL_TELEMETRY_OPTOUT': '1'
        }
      });

      this.activeProcesses.set(processId, child);

      let stdout = '';
      let stderr = '';
      let streamingData = [];

      // Handle stdout with UTF-8 encoding
      child.stdout.on('data', (data) => {
        const utf8Data = data.toString('utf8');
        stdout += utf8Data;
        
        if (streaming) {
          const streamChunk = {
            type: 'stdout',
            content: utf8Data,
            timestamp: new Date().toISOString(),
            processId
          };
          streamingData.push(streamChunk);
          
          if (onStream && typeof onStream === 'function') {
            onStream(streamChunk);
          }
        }
      });

      // Handle stderr with UTF-8 encoding
      child.stderr.on('data', (data) => {
        const utf8Data = data.toString('utf8');
        stderr += utf8Data;
        
        if (streaming) {
          const streamChunk = {
            type: 'stderr',
            content: utf8Data,
            timestamp: new Date().toISOString(),
            processId
          };
          streamingData.push(streamChunk);
          
          if (onStream && typeof onStream === 'function') {
            onStream(streamChunk);
          }
        }
      });

      // Handle process completion
      child.on('close', (code, signal) => {
        this.activeProcesses.delete(processId);
        const executionTime = Date.now() - startTime;
        
        const result = {
          success: code === 0,
          exitCode: code,
          signal: signal,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          processId,
          command: command.substring(0, 100) + (command.length > 100 ? '...' : ''),
          workingDirectory,
          timestamp: new Date().toISOString()
        };

        if (streaming) {
          result.streamingData = streamingData;
        }

        logger.info('PowerShell command completed', {
          processId,
          exitCode: code,
          executionTime,
          success: code === 0
        });

        resolve(result);
      });

      // Handle process errors
      child.on('error', (error) => {
        this.activeProcesses.delete(processId);
        const executionTime = Date.now() - startTime;
        
        logger.error('PowerShell process error', {
          processId,
          error: error.message,
          executionTime
        });

        reject(new Error(`PowerShell process failed: ${error.message}`));
      });

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        if (this.activeProcesses.has(processId)) {
          child.kill('SIGTERM');
          this.activeProcesses.delete(processId);
          
          logger.warn('PowerShell command timed out', {
            processId,
            timeout,
            command: command.substring(0, 100)
          });
          
          reject(new Error(`Command timed out after ${timeout}ms`));
        }
      }, timeout);

      // Clear timeout on completion
      child.on('close', () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  /**
   * Execute batch file with proper encoding and streaming
   * @param {string} batchFilePath - Path to batch file
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  async executeBatchFile(batchFilePath, options = {}) {
    const { workingDirectory = null, ...otherOptions } = options;
    
    // Change to the batch file directory if no working directory specified
    const batchDir = workingDirectory || require('path').dirname(batchFilePath);
    const batchFileName = require('path').basename(batchFilePath);
    
    const command = `& '.\\${batchFileName}'`;
    
    return this.executePowerShellCommand(command, {
      ...otherOptions,
      workingDirectory: batchDir
    });
  }

  /**
   * Get status of all active processes
   * @returns {Object} - Active processes information
   */
  getActiveProcesses() {
    const processes = [];
    
    this.activeProcesses.forEach((child, processId) => {
      processes.push({
        processId,
        pid: child.pid,
        killed: child.killed,
        exitCode: child.exitCode,
        signalCode: child.signalCode
      });
    });

    return {
      count: processes.length,
      processes
    };
  }

  /**
   * Kill specific process by ID
   * @param {number} processId - Process ID to kill
   * @returns {boolean} - True if process was killed
   */
  killProcess(processId) {
    const child = this.activeProcesses.get(processId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      logger.info('PowerShell process killed', { processId });
      return true;
    }
    return false;
  }

  /**
   * Kill all active processes
   * @returns {number} - Number of processes killed
   */
  killAllProcesses() {
    let killed = 0;
    this.activeProcesses.forEach((child, processId) => {
      child.kill('SIGTERM');
      killed++;
    });
    this.activeProcesses.clear();
    
    logger.info('All PowerShell processes killed', { count: killed });
    return killed;
  }

  /**
   * Sanitize command for safe execution
   * @param {string} command - Raw command
   * @returns {string} - Sanitized command
   */
  sanitizeCommand(command) {
    // Remove potentially dangerous characters and patterns
    return command
      .replace(/[;&|`]/g, '') // Remove command chaining
      .replace(/\$\(.*?\)/g, '') // Remove command substitution
      .trim();
  }

  /**
   * Validate PowerShell command for security
   * @param {string} command - Command to validate
   * @returns {Object} - Validation result
   */
  validateCommand(command) {
    const dangerousPatterns = [
      /Invoke-Expression/i,
      /Invoke-Command/i,
      /New-Object.*System\.Net\.WebClient/i,
      /DownloadString/i,
      /DownloadFile/i,
      /Start-Process.*-Verb.*RunAs/i
    ];

    const warnings = [];
    
    dangerousPatterns.forEach(pattern => {
      if (pattern.test(command)) {
        warnings.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    });

    return {
      isValid: warnings.length === 0,
      warnings,
      sanitized: this.sanitizeCommand(command)
    };
  }
}

// Export singleton instance
module.exports = new PowerShellExecutor();