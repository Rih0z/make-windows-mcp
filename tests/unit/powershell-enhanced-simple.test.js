/**
 * PowerShell Enhanced Simple Test - JSON Handling Improvements
 */

const executor = require('../../server/src/utils/powershell-enhanced');

describe('PowerShell Enhanced Simple Coverage', () => {
  beforeEach(() => {
    // Clear any cached state if needed
  });

  describe('JSON Escaping Enhancement', () => {
    test('should improve JSON escaping in PowerShell commands', () => {
      const command = 'Invoke-WebRequest -Uri "http://localhost:8090/api/chat" -Method POST -Body "{\\"message\\":\\"Hello AI\\",\\"model\\":\\"tinyllama\\"}"';
      
      const enhanced = executor.enhanceJsonEscaping(command);
      
      expect(enhanced).toBeDefined();
      expect(enhanced).toContain('-Body');
      // Should have proper JSON escaping
      expect(enhanced.includes('\\"')).toBe(true);
    });

    test('should handle complex JSON with nested objects', () => {
      const command = 'Invoke-WebRequest -Body "{\\"query\\":{\\"filters\\":{\\"status\\":\\"active\\"}},\\"options\\":{\\"format\\":\\"json\\"}}"';
      
      const enhanced = executor.enhanceJsonEscaping(command);
      
      expect(enhanced).toBeDefined();
      expect(enhanced).toContain('query');
      expect(enhanced).toContain('filters');
    });

    test('should preserve non-JSON content unchanged', () => {
      const command = 'Get-Process | Where-Object { $_.Name -eq "node" }';
      
      const enhanced = executor.enhanceJsonEscaping(command);
      
      expect(enhanced).toBe(command); // Should remain unchanged
    });
  });

  describe('Here-String Conversion', () => {
    test('should convert complex JSON to here-strings', () => {
      const command = 'Invoke-WebRequest -Body "{\\"message\\":\\"Complex message with \\\\"quotes\\\\"\\",\\"data\\":\\"test\\"}"';
      
      const converted = executor.convertToHereStrings(command);
      
      expect(converted).toBeDefined();
      // Should contain here-string syntax
      expect(converted).toContain('$jsonBody');
    });

    test('should handle simple JSON without conversion', () => {
      const command = 'Invoke-WebRequest -Body "{\\"simple\\":\\"json\\"}"';
      
      const converted = executor.convertToHereStrings(command);
      
      // Simple JSON might not trigger here-string conversion
      expect(converted).toBeDefined();
    });

    test('should preserve command structure', () => {
      const command = 'Invoke-WebRequest -Uri "http://test.com" -Method POST';
      
      const converted = executor.convertToHereStrings(command);
      
      expect(converted).toContain('Invoke-WebRequest');
      expect(converted).toContain('http://test.com');
    });
  });

  describe('Bash Operator Conversion', () => {
    test('should convert && operators to PowerShell equivalents', () => {
      const command = 'dotnet build && dotnet test';
      
      const converted = executor.convertBashOperators(command);
      
      expect(converted).toContain('if ($LASTEXITCODE -eq 0)');
      expect(converted).toContain('dotnet build');
      expect(converted).toContain('dotnet test');
    });

    test('should convert || operators to PowerShell error handling', () => {
      const command = 'npm install || echo "Install failed"';
      
      const converted = executor.convertBashOperators(command);
      
      expect(converted).toContain('} else {');
      expect(converted).toContain('npm install');
      expect(converted).toContain('echo');
    });

    test('should handle mixed operators correctly', () => {
      const command = 'git pull && npm install || echo "Failed"';
      
      const converted = executor.convertBashOperators(command);
      
      expect(converted).toContain('if ($LASTEXITCODE -eq 0)');
      expect(converted).toContain('} else {');
      expect(converted).toContain('}'); // Should have proper closing braces
    });

    test('should preserve simple commands without operators', () => {
      const command = 'Get-Process node';
      
      const converted = executor.convertBashOperators(command);
      
      expect(converted).toBe('Get-Process node');
    });
  });

  describe('Command Preprocessing', () => {
    test('should preprocess commands when enhanced mode is enabled', () => {
      const command = 'dotnet build && Invoke-WebRequest -Body "{\\"test\\":\\"data\\"}"';
      const options = {
        enableJsonEscaping: true,
        enableHereStrings: true,
        complexityLevel: 4
      };
      
      const processed = executor.preprocessCommand(command, options);
      
      expect(processed).toBeDefined();
      expect(processed).not.toBe(command); // Should be modified
    });

    test('should handle disabled preprocessing options', () => {
      const command = 'simple command';
      const options = {
        enableJsonEscaping: false,
        enableHereStrings: false,
        complexityLevel: 1
      };
      
      const processed = executor.preprocessCommand(command, options);
      
      expect(processed).toBe(command); // Should remain unchanged
    });

    test('should handle environment variable configuration', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env.ENABLE_ENHANCED_JSON_ESCAPING = 'true';
      process.env.ENABLE_POWERSHELL_HERE_STRINGS = 'true';
      process.env.COMMAND_COMPLEXITY_LEVEL = '4';
      
      const command = 'test && echo "test"';
      const processed = executor.preprocessCommand(command);
      
      expect(processed).toBeDefined();
      
      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Integration with PowerShell Execution', () => {
    test('should maintain executor state', () => {
      expect(executor.activeProcesses).toBeDefined();
      expect(executor.processCounter).toBeDefined();
      expect(typeof executor.processCounter).toBe('number');
    });

    test('should have enhanced execution method', () => {
      expect(typeof executor.executePowerShellCommand).toBe('function');
    });

    test('should support enhanced mode option', () => {
      const options = {
        enhancedMode: true,
        enableJsonEscaping: true,
        timeout: 30000
      };
      
      // Should not throw when enhanced mode is configured
      expect(() => {
        executor.preprocessCommand('test command', options);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', () => {
      const command = 'Invoke-WebRequest -Body "malformed json {test"';
      
      expect(() => {
        executor.enhanceJsonEscaping(command);
      }).not.toThrow();
    });

    test('should handle empty commands', () => {
      expect(() => {
        executor.preprocessCommand('');
      }).not.toThrow();
      
      expect(() => {
        executor.enhanceJsonEscaping('');
      }).not.toThrow();
    });

    test('should handle null/undefined inputs', () => {
      expect(() => {
        executor.preprocessCommand(null);
      }).not.toThrow();
      
      expect(() => {
        executor.convertBashOperators(undefined);
      }).not.toThrow();
    });
  });
});