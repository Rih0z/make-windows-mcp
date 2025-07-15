#!/usr/bin/env node
/**
 * Fix remaining test issues - comprehensive fix
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const testsDir = path.join(__dirname, '..', 'tests');

// Find all test files
const testFiles = glob.sync(path.join(testsDir, '*.test.js'));

console.log(`Processing ${testFiles.length} test files for comprehensive fixes`);

let totalFixed = 0;

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  let fixes = 0;

  // Fix 1: Add jsonrpc and id to all MCP requests that don't have them
  content = content.replace(
    /\.send\(\{([^}]+(?:method\s*:\s*['"`]tools\/(?:call|list)['"`])[^}]+)\}\)/gms,
    (match, bodyContent) => {
      // Check if jsonrpc is already present
      if (bodyContent.includes('jsonrpc')) {
        return match;
      }
      fixes++;
      
      // Extract indentation
      const lines = bodyContent.split('\n');
      const indent = lines[0].match(/^\s*/)[0];
      
      return `.send({${indent}jsonrpc: '2.0',${indent}id: \`test-\${Date.now()}-\${Math.random()}\`,${bodyContent}})`;
    }
  );

  // Fix 2: Update response.body.tools to response.body.result.tools
  content = content.replace(/response\.body\.tools(?!\.)/g, (match) => {
    fixes++;
    return 'response.body.result.tools';
  });

  // Fix 3: Update response.body.content to response.body.result.content
  content = content.replace(/response\.body\.content(?!\.)/g, (match) => {
    fixes++;
    return 'response.body.result.content';
  });

  // Fix 4: Fix specific tool names
  const toolNameFixes = {
    'execute_powershell': 'run_powershell',
    'build_project': 'build_dotnet'
  };

  Object.entries(toolNameFixes).forEach(([oldName, newName]) => {
    const regex = new RegExp(`name:\\s*['"\`]${oldName}['"\`]`, 'g');
    content = content.replace(regex, (match) => {
      fixes++;
      return `name: '${newName}'`;
    });
  });

  // Fix 5: Add missing result property access in expect statements
  content = content.replace(
    /expect\(response\.body\)\.toHaveProperty\(['"`]tools['"`]\)/g,
    (match) => {
      fixes++;
      return "expect(response.body.result).toHaveProperty('tools')";
    }
  );

  // Fix 6: Fix array access patterns
  content = content.replace(
    /response\.body\.tools\[(\d+)\]/g,
    (match, index) => {
      fixes++;
      return `response.body.result.tools[${index}]`;
    }
  );

  // Fix 7: Fix error message paths
  content = content.replace(
    /response\.body\.message/g,
    (match) => {
      fixes++;
      return 'response.body.error.message';
    }
  );

  // Fix 8: Add complete JSON-RPC structure to tools/list calls
  content = content.replace(
    /\.send\(\{\s*(method\s*:\s*['"`]tools\/list['"`])\s*\}\)/g,
    (match, method) => {
      fixes++;
      return `.send({
          jsonrpc: '2.0',
          id: \`test-\${Date.now()}-\${Math.random()}\`,
          ${method},
          params: {}
        })`;
    }
  );

  // Save if changes were made
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Fixed ${path.basename(file)}: ${fixes} changes`);
    totalFixed += fixes;
  }
});

console.log(`\nTotal fixes applied: ${totalFixed}`);
console.log('Test fixes completed!');