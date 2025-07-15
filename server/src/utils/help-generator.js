/**
 * Dynamic Help System - Generate comprehensive tool documentation and usage examples
 * Implements CLAUDE.md 第13条: MCP接続成功時にすべての機能の使い方をクライアントに伝える
 */

class HelpGenerator {
  constructor() {
    this.categories = {
      build: {
        name: 'Build Tools',
        description: 'Multi-language application building and compilation',
        icon: '🔨'
      },
      system: {
        name: 'System Operations', 
        description: 'PowerShell execution, batch files, and process management',
        icon: '⚙️'
      },
      files: {
        name: 'File Operations',
        description: 'File synchronization, encoding, and manipulation',
        icon: '📁'
      },
      network: {
        name: 'Network & Remote',
        description: 'SSH connections, remote operations, and connectivity',
        icon: '🌐'
      },
      management: {
        name: 'Server Management',
        description: 'Server administration, monitoring, and configuration',
        icon: '🛠️'
      },
      auth: {
        name: 'Authentication',
        description: 'Authentication, security, and session management',
        icon: '🔐'
      }
    };

    this.toolExamples = {
      build_dotnet: {
        category: 'build',
        examples: [
          {
            title: 'Basic .NET Build',
            code: `{
  "name": "build_dotnet",
  "arguments": {
    "projectPath": "C:/builds/MyProject/MyProject.csproj",
    "configuration": "Release"
  }
}`
          },
          {
            title: 'Clean and Rebuild',
            code: `{
  "name": "build_dotnet", 
  "arguments": {
    "projectPath": "C:/builds/MyProject/MyProject.sln",
    "configuration": "Debug",
    "clean": true,
    "restore": true
  }
}`
          }
        ]
      },
      run_powershell: {
        category: 'system',
        examples: [
          {
            title: 'Basic PowerShell Command',
            code: `{
  "name": "run_powershell",
  "arguments": {
    "command": "Get-Process | Where-Object {$_.ProcessName -eq 'notepad'}"
  }
}`
          },
          {
            title: 'File Operations with Timeout',
            code: `{
  "name": "run_powershell",
  "arguments": {
    "command": "Get-ChildItem C:\\\\builds\\\\ -Recurse | Measure-Object -Property Length -Sum",
    "timeout": 60000
  }
}`
          }
        ]
      },
      build_python: {
        category: 'build',
        examples: [
          {
            title: 'Run Python Tests with Virtual Environment',
            code: `{
  "name": "build_python",
  "arguments": {
    "projectPath": "C:/builds/MyPythonProject",
    "commands": ["test"],
    "useVirtualEnv": true,
    "venvName": ".venv",
    "extraPackages": ["pytest", "pytest-asyncio"],
    "testRunner": "pytest"
  }
}`
          },
          {
            title: 'Install Dependencies and Build',
            code: `{
  "name": "build_python",
  "arguments": {
    "projectPath": "C:/builds/MyPythonProject",
    "commands": ["install", "build"],
    "useVirtualEnv": true,
    "requirements": "requirements-dev.txt"
  }
}`
          },
          {
            title: 'Poetry Project Build',
            code: `{
  "name": "build_python",
  "arguments": {
    "projectPath": "C:/builds/MyPoetryProject",
    "buildTool": "poetry",
    "commands": ["install", "test", "build"]
  }
}`
          }
        ]
      },
      encode_file_base64: {
        category: 'files',
        examples: [
          {
            title: 'Encode PDF File',
            code: `{
  "name": "encode_file_base64",
  "arguments": {
    "filePath": "C:/builds/output/document.pdf"
  }
}`
          },
          {
            title: 'Preview Mode (Metadata Only)',
            code: `{
  "name": "encode_file_base64",
  "arguments": {
    "filePath": "C:/builds/output/large-file.pdf",
    "options": {
      "preview": true
    }
  }
}`
          }
        ]
      },
      ssh_command: {
        category: 'network',
        examples: [
          {
            title: 'Remote Command Execution',
            code: `{
  "name": "ssh_command",
  "arguments": {
    "command": "systemctl status nginx",
    "remoteHost": "192.168.1.100"
  }
}`
          }
        ]
      },
      mcp_self_build: {
        category: 'management',
        examples: [
          {
            title: 'Update Server from GitHub',
            code: `{
  "name": "mcp_self_build",
  "arguments": {
    "action": "update",
    "options": {
      "autoStart": true
    }
  }
}`
          },
          {
            title: 'Build and Test',
            code: `{
  "name": "mcp_self_build",
  "arguments": {
    "action": "build",
    "options": {
      "runTests": true
    }
  }
}`
          }
        ]
      }
    };
  }

  /**
   * Generate welcome message for MCP connection
   * @param {Object} serverInfo - Server information
   * @returns {string} - Welcome message with tool overview
   */
  generateWelcomeMessage(serverInfo) {
    const toolCount = serverInfo.tools ? serverInfo.tools.length : 'multiple';
    const version = serverInfo.version || 'latest';
    
    return `🎉 Welcome to Windows MCP Build Server v${version}!

🚀 **Available Features (${toolCount} tools)**:
${this.generateCategoryOverview()}

📋 **Quick Start**:
• Use \`tools/list\` to see all available tools
• Use \`GET /help/tools\` for detailed documentation
• Use \`GET /auth/status\` to verify authentication

🔧 **Server Status**:
• Authentication: ${serverInfo.authConfigured ? '✅ Configured' : '⚠️ Disabled'}
• Security Mode: ${serverInfo.dangerousMode ? '🔓 Dangerous' : '🔒 Secure'}
• Version: ${version}

💡 **Need Help?** Visit \`/help/tools\` for comprehensive usage examples!`;
  }

  /**
   * Generate category overview for welcome message
   * @returns {string} - Formatted category list
   */
  generateCategoryOverview() {
    return Object.entries(this.categories)
      .map(([key, cat]) => `${cat.icon} **${cat.name}**: ${cat.description}`)
      .join('\n');
  }

  /**
   * Generate comprehensive tool documentation
   * @param {Array} tools - Array of tool definitions
   * @returns {Object} - Complete documentation object
   */
  generateToolDocumentation(tools) {
    const categorizedTools = this.categorizeTools(tools);
    const documentation = {
      timestamp: new Date().toISOString(),
      totalTools: tools.length,
      categories: {},
      quickReference: this.generateQuickReference(tools),
      examples: this.generateComprehensiveExamples(tools)
    };

    // Generate documentation for each category
    Object.entries(categorizedTools).forEach(([category, categoryTools]) => {
      documentation.categories[category] = {
        ...this.categories[category],
        tools: categoryTools.map(tool => this.generateToolDocumentation_single(tool)),
        toolCount: categoryTools.length
      };
    });

    return documentation;
  }

  /**
   * Categorize tools based on their names and descriptions
   * @param {Array} tools - Tool definitions
   * @returns {Object} - Tools grouped by category
   */
  categorizeTools(tools) {
    const categorized = {};
    
    // Initialize categories
    Object.keys(this.categories).forEach(cat => {
      categorized[cat] = [];
    });

    tools.forEach(tool => {
      const category = this.determineToolCategory(tool);
      categorized[category].push(tool);
    });

    return categorized;
  }

  /**
   * Determine tool category based on name and description
   * @param {Object} tool - Tool definition
   * @returns {string} - Category name
   */
  determineToolCategory(tool) {
    const name = tool.name.toLowerCase();
    
    if (name.startsWith('build_')) return 'build';
    if (name.includes('powershell') || name.includes('batch') || name.includes('process')) return 'system';
    if (name.includes('file') || name.includes('sync') || name.includes('encode')) return 'files';
    if (name.includes('ssh') || name.includes('ping') || name.includes('remote')) return 'network';
    if (name.includes('auth') || name.includes('security')) return 'auth';
    
    return 'management'; // Default category
  }

  /**
   * Generate documentation for a single tool
   * @param {Object} tool - Tool definition
   * @returns {Object} - Tool documentation
   */
  generateToolDocumentation_single(tool) {
    const examples = this.toolExamples[tool.name] || {
      category: this.determineToolCategory(tool),
      examples: [this.generateGenericExample(tool)]
    };

    return {
      name: tool.name,
      description: tool.description,
      category: examples.category,
      inputSchema: tool.inputSchema,
      examples: examples.examples,
      usage: this.generateUsageNotes(tool)
    };
  }

  /**
   * Generate generic example for tools without predefined examples
   * @param {Object} tool - Tool definition
   * @returns {Object} - Generic example
   */
  generateGenericExample(tool) {
    const required = tool.inputSchema?.required || [];
    const properties = tool.inputSchema?.properties || {};
    
    const args = {};
    required.forEach(param => {
      if (properties[param]) {
        args[param] = this.generateExampleValue(properties[param]);
      }
    });

    return {
      title: `Basic ${tool.name} Usage`,
      code: JSON.stringify({
        name: tool.name,
        arguments: args
      }, null, 2)
    };
  }

  /**
   * Generate example value based on parameter schema
   * @param {Object} schema - Parameter schema
   * @returns {*} - Example value
   */
  generateExampleValue(schema) {
    switch (schema.type) {
      case 'string':
        if (schema.description?.toLowerCase().includes('path')) {
          return 'C:/builds/project/file.ext';
        }
        return 'example_value';
      case 'number':
        return schema.minimum || 0;
      case 'boolean':
        return true;
      case 'array':
        return ['example'];
      case 'object':
        return {};
      default:
        return 'example_value';
    }
  }

  /**
   * Generate usage notes for a tool
   * @param {Object} tool - Tool definition
   * @returns {Array} - Usage notes
   */
  generateUsageNotes(tool) {
    const notes = [];
    const schema = tool.inputSchema;
    
    if (schema?.required?.length > 0) {
      notes.push(`Required parameters: ${schema.required.join(', ')}`);
    }
    
    if (tool.name.includes('build')) {
      notes.push('Ensure project files exist in allowed build paths');
    }
    
    if (tool.name.includes('powershell') || tool.name.includes('batch')) {
      notes.push('Commands are validated based on security mode');
    }
    
    if (tool.name.includes('ssh') || tool.name.includes('remote')) {
      notes.push('Requires valid SSH credentials and network connectivity');
    }

    return notes;
  }

  /**
   * Generate quick reference guide
   * @param {Array} tools - Tool definitions
   * @returns {Object} - Quick reference
   */
  generateQuickReference(tools) {
    return {
      mostUsed: [
        'build_dotnet',
        'run_powershell',
        'file_sync',
        'ping_host',
        'encode_file_base64'
      ].filter(name => tools.find(t => t.name === name)),
      
      byCategory: Object.keys(this.categories).reduce((acc, cat) => {
        acc[cat] = tools
          .filter(t => this.determineToolCategory(t) === cat)
          .map(t => t.name);
        return acc;
      }, {}),
      
      authenticationRequired: tools
        .filter(t => !['ping_host', 'build_dotnet'].includes(t.name))
        .map(t => t.name)
    };
  }

  /**
   * Generate comprehensive examples for all tools
   * @param {Array} tools - Tool definitions
   * @returns {Object} - Examples organized by scenario
   */
  generateComprehensiveExamples(tools) {
    return {
      buildWorkflow: this.generateBuildWorkflowExample(),
      fileOperations: this.generateFileOperationsExample(),
      remoteManagement: this.generateRemoteManagementExample(),
      troubleshooting: this.generateTroubleshootingExample()
    };
  }

  /**
   * Generate build workflow example
   * @returns {Object} - Build workflow
   */
  generateBuildWorkflowExample() {
    return {
      title: 'Complete Build Workflow',
      description: 'End-to-end application build, test, and deployment',
      steps: [
        {
          step: 1,
          action: 'Clean previous build',
          tool: 'run_powershell',
          command: 'Remove-Item C:\\builds\\output\\* -Recurse -Force'
        },
        {
          step: 2,
          action: 'Build .NET application',
          tool: 'build_dotnet',
          arguments: {
            projectPath: 'C:/builds/MyApp/MyApp.csproj',
            configuration: 'Release'
          }
        },
        {
          step: 3,
          action: 'Verify build output',
          tool: 'encode_file_base64',
          arguments: {
            filePath: 'C:/builds/output/MyApp.exe',
            options: { preview: true }
          }
        }
      ]
    };
  }

  /**
   * Generate file operations example
   * @returns {Object} - File operations workflow
   */
  generateFileOperationsExample() {
    return {
      title: 'File Management Operations',
      description: 'Common file synchronization and encoding tasks',
      examples: [
        {
          task: 'Sync build artifacts',
          tool: 'file_sync',
          arguments: {
            source: 'C:/builds/output/',
            destination: 'C:/deployment/staging/',
            options: { recursive: true, verify: true }
          }
        },
        {
          task: 'Encode PDF for verification',
          tool: 'encode_file_base64',
          arguments: {
            filePath: 'C:/builds/documentation.pdf'
          }
        }
      ]
    };
  }

  /**
   * Generate remote management example
   * @returns {Object} - Remote management workflow
   */
  generateRemoteManagementExample() {
    return {
      title: 'Remote Server Management',
      description: 'Managing remote hosts and services',
      examples: [
        {
          task: 'Check server connectivity',
          tool: 'ping_host',
          arguments: { host: '192.168.1.100' }
        },
        {
          task: 'Execute remote command',
          tool: 'ssh_command',
          arguments: {
            command: 'systemctl status nginx',
            remoteHost: '192.168.1.100'
          }
        }
      ]
    };
  }

  /**
   * Generate troubleshooting example
   * @returns {Object} - Troubleshooting guide
   */
  generateTroubleshootingExample() {
    return {
      title: 'Troubleshooting Common Issues',
      description: 'Diagnostic commands and solutions',
      scenarios: [
        {
          issue: 'Build failure',
          solution: 'Check build environment and dependencies',
          command: {
            tool: 'run_powershell',
            command: 'Get-ChildItem Env: | Where-Object {$_.Name -like "*DOTNET*"}'
          }
        },
        {
          issue: 'Authentication problems',
          solution: 'Verify token configuration',
          endpoint: 'GET /auth/status'
        }
      ]
    };
  }
}

module.exports = new HelpGenerator();