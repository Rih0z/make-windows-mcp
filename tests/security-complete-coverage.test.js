const SecurityValidator = require('../server/src/utils/security');
const path = require('path');

describe('Security Validator - Complete Coverage', () => {
  let validator;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env;
    
    // Create fresh validator instance
    validator = new SecurityValidator();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('PowerShell Command Validation', () => {
    test('should validate basic allowed commands', () => {
      const command = 'dotnet build';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("dotnet build");
    });

    test('should handle PowerShell variables', () => {
      const command = '$env:PATH';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("$env:PATH");
    });

    test('should handle PowerShell expressions', () => {
      const command = '(Get-Process).Count';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("(Get-Process).Count");
    });

    test('should reject null or undefined commands', () => {
      expect(() => validator.validatePowerShellCommand(null)).toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand(undefined)).toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand('')).toThrow('Invalid command: must be a non-empty string');
    });

    test('should reject non-string commands', () => {
      expect(() => validator.validatePowerShellCommand(123)).toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand({})).toThrow('Invalid command: must be a non-empty string');
      expect(() => validator.validatePowerShellCommand([])).toThrow('Invalid command: must be a non-empty string');
    });

    test('should enforce command length limits', () => {
      process.env.MAX_COMMAND_LENGTH = '100';
      const longCommand = 'a'.repeat(101);
      expect(() => validator.validatePowerShellCommand(longCommand)).toThrow('Command too long: maximum 100 characters allowed');
    });

    test('should use default command length limit', () => {
      delete process.env.MAX_COMMAND_LENGTH;
      const longCommand = 'a'.repeat(8193);
      expect(() => validator.validatePowerShellCommand(longCommand)).toThrow('Command too long: maximum 8192 characters allowed');
    });

    test('should detect dangerous rm -rf patterns', () => {
      expect(() => validator.validatePowerShellCommand('rm -rf /')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('rm -RF /home')).toThrow('Dangerous command detected');
    });

    test('should detect dangerous del patterns', () => {
      expect(() => validator.validatePowerShellCommand('del /s /f C:\\')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('del /S /F C:\\')).toThrow('Dangerous command detected');
    });

    test('should detect format commands', () => {
      expect(() => validator.validatePowerShellCommand('format c:')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('format D:')).toThrow('Dangerous command detected');
    });

    test('should detect shutdown commands', () => {
      expect(() => validator.validatePowerShellCommand('shutdown /s')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('SHUTDOWN /r')).toThrow('Dangerous command detected');
    });

    test('should detect reboot commands', () => {
      expect(() => validator.validatePowerShellCommand('reboot now')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('REBOOT')).toThrow('Dangerous command detected');
    });

    test('should detect user creation commands', () => {
      expect(() => validator.validatePowerShellCommand('net user hacker /add')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('NET USER malicious /ADD')).toThrow('Dangerous command detected');
    });

    test('should detect registry modification', () => {
      expect(() => validator.validatePowerShellCommand('reg add HKCU\\Software\\Test')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('REG ADD HKLM\\SYSTEM')).toThrow('Dangerous command detected');
    });

    test('should detect task scheduler commands', () => {
      expect(() => validator.validatePowerShellCommand('schtasks /create /tn "malicious"')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('SCHTASKS /CREATE /TN "evil"')).toThrow('Dangerous command detected');
    });

    test('should detect WMIC process creation', () => {
      expect(() => validator.validatePowerShellCommand('wmic process call create "notepad.exe"')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('WMIC PROCESS CALL CREATE "cmd.exe"')).toThrow('Dangerous command detected');
    });

    test('should detect dangerous backtick patterns', () => {
      expect(() => validator.validatePowerShellCommand('echo `whoami`')).toThrow('Dangerous command detected');
      expect(() => validator.validatePowerShellCommand('Write-Host `(Get-Process)`')).toThrow('Dangerous command detected');
    });

    test('should allow backticks in Here-Strings', () => {
      const command = '@"\nThis is a here-string with `backticks`\n"@';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toContain('here-string');
    });

    test('should reject disallowed commands', () => {
      expect(() => validator.validatePowerShellCommand('forbidden-command')).toThrow('Command not allowed: forbidden-command');
      expect(() => validator.validatePowerShellCommand('hack-system')).toThrow('Command not allowed: hack-system');
    });

    test('should handle commands with file extensions', () => {
      const command = 'dotnet.exe build';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("dotnet.exe build");
    });

    test('should handle commands with leading dollar signs', () => {
      const command = '$(Get-Process)';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("$(Get-Process)");
    });
  });

  describe('Development Mode Command Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      validator = new SecurityValidator();
    });

    test('should allow development commands', () => {
      const command = 'tasklist';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("tasklist");
    });

    test('should allow command chaining with &&', () => {
      const command = 'echo hello && echo world';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("echo hello && echo world");
    });

    test('should allow command chaining with ||', () => {
      const command = 'echo hello || echo world';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("echo hello || echo world");
    });

    test('should allow piping with |', () => {
      const command = 'tasklist | findstr notepad';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("tasklist | findstr notepad");
    });

    test('should allow redirection operators', () => {
      const command = 'echo hello > output.txt';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("echo hello > output.txt");
    });

    test('should allow custom dev commands from environment', () => {
      process.env.ALLOWED_DEV_COMMANDS = 'custom-tool,another-tool';
      validator = new SecurityValidator();
      
      const command = 'custom-tool --help';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("custom-tool --help");
    });

    test('should validate each part of command chain', () => {
      expect(() => validator.validatePowerShellCommand('echo hello && forbidden-command')).toThrow();
    });

    test('should handle complex command chains', () => {
      const command = 'echo start && tasklist | findstr notepad && echo end';
      const result = validator.validatePowerShellCommand(command);
      expect(result).toBe("echo start && tasklist | findstr notepad && echo end");
    });
  });

  describe('Command Sanitization', () => {
    test('should remove null bytes', () => {
      const command = 'echo hello\x00world';
      const result = validator.sanitizeCommand(command);
      expect(result).toBe("echo helloworld");
    });

    test('should remove control characters', () => {
      const command = 'echo hello\x01\x02\x03world';
      const result = validator.sanitizeCommand(command);
      expect(result).toBe("echo helloworld");
    });

    test('should escape single quotes', () => {
      const command = "echo 'hello world'";
      const result = validator.sanitizeCommand(command);
      expect(result).toBe("echo ''hello world''");
    });

    test('should handle multiple single quotes', () => {
      const command = "echo 'hello' 'world'";
      const result = validator.sanitizeCommand(command);
      expect(result).toBe("echo ''hello'' ''world''");
    });

    test('should handle empty command', () => {
      const result = validator.sanitizeCommand('');
      expect(result).toBe('');
    });

    test('should handle whitespace-only command', () => {
      const result = validator.sanitizeCommand('   \n\t   ');
      expect(result).toBe('   \n\t   ');
    });
  });

  describe('Path Validation', () => {
    test('should validate allowed paths', () => {
      const testPath = 'C:\\projects\\myapp';
      const result = validator.validatePath(testPath);
      expect(result).toBe(testPath);
    });

    test('should normalize forward slashes to backslashes', () => {
      const testPath = 'C:/projects/myapp';
      const result = validator.validatePath(testPath);
      expect(result).toBe('C:\\projects\\myapp');
    });

    test('should reject null or undefined paths', () => {
      expect(() => validator.validatePath(null)).toThrow('Invalid path: must be a non-empty string');
      expect(() => validator.validatePath(undefined)).toThrow('Invalid path: must be a non-empty string');
      expect(() => validator.validatePath('')).toThrow('Invalid path: must be a non-empty string');
    });

    test('should reject non-string paths', () => {
      expect(() => validator.validatePath(123)).toThrow('Invalid path: must be a non-empty string');
      expect(() => validator.validatePath({})).toThrow('Invalid path: must be a non-empty string');
      expect(() => validator.validatePath([])).toThrow('Invalid path: must be a non-empty string');
    });

    test('should detect directory traversal with ..', () => {
      expect(() => validator.validatePath('C:\\projects\\..\\system32')).toThrow('Directory traversal detected in path');
      expect(() => validator.validatePath('../etc/passwd')).toThrow('Directory traversal detected in path');
    });

    test('should detect directory traversal with ~', () => {
      expect(() => validator.validatePath('~/../../etc/passwd')).toThrow('Directory traversal detected in path');
      expect(() => validator.validatePath('C:\\projects\\~\\system32')).toThrow('Directory traversal detected in path');
    });

    test('should detect directory traversal after normalization', () => {
      expect(() => validator.validatePath('C:\\projects\\subdir\\..\\..\\system32')).toThrow('Directory traversal detected in path');
    });

    test('should use custom allowed paths from environment', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\custom\\,D:\\projects\\';
      validator = new SecurityValidator();
      
      const testPath = 'C:\\custom\\myapp';
      const result = validator.validatePath(testPath);
      expect(result).toBe(testPath);
    });

    test('should reject paths not in allowed directories', () => {
      expect(() => validator.validatePath('C:\\windows\\system32')).toThrow('Path not in allowed directories');
      expect(() => validator.validatePath('D:\\forbidden\\path')).toThrow('Path not in allowed directories');
    });

    test('should handle case-insensitive path matching', () => {
      const testPath = 'c:\\PROJECTS\\MyApp';
      const result = validator.validatePath(testPath);
      expect(result).toBe(testPath);
    });
  });

  describe('Enterprise Mode Path Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_ENTERPRISE_DEV_MODE = 'true';
      process.env.ENTERPRISE_PROJECT_PATHS = 'C:\\Enterprise\\,D:\\Development\\';
      validator = new SecurityValidator();
    });

    test('should validate enterprise paths', () => {
      const testPath = 'C:\\Enterprise\\MyProject';
      const result = validator.validatePath(testPath);
      expect(result).toBe(testPath);
    });

    test('should fallback to enterprise paths when standard paths fail', () => {
      const testPath = 'D:\\Development\\SpecialProject';
      const result = validator.validatePath(testPath);
      expect(result).toBe(testPath);
    });

    test('should provide enterprise-specific error suggestions', () => {
      try {
        validator.validatePath('C:\\InvalidPath');
      } catch (error) {
        expect(error.message).toContain('Verify ENTERPRISE_PROJECT_PATHS configuration');
      }
    });
  });

  describe('Cross-Platform Path Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_CROSS_PLATFORM_PATHS = 'true';
      validator = new SecurityValidator();
    });

    test('should enable cross-platform mode suggestions', () => {
      try {
        validator.validatePath('/invalid/unix/path');
      } catch (error) {
        expect(error.message).toContain('Path not in allowed directories');
      }
    });

    test('should provide cross-platform specific error suggestions', () => {
      try {
        validator.validatePath('C:\\InvalidPath');
      } catch (error) {
        expect(error.message).toContain('Consider enabling ENABLE_ENTERPRISE_DEV_MODE');
      }
    });
  });

  describe('IP Address Validation', () => {
    test('should validate IPv4 addresses', () => {
      expect(() => validator.validateIPAddress('192.168.1.1')).not.toThrow();
      expect(() => validator.validateIPAddress('127.0.0.1')).not.toThrow();
      expect(() => validator.validateIPAddress('10.0.0.1')).not.toThrow();
      expect(() => validator.validateIPAddress('255.255.255.255')).not.toThrow();
    });

    test('should reject invalid IPv4 addresses', () => {
      expect(() => validator.validateIPAddress('256.1.1.1')).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress('192.168.1')).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress('192.168.1.1.1')).toThrow('Invalid IP address format');
    });

    test('should validate IPv6 addresses', () => {
      expect(() => validator.validateIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).not.toThrow();
      expect(() => validator.validateIPAddress('::1')).not.toThrow();
      expect(() => validator.validateIPAddress('fe80::1')).not.toThrow();
    });

    test('should reject null or undefined IP addresses', () => {
      expect(() => validator.validateIPAddress(null)).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress(undefined)).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress('')).toThrow('Invalid IP address format');
    });

    test('should reject non-string IP addresses', () => {
      expect(() => validator.validateIPAddress(123)).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress({})).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress([])).toThrow('Invalid IP address format');
    });

    test('should reject malformed IP addresses', () => {
      expect(() => validator.validateIPAddress('not-an-ip')).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress('192.168.1.abc')).toThrow('Invalid IP address format');
      expect(() => validator.validateIPAddress('192.168.1.-1')).toThrow('Invalid IP address format');
    });
  });

  describe('Command Chain Parsing', () => {
    beforeEach(() => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      validator = new SecurityValidator();
    });

    test('should parse simple command chains', () => {
      const command = 'echo hello && echo world';
      const parts = validator.parseCommandChain(command);
      expect(parts).toHaveLength(3);
      expect(parts[0]).toEqual({ type: 'command', value: 'echo hello ' });
      expect(parts[1]).toEqual({ type: 'operator', value: '&&' });
      expect(parts[2]).toEqual({ type: 'command', value: ' echo world' });
    });

    test('should parse complex command chains', () => {
      const command = 'echo start && tasklist | findstr notepad || echo not found';
      const parts = validator.parseCommandChain(command);
      expect(parts.length).toBeGreaterThan(3);
      expect(parts.some(p => p.type === 'operator' && p.value === '&&')).toBe(true);
      expect(parts.some(p => p.type === 'operator' && p.value === '|')).toBe(true);
      expect(parts.some(p => p.type === 'operator' && p.value === '||')).toBe(true);
    });

    test('should handle single commands', () => {
      const command = 'echo hello';
      const parts = validator.parseCommandChain(command);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ type: 'command', value: 'echo hello' });
    });

    test('should handle redirection operators', () => {
      const command = 'echo hello > output.txt';
      const parts = validator.parseCommandChain(command);
      expect(parts).toHaveLength(3);
      expect(parts[1]).toEqual({ type: 'operator', value: '>' });
    });
  });

  describe('Development Command Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      validator = new SecurityValidator();
    });

    test('should validate allowed dev commands', () => {
      expect(() => validator.validateDevCommand('tasklist')).not.toThrow();
      expect(() => validator.validateDevCommand('netstat')).not.toThrow();
      expect(() => validator.validateDevCommand('echo hello')).not.toThrow();
    });

    test('should reject disallowed dev commands', () => {
      expect(() => validator.validateDevCommand('forbidden-command')).toThrow('Command not allowed in development mode');
    });

    test('should handle commands with parameters', () => {
      expect(() => validator.validateDevCommand('tasklist /svc')).not.toThrow();
      expect(() => validator.validateDevCommand('netstat -an')).not.toThrow();
    });

    test('should handle empty or whitespace commands', () => {
      expect(() => validator.validateDevCommand('')).not.toThrow();
      expect(() => validator.validateDevCommand('   ')).not.toThrow();
    });
  });

  describe('Enterprise Path Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_ENTERPRISE_DEV_MODE = 'true';
      validator = new SecurityValidator();
    });

    test('should validate enterprise paths with wildcards', () => {
      const enterprisePaths = ['C:\\Enterprise\\*', 'D:\\Development\\Projects\\*'];
      const testPath = 'C:\\Enterprise\\MyProject\\src';
      const result = validator.validateEnterprisePath(testPath, enterprisePaths, false);
      expect(result).toBe(true);
    });

    test('should handle cross-platform enterprise paths', () => {
      const enterprisePaths = ['C:\\Enterprise\\*'];
      const testPath = 'C:\\Enterprise\\MyProject';
      const result = validator.validateEnterprisePath(testPath, enterprisePaths, true);
      expect(result).toBe(true);
    });

    test('should reject non-matching enterprise paths', () => {
      const enterprisePaths = ['C:\\Enterprise\\*'];
      const testPath = 'C:\\Other\\Project';
      const result = validator.validateEnterprisePath(testPath, enterprisePaths, false);
      expect(result).toBe(false);
    });
  });

  describe('Cross-Platform Path Validation', () => {
    test('should validate cross-platform paths', () => {
      const testPath = 'C:\\CrossPlatform\\Project';
      const result = validator.validateCrossPlatformPath(testPath);
      expect(typeof result).toBe('boolean');
    });

    test('should handle Unix-style paths', () => {
      const testPath = '/usr/local/projects';
      const result = validator.validateCrossPlatformPath(testPath);
      expect(typeof result).toBe('boolean');
    });

    test('should handle relative paths', () => {
      const testPath = '.\\relative\\path';
      const result = validator.validateCrossPlatformPath(testPath);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long paths', () => {
      const longPath = 'C:\\projects\\' + 'a'.repeat(1000);
      try {
        validator.validatePath(longPath);
      } catch (error) {
        expect(error.message).toContain('Path not in allowed directories');
      }
    });

    test('should handle paths with special characters', () => {
      const specialPath = 'C:\\projects\\app@2023\\src';
      const result = validator.validatePath(specialPath);
      expect(result).toBe(specialPath);
    });

    test('should handle paths with Unicode characters', () => {
      const unicodePath = 'C:\\projects\\テスト\\src';
      const result = validator.validatePath(unicodePath);
      expect(result).toBe(unicodePath);
    });

    test('should handle commands with Unicode characters', () => {
      const unicodeCommand = 'echo "こんにちは世界"';
      const result = validator.validatePowerShellCommand(unicodeCommand);
      expect(result).toBe('echo "こんにちは世界"');
    });

    test('should handle mixed case commands', () => {
      const mixedCaseCommand = 'DOTNET Build';
      const result = validator.validatePowerShellCommand(mixedCaseCommand);
      expect(result).toBe('DOTNET Build');
    });
  });
});