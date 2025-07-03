const security = require('../server/src/utils/security');

describe('Security Edge Cases', () => {
  describe('PowerShell Command Edge Cases', () => {
    test('should handle null bytes in commands', () => {
      const commandWithNullBytes = 'echo test\x00';
      const sanitized = security.validatePowerShellCommand(commandWithNullBytes);
      expect(sanitized).not.toContain('\x00');
    });

    test('should handle control characters in commands', () => {
      const commandWithControlChars = 'echo test\x01\x02\x03';
      const sanitized = security.validatePowerShellCommand(commandWithControlChars);
      expect(sanitized).not.toMatch(/[\x00-\x1f\x7f]/);
    });

    test('should allow PowerShell-specific syntax', () => {
      const powerShellCommands = [
        'Get-Process | Select-Object Name',
        'Get-Service | Where-Object {$_.Status -eq "Running"}',
        'Get-ChildItem -Path C:\\ -Recurse',
        '$processes = Get-Process',
        'Write-Host "Hello World"'
      ];

      powerShellCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should reject empty string after trimming', () => {
      expect(() => security.validatePowerShellCommand('   ')).toThrow();
      expect(() => security.validatePowerShellCommand('\t\n')).toThrow();
    });

    test('should handle mixed case dangerous commands', () => {
      const dangerousCommands = [
        'SHUTDOWN /s /t 0',
        'Format C:',
        'RM -RF /',
        'Del /S /F',
        'NET USER admin password /ADD'
      ];

      dangerousCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow();
      });
    });

    test('should validate against partial dangerous patterns', () => {
      const borderlineCommands = [
        'Get-Process | Where Name -eq "myshutdownapp"', // Contains 'shutdown' but in different context
        'Find-RegKey', // Contains 'reg' but not dangerous pattern
        'Format-Table', // Contains 'format' but not dangerous
        'Remove-Item C:\\temp\\file.txt' // rm pattern but specific file
      ];

      borderlineCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });
  });

  describe('Path Validation Edge Cases', () => {
    beforeEach(() => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\,D:\\builds\\,/home/user/projects/';
    });

    test('should handle paths with various separators', () => {
      const validPaths = [
        'C:\\projects\\app\\file.cs',
        'C:/projects/app/file.cs',
        'D:\\builds\\release\\app.exe',
        '/home/user/projects/myapp/src'
      ];

      validPaths.forEach(path => {
        expect(() => security.validatePath(path)).not.toThrow();
      });
    });

    test('should reject sophisticated directory traversal attempts', () => {
      const traversalPaths = [
        'C:\\projects\\..\\..\\Windows\\System32\\cmd.exe',
        'C:/projects/../../../etc/passwd',
        'D:\\builds\\..\\..\\..\\sensitive\\data.txt',
        'C:\\projects\\subdir\\..\\..\\..\\outside.txt',
        '/home/user/projects/../../../root/.ssh/id_rsa'
      ];

      traversalPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow('Directory traversal detected');
      });
    });

    test('should handle UNC paths correctly', () => {
      // UNC paths should be rejected unless explicitly allowed
      const uncPaths = [
        '\\\\server\\share\\file.txt',
        '//server/share/file.txt'
      ];

      uncPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow();
      });
    });

    test('should handle relative paths', () => {
      const relativePaths = [
        './project/file.cs',
        '../project/file.cs',
        'project/file.cs'
      ];

      relativePaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow();
      });
    });
  });

  describe('IP Address Edge Cases', () => {
    test('should validate IPv4 edge cases', () => {
      const validEdgeCases = [
        '255.255.255.255',
        '192.168.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '8.8.8.8'
      ];

      validEdgeCases.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).not.toThrow();
      });
    });

    test('should reject invalid IPv4 formats', () => {
      const invalidIPs = [
        '256.1.1.1',
        '1.256.1.1',
        '1.1.256.1',
        '1.1.1.256',
        '999.999.999.999',
        '1.1.1',
        '1.1.1.1.1',
        '1.1.1.-1',
        'not-an-ip',
        '1.1.1.1.',
        '.1.1.1.1'
      ];

      invalidIPs.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).toThrow('Invalid IP address format');
      });
    });

    test('should block specific dangerous IP ranges', () => {
      const dangerousIPs = [
        '0.0.0.1',       // Reserved (0.x.x.x range is blocked)
        '127.0.0.1',     // Loopback
        '127.1.1.1',     // Other loopback
        '169.254.1.1',   // Link-local
        '169.254.255.254',
        '224.0.0.1'      // Multicast start
      ];

      dangerousIPs.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).toThrow('Access to IP range blocked');
      });
    });
  });

  describe('SSH Credentials Edge Cases', () => {
    test('should handle username edge cases', () => {
      const invalidUsernames = [
        '', // Empty
        'a'.repeat(65), // Too long
        'admin\x00', // Null byte
        'user\n', // Newline
        'admin\t', // Tab
        'user; cat /etc/passwd', // Command injection
        "admin' OR '1'='1", // SQL injection
        'admin--', // SQL comment
        'user UNION SELECT * FROM users' // SQL injection
      ];

      invalidUsernames.forEach(username => {
        expect(() => {
          security.validateSSHCredentials('192.168.1.1', username, 'password');
        }).toThrow();
      });
    });

    test('should handle password edge cases', () => {
      const invalidPasswords = [
        '', // Empty
        'a'.repeat(129), // Too long
        'pass\x00word', // Null byte
        'pass\nword', // Newline
        'pass\tword', // Tab
        'pass--word' // SQL comment
      ];

      invalidPasswords.forEach(password => {
        expect(() => {
          security.validateSSHCredentials('192.168.1.1', 'admin', password);
        }).toThrow();
      });

      // Test valid complex passwords
      const validPasswords = [
        'ComplexP@ssw0rd!',
        'Very$ecure123',
        'a'.repeat(128) // Max length
      ];

      validPasswords.forEach(password => {
        expect(() => {
          security.validateSSHCredentials('192.168.1.1', 'admin', password);
        }).not.toThrow();
      });
    });

    test('should return validated credentials object', () => {
      const result = security.validateSSHCredentials('192.168.1.1', 'admin', 'password');
      expect(result).toEqual({
        host: '192.168.1.1',
        username: 'admin',
        password: 'password'
      });
    });
  });

  describe('Sanitization Functions', () => {
    test('should properly sanitize various special characters', () => {
      const testCases = [
        { input: "echo 'hello'", expected: "echo ''hello''" },
        { input: "test'quote'test", expected: "test''quote''test" },
        { input: "multiple'quotes'here'too", expected: "multiple''quotes''here''too" },
        { input: "no quotes here", expected: "no quotes here" }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = security.sanitizeCommand(input);
        expect(result).toBe(expected);
      });
    });

    test('should remove control characters from commands', () => {
      const input = 'Get-Process\x01\x02\x03\x1f\x7f';
      const result = security.sanitizeCommand(input);
      expect(result).toBe('Get-Process');
    });
  });

  describe('Command Validation with Allowed Commands', () => {
    test('should allow commands starting with allowed prefixes', () => {
      const allowedCommands = [
        'dotnet --version',
        'dotnet.exe build',
        'powershell.exe -Command "Get-Process"',
        'git status',
        'git.exe log',
        'docker ps',
        'kubectl get pods'
      ];

      allowedCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should reject commands not starting with allowed prefixes', () => {
      const disallowedCommands = [
        'evil-tool --hack',
        'malware.exe',
        'unknown-command do-something',
        'backdoor --install',
        'virus --spread'
      ];

      disallowedCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow('Command not allowed');
      });
    });
  });
});