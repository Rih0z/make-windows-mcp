const security = require('../../server/src/utils/security');

describe('Security Validator', () => {
  describe('PowerShell Command Validation', () => {
    test('should allow valid PowerShell commands', () => {
      const validCommands = [
        'Get-Process',
        'Get-Service',
        'dotnet --version',
        'Get-ChildItem C:\\projects',
        'ping 192.168.1.1'
      ];

      validCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should reject dangerous PowerShell commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'del /s /f C:\\*',
        'format c:',
        'shutdown /s /t 0',
        'net user hacker password /add',
        'reg add HKLM\\SYSTEM',
        'Get-Process; rm -rf /',
        'cmd & del /s /f',
        '`rm -rf /`',  // backtick for command substitution
        'command | dangerous'  // pipe operator
      ];

      dangerousCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow();
      });
    });

    test('should reject commands that are too long', () => {
      const longCommand = 'Get-Process ' + 'a'.repeat(2048);
      expect(() => security.validatePowerShellCommand(longCommand)).toThrow('Command too long');
    });

    test('should reject empty or invalid commands', () => {
      expect(() => security.validatePowerShellCommand('')).toThrow();
      expect(() => security.validatePowerShellCommand(null)).toThrow();
      expect(() => security.validatePowerShellCommand(undefined)).toThrow();
      expect(() => security.validatePowerShellCommand(123)).toThrow();
    });

    test('should reject commands with unauthorized first word', () => {
      const unauthorizedCommands = [
        'evil-command do something',
        'malware.exe run',
        'unauthorized-tool --flag'
      ];

      unauthorizedCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow('Command not allowed');
      });
    });

    test('should sanitize commands properly', () => {
      const commandWithQuotes = "Get-Process -Name 'notepad'";
      const sanitized = security.validatePowerShellCommand(commandWithQuotes);
      expect(sanitized).toContain("''"); // Single quotes should be doubled
    });
  });

  describe('Path Validation', () => {
    beforeEach(() => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\';
    });

    test('should allow valid paths in allowed directories', () => {
      const validPaths = [
        'C:\\projects\\myapp\\app.csproj',
        'D:\\builds\\test\\test.sln',
        'C:\\projects\\subfolder\\project.json'
      ];

      validPaths.forEach(path => {
        expect(() => security.validatePath(path)).not.toThrow();
      });
    });

    test('should reject paths outside allowed directories', () => {
      const invalidPaths = [
        'C:\\Windows\\System32\\evil.exe',
        'D:\\private\\secret.txt',
        'E:\\unauthorized\\file.txt'
      ];

      invalidPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow('Path not in allowed directories');
      });
    });

    test('should reject directory traversal attempts', () => {
      const traversalPaths = [
        'C:\\projects\\..\\..\\Windows\\System32\\cmd.exe',
        'C:\\projects\\..\\private\\secret.txt',
        'D:\\builds\\~\\unauthorized.txt',
        '../../../etc/passwd'
      ];

      traversalPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow('Directory traversal detected');
      });
    });

    test('should reject empty or invalid paths', () => {
      expect(() => security.validatePath('')).toThrow();
      expect(() => security.validatePath(null)).toThrow();
      expect(() => security.validatePath(undefined)).toThrow();
    });
  });

  describe('IP Address Validation', () => {
    test('should allow valid IP addresses', () => {
      const validIPs = [
        '192.168.1.100',
        '10.0.0.1',
        '172.16.0.1',
        '8.8.8.8'
      ];

      validIPs.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).not.toThrow();
      });
    });

    test('should reject invalid IP formats', () => {
      const invalidIPs = [
        '256.256.256.256',
        '192.168.1',
        '192.168.1.1.1',
        'not.an.ip.address',
        '192.168.1.-1',
        ''
      ];

      invalidIPs.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).toThrow('Invalid IP address format');
      });
    });

    test('should block dangerous IP ranges', () => {
      const blockedIPs = [
        '127.0.0.1',      // Loopback
        '169.254.1.1',    // Link-local
        '224.0.0.1',      // Multicast
        '0.0.0.0'         // Reserved
      ];

      blockedIPs.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).toThrow('Access to IP range blocked');
      });
    });
  });

  describe('SSH Credentials Validation', () => {
    test('should allow valid SSH credentials', () => {
      expect(() => {
        security.validateSSHCredentials('192.168.1.100', 'admin', 'password123');
      }).not.toThrow();
    });

    test('should reject invalid usernames', () => {
      expect(() => {
        security.validateSSHCredentials('192.168.1.100', '', 'password');
      }).toThrow('Invalid username');

      expect(() => {
        security.validateSSHCredentials('192.168.1.100', 'a'.repeat(65), 'password');
      }).toThrow('Invalid username');

      expect(() => {
        security.validateSSHCredentials('192.168.1.100', 'admin; DROP TABLE users--', 'password');
      }).toThrow('Invalid characters in credentials');
    });

    test('should reject invalid passwords', () => {
      expect(() => {
        security.validateSSHCredentials('192.168.1.100', 'admin', '');
      }).toThrow('Invalid password');

      expect(() => {
        security.validateSSHCredentials('192.168.1.100', 'admin', 'a'.repeat(129));
      }).toThrow('Invalid password');
    });

    test('should reject invalid hosts', () => {
      expect(() => {
        security.validateSSHCredentials('invalid-ip', 'admin', 'password');
      }).toThrow('Invalid IP address format');
    });
  });

  describe('Batch File Path Validation', () => {
    beforeEach(() => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\builds\\AIServer\\;C:\\temp\\';
    });

    test('should allow valid batch files in allowed directories', () => {
      const validBatchFiles = [
        'C:\\builds\\AIServer\\release\\start.bat',
        'C:\\builds\\myproject\\build.bat',
        'C:\\temp\\test.cmd',
        'C:\\builds\\deploy.bat'
      ];

      validBatchFiles.forEach(filePath => {
        expect(() => security.validateBatchFilePath(filePath)).not.toThrow();
      });
    });

    test('should reject non-batch files', () => {
      const nonBatchFiles = [
        'C:\\builds\\script.ps1',
        'C:\\builds\\executable.exe',
        'C:\\builds\\config.txt',
        'C:\\builds\\data.json'
      ];

      nonBatchFiles.forEach(filePath => {
        expect(() => security.validateBatchFilePath(filePath)).toThrow('Only .bat and .cmd files are allowed');
      });
    });

    test('should reject batch files outside allowed directories', () => {
      const unauthorizedBatchFiles = [
        'C:\\Windows\\System32\\malware.bat',
        'D:\\private\\secret.cmd',
        'C:\\Users\\admin\\Desktop\\evil.bat',
        'E:\\unauthorized\\script.bat'
      ];

      unauthorizedBatchFiles.forEach(filePath => {
        expect(() => security.validateBatchFilePath(filePath)).toThrow('Batch file must be in one of the allowed directories');
      });
    });

    test('should reject directory traversal attempts in batch file paths', () => {
      const traversalBatchFiles = [
        'C:\\builds\\..\\..\\Windows\\System32\\cmd.bat',
        'C:\\temp\\..\\private\\secret.cmd',
        'C:\\builds\\~\\unauthorized.bat',
        '../../../etc/malware.bat'
      ];

      traversalBatchFiles.forEach(filePath => {
        expect(() => security.validateBatchFilePath(filePath)).toThrow('Directory traversal detected in batch file path');
      });
    });

    test('should reject empty or invalid batch file paths', () => {
      expect(() => security.validateBatchFilePath('')).toThrow('Batch file path is required');
      expect(() => security.validateBatchFilePath(null)).toThrow('Batch file path is required');
      expect(() => security.validateBatchFilePath(undefined)).toThrow('Batch file path is required');
    });

    test('should normalize paths correctly', () => {
      const pathWithForwardSlashes = 'C:/builds/AIServer/release/start.bat';
      const normalizedPath = security.validateBatchFilePath(pathWithForwardSlashes);
      expect(normalizedPath).toContain('\\');
      expect(normalizedPath).not.toContain('/');
    });

    test('should be case-insensitive for directory matching', () => {
      const mixedCasePaths = [
        'c:\\builds\\aiserver\\release\\start.bat',
        'C:\\BUILDS\\test.BAT',
        'C:\\Temp\\Script.CMD'
      ];

      mixedCasePaths.forEach(filePath => {
        expect(() => security.validateBatchFilePath(filePath)).not.toThrow();
      });
    });

    test('should respect environment variable configuration', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\custom\\;D:\\special\\';
      
      expect(() => security.validateBatchFilePath('C:\\custom\\test.bat')).not.toThrow();
      expect(() => security.validateBatchFilePath('D:\\special\\script.cmd')).not.toThrow();
      expect(() => security.validateBatchFilePath('C:\\builds\\test.bat')).toThrow('Batch file must be in one of the allowed directories');
    });
  });
});