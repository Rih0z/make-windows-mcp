const security = require('../server/src/utils/security');

describe('Security Validator Comprehensive Tests', () => {
  describe('Development Mode Command Validation', () => {
    beforeEach(() => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      process.env.DEV_COMMAND_PATHS = 'C:\\builds\\,C:\\projects\\,C:\\dev\\';
    });

    afterEach(() => {
      delete process.env.ENABLE_DEV_COMMANDS;
      delete process.env.DEV_COMMAND_PATHS;
    });

    test('should allow development commands in dev mode', () => {
      const devCommands = [
        'tasklist',
        'netstat -an',
        'type C:\\builds\\config.json',
        'python script.py',
        'pip install requests',
        'node app.js',
        'npm install',
        'if exist file.txt echo found',
        'for %i in (*.txt) do echo %i',
        'findstr "pattern" file.txt',
        'echo test',
        'set VAR=value',
        'call build.bat',
        'start notepad.exe',
        'cd C:\\builds'
      ];

      devCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should allow command chaining in dev mode', () => {
      const chainedCommands = [
        'echo test && echo success',
        'dir || echo failed',
        'type file.txt | findstr pattern',
        'echo test > output.txt',
        'echo append >> output.txt',
        'command1 & command2',
        'error 2>&1',
        'command1; command2'
      ];

      chainedCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should validate paths in dev mode commands', () => {
      const commandsWithPaths = [
        'type C:\\builds\\file.txt', // allowed
        'python C:\\projects\\script.py', // allowed
        'node C:\\dev\\app.js' // allowed
      ];

      commandsWithPaths.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });

      // Commands with disallowed paths
      const disallowedPaths = [
        'type C:\\Windows\\System32\\config.sys',
        'python C:\\unauthorized\\script.py'
      ];

      disallowedPaths.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow('Development command must operate within allowed paths');
      });
    });

    test('should allow batch files in dev mode within allowed paths', () => {
      const batchCommands = [
        'C:\\builds\\setup.bat',
        'call C:\\projects\\build.bat',
        'start C:\\dev\\install.cmd'
      ];

      batchCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should reject batch files outside allowed paths in dev mode', () => {
      const disallowedBatch = [
        'C:\\Windows\\malicious.bat',
        'call C:\\temp\\unauthorized.cmd'
      ];

      disallowedBatch.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow();
      });
    });

    test('should handle complex command parsing', () => {
      const complexCommands = [
        'if exist "C:\\builds\\file with spaces.txt" type "C:\\builds\\file with spaces.txt"',
        'for /f "tokens=*" %i in (\'dir /b C:\\builds\\*.txt\') do echo %i',
        'cmd /c "cd C:\\builds && dir"'
      ];

      complexCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should reject dangerous patterns even in dev mode', () => {
      const dangerousCommands = [
        'rm -rf /',
        'format c:',
        'del /s /f C:\\Windows',
        'shutdown /s /t 0',
        'net user hacker password /add',
        'reg add HKLM\\SYSTEM',
        'echo test `rm -rf /`' // backtick command substitution
      ];

      dangerousCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).toThrow();
      });
    });

    test('should handle environment variable in dev commands', () => {
      process.env.ALLOWED_DEV_COMMANDS = 'custom1,custom2,custom3';
      
      // Reset the module to pick up new env var
      jest.resetModules();
      const freshSecurity = require('../server/src/utils/security');

      expect(() => freshSecurity.validatePowerShellCommand('custom1 arg1 arg2')).not.toThrow();
      expect(() => freshSecurity.validatePowerShellCommand('custom2')).not.toThrow();
      expect(() => freshSecurity.validatePowerShellCommand('notallowed')).toThrow();
    });
  });

  describe('Command Parsing and Validation', () => {
    test('should parse command chains correctly', () => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      
      const commandWithMultipleOperators = 'echo start && dir || echo failed & echo end';
      expect(() => security.validatePowerShellCommand(commandWithMultipleOperators)).not.toThrow();

      delete process.env.ENABLE_DEV_COMMANDS;
    });

    test('should handle quoted strings in commands', () => {
      const quotedCommands = [
        'echo "Hello World"',
        'Write-Host \'Single quotes\'',
        'Get-Process -Name "My Process"'
      ];

      quotedCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should handle PowerShell specific syntax', () => {
      const psCommands = [
        '$var = Get-Process',
        '$(Get-Date)',
        'Get-Process | Where-Object {$_.CPU -gt 100}',
        'Invoke-Command -ScriptBlock { Get-Service }'
      ];

      psCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should validate commands with .exe extension', () => {
      const exeCommands = [
        'dotnet.exe build',
        'git.exe clone repo',
        'docker.exe ps',
        'kubectl.exe get pods'
      ];

      exeCommands.forEach(command => {
        expect(() => security.validatePowerShellCommand(command)).not.toThrow();
      });
    });

    test('should handle edge cases in command validation', () => {
      const edgeCases = [
        '   echo   test   ', // extra spaces
        'ECHO TEST', // uppercase
        'echo', // command without args
        'echo;', // trailing semicolon
      ];

      edgeCases.forEach(command => {
        const sanitized = security.validatePowerShellCommand(command);
        expect(sanitized).toBeDefined();
      });
    });
  });

  describe('Path Validation Edge Cases', () => {
    test('should handle UNC paths', () => {
      const uncPaths = [
        '\\\\server\\share\\file.txt',
        '\\\\192.168.1.1\\c$\\projects\\app.csproj'
      ];

      uncPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow();
      });
    });

    test('should handle relative paths by rejecting them', () => {
      const relativePaths = [
        './file.txt',
        'subdir/file.txt',
        'file.txt'
      ];

      relativePaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow();
      });
    });

    test('should handle paths with environment variables', () => {
      const envPaths = [
        '%TEMP%\\file.txt',
        '%USERPROFILE%\\Documents\\project.csproj',
        '%APPDATA%\\config.json'
      ];

      envPaths.forEach(path => {
        expect(() => security.validatePath(path)).toThrow();
      });
    });

    test('should normalize different path separators', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\projects\\';
      
      const paths = [
        'C:/projects/app.csproj', // forward slashes
        'C:\\\\projects\\\\app.csproj', // double backslashes
        'C:/projects\\app.csproj' // mixed
      ];

      paths.forEach(path => {
        const normalized = security.validatePath(path);
        expect(normalized).toBe('C:\\projects\\app.csproj');
      });
    });
  });

  describe('IP Address Validation Extended', () => {
    test('should validate IPv6 addresses', () => {
      const validIPv6 = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '2001:db8:85a3::8a2e:370:7334',
        '::1',
        'fe80::1',
        '::ffff:192.168.1.1' // IPv4-mapped IPv6
      ];

      validIPv6.forEach(ip => {
        expect(() => security.validateIPAddress(ip)).not.toThrow();
      });
    });

    test('should handle hostname instead of IP', () => {
      const hostnames = [
        'localhost',
        'server.local',
        'my-server',
        'server_name'
      ];

      hostnames.forEach(hostname => {
        expect(() => security.validateIPAddress(hostname)).toThrow('Invalid IP address format');
      });
    });

    test('should validate special case IPs', () => {
      // These should be blocked
      expect(() => security.validateIPAddress('0.0.0.0')).toThrow('Access to IP range blocked');
      expect(() => security.validateIPAddress('127.0.0.1')).toThrow('Access to IP range blocked');
      expect(() => security.validateIPAddress('169.254.0.1')).toThrow('Access to IP range blocked');
      expect(() => security.validateIPAddress('224.0.0.1')).toThrow('Access to IP range blocked');

      // These should be allowed
      expect(() => security.validateIPAddress('8.8.8.8')).not.toThrow();
      expect(() => security.validateIPAddress('1.1.1.1')).not.toThrow();
    });
  });

  describe('SSH Credentials Extended Validation', () => {
    test('should detect SQL injection patterns in credentials', () => {
      const sqlInjectionAttempts = [
        { username: "admin' OR '1'='1", password: 'pass' },
        { username: 'admin', password: "' OR '1'='1" },
        { username: 'admin; DROP TABLE users--', password: 'pass' },
        { username: 'admin', password: 'pass\' UNION SELECT * FROM users--' }
      ];

      sqlInjectionAttempts.forEach(({ username, password }) => {
        expect(() => security.validateSSHCredentials('192.168.1.1', username, password))
          .toThrow('Invalid characters in credentials');
      });
    });

    test('should handle international characters in credentials', () => {
      const internationalCreds = [
        { username: 'müller', password: 'pässwörd' },
        { username: 'user名前', password: 'パスワード' },
        { username: 'пользователь', password: 'пароль' }
      ];

      internationalCreds.forEach(({ username, password }) => {
        const result = security.validateSSHCredentials('192.168.1.1', username, password);
        expect(result).toEqual({
          host: '192.168.1.1',
          username,
          password
        });
      });
    });

    test('should validate credential length limits', () => {
      const longUsername = 'a'.repeat(65);
      const longPassword = 'b'.repeat(129);

      expect(() => security.validateSSHCredentials('192.168.1.1', longUsername, 'pass'))
        .toThrow('Invalid username');
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', longPassword))
        .toThrow('Invalid password');
    });
  });

  describe('Batch File Path Extended Validation', () => {
    test('should handle network paths', () => {
      const networkPaths = [
        '\\\\server\\share\\script.bat',
        '\\\\192.168.1.1\\c$\\temp\\test.cmd'
      ];

      networkPaths.forEach(path => {
        expect(() => security.validateBatchFilePath(path)).toThrow();
      });
    });

    test('should handle paths with special characters', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\';
      
      const specialPaths = [
        'C:\\builds\\my script.bat', // space
        'C:\\builds\\test[1].bat', // brackets
        'C:\\builds\\test(2).cmd', // parentheses
        'C:\\builds\\test-script.bat', // hyphen
        'C:\\builds\\test_script.cmd' // underscore
      ];

      specialPaths.forEach(path => {
        expect(() => security.validateBatchFilePath(path)).not.toThrow();
      });
    });

    test('should handle very long paths', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\';
      
      // Windows MAX_PATH is typically 260 characters
      const longPath = 'C:\\builds\\' + 'a'.repeat(240) + '.bat';
      
      expect(() => security.validateBatchFilePath(longPath)).not.toThrow();
    });

    test('should handle edge cases in extension checking', () => {
      const edgeCases = [
        'C:\\builds\\test.BAT', // uppercase
        'C:\\builds\\test.BaT', // mixed case
        'C:\\builds\\test.CMD', // uppercase CMD
        'C:\\builds\\test.cmd.txt', // double extension
        'C:\\builds\\.bat', // just extension
        'C:\\builds\\test.', // trailing dot
      ];

      edgeCases.forEach((path, index) => {
        if (index < 3) {
          // First three should pass (case variations)
          expect(() => security.validateBatchFilePath(path)).not.toThrow();
        } else {
          // Rest should fail
          expect(() => security.validateBatchFilePath(path)).toThrow();
        }
      });
    });

    test('should handle empty allowed directories', () => {
      process.env.ALLOWED_BATCH_DIRS = '';
      
      // Should fall back to defaults
      expect(() => security.validateBatchFilePath('C:\\builds\\test.bat')).not.toThrow();
      expect(() => security.validateBatchFilePath('C:\\temp\\test.cmd')).not.toThrow();
    });

    test('should handle malformed environment variable', () => {
      process.env.ALLOWED_BATCH_DIRS = ';;;'; // Just semicolons
      
      // Should fall back to defaults
      expect(() => security.validateBatchFilePath('C:\\builds\\test.bat')).not.toThrow();
    });
  });

  describe('Security Bypass Attempts', () => {
    test('should prevent null byte injection', () => {
      const nullByteAttempts = [
        'C:\\builds\\test.bat\x00.txt',
        'C:\\builds\\test\x00../../Windows/System32/cmd.bat'
      ];

      nullByteAttempts.forEach(path => {
        expect(() => security.validateBatchFilePath(path)).toThrow();
      });
    });

    test('should prevent unicode normalization attacks', () => {
      const unicodeAttempts = [
        'C:\\builds\\test．bat', // Full-width dot
        'C:\\builds\\tes\u200Bt.bat', // Zero-width space
        'C:\\builds\\test\uFEFFscript.bat' // Byte order mark
      ];

      unicodeAttempts.forEach(path => {
        expect(() => security.validateBatchFilePath(path)).toThrow();
      });
    });

    test('should handle various encoding attempts', () => {
      const encodingAttempts = [
        'C:%5Cbuilds%5Ctest.bat', // URL encoded
        'C:&#92;builds&#92;test.bat', // HTML encoded
        'C:\\x62\\x75\\x69\\x6c\\x64\\x73\\test.bat' // Hex encoded
      ];

      encodingAttempts.forEach(path => {
        expect(() => security.validateBatchFilePath(path)).toThrow();
      });
    });
  });
});