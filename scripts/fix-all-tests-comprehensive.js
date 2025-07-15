#!/usr/bin/env node
/**
 * Comprehensive test fix script - fixes all remaining issues
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

  // Fix 1: Update .tools array access when it's NOT already .result.tools
  content = content.replace(/(?<!\.result)\.tools\s*(?=\.map|\.find|\.filter|\.length|\.forEach|\[)/g, (match) => {
    fixes++;
    return '.result.tools';
  });

  // Fix 2: Fix standalone response.body.tools references
  content = content.replace(/response\.body\.tools(?!\s*=)/g, (match) => {
    // Don't replace if it's already response.body.result.tools
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'response.body.result.tools';
    }
    return match;
  });

  // Fix 3: Fix content array access
  content = content.replace(/response\.body\.content(?!\s*=)/g, (match) => {
    // Don't replace if it's already response.body.result.content
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'response.body.result.content';
    }
    return match;
  });

  // Fix 4: Fix expect statements for tools property
  content = content.replace(/expect\(response\.body\)\.toHaveProperty\(['"`]tools['"`]\)/g, (match) => {
    fixes++;
    return "expect(response.body.result).toHaveProperty('tools')";
  });

  // Fix 5: Fix expect statements for content property
  content = content.replace(/expect\(response\.body\)\.toHaveProperty\(['"`]content['"`]\)/g, (match) => {
    fixes++;
    return "expect(response.body.result).toHaveProperty('content')";
  });

  // Fix 6: Fix tools array indexing
  content = content.replace(/response\.body\.tools\[(\d+)\]/g, (match, index) => {
    if (!match.includes('result')) {
      fixes++;
      return `response.body.result.tools[${index}]`;
    }
    return match;
  });

  // Fix 7: Fix .body.error.message pattern
  content = content.replace(/response\.body\.message/g, (match) => {
    fixes++;
    return 'response.body.error.message';
  });

  // Fix 8: Fix expect(response.body.content) to expect(response.body.result.content)
  content = content.replace(/expect\(response\.body\.content\)/g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'expect(response.body.result.content)';
    }
    return match;
  });

  // Fix 9: Fix expect(response.body.tools) to expect(response.body.result.tools)
  content = content.replace(/expect\(response\.body\.tools\)/g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'expect(response.body.result.tools)';
    }
    return match;
  });

  // Fix 10: Fix .body.tools. direct property access
  content = content.replace(/\.body\.tools\./g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return '.body.result.tools.';
    }
    return match;
  });

  // Fix 11: Fix .body.content. direct property access
  content = content.replace(/\.body\.content\./g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return '.body.result.content.';
    }
    return match;
  });

  // Fix 12: Fix res.body patterns (shortened var names)
  content = content.replace(/res\.body\.tools/g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'res.body.result.tools';
    }
    return match;
  });

  content = content.replace(/res\.body\.content/g, (match) => {
    if (!content.substring(content.lastIndexOf(match) - 7, content.lastIndexOf(match)).includes('result')) {
      fixes++;
      return 'res.body.result.content';
    }
    return match;
  });

  // Save if changes were made
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Fixed ${path.basename(file)}: ${fixes} changes`);
    totalFixed += fixes;
  }
});

console.log(`\nTotal fixes applied: ${totalFixed}`);
console.log('Comprehensive test fixes completed!');