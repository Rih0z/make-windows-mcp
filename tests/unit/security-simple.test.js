/**
 * Security Simple Test - Core Functions Coverage
 */

const security = require('../../server/src/utils/security');

describe('Security Simple Coverage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validatePowerShellCommand', () => {
    test('should reject dangerous patterns', () => {
      expect(() => security.validatePowerShellCommand('rm -rf /')).toThrow();
      expect(() => security.validatePowerShellCommand('format c:')).toThrow();
      expect(() => security.validatePowerShellCommand('del /s')).toThrow();
    });

    test('should allow basic safe commands', () => {
      expect(() => security.validatePowerShellCommand('dir')).not.toThrow();
      expect(() => security.validatePowerShellCommand('echo test')).not.toThrow();
      expect(() => security.validatePowerShellCommand('dotnet build')).not.toThrow();
    });

    test('should reject null or empty commands', () => {
      expect(() => security.validatePowerShellCommand('')).toThrow();
      expect(() => security.validatePowerShellCommand(null)).toThrow();
    });
  });

  describe('validatePath', () => {
    test('should validate paths within allowed directories', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\temp\\';
      expect(() => security.validatePath('C:\\builds\\test')).not.toThrow();
      expect(() => security.validatePath('C:\\temp\\app')).not.toThrow();
    });

    test('should reject paths outside allowed directories', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\,C:\\temp\\';
      expect(() => security.validatePath('C:\\system32')).toThrow();
      expect(() => security.validatePath('C:\\windows')).toThrow();
    });

    test('should reject directory traversal attempts', () => {
      expect(() => security.validatePath('C:\\builds\\..\\system32')).toThrow();
      expect(() => security.validatePath('C:\\builds\\~\\.ssh')).toThrow();
    });
  });

  describe('validateIPAddress', () => {
    test('should validate proper IP addresses', () => {
      expect(security.validateIPAddress('192.168.1.1')).toBe('192.168.1.1');
      expect(security.validateIPAddress('10.0.0.1')).toBe('10.0.0.1');
      expect(security.validateIPAddress('127.0.0.1')).toBe('127.0.0.1');
    });

    test('should reject invalid IP addresses', () => {
      expect(() => security.validateIPAddress('invalid-ip')).toThrow();
      expect(() => security.validateIPAddress('256.1.1.1')).toThrow();
      expect(() => security.validateIPAddress('')).toThrow();
    });

    test('should reject blocked IP ranges', () => {
      expect(() => security.validateIPAddress('169.254.1.1')).toThrow();
      expect(() => security.validateIPAddress('224.1.1.1')).toThrow();
    });
  });

  describe('sanitizeCommand', () => {
    test('should sanitize dangerous characters', () => {
      const input = 'test\x00dangerous';
      const sanitized = security.sanitizeCommand(input);
      expect(sanitized).not.toContain('\x00');
    });

    test('should escape single quotes', () => {
      const input = "test 'quoted' text";
      const sanitized = security.sanitizeCommand(input);
      expect(sanitized).toContain("''");
    });
  });

  describe('validateBatchFilePath', () => {
    test('should accept valid batch file paths', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\temp\\';
      expect(() => security.validateBatchFilePath('C:\\builds\\test.bat')).not.toThrow();
      expect(() => security.validateBatchFilePath('C:\\temp\\script.cmd')).not.toThrow();
    });

    test('should reject non-batch files', () => {
      expect(() => security.validateBatchFilePath('C:\\builds\\test.exe')).toThrow();
      expect(() => security.validateBatchFilePath('C:\\builds\\script.ps1')).toThrow();
    });

    test('should reject paths outside allowed directories', () => {
      process.env.ALLOWED_BATCH_DIRS = 'C:\\builds\\;C:\\temp\\';
      expect(() => security.validateBatchFilePath('C:\\system32\\script.bat')).toThrow();
    });
  });

  describe('validateSSHCredentials', () => {
    test('should validate proper SSH credentials', () => {
      const result = security.validateSSHCredentials('192.168.1.1', 'user', 'password');
      expect(result.host).toBe('192.168.1.1');
      expect(result.username).toBe('user');
      expect(result.password).toBe('password');
    });

    test('should reject invalid credentials', () => {
      expect(() => security.validateSSHCredentials('invalid-ip', 'user', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', '', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', '')).toThrow();
    });

    test('should reject credentials with dangerous characters', () => {
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user;drop', 'pass')).toThrow();
      expect(() => security.validateSSHCredentials('192.168.1.1', 'user', 'pass"')).toThrow();
    });
  });

  describe('validateJavaBuild', () => {
    test('should validate Java project files', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\';
      expect(() => security.validateJavaBuild('C:\\builds\\pom.xml', 'maven')).not.toThrow();
      expect(() => security.validateJavaBuild('C:\\builds\\build.gradle', 'gradle')).not.toThrow();
    });

    test('should auto-detect build tool', () => {
      process.env.ALLOWED_BUILD_PATHS = 'C:\\builds\\';
      expect(security.validateJavaBuild('C:\\builds\\pom.xml', 'auto')).toBe('maven');
      expect(security.validateJavaBuild('C:\\builds\\build.gradle', 'auto')).toBe('gradle');
    });
  });

  describe('validateBuildFlags', () => {
    test('should validate safe build flags', () => {
      const flags = ['--release', '--target', 'x86_64-pc-windows-msvc'];
      expect(() => security.validateBuildFlags(flags)).not.toThrow();
    });

    test('should reject dangerous flags', () => {
      expect(() => security.validateBuildFlags(['--privileged'])).toThrow();
      expect(() => security.validateBuildFlags(['--cap-add=SYS_ADMIN'])).toThrow();
      expect(() => security.validateBuildFlags(['--volume /:/host'])).toThrow();
    });

    test('should reject flags with injection attempts', () => {
      expect(() => security.validateBuildFlags(['--flag=$(malicious)'])).toThrow();
      expect(() => security.validateBuildFlags(['--flag `cmd`'])).toThrow();
    });
  });
});