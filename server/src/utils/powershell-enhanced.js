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
      onStream = null
    } = options;

    const processId = ++this.processCounter;
    const startTime = Date.now();

    // Enhanced PowerShell arguments for UTF-8 support
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-OutputEncoding', 'UTF8',
      '-InputFormat', 'Text',
      '-Command', `
        # Force UTF-8 encoding for all output
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
        [Console]::InputEncoding = [System.Text.Encoding]::UTF8;
        $OutputEncoding = [System.Text.Encoding]::UTF8;
        
        # Set working directory if specified
        ${workingDirectory ? `Set-Location -Path '${workingDirectory}';` : ''}
        
        # Execute the actual command
        try {
          ${command}
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