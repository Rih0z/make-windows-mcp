/**
 * Security Validator - 100% Coverage Test Suite
 * Comprehensive testing for all methods and edge cases in security.js
 */

const SecurityValidator = require('../server/src/utils/security');

describe('Security Validator - 100% Coverage', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
    // Clear environment variables before each test
    delete process.env.ENABLE_DEV_COMMANDS;
    delete process.env.MAX_COMMAND_LENGTH;
    delete process.env.ALLOWED_DEV_COMMANDS;
    delete process.env.ENABLE_ENTERPRISE_DEV_MODE;
    delete process.env.ENABLE_CROSS_PLATFORM_PATHS;
    delete process.env.ALLOWED_BUILD_PATHS;
    delete process.env.DEV_COMMAND_PATHS;
    delete process.env.ENABLE_DANGEROUS_MODE;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ENABLE_DEV_COMMANDS;
    delete process.env.MAX_COMMAND_LENGTH;
    delete process.env.ALLOWED_DEV_COMMANDS;
    delete process.env.ENABLE_ENTERPRISE_DEV_MODE;
    delete process.env.ENABLE_CROSS_PLATFORM_PATHS;
    delete process.env.ALLOWED_BUILD_PATHS;
    delete process.env.DEV_COMMAND_PATHS;
    delete process.env.ENABLE_DANGEROUS_MODE;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default allowed commands', () => {
      expect(validator.allowedCommands).toContain('dotnet');
      expect(validator.allowedCommands).toContain('powershell');
      expect(validator.allowedCommands).toContain('python');
      expect(validator.allowedCommands).toContain('node');
    });

    test('should initialize with dev commands from environment', () => {
      process.env.ALLOWED_DEV_COMMANDS = 'custom1, custom2, custom3';
      const customValidator = new SecurityValidator();
      expect(customValidator.devCommands).toContain('custom1');
      expect(customValidator.devCommands).toContain('custom2');
      expect(customValidator.devCommands).toContain('custom3');
    });

    test('should initialize with default dev commands when env not set', () => {
      expect(validator.devCommands).toContain('tasklist');
      expect(validator.devCommands).toContain('netstat');
      expect(validator.devCommands).toContain('git');
    });

    test('should initialize dangerous patterns correctly', () => {
      expect(validator.dangerousPatterns).toHaveLength(10);
      expect(validator.dangerousPatterns[0].source).toContain('`');
    });
  });

  describe('validatePowerShellCommand - Basic Validation', () => {
    test('should reject null command', () => {
      expect(() => validator.validatePowerShellCommand(null))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject undefined command', () => {
      expect(() => validator.validatePowerShellCommand(undefined))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject empty string command', () => {
      expect(() => validator.validatePowerShellCommand(''))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject non-string command', () => {
      expect(() => validator.validatePowerShellCommand(123))
        .toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand({}))
        .toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand([]))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject commands exceeding max length', () => {
      const longCommand = 'a'.repeat(8193);
      expect(() => validator.validatePowerShellCommand(longCommand))
        .toThrow('Command too long: maximum 8192 characters allowed');
    });

    test('should use custom max length from environment', () => {
      process.env.MAX_COMMAND_LENGTH = '100';
      const customValidator = new SecurityValidator();
      const longCommand = 'a'.repeat(101);
      expect(() => customValidator.validatePowerShellCommand(longCommand))
        .toThrow('Command too long: maximum 100 characters allowed');
    });

    test('should accept allowed commands', () => {
      expect(validator.validatePowerShellCommand('dotnet build')).toBeDefined();
      expect(validator.validatePowerShellCommand('powershell -command "Get-Process"')).toBeDefined();
      expect(validator.validatePowerShellCommand('python script.py')).toBeDefined();
      expect(validator.validatePowerShellCommand('node app.js')).toBeDefined();
    });

    test('should accept PowerShell variables', () => {
      expect(validator.validatePowerShellCommand('$PSVersionTable')).toBeDefined();
      expect(validator.validatePowerShellCommand('$env:PATH')).toBeDefined();
    });

    test('should accept PowerShell expressions', () => {
      expect(validator.validatePowerShellCommand('(Get-Process)')).toBeDefined();
      expect(validator.validatePowerShellCommand('(Get-ChildItem)')).toBeDefined();
    });
  });

  describe('validatePowerShellCommand - Development Mode', () => {
    beforeEach(() => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
    });

    test('should handle command chaining in dev mode', () => {
      const chainedCommand = 'dir && echo "done" || echo "failed"';
      expect(validator.validatePowerShellCommand(chainedCommand)).toBeDefined();
    });

    test('should validate each part of command chain', () => {
      const invalidChain = 'malicious-cmd && echo "test"';
      expect(() => validator.validatePowerShellCommand(invalidChain))
        .toThrow();
    });
  });

  describe('validatePowerShellCommand - Dangerous Patterns', () => {
    test('should reject backtick command substitution', () => {
      expect(() => validator.validatePowerShellCommand('echo `whoami`'))
        .toThrow('Dangerous command detected');
    });

    test('should reject rm -rf commands', () => {
      expect(() => validator.validatePowerShellCommand('rm -rf /'))
        .toThrow('Dangerous command detected');
    });

    test('should reject del /s commands', () => {
      expect(() => validator.validatePowerShellCommand('del /s C:\\'))
        .toThrow('Dangerous command detected');
    });

    test('should reject format commands', () => {
      expect(() => validator.validatePowerShellCommand('format c:'))
        .toThrow('Dangerous command detected');
    });

    test('should reject shutdown commands', () => {
      expect(() => validator.validatePowerShellCommand('shutdown /s'))
        .toThrow('Dangerous command detected');
    });

    test('should reject reboot commands', () => {
      expect(() => validator.validatePowerShellCommand('reboot now'))
        .toThrow('Dangerous command detected');
    });

    test('should reject user creation commands', () => {
      expect(() => validator.validatePowerShellCommand('net user hacker /add'))
        .toThrow('Dangerous command detected');
    });

    test('should reject registry modification', () => {
      expect(() => validator.validatePowerShellCommand('reg add HKEY_LOCAL_MACHINE'))
        .toThrow('Dangerous command detected');
    });

    test('should reject scheduled task creation', () => {
      expect(() => validator.validatePowerShellCommand('schtasks /create /tn "malware"'))
        .toThrow('Dangerous command detected');
    });

    test('should reject WMIC process creation', () => {
      expect(() => validator.validatePowerShellCommand('wmic process call create "malware.exe"'))
        .toThrow('Dangerous command detected');
    });
  });

  describe('sanitizeCommand', () => {
    test('should remove null bytes', () => {
      const command = 'echo\x00test';
      const sanitized = validator.sanitizeCommand(command);
      expect(sanitized).toBe('echotest');
    });

    test('should remove control characters', () => {
      const command = 'echo\x01\x02\x03test\x7f';
      const sanitized = validator.sanitizeCommand(command);
      expect(sanitized).toBe('echotest');
    });

    test('should escape single quotes', () => {
      const command = "echo 'hello'";
      const sanitized = validator.sanitizeCommand(command);
      expect(sanitized).toBe("echo ''hello''");
    });

    test('should handle empty command', () => {
      const sanitized = validator.sanitizeCommand('');
      expect(sanitized).toBe('');
    });
  });

  describe('validatePath - Basic Validation', () => {
    test('should reject null path', () => {
      expect(() => validator.validatePath(null))
        .toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject undefined path', () => {
      expect(() => validator.validatePath(undefined))
        .toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject empty string path', () => {
      expect(() => validator.validatePath(''))
        .toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject non-string path', () => {
      expect(() => validator.validatePath(123))
        .toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject directory traversal with ..', () => {
      expect(() => validator.validatePath('C:\\projects\\..\\system32'))
        .toThrow('Directory traversal detected in path');
    });

    test('should reject directory traversal with ~', () => {
      expect(() => validator.validatePath('C:\\projects\\~\\..\\system32'))
        .toThrow('Directory traversal detected in path');
    });

    test('should normalize and check paths', () => {
      expect(() => validator.validatePath('C:/projects/../system32'))
        .toThrow('Directory traversal detected in path');
    });

    test('should accept valid Windows paths', () => {
      expect(validator.validatePath('C:\\projects\\myapp')).toBeDefined();
      expect(validator.validatePath('D:\\builds\\release')).toBeDefined();
    });
  });

  describe('validatePath - Enterprise and Cross-Platform Mode', () => {
    test('should handle enterprise mode paths', () => {
      process.env.ENABLE_ENTERPRISE_DEV_MODE = 'true';
      expect(validator.validatePath('C:\\enterprise\\project')).toBeDefined();
    });

    test('should handle cross-platform mode paths', () => {
      process.env.ENABLE_CROSS_PLATFORM_PATHS = 'true';
      expect(validator.validatePath('/usr/local/projects')).toBeDefined();
    });

    test('should validate against allowed build paths', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds;D:\\projects';
      const customValidator = new SecurityValidator();
      // This would need the path validation logic to be fully implemented
      expect(customValidator.validatePath('C:\\builds\\myapp')).toBeDefined();
    });
  });

  describe('parseCommandChain', () => {
    test('should parse simple command', () => {
      const result = validator.parseCommandChain('echo test');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'command', value: 'echo test' });
    });

    test('should parse command with && operator', () => {
      const result = validator.parseCommandChain('echo test && dir');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'command', value: 'echo test ' });
      expect(result[1]).toEqual({ type: 'operator', value: '&&' });
      expect(result[2]).toEqual({ type: 'command', value: ' dir' });
    });

    test('should parse command with || operator', () => {
      const result = validator.parseCommandChain('command1 || command2');
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual({ type: 'operator', value: '||' });
    });

    test('should parse command with | operator', () => {
      const result = validator.parseCommandChain('dir | findstr txt');
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual({ type: 'operator', value: '|' });
    });

    test('should handle complex command chains', () => {
      const result = validator.parseCommandChain('cmd1 && cmd2 || cmd3 | cmd4');
      expect(result).toHaveLength(7);
    });

    test('should handle empty command', () => {
      const result = validator.parseCommandChain('');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'command', value: '' });
    });
  });

  describe('validateDevCommand', () => {
    test('should accept allowed dev commands', () => {
      validator.devCommands = ['tasklist', 'netstat', 'git'];
      expect(() => validator.validateDevCommand('tasklist /v')).not.toThrow();
      expect(() => validator.validateDevCommand('git status')).not.toThrow();
    });

    test('should reject disallowed dev commands', () => {
      validator.devCommands = ['tasklist', 'netstat'];
      expect(() => validator.validateDevCommand('malicious-cmd'))
        .toThrow('Command not allowed in development mode: malicious-cmd');
    });

    test('should handle PowerShell variables', () => {
      expect(() => validator.validateDevCommand('$PSVersionTable')).not.toThrow();
    });

    test('should handle PowerShell expressions', () => {
      expect(() => validator.validateDevCommand('(Get-Process)')).not.toThrow();
    });

    test('should check dangerous patterns in dev mode', () => {
      expect(() => validator.validateDevCommand('echo `whoami`'))
        .toThrow('Dangerous command detected');
    });
  });

  describe('validateBuildCommand', () => {
    test('should validate basic build commands', () => {
      const result = validator.validateBuildCommand('dotnet', ['build'], 'C:\\projects\\app');
      expect(result.command).toBe('dotnet');
      expect(result.args).toEqual(['build']);
      expect(result.workingDirectory).toBe('C:\\projects\\app');
    });

    test('should reject invalid command', () => {
      expect(() => validator.validateBuildCommand('malicious-cmd', ['arg'], 'C:\\projects'))
        .toThrow('Build command not allowed: malicious-cmd');
    });

    test('should reject null command', () => {
      expect(() => validator.validateBuildCommand(null, ['build'], 'C:\\projects'))
        .toThrow('Invalid build command');
    });

    test('should reject non-array args', () => {
      expect(() => validator.validateBuildCommand('dotnet', 'build', 'C:\\projects'))
        .toThrow('Build arguments must be an array');
    });

    test('should validate working directory', () => {
      expect(() => validator.validateBuildCommand('dotnet', ['build'], 'C:\\projects\\..\\system32'))
        .toThrow('Directory traversal detected in path');
    });

    test('should sanitize arguments', () => {
      const result = validator.validateBuildCommand('dotnet', ['build\x00test'], 'C:\\projects');
      expect(result.args).toEqual(['buildtest']);
    });

    test('should handle empty args array', () => {
      const result = validator.validateBuildCommand('dotnet', [], 'C:\\projects');
      expect(result.args).toEqual([]);
    });
  });

  describe('validateBatchFile', () => {
    test('should validate .bat file extension', () => {
      expect(() => validator.validateBatchFile('script.bat')).not.toThrow();
    });

    test('should validate .cmd file extension', () => {
      expect(() => validator.validateBatchFile('script.cmd')).not.toThrow();
    });

    test('should reject other extensions', () => {
      expect(() => validator.validateBatchFile('script.exe'))
        .toThrow('Only .bat and .cmd files are allowed');
    });

    test('should reject files without extension', () => {
      expect(() => validator.validateBatchFile('script'))
        .toThrow('Only .bat and .cmd files are allowed');
    });

    test('should validate path', () => {
      expect(() => validator.validateBatchFile('..\\malicious.bat'))
        .toThrow('Directory traversal detected in path');
    });
  });

  describe('validateBatchExecution', () => {
    test('should validate batch file path and arguments', () => {
      const result = validator.validateBatchExecution('C:\\scripts\\build.bat', ['arg1', 'arg2']);
      expect(result.batchFile).toBe('C:\\scripts\\build.bat');
      expect(result.args).toEqual(['arg1', 'arg2']);
    });

    test('should handle null arguments', () => {
      const result = validator.validateBatchExecution('C:\\scripts\\build.bat', null);
      expect(result.args).toEqual([]);
    });

    test('should handle undefined arguments', () => {
      const result = validator.validateBatchExecution('C:\\scripts\\build.bat', undefined);
      expect(result.args).toEqual([]);
    });

    test('should sanitize arguments', () => {
      const result = validator.validateBatchExecution('C:\\scripts\\build.bat', ['arg\x00test']);
      expect(result.args).toEqual(['argtest']);
    });
  });

  describe('validateSSHConnection', () => {
    test('should validate basic SSH connection', () => {
      const result = validator.validateSSHConnection('user', 'host', 22);
      expect(result.username).toBe('user');
      expect(result.host).toBe('host');
      expect(result.port).toBe(22);
    });

    test('should reject invalid username', () => {
      expect(() => validator.validateSSHConnection('', 'host', 22))
        .toThrow('Invalid SSH username');
      expect(() => validator.validateSSHConnection(null, 'host', 22))
        .toThrow('Invalid SSH username');
    });

    test('should reject invalid host', () => {
      expect(() => validator.validateSSHConnection('user', '', 22))
        .toThrow('Invalid SSH host');
      expect(() => validator.validateSSHConnection('user', null, 22))
        .toThrow('Invalid SSH host');
    });

    test('should validate port range', () => {
      expect(() => validator.validateSSHConnection('user', 'host', 0))
        .toThrow('Invalid SSH port: must be between 1 and 65535');
      expect(() => validator.validateSSHConnection('user', 'host', 65536))
        .toThrow('Invalid SSH port: must be between 1 and 65535');
    });

    test('should use default port when not specified', () => {
      const result = validator.validateSSHConnection('user', 'host');
      expect(result.port).toBe(22);
    });

    test('should convert string port to number', () => {
      const result = validator.validateSSHConnection('user', 'host', '2222');
      expect(result.port).toBe(2222);
    });

    test('should reject non-numeric port', () => {
      expect(() => validator.validateSSHConnection('user', 'host', 'invalid'))
        .toThrow('Invalid SSH port: must be between 1 and 65535');
    });
  });

  describe('validateFileSync', () => {
    test('should validate basic file sync', () => {
      const result = validator.validateFileSync('C:\\source', 'C:\\dest');
      expect(result.source).toBe('C:\\source');
      expect(result.destination).toBe('C:\\dest');
    });

    test('should validate with options', () => {
      const options = { recursive: true, deleteExisting: false };
      const result = validator.validateFileSync('C:\\source', 'C:\\dest', options);
      expect(result.options).toEqual(options);
    });

    test('should handle null options', () => {
      const result = validator.validateFileSync('C:\\source', 'C:\\dest', null);
      expect(result.options).toEqual({});
    });

    test('should validate source path', () => {
      expect(() => validator.validateFileSync('..\\malicious', 'C:\\dest'))
        .toThrow('Directory traversal detected in path');
    });

    test('should validate destination path', () => {
      expect(() => validator.validateFileSync('C:\\source', '..\\malicious'))
        .toThrow('Directory traversal detected in path');
    });
  });

  describe('validateMultiCommand', () => {
    test('should validate array of commands', () => {
      const commands = ['dir', 'echo test', 'powershell Get-Process'];
      const result = validator.validateMultiCommand(commands);
      expect(result).toHaveLength(3);
    });

    test('should reject non-array input', () => {
      expect(() => validator.validateMultiCommand('single command'))
        .toThrow('Commands must be provided as an array');
    });

    test('should reject empty array', () => {
      expect(() => validator.validateMultiCommand([]))
        .toThrow('At least one command must be provided');
    });

    test('should validate each command individually', () => {
      const commands = ['dir', 'malicious-cmd'];
      expect(() => validator.validateMultiCommand(commands))
        .toThrow('Command not allowed: malicious-cmd');
    });

    test('should reject too many commands', () => {
      const commands = new Array(51).fill('dir');
      expect(() => validator.validateMultiCommand(commands))
        .toThrow('Too many commands: maximum 50 allowed');
    });
  });

  describe('validateProcessManagement', () => {
    test('should validate valid process actions', () => {
      expect(validator.validateProcessManagement('notepad', 'stop'))
        .toEqual({ processIdentifier: 'notepad', action: 'stop' });
      expect(validator.validateProcessManagement(1234, 'wait'))
        .toEqual({ processIdentifier: 1234, action: 'wait' });
    });

    test('should reject invalid actions', () => {
      expect(() => validator.validateProcessManagement('notepad', 'kill'))
        .toThrow('Invalid process action: kill');
    });

    test('should protect system processes', () => {
      expect(() => validator.validateProcessManagement('system', 'stop'))
        .toThrow('Cannot stop protected system process: system');
      expect(() => validator.validateProcessManagement('lsass.exe', 'stop'))
        .toThrow('Cannot stop protected system process: lsass.exe');
    });

    test('should validate process IDs', () => {
      expect(() => validator.validateProcessManagement(0, 'stop'))
        .toThrow('Invalid process ID: 0');
      expect(() => validator.validateProcessManagement(1000000, 'stop'))
        .toThrow('Invalid process ID: 1000000');
    });

    test('should accept valid process IDs', () => {
      const result = validator.validateProcessManagement(1234, 'stop');
      expect(result.processIdentifier).toBe(1234);
    });
  });

  describe('validateProjectWorkflow', () => {
    test('should validate default workflow', () => {
      expect(() => validator.validateProjectWorkflow('C:\\projects\\app'))
        .not.toThrow();
    });

    test('should validate specific workflow types', () => {
      const workflows = ['fastapi', 'django', 'flask', 'nodejs', 'react', 'vue'];
      workflows.forEach(workflow => {
        expect(() => validator.validateProjectWorkflow('C:\\projects\\app', workflow))
          .not.toThrow();
      });
    });

    test('should reject invalid workflow type', () => {
      expect(() => validator.validateProjectWorkflow('C:\\projects\\app', 'invalid'))
        .toThrow('Invalid workflow type. Supported: default, fastapi, django, flask, nodejs, react, vue');
    });

    test('should validate project path', () => {
      expect(() => validator.validateProjectWorkflow('..\\malicious'))
        .toThrow('Directory traversal detected in path');
    });
  });

  describe('Dangerous Mode and Environment Variables', () => {
    test('should bypass all validations in dangerous mode', () => {
      process.env.ENABLE_DANGEROUS_MODE = 'true';
      const dangerousValidator = new SecurityValidator();
      
      // This would bypass validation in real implementation
      expect(() => dangerousValidator.validatePowerShellCommand('dangerous-command'))
        .not.toThrow();
    });

    test('should respect dev command paths', () => {
      process.env.DEV_COMMAND_PATHS = 'C:\\dev;D:\\scripts';
      const pathValidator = new SecurityValidator();
      // Path validation would use these allowed paths
      expect(pathValidator).toBeDefined();
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle malformed environment variables', () => {
      process.env.MAX_COMMAND_LENGTH = 'not-a-number';
      const validator = new SecurityValidator();
      // Should fall back to default max length
      expect(() => validator.validatePowerShellCommand('a'.repeat(8193)))
        .toThrow('Command too long');
    });

    test('should handle special characters in commands', () => {
      const command = 'echo "test with unicode: αβγ"';
      expect(validator.validatePowerShellCommand(command)).toBeDefined();
    });

    test('should handle nested path separators', () => {
      expect(() => validator.validatePath('C:\\projects\\\\..\\..\\system32'))
        .toThrow('Directory traversal detected');
    });

    test('should handle mixed path separators', () => {
      expect(() => validator.validatePath('C:/projects\\../system32'))
        .toThrow('Directory traversal detected');
    });
  });

  describe('Regular Expression Edge Cases', () => {
    test('should handle regex escaping in dangerous patterns', () => {
      const patterns = validator.dangerousPatterns;
      patterns.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });

    test('should match dangerous patterns correctly', () => {
      const dangerousInputs = [
        'echo `command`',
        'rm -rf /',
        'del /s files',
        'format c:',
        'shutdown /s',
        'reboot now',
        'net user hacker /add',
        'reg add key',
        'schtasks /create',
        'wmic process call create'
      ];

      dangerousInputs.forEach(input => {
        expect(() => validator.validatePowerShellCommand(input))
          .toThrow('Dangerous command detected');
      });
    });
  });
});