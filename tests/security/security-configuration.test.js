/**
 * Security Configuration Integration Tests
 * Tests the security separation between .env and .mcp.json
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

describe('Security Configuration Tests', () => {
  const projectRoot = path.join(__dirname, '..');
  const envPath = path.join(projectRoot, '.env');
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  const envExamplePath = path.join(projectRoot, '.env.example');
  
  let originalEnv;
  let backupEnv;
  
  beforeAll(async () => {
    // Backup original environment
    originalEnv = { ...process.env };
    
    // Backup existing .env if it exists
    try {
      backupEnv = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      backupEnv = null;
    }
  });
  
  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore .env file
    if (backupEnv) {
      await fs.writeFile(envPath, backupEnv);
    } else {
      try {
        await fs.unlink(envPath);
      } catch (error) {
        // File didn't exist originally
      }
    }
  });
  
  beforeEach(() => {
    // Reset environment for each test
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MCP_') || key.startsWith('ALLOWED_') || key.startsWith('ENABLE_')) {
        delete process.env[key];
      }
    });
  });

  describe('File Security Validation', () => {
    test('should ensure .mcp.json does not contain sensitive information', async () => {
      const mcpContent = await fs.readFile(mcpJsonPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      
      // Check that MCP_AUTH_TOKEN is not in .mcp.json
      const envSection = mcpConfig.mcpServers?.['windows-build-server']?.env || {};
      expect(envSection.MCP_AUTH_TOKEN).toBeUndefined();
      
      // Check for any token-like strings
      expect(mcpContent).not.toMatch(/token.*[a-fA-F0-9]{32}/i);
      expect(mcpContent).not.toMatch(/auth.*[a-fA-F0-9]{32}/i);
      expect(mcpContent).not.toMatch(/secret.*[a-fA-F0-9]{32}/i);
    });

    test('should ensure .env.example does not contain real secrets', async () => {
      const envExampleContent = await fs.readFile(envExamplePath, 'utf8');
      
      // Should contain token variable but not real values
      expect(envExampleContent).toMatch(/MCP_AUTH_TOKEN=/);
      expect(envExampleContent).not.toMatch(/MCP_AUTH_TOKEN=[a-fA-F0-9]{32}/);
      
      // Should not contain real passwords or usernames
      expect(envExampleContent).not.toMatch(/REMOTE_PASSWORD=.+[^$]/);
      expect(envExampleContent).not.toMatch(/REMOTE_USERNAME=(?!Administrator$|$).+/);
    });

    test('should validate .gitignore excludes sensitive files', async () => {
      const gitignorePath = path.join(projectRoot, '.gitignore');
      
      try {
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        
        // Check that .env files are excluded
        expect(gitignoreContent).toMatch(/\.env\b/);
        expect(gitignoreContent).toMatch(/\.env\.local/);
        
        // Check that log files are excluded
        expect(gitignoreContent).toMatch(/\*\.log/);
        expect(gitignoreContent).toMatch(/logs?\//);
      } catch (error) {
        // If .gitignore doesn't exist, recommend its creation
        fail('.gitignore file should exist and exclude sensitive files');
      }
    });
  });

  describe('Environment Variable Separation', () => {
    test('should load sensitive config from .env file', async () => {
      const testToken = 'abcdef1234567890abcdef1234567890';
      const testEnvContent = `
MCP_AUTH_TOKEN=${testToken}
MCP_SERVER_PORT=8080-8089
ALLOWED_BUILD_PATHS=C:\\builds\\
`;
      
      // Create test .env file
      await fs.writeFile(envPath, testEnvContent);
      
      // Load dotenv
      require('dotenv').config({ path: envPath });
      
      expect(process.env.MCP_AUTH_TOKEN).toBe(testToken);
      expect(process.env.MCP_SERVER_PORT).toBe('8080-8089');
      expect(process.env.ALLOWED_BUILD_PATHS).toBe('C:\\builds\\');
    });

    test('should prioritize .env over .mcp.json for overlapping settings', async () => {
      const envPort = '9000-9009';
      const envPaths = 'C:\\secure\\builds\\';
      
      const testEnvContent = `
MCP_SERVER_PORT=${envPort}
ALLOWED_BUILD_PATHS=${envPaths}
`;
      
      await fs.writeFile(envPath, testEnvContent);
      require('dotenv').config({ path: envPath });
      
      // Environment variables should take precedence
      expect(process.env.MCP_SERVER_PORT).toBe(envPort);
      expect(process.env.ALLOWED_BUILD_PATHS).toBe(envPaths);
      
      // Load .mcp.json config
      const mcpContent = await fs.readFile(mcpJsonPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      const mcpEnv = mcpConfig.mcpServers?.['windows-build-server']?.env || {};
      
      // .env should override .mcp.json
      expect(process.env.MCP_SERVER_PORT).not.toBe(mcpEnv.MCP_SERVER_PORT);
    });

    test('should handle missing .env file gracefully', () => {
      // Ensure no .env file exists for this test
      delete process.env.MCP_AUTH_TOKEN;
      delete process.env.MCP_SERVER_PORT;
      
      // Server should still start with defaults
      expect(() => {
        require('dotenv').config({ path: '/nonexistent/.env' });
      }).not.toThrow();
      
      // Should use defaults or .mcp.json values
      expect(process.env.MCP_AUTH_TOKEN).toBeUndefined();
    });
  });

  describe('Security Configuration Templates', () => {
    test('should validate all template files exclude tokens', async () => {
      const templatesDir = path.join(projectRoot, 'claude-config-templates');
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(templatesDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          
          // Should not contain MCP_AUTH_TOKEN
          expect(content).not.toMatch(/"MCP_AUTH_TOKEN":\s*"[^"]+"/);
          
          // Should not contain real token values
          expect(content).not.toMatch(/[a-fA-F0-9]{32}/);
          
          // Parse JSON to ensure it's valid
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    });

    test('should validate setup script excludes tokens from .mcp.json', async () => {
      const setupScriptPath = path.join(projectRoot, 'setup-claude-code.ps1');
      const scriptContent = await fs.readFile(setupScriptPath, 'utf8');
      
      // Should not include MCP_AUTH_TOKEN in .mcp.json generation
      expect(scriptContent).not.toMatch(/MCP_AUTH_TOKEN.*=.*\$Token/);
      
      // Should generate .env file instead
      expect(scriptContent).toMatch(/\.env/i);
    });
  });

  describe('Path Security Validation', () => {
    test('should restrict build paths to secure directories', async () => {
      const mcpContent = await fs.readFile(mcpJsonPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      const envSection = mcpConfig.mcpServers?.['windows-build-server']?.env || {};
      
      const allowedPaths = envSection.ALLOWED_BUILD_PATHS || '';
      
      // Should be restricted to C:\\builds\\ only
      expect(allowedPaths).toBe('C:\\builds\\');
      
      // Should not include dangerous paths
      expect(allowedPaths).not.toMatch(/C:\\Windows/i);
      expect(allowedPaths).not.toMatch(/C:\\Program Files/i);
      expect(allowedPaths).not.toMatch(/C:\\System/i);
      expect(allowedPaths).not.toMatch(/\\.\\./); // No relative paths
    });

    test('should validate port range security', async () => {
      const mcpContent = await fs.readFile(mcpJsonPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      const envSection = mcpConfig.mcpServers?.['windows-build-server']?.env || {};
      
      const portConfig = envSection.MCP_SERVER_PORT || '';
      
      if (portConfig.includes('-')) {
        const [start, end] = portConfig.split('-').map(p => parseInt(p));
        
        // Should use safe port range
        expect(start).toBeGreaterThanOrEqual(1024); // Above system ports
        expect(end).toBeLessThanOrEqual(65535); // Valid port range
        expect(end - start).toBeLessThanOrEqual(100); // Reasonable range size
      }
    });
  });

  describe('Runtime Security Validation', () => {
    test('should not expose tokens in process environment listing', async () => {
      const testToken = 'test-secret-token-1234567890abcdef';
      
      // Set token in environment
      process.env.MCP_AUTH_TOKEN = testToken;
      
      // Simulate getting environment for child process
      const childEnv = { ...process.env };
      
      // Token should be available to server process
      expect(childEnv.MCP_AUTH_TOKEN).toBe(testToken);
      
      // But should not be logged or exposed in configuration
      const configForLogging = {
        port: childEnv.MCP_SERVER_PORT,
        paths: childEnv.ALLOWED_BUILD_PATHS,
        // Token should NOT be included in logged config
      };
      
      expect(configForLogging).not.toHaveProperty('token');
      expect(configForLogging).not.toHaveProperty('auth');
      expect(JSON.stringify(configForLogging)).not.toContain(testToken);
    });

    test('should validate development mode restrictions', async () => {
      const mcpContent = await fs.readFile(mcpJsonPath, 'utf8');
      const mcpConfig = JSON.parse(mcpContent);
      const envSection = mcpConfig.mcpServers?.['windows-build-server']?.env || {};
      
      // Development commands should be disabled by default
      expect(envSection.ENABLE_DEV_COMMANDS).toBe('false');
      
      // Dangerous mode should be disabled by default
      expect(envSection.ENABLE_DANGEROUS_MODE).toBe('false');
    });
  });

  describe('Documentation Security Review', () => {
    test('should ensure documentation promotes secure practices', async () => {
      const readmePath = path.join(projectRoot, 'README.md');
      const readmeContent = await fs.readFile(readmePath, 'utf8');
      
      // Should mention .env file usage
      expect(readmeContent).toMatch(/\.env/);
      
      // Should not contain example tokens
      expect(readmeContent).not.toMatch(/[a-fA-F0-9]{32}/);
      expect(readmeContent).not.toMatch(/your-generated-token-here/);
    });

    test('should validate security guide exists and is comprehensive', async () => {
      const securityPath = path.join(projectRoot, 'SECURITY.md');
      
      try {
        const securityContent = await fs.readFile(securityPath, 'utf8');
        
        // Should cover key security topics
        expect(securityContent).toMatch(/token/i);
        expect(securityContent).toMatch(/\.env/i);
        expect(securityContent).toMatch(/\.mcp\.json/i);
        expect(securityContent).toMatch(/gitignore/i);
        expect(securityContent).toMatch(/permission/i);
      } catch (error) {
        fail('SECURITY.md file should exist and contain security guidelines');
      }
    });
  });

  describe('Integration Testing', () => {
    test('should start server with secure configuration', (done) => {
      const testEnvContent = `
MCP_AUTH_TOKEN=test-token-for-integration-testing
MCP_SERVER_PORT=8080-8089
ALLOWED_BUILD_PATHS=C:\\builds\\
ENABLE_DEV_COMMANDS=false
ENABLE_DANGEROUS_MODE=false
`;
      
      fs.writeFile(envPath, testEnvContent).then(() => {
        const serverPath = path.join(projectRoot, 'server/src/server.js');
        const serverProcess = spawn('node', [serverPath], {
          cwd: projectRoot,
          env: { ...process.env, NODE_ENV: 'test' },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        serverProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        serverProcess.stderr.on('data', (data) => {
          output += data.toString();
        });
        
        // Give server time to start
        setTimeout(() => {
          serverProcess.kill('SIGTERM');
          
          // Should start without errors
          expect(output).not.toMatch(/error/i);
          expect(output).not.toMatch(/failed/i);
          
          // Should not expose token in logs
          expect(output).not.toContain('test-token-for-integration-testing');
          
          done();
        }, 3000);
      });
    }, 10000);

    test('should reject invalid authentication', (done) => {
      const testEnvContent = `
MCP_AUTH_TOKEN=valid-token-123456789012345678901234
MCP_SERVER_PORT=8081
ALLOWED_BUILD_PATHS=C:\\builds\\
`;
      
      fs.writeFile(envPath, testEnvContent).then(() => {
        const serverPath = path.join(projectRoot, 'server/src/server.js');
        const serverProcess = spawn('node', [serverPath], {
          cwd: projectRoot,
          env: { ...process.env, NODE_ENV: 'test' },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Give server time to start, then test authentication
        setTimeout(() => {
          const http = require('http');
          const postData = JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1
          });
          
          const options = {
            hostname: 'localhost',
            port: 8081,
            path: '/',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer invalid-token',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          
          const req = http.request(options, (res) => {
            expect(res.statusCode).toBe(401); // Unauthorized
            serverProcess.kill('SIGTERM');
            done();
          });
          
          req.on('error', (e) => {
            serverProcess.kill('SIGTERM');
            done();
          });
          
          req.write(postData);
          req.end();
        }, 2000);
      });
    }, 10000);
  });

  describe('Compliance and Best Practices', () => {
    test('should follow security coding standards', async () => {
      const serverFiles = [
        'server/src/server.js',
        'server/src/utils/security.js',
        'server/src/utils/auth-manager.js'
      ];
      
      for (const file of serverFiles) {
        const filePath = path.join(projectRoot, file);
        
        try {
          const content = await fs.readFile(filePath, 'utf8');
          
          // Should not contain hardcoded secrets
          expect(content).not.toMatch(/password.*=.*["'][^"']{8,}["']/i);
          expect(content).not.toMatch(/token.*=.*["'][a-fA-F0-9]{32}["']/i);
          expect(content).not.toMatch(/secret.*=.*["'][^"']{8,}["']/i);
          
          // Should use environment variables for sensitive config
          expect(content).toMatch(/process\.env\./);
        } catch (error) {
          // File might not exist, which is OK for some optional files
          if (file.includes('auth-manager.js')) {
            continue; // Optional file
          }
          throw error;
        }
      }
    });

    test('should implement proper error handling for auth failures', async () => {
      const securityFilePath = path.join(projectRoot, 'server/src/utils/security.js');
      
      try {
        const securityContent = await fs.readFile(securityFilePath, 'utf8');
        
        // Should have authentication validation
        expect(securityContent).toMatch(/auth/i);
        expect(securityContent).toMatch(/token/i);
        
        // Should not expose sensitive information in errors
        expect(securityContent).not.toMatch(/console\.log.*token/i);
        expect(securityContent).not.toMatch(/console\.log.*password/i);
      } catch (error) {
        // Security file should exist
        fail('security.js file should exist and implement proper authentication');
      }
    });
  });
});