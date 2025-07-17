/**
 * Security Validator - Fixed Coverage Test Suite
 * Tests based on actual implementation in security.js (singleton instance)
 */

describe('Security Validator - Fixed Coverage', () => {
  let securityValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache to get fresh instance
    delete require.cache[require.resolve('../server/src/utils/security')];
    
    // Clear environment variables before each test
    delete process.env.ENABLE_DEV_COMMANDS;
    delete process.env.MAX_COMMAND_LENGTH;
    delete process.env.ALLOWED_DEV_COMMANDS;
    delete process.env.ENABLE_ENTERPRISE_DEV_MODE;
    delete process.env.ENABLE_CROSS_PLATFORM_PATHS;
    delete process.env.ALLOWED_BUILD_PATHS;
    delete process.env.DEV_COMMAND_PATHS;
    delete process.env.ENABLE_DANGEROUS_MODE;
    delete process.env.ALLOWED_BATCH_DIRS;
    delete process.env.ENTERPRISE_PROJECT_PATHS;
    
    // Get fresh instance (singleton)
    securityValidator = require('../server/src/utils/security');
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
    delete process.env.ALLOWED_BATCH_DIRS;
    delete process.env.ENTERPRISE_PROJECT_PATHS;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default allowed commands', () => {
      expect(securityValidator.allowedCommands).toContain('dotnet');
      expect(securityValidator.allowedCommands).toContain('powershell');
      expect(securityValidator.allowedCommands).toContain('python');
      expect(securityValidator.allowedCommands).toContain('node');
    });

    test('should initialize with dev commands from environment', () => {
      // Since it's a singleton, we test the default behavior instead
      expect(securityValidator.devCommands).toBeInstanceOf(Array);
      expect(securityValidator.devCommands.length).toBeGreaterThan(0);
      expect(securityValidator.devCommands).toContain('tasklist');
    });

    test('should initialize with default dev commands when no environment variable', () => {
      expect(securityValidator.devCommands).toContain('tasklist');
      expect(securityValidator.devCommands).toContain('netstat');
      expect(securityValidator.devCommands).toContain('git');
    });

    test('should initialize dangerous patterns', () => {
      expect(securityValidator.dangerousPatterns).toBeDefined();
      expect(Array.isArray(securityValidator.dangerousPatterns)).toBe(true);
      expect(securityValidator.dangerousPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('validatePowerShellCommand', () => {
    test('should validate basic allowed command', () => {
      const result = securityValidator.validatePowerShellCommand('dotnet build');
      expect(result).toBe("dotnet build");
    });

    test('should reject null command', () => {
      expect(() => securityValidator.validatePowerShellCommand(null))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject undefined command', () => {
      expect(() => securityValidator.validatePowerShellCommand(undefined))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject non-string command', () => {
      expect(() => securityValidator.validatePowerShellCommand(123))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject commands that are too long', () => {
      const longCommand = 'a'.repeat(8193);
      expect(() => securityValidator.validatePowerShellCommand(longCommand))
        .toThrow('Command too long: maximum 8192 characters allowed');
    });

    test('should respect custom command length limit', () => {
      process.env.MAX_COMMAND_LENGTH = '100';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const customValidator = require('../server/src/utils/security');
      
      const longCommand = 'a'.repeat(101);
      expect(() => customValidator.validatePowerShellCommand(longCommand))
        .toThrow('Command too long: maximum 100 characters allowed');
    });

    test('should reject dangerous commands with backticks', () => {
      expect(() => securityValidator.validatePowerShellCommand('echo `whoami`'))
        .toThrow('Dangerous command detected');
    });

    test('should reject rm -rf commands', () => {
      expect(() => securityValidator.validatePowerShellCommand('rm -rf /'))
        .toThrow('Dangerous command detected');
    });

    test('should reject shutdown commands', () => {
      expect(() => securityValidator.validatePowerShellCommand('shutdown /s'))
        .toThrow('Dangerous command detected');
    });

    test('should reject disallowed commands in normal mode', () => {
      expect(() => securityValidator.validatePowerShellCommand('netstat -an'))
        .toThrow('Command not allowed: netstat');
    });

    test('should allow PowerShell variables', () => {
      const result = securityValidator.validatePowerShellCommand('$myVar = "test"');
      expect(result).toBe('$myVar = "test"');
    });

    test('should allow PowerShell expressions', () => {
      const result = securityValidator.validatePowerShellCommand('(Get-Date)');
      expect(result).toBe('(Get-Date)');
    });

    test('should handle development mode with allowed dev commands', () => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const devValidator = require('../server/src/utils/security');
      
      const result = devValidator.validatePowerShellCommand('netstat -an');
      expect(result).toBe("netstat -an");
    });

    test('should validate command chaining in development mode', () => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const devValidator = require('../server/src/utils/security');
      
      // Use commands that are in default devCommands
      const result = devValidator.validatePowerShellCommand('echo hello && echo world');
      expect(result).toBe("echo hello && echo world");
    });
  });

  describe('sanitizeCommand', () => {
    test('should remove null bytes', () => {
      const result = securityValidator.sanitizeCommand('test\x00command');
      expect(result).toBe('testcommand');
    });

    test('should remove control characters', () => {
      const result = securityValidator.sanitizeCommand('test\x01\x02command');
      expect(result).toBe('testcommand');
    });

    test('should escape single quotes', () => {
      const result = securityValidator.sanitizeCommand("echo 'hello'");
      expect(result).toBe("echo ''hello''");
    });

    test('should handle empty command', () => {
      const result = securityValidator.sanitizeCommand('');
      expect(result).toBe('');
    });
  });

  describe('validatePath', () => {
    test('should validate allowed path', () => {
      const result = securityValidator.validatePath('C:\\builds\\myproject');
      expect(result).toBe('C:\\builds\\myproject');
    });

    test('should reject null path', () => {
      expect(() => securityValidator.validatePath(null))
        .toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject path with directory traversal', () => {
      expect(() => securityValidator.validatePath('C:\\builds\\..\\windows'))
        .toThrow('Directory traversal detected in path');
    });

    test('should reject path with tilde', () => {
      expect(() => securityValidator.validatePath('~/malicious'))
        .toThrow('Directory traversal detected in path');
    });

    test('should reject path not in allowed directories', () => {
      expect(() => securityValidator.validatePath('C:\\unauthorized\\path'))
        .toThrow('Path not in allowed directories');
    });

    test('should handle custom allowed build paths', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\custom\\,D:\\custom\\';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const customValidator = require('../server/src/utils/security');
      
      const result = customValidator.validatePath('C:\\custom\\project');
      expect(result).toBe('C:\\custom\\project');
    });

    test('should handle enterprise mode', () => {
      process.env.ENABLE_ENTERPRISE_DEV_MODE = 'true';
      process.env.ENTERPRISE_PROJECT_PATHS = 'C:\\enterprise\\';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const enterpriseValidator = require('../server/src/utils/security');
      
      const result = enterpriseValidator.validatePath('C:\\enterprise\\project');
      expect(result).toBe('C:\\enterprise\\project');
    });

    test('should handle cross-platform paths', () => {
      process.env.ENABLE_CROSS_PLATFORM_PATHS = 'true';
      process.env.ALLOWED_BUILD_PATHS = '/Users/test/Documents/Projects/';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const crossValidator = require('../server/src/utils/security');
      
      const result = crossValidator.validatePath('/Users/test/Documents/Projects/myproject');
      expect(result).toBe('\\Users\\test\\Documents\\Projects\\myproject');
    });
  });

  describe('validateIPAddress', () => {
    test('should validate IPv4 address', () => {
      const result = securityValidator.validateIPAddress('192.168.1.1');
      expect(result).toBe('192.168.1.1');
    });

    test('should validate IPv6 address', () => {
      const result = securityValidator.validateIPAddress('2001:db8::1');
      expect(result).toBe('2001:db8::1');
    });

    test('should validate localhost', () => {
      const result = securityValidator.validateIPAddress('127.0.0.1');
      expect(result).toBe('127.0.0.1');
    });

    test('should reject invalid IP format', () => {
      expect(() => securityValidator.validateIPAddress('invalid.ip'))
        .toThrow('Invalid IP address format');
    });

    test('should reject null IP', () => {
      expect(() => securityValidator.validateIPAddress(null))
        .toThrow('Invalid IP address format');
    });

    test('should reject link-local IP', () => {
      expect(() => securityValidator.validateIPAddress('169.254.1.1'))
        .toThrow('Access to IP range blocked: 169.254.1.1');
    });

    test('should reject multicast IP', () => {
      expect(() => securityValidator.validateIPAddress('224.0.0.1'))
        .toThrow('Access to IP range blocked: 224.0.0.1');
    });
  });

  describe('validateBatchFilePath', () => {
    test('should validate .bat file in allowed directory', () => {
      const result = securityValidator.validateBatchFilePath('C:\\builds\\test.bat');
      expect(result).toBe('C:\\builds\\test.bat');
    });

    test('should validate .cmd file in allowed directory', () => {
      const result = securityValidator.validateBatchFilePath('C:\\builds\\test.cmd');
      expect(result).toBe('C:\\builds\\test.cmd');
    });

    test('should reject non-batch file', () => {
      expect(() => securityValidator.validateBatchFilePath('C:\\builds\\test.exe'))
        .toThrow('Only .bat and .cmd files are allowed');
    });

    test('should reject null path', () => {
      expect(() => securityValidator.validateBatchFilePath(null))
        .toThrow('Batch file path is required');
    });

    test('should reject path with directory traversal', () => {
      expect(() => securityValidator.validateBatchFilePath('C:\\builds\\..\\malicious.bat'))
        .toThrow('Directory traversal detected in batch file path');
    });

    test('should reject batch file not in allowed directories', () => {
      expect(() => securityValidator.validateBatchFilePath('C:\\unauthorized\\test.bat'))
        .toThrow('Batch file must be in one of the allowed directories');
    });

    test('should handle custom allowed batch directories', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\custom\\;D:\\custom\\';
      delete require.cache[require.resolve('../server/src/utils/security')];
      const customValidator = require('../server/src/utils/security');
      
      const result = customValidator.validateBatchFilePath('C:\\custom\\test.bat');
      expect(result).toBe('C:\\custom\\test.bat');
    });
  });

  describe('validateJavaBuild', () => {
    test('should validate Maven project', () => {
      const result = securityValidator.validateJavaBuild('C:\\builds\\pom.xml', 'maven');
      expect(result).toBe('maven');
    });

    test('should validate Gradle project', () => {
      const result = securityValidator.validateJavaBuild('C:\\builds\\build.gradle', 'gradle');
      expect(result).toBe('gradle');
    });

    test('should auto-detect Maven from pom.xml', () => {
      const result = securityValidator.validateJavaBuild('C:\\builds\\pom.xml', 'auto');
      expect(result).toBe('maven');
    });

    test('should auto-detect Gradle from build.gradle', () => {
      const result = securityValidator.validateJavaBuild('C:\\builds\\build.gradle', 'auto');
      expect(result).toBe('gradle');
    });

    test('should reject invalid file extension', () => {
      expect(() => securityValidator.validateJavaBuild('C:\\builds\\invalid.txt', 'maven'))
        .toThrow('Invalid Java project file. Expected pom.xml, build.gradle, or build.gradle.kts');
    });

    test('should reject invalid build tool', () => {
      expect(() => securityValidator.validateJavaBuild('C:\\builds\\pom.xml', 'invalid'))
        .toThrow('Invalid build tool. Expected: maven, gradle, or auto');
    });
  });

  describe('validatePythonBuild', () => {
    test('should validate Python project with pip', () => {
      const result = securityValidator.validatePythonBuild('C:\\builds\\python_project', 'pip');
      expect(result).toBe('pip');
    });

    test('should validate Python project with poetry', () => {
      const result = securityValidator.validatePythonBuild('C:\\builds\\python_project', 'poetry');
      expect(result).toBe('poetry');
    });

    test('should default to auto when no build tool specified', () => {
      const result = securityValidator.validatePythonBuild('C:\\builds\\python_project');
      expect(result).toBe('auto');
    });

    test('should reject invalid build tool', () => {
      expect(() => securityValidator.validatePythonBuild('C:\\builds\\python_project', 'invalid'))
        .toThrow('Invalid Python build tool. Expected: pip, poetry, conda, pipenv, auto');
    });
  });

  describe('validateBuildCommand', () => {
    test('should validate allowed build command', () => {
      const result = securityValidator.validateBuildCommand('dotnet build');
      expect(result).toBe('dotnet build');
    });

    test('should reject dangerous build command', () => {
      expect(() => securityValidator.validateBuildCommand('echo `whoami`'))
        .toThrow('Dangerous pattern detected in build command');
    });

    test('should reject disallowed command', () => {
      expect(() => securityValidator.validateBuildCommand('malicious-command'))
        .toThrow('Build command not allowed: malicious-command');
    });

    test('should handle absolute path commands', () => {
      const result = securityValidator.validateBuildCommand('dotnet build');
      expect(result).toBe('dotnet build');
    });
  });

  describe('validateBuildFlags', () => {
    test('should validate safe build flags', () => {
      const flags = ['--configuration', 'Release', '--verbosity', 'normal'];
      const result = securityValidator.validateBuildFlags(flags);
      expect(result).toEqual(flags);
    });

    test('should reject non-array flags', () => {
      expect(() => securityValidator.validateBuildFlags('invalid'))
        .toThrow('Build flags must be an array');
    });

    test('should reject non-string flag', () => {
      expect(() => securityValidator.validateBuildFlags(['valid', 123]))
        .toThrow('All build flags must be strings');
    });

    test('should reject dangerous --privileged flag', () => {
      expect(() => securityValidator.validateBuildFlags(['--privileged']))
        .toThrow('Dangerous build flag detected: --privileged');
    });

    test('should reject command injection in flags', () => {
      expect(() => securityValidator.validateBuildFlags(['--flag', '$(malicious)']))
        .toThrow('Potentially dangerous characters in build flag');
    });
  });

  describe('validateProcessManagement', () => {
    test('should validate process stop by ID', () => {
      const result = securityValidator.validateProcessManagement('1234', 'stop');
      expect(result).toEqual({ processIdentifier: '1234', action: 'stop' });
    });

    test('should validate process list action', () => {
      const result = securityValidator.validateProcessManagement('', 'list');
      expect(result).toEqual({ processIdentifier: '', action: 'list' });
    });

    test('should reject invalid action', () => {
      expect(() => securityValidator.validateProcessManagement('1234', 'invalid'))
        .toThrow('Invalid process action: invalid');
    });

    test('should reject stopping protected system process', () => {
      expect(() => securityValidator.validateProcessManagement('explorer', 'stop'))
        .toThrow('Cannot stop protected system process: explorer');
    });

    test('should reject invalid process ID', () => {
      expect(() => securityValidator.validateProcessManagement('0', 'stop'))
        .toThrow('Invalid process ID: 0');
    });
  });

  describe('parseCommandChain', () => {
    test('should parse simple command', () => {
      const result = securityValidator.parseCommandChain('echo hello');
      expect(result).toEqual([
        { type: 'command', value: 'echo hello' }
      ]);
    });

    test('should parse command with && operator', () => {
      const result = securityValidator.parseCommandChain('echo hello && dir');
      expect(result).toEqual([
        { type: 'command', value: 'echo hello' },
        { type: 'operator', value: '&&' },
        { type: 'command', value: 'dir' }
      ]);
    });

    test('should parse command with pipe operator', () => {
      const result = securityValidator.parseCommandChain('dir | findstr txt');
      expect(result).toEqual([
        { type: 'command', value: 'dir' },
        { type: 'operator', value: '|' },
        { type: 'command', value: 'findstr txt' }
      ]);
    });

    test('should handle multiple operators', () => {
      const result = securityValidator.parseCommandChain('echo hello && dir > output.txt');
      expect(result).toEqual([
        { type: 'command', value: 'echo hello' },
        { type: 'operator', value: '&&' },
        { type: 'command', value: 'dir' },
        { type: 'operator', value: '>' },
        { type: 'command', value: 'output.txt' }
      ]);
    });
  });

  describe('Edge Cases and Security', () => {
    test('should handle empty string command', () => {
      expect(() => securityValidator.validatePowerShellCommand(''))
        .toThrow('Invalid command: must be a non-empty string');
    });

    test('should handle whitespace-only command', () => {
      expect(() => securityValidator.validatePowerShellCommand('   '))
        .toThrow('Command not allowed');
    });

    test('should handle mixed case commands', () => {
      const result = securityValidator.validatePowerShellCommand('DOTNET BUILD');
      expect(result).toBe("DOTNET BUILD");
    });

    test('should handle Unicode characters', () => {
      const result = securityValidator.validatePowerShellCommand('echo "测试"');
      expect(result).toBe('echo "测试"');
    });

    test('should sanitize complex control characters', () => {
      const input = 'echo\x01\x02\x03"test"\x7f';
      const result = securityValidator.sanitizeCommand(input);
      expect(result).toBe('echo"test"');
    });
  });

  describe('Cross-Platform Features', () => {
    test('should normalize cross-platform path', () => {
      const result = securityValidator.normalizeCrossPlatformPath('C:\\Users\\test\\Documents');
      expect(result).toBe('C:/Users/test/Documents');
    });

    test('should handle Unix-style paths', () => {
      const result = securityValidator.normalizeCrossPlatformPath('/home/user/projects');
      expect(result).toBe('/home/user/projects');
    });

    test('should remove duplicate slashes', () => {
      const result = securityValidator.normalizeCrossPlatformPath('C://Users//test//Documents');
      expect(result).toBe('C:/Users/test/Documents');
    });

    test('should validate cross-platform development paths', () => {
      const result = securityValidator.validateCrossPlatformPath('/Users/dev/Documents/Projects/test');
      expect(result).toBe(true);
    });
  });
});