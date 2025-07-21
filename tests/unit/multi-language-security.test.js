const security = require('../../server/src/utils/security');

describe('Multi-Language Build Security', () => {
  beforeEach(() => {
    // Reset environment variables for each test  
    process.env.ALLOWED_BUILD_PATHS = 'C:\\projects;D:\\builds';
    process.env.ENABLE_DEV_COMMANDS = 'true';
  });

  describe('Java Build Validation', () => {
    test('should validate Maven project paths', () => {
      expect(() => {
        security.validateJavaBuild('C:\\projects\\myapp\\pom.xml', 'maven');
      }).not.toThrow();
    });

    test('should validate Gradle project paths', () => {
      expect(() => {
        security.validateJavaBuild('C:\\projects\\myapp\\build.gradle', 'gradle');
      }).not.toThrow();
    });

    test('should auto-detect Maven from pom.xml', () => {
      const result = security.validateJavaBuild('C:\\projects\\myapp\\pom.xml', 'auto');
      expect(result).toBe('maven');
    });

    test('should auto-detect Gradle from build.gradle', () => {
      const result = security.validateJavaBuild('C:\\projects\\myapp\\build.gradle', 'auto');
      expect(result).toBe('gradle');
    });

    test('should reject invalid file extensions', () => {
      expect(() => {
        security.validateJavaBuild('C:\\projects\\myapp\\invalid.txt', 'maven');
      }).toThrow('Invalid Java project file');
    });

    test('should reject invalid build tools', () => {
      expect(() => {
        security.validateJavaBuild('C:\\projects\\myapp\\pom.xml', 'invalid');
      }).toThrow('Invalid build tool');
    });

    test('should reject paths outside allowed directories', () => {
      expect(() => {
        security.validateJavaBuild('C:\\unauthorized\\pom.xml', 'maven');
      }).toThrow('Path not in allowed directories');
    });
  });

  describe('Python Build Validation', () => {
    test('should validate Python project paths', () => {
      expect(() => {
        security.validatePythonBuild('C:\\projects\\python-app', 'pip');
      }).not.toThrow();
    });

    test('should accept valid build tools', () => {
      const validTools = ['pip', 'poetry', 'conda', 'pipenv', 'auto'];
      validTools.forEach(tool => {
        expect(() => {
          security.validatePythonBuild('C:\\projects\\python-app', tool);
        }).not.toThrow();
      });
    });

    test('should reject invalid build tools', () => {
      expect(() => {
        security.validatePythonBuild('C:\\projects\\python-app', 'invalid');
      }).toThrow('Invalid Python build tool');
    });

    test('should default to auto when no build tool specified', () => {
      const result = security.validatePythonBuild('C:\\projects\\python-app');
      expect(result).toBe('auto');
    });

    test('should reject paths outside allowed directories', () => {
      expect(() => {
        security.validatePythonBuild('C:\\unauthorized\\python-app', 'pip');
      }).toThrow('Path not in allowed directories');
    });
  });

  describe('Node.js Build Validation', () => {
    test('should validate Node.js project paths', () => {
      expect(() => {
        security.validateNodeBuild('C:\\projects\\node-app', 'npm');
      }).not.toThrow();
    });

    test('should accept valid package managers', () => {
      const validManagers = ['npm', 'yarn', 'pnpm', 'auto'];
      validManagers.forEach(manager => {
        expect(() => {
          security.validateNodeBuild('C:\\projects\\node-app', manager);
        }).not.toThrow();
      });
    });

    test('should reject invalid package managers', () => {
      expect(() => {
        security.validateNodeBuild('C:\\projects\\node-app', 'invalid');
      }).toThrow('Invalid Node.js package manager');
    });

    test('should default to auto when no package manager specified', () => {
      const result = security.validateNodeBuild('C:\\projects\\node-app');
      expect(result).toBe('auto');
    });

    test('should reject paths outside allowed directories', () => {
      expect(() => {
        security.validateNodeBuild('C:\\unauthorized\\node-app', 'npm');
      }).toThrow('Path not in allowed directories');
    });
  });

  describe('Build Command Validation', () => {
    test('should allow valid Maven commands', () => {
      const validCommands = [
        'mvn clean compile',
        'mvn clean install -Pproduction',
        'mvn test -Dmaven.test.skip=false'
      ];

      validCommands.forEach(command => {
        expect(() => {
          security.validateBuildCommand(command);
        }).not.toThrow();
      });
    });

    test('should allow valid Gradle commands', () => {
      const validCommands = [
        'gradle clean build',
        'gradlew test',
        'gradle bootRun -Dspring.profiles.active=dev'
      ];

      validCommands.forEach(command => {
        expect(() => {
          security.validateBuildCommand(command);
        }).not.toThrow();
      });
    });

    test('should allow valid Python commands', () => {
      const validCommands = [
        'pip install -r requirements.txt',
        'poetry install',
        'pytest',
        'python -m pip install package'
      ];

      validCommands.forEach(command => {
        expect(() => {
          security.validateBuildCommand(command);
        }).not.toThrow();
      });
    });

    test('should allow valid Node.js commands', () => {
      const validCommands = [
        'npm install',
        'npm run build',
        'yarn install',
        'yarn build',
        'pnpm install',
        'npx tsc --noEmit'
      ];

      validCommands.forEach(command => {
        expect(() => {
          security.validateBuildCommand(command);
        }).not.toThrow();
      });
    });

    test('should reject dangerous build commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'del /s /f C:\\*',
        'shutdown /s /t 0',
        'mvn clean compile && rm -rf /',
        'npm install; del /f important.txt'
      ];

      dangerousCommands.forEach(command => {
        expect(() => {
          security.validateBuildCommand(command);
        }).toThrow();
      });
    });

    test('should reject commands with backticks', () => {
      expect(() => {
        security.validateBuildCommand('mvn clean `rm -rf /`');
      }).toThrow('Dangerous pattern detected');
    });

    test('should reject commands not in allowed list', () => {
      expect(() => {
        security.validateBuildCommand('malware.exe execute');
      }).toThrow('Build command not allowed');
    });

    test('should reject empty or invalid commands', () => {
      expect(() => {
        security.validateBuildCommand('');
      }).toThrow('Invalid build command');

      expect(() => {
        security.validateBuildCommand(null);
      }).toThrow('Invalid build command');

      expect(() => {
        security.validateBuildCommand(123);
      }).toThrow('Invalid build command');
    });
  });

  describe('Integration with Development Mode', () => {
    test('should allow additional commands in development mode', () => {
      process.env.ENABLE_DEV_COMMANDS = 'true';
      
      expect(() => {
        security.validateBuildCommand('python setup.py build');
      }).not.toThrow();
    });

    test('should restrict commands when development mode is disabled', () => {
      process.env.ENABLE_DEV_COMMANDS = 'false';
      
      // Use a command that's only in devCommands
      expect(() => {
        security.validateBuildCommand('tasklist /fi "imagename eq notepad.exe"');
      }).toThrow('Build command not allowed');
    });

    test('should always allow core build tools regardless of mode', () => {
      process.env.ENABLE_DEV_COMMANDS = 'false';
      
      // These are in allowedCommands, should work in any mode
      expect(() => {
        security.validateBuildCommand('mvn clean compile');
      }).not.toThrow();

      expect(() => {
        security.validateBuildCommand('gradle build');
      }).not.toThrow();
    });
  });

  describe('Path Traversal Protection', () => {
    test('should reject directory traversal in Java builds', () => {
      expect(() => {
        security.validateJavaBuild('C:\\projects\\..\\..\\Windows\\System32\\pom.xml', 'maven');
      }).toThrow('Directory traversal detected');
    });

    test('should reject directory traversal in Python builds', () => {
      expect(() => {
        security.validatePythonBuild('C:\\projects\\..\\..\\Windows\\System32', 'pip');
      }).toThrow('Directory traversal detected');
    });

    test('should reject directory traversal in Node.js builds', () => {
      expect(() => {
        security.validateNodeBuild('C:\\projects\\..\\..\\Windows\\System32', 'npm');
      }).toThrow('Directory traversal detected');
    });
  });
});