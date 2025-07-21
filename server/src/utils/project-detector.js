/**
 * Project Detector - Automatic project type detection and environment recommendation
 * Analyzes project files to recommend optimal build environment
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectDetector {
  constructor() {
    // Project type patterns and their environment requirements
    this.patterns = {
      wpf: {
        files: ['.csproj'],
        contentPatterns: [
          /UseWPF.*true/i,
          /Microsoft\.WindowsDesktop\.App/i,
          /net[0-9]+-windows/i,
          /<UseWPF>true<\/UseWPF>/i
        ],
        environment: 'windows',
        priority: 'high',
        description: 'WPF Desktop Application'
      },
      winforms: {
        files: ['.csproj'],
        contentPatterns: [
          /UseWindowsForms.*true/i,
          /System\.Windows\.Forms/i,
          /net[0-9]+-windows/i,
          /<UseWindowsForms>true<\/UseWindowsForms>/i
        ],
        environment: 'windows',
        priority: 'high',
        description: 'Windows Forms Application'
      },
      winui: {
        files: ['.csproj'],
        contentPatterns: [
          /Microsoft\.WinUI/i,
          /Microsoft\.WindowsAppSDK/i,
          /net[0-9]+-windows/i
        ],
        environment: 'windows',
        priority: 'high',
        description: 'WinUI 3 Application'
      },
      xamarin: {
        files: ['.csproj'],
        contentPatterns: [
          /Xamarin/i,
          /Microsoft\.iOS/i,
          /Microsoft\.Android/i,
          /Microsoft\.MacCatalyst/i
        ],
        environment: 'mac',
        priority: 'high',
        description: 'Xamarin Mobile Application'
      },
      maui: {
        files: ['.csproj'],
        contentPatterns: [
          /Microsoft\.Maui/i,
          /net[0-9]+-android/i,
          /net[0-9]+-ios/i,
          /net[0-9]+-maccatalyst/i
        ],
        environment: 'cross-platform',
        priority: 'high',
        description: '.NET MAUI Cross-platform Application'
      },
      dotnetCore: {
        files: ['.csproj'],
        contentPatterns: [
          /netcoreapp[0-9]/i,
          /net[0-9]+\./i,
          /Microsoft\.AspNetCore/i
        ],
        environment: 'cross-platform',
        priority: 'medium',
        description: '.NET Core Application'
      },
      netStandard: {
        files: ['.csproj'],
        contentPatterns: [
          /netstandard[0-9]/i,
          /TargetFramework.*netstandard/i
        ],
        environment: 'cross-platform',
        priority: 'low',
        description: '.NET Standard Library'
      },
      docker: {
        files: ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
        contentPatterns: [
          /FROM.*microsoft\/dotnet/i,
          /FROM.*mcr\.microsoft\.com\/dotnet/i
        ],
        environment: 'docker',
        priority: 'medium',
        description: 'Dockerized Application'
      },
      python: {
        files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
        contentPatterns: [
          /tkinter/i,
          /PyQt/i,
          /wx.*python/i,
          /kivy/i
        ],
        environment: 'cross-platform',
        priority: 'medium',
        description: 'Python Application'
      },
      node: {
        files: ['package.json'],
        contentPatterns: [
          /electron/i,
          /nw\.js/i,
          /tauri/i
        ],
        environment: 'cross-platform',
        priority: 'medium',
        description: 'Node.js Application'
      }
    };
  }

  /**
   * Analyze project directory and detect project type
   * @param {string} projectPath - Path to project directory
   * @returns {Promise<Object>} - Detection results
   */
  async detectProject(projectPath) {
    const results = {
      detectedTypes: [],
      recommendedEnvironment: 'cross-platform',
      confidence: 'low',
      buildStrategy: {},
      analysis: {}
    };

    try {
      // Get all files in project directory
      const files = await this.getAllFiles(projectPath);
      
      // Analyze each pattern
      for (const [type, pattern] of Object.entries(this.patterns)) {
        const detection = await this.analyzePattern(projectPath, files, type, pattern);
        if (detection.detected) {
          results.detectedTypes.push(detection);
        }
      }

      // Sort by priority and confidence
      results.detectedTypes.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] * b.confidence) - (priorityOrder[a.priority] * a.confidence);
      });

      // Determine recommended environment
      if (results.detectedTypes.length > 0) {
        const topMatch = results.detectedTypes[0];
        results.recommendedEnvironment = topMatch.environment;
        results.confidence = topMatch.confidence > 0.7 ? 'high' : 
                           topMatch.confidence > 0.4 ? 'medium' : 'low';
        
        // Build strategy recommendations
        results.buildStrategy = this.getBuildStrategy(topMatch);
      }

      // Analysis summary
      results.analysis = {
        totalFiles: files.length,
        projectFiles: files.filter(f => this.isProjectFile(f)).length,
        hasWindowsSpecific: results.detectedTypes.some(t => t.environment === 'windows'),
        hasCrossPlatform: results.detectedTypes.some(t => t.environment === 'cross-platform'),
        hasContainerization: results.detectedTypes.some(t => t.environment === 'docker')
      };

    } catch (error) {
      results.error = error.message;
    }

    return results;
  }

  /**
   * Get all files recursively in directory
   * @param {string} dirPath - Directory path
   * @param {number} maxDepth - Maximum recursion depth
   * @returns {Promise<Array>} - Array of file paths
   */
  async getAllFiles(dirPath, maxDepth = 3) {
    const files = [];
    
    async function traverse(currentPath, depth = 0) {
      if (depth > maxDepth) return;
      
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isFile()) {
            files.push(fullPath);
          } else if (entry.isDirectory() && !entry.name.startsWith('.') && 
                    !['node_modules', 'bin', 'obj', '__pycache__'].includes(entry.name)) {
            await traverse(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await traverse(dirPath);
    return files;
  }

  /**
   * Analyze pattern against project files
   * @param {string} projectPath - Project directory path
   * @param {Array} files - Array of file paths
   * @param {string} type - Pattern type name
   * @param {Object} pattern - Pattern configuration
   * @returns {Promise<Object>} - Analysis result
   */
  async analyzePattern(projectPath, files, type, pattern) {
    const result = {
      type,
      detected: false,
      confidence: 0,
      evidence: [],
      environment: pattern.environment,
      priority: pattern.priority,
      description: pattern.description
    };

    // Check for required files
    const matchingFiles = files.filter(file => {
      return pattern.files.some(patternFile => 
        path.basename(file).toLowerCase().includes(patternFile.toLowerCase())
      );
    });

    if (matchingFiles.length === 0) {
      return result;
    }

    result.evidence.push(`Found ${matchingFiles.length} matching files`);
    
    // Analyze file contents
    let contentMatches = 0;
    let totalContentChecks = 0;

    for (const file of matchingFiles.slice(0, 5)) { // Limit to first 5 files
      try {
        const content = await fs.readFile(file, 'utf8');
        totalContentChecks++;

        for (const contentPattern of pattern.contentPatterns) {
          if (contentPattern.test(content)) {
            contentMatches++;
            result.evidence.push(`Pattern match in ${path.basename(file)}: ${contentPattern.source}`);
          }
        }
      } catch (error) {
        // Skip files we can't read
      }
    }

    // Calculate confidence score
    const fileScore = Math.min(matchingFiles.length / pattern.files.length, 1) * 0.3;
    const contentScore = totalContentChecks > 0 ? (contentMatches / (pattern.contentPatterns.length * totalContentChecks)) * 0.7 : 0;
    
    result.confidence = fileScore + contentScore;
    result.detected = result.confidence > 0.1;

    return result;
  }

  /**
   * Get build strategy recommendations
   * @param {Object} detection - Detection result
   * @returns {Object} - Build strategy
   */
  getBuildStrategy(detection) {
    const strategies = {
      windows: {
        tools: ['build_dotnet'],
        requirements: ['.NET 6.0/8.0/9.0', 'Windows Desktop SDK'],
        commands: ['dotnet build', 'dotnet publish'],
        outputFormats: ['EXE', 'MSI'],
        testCommands: ['dotnet test']
      },
      'cross-platform': {
        tools: ['build_dotnet', 'build_python', 'build_nodejs'],
        requirements: ['.NET Core', 'Cross-platform runtime'],
        commands: ['dotnet build', 'dotnet publish'],
        outputFormats: ['DLL', 'Executable'],
        testCommands: ['dotnet test', 'npm test', 'pytest']
      },
      mac: {
        tools: ['build_dotnet'],
        requirements: ['.NET Core', 'Xamarin.Mac'],
        commands: ['dotnet build', 'msbuild'],
        outputFormats: ['APP', 'PKG'],
        testCommands: ['dotnet test']
      },
      docker: {
        tools: ['run_powershell'],
        requirements: ['Docker Engine', 'Container runtime'],
        commands: ['docker build', 'docker run'],
        outputFormats: ['Container Image'],
        testCommands: ['docker exec', 'docker-compose test']
      }
    };

    return strategies[detection.environment] || strategies['cross-platform'];
  }

  /**
   * Check if file is a project file
   * @param {string} filePath - File path
   * @returns {boolean} - True if project file
   */
  isProjectFile(filePath) {
    const projectExtensions = ['.csproj', '.sln', '.fsproj', '.vbproj', '.props', '.targets',
                              'package.json', 'requirements.txt', 'setup.py', 'Dockerfile'];
    return projectExtensions.some(ext => filePath.toLowerCase().endsWith(ext.toLowerCase()));
  }

  /**
   * Generate environment recommendation report
   * @param {Object} detection - Detection results
   * @returns {string} - Formatted report
   */
  generateReport(detection) {
    const report = [];
    
    report.push('🔍 Project Analysis Report');
    report.push('═'.repeat(50));
    
    if (detection.detectedTypes.length > 0) {
      report.push(`📊 Detected Project Types (${detection.detectedTypes.length}):`);
      detection.detectedTypes.forEach((type, index) => {
        const confidence = Math.round(type.confidence * 100);
        report.push(`   ${index + 1}. ${type.description} (${confidence}% confidence)`);
        report.push(`      Environment: ${type.environment.toUpperCase()}`);
        report.push(`      Evidence: ${type.evidence.length} items`);
      });
      
      report.push('');
      report.push(`🎯 Recommended Environment: ${detection.recommendedEnvironment.toUpperCase()}`);
      report.push(`🔒 Confidence Level: ${detection.confidence.toUpperCase()}`);
      
      if (detection.buildStrategy.tools) {
        report.push('');
        report.push('🛠️  Recommended Tools:');
        detection.buildStrategy.tools.forEach(tool => {
          report.push(`   • ${tool}`);
        });
      }
      
      if (detection.buildStrategy.requirements) {
        report.push('');
        report.push('📋 Requirements:');
        detection.buildStrategy.requirements.forEach(req => {
          report.push(`   • ${req}`);
        });
      }
      
    } else {
      report.push('❌ No specific project type detected');
      report.push('💡 Defaulting to cross-platform environment');
    }
    
    if (detection.analysis) {
      report.push('');
      report.push('📈 Analysis Summary:');
      report.push(`   • Total Files: ${detection.analysis.totalFiles}`);
      report.push(`   • Project Files: ${detection.analysis.projectFiles}`);
      report.push(`   • Windows-Specific: ${detection.analysis.hasWindowsSpecific ? '✅' : '❌'}`);
      report.push(`   • Cross-Platform: ${detection.analysis.hasCrossPlatform ? '✅' : '❌'}`);
      report.push(`   • Containerized: ${detection.analysis.hasContainerization ? '✅' : '❌'}`);
    }
    
    return report.join('\n');
  }
}

module.exports = ProjectDetector;