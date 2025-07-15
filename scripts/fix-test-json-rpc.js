#!/usr/bin/env node
/**
 * Fix JSON-RPC format in all test files
 * Updates test requests to include required jsonrpc and id fields
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const testsDir = path.join(__dirname, '..', 'tests');

// Find all test files
const testFiles = glob.sync(path.join(testsDir, '*.test.js'));

console.log(`Found ${testFiles.length} test files to update`);

let totalUpdates = 0;

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let updates = 0;

  // Pattern 1: Add jsonrpc and id to tools/call requests
  content = content.replace(
    /\.post\(['"`]\/tools\/call['"`]\)\s*\.send\(\{([^}]+)\}\)/g,
    (match, bodyContent) => {
      // Check if jsonrpc is already present
      if (bodyContent.includes('jsonrpc')) {
        return match;
      }
      updates++;
      // Add jsonrpc and id fields
      return `.post('/tools/call')
        .send({
          jsonrpc: '2.0',
          id: \`test-\${Date.now()}-\${Math.random()}\`,${bodyContent}
        })`;
    }
  );

  // Pattern 2: Add jsonrpc and id to tools/list requests
  content = content.replace(
    /\.post\(['"`]\/tools\/list['"`]\)\s*\.send\(\{([^}]+)\}\)/g,
    (match, bodyContent) => {
      // Check if jsonrpc is already present
      if (bodyContent.includes('jsonrpc')) {
        return match;
      }
      updates++;
      // Add jsonrpc and id fields
      return `.post('/tools/list')
        .send({
          jsonrpc: '2.0',
          id: \`test-\${Date.now()}-\${Math.random()}\`,${bodyContent}
        })`;
    }
  );

  // Pattern 3: Fix empty send() calls
  content = content.replace(
    /\.post\(['"`]\/tools\/list['"`]\)\s*\.send\(\s*\)/g,
    `.post('/tools/list')
        .send({
          jsonrpc: '2.0',
          id: \`test-\${Date.now()}-\${Math.random()}\`,
          method: 'tools/list',
          params: {}
        })`
  );

  // Pattern 4: Update response expectations from body.content to body.result.content
  content = content.replace(
    /expect\(response\.body\.content\[0\]\.text\)/g,
    'expect(response.body.result.content[0].text)'
  );

  // Pattern 5: Update response expectations from body.tools to body.result.tools
  content = content.replace(
    /expect\(response\.body\.tools\)/g,
    'expect(response.body.result.tools)'
  );

  // Pattern 6: Update error response checks
  content = content.replace(
    /expect\(response\.body\.error\)/g,
    'expect(response.body.error)'
  );

  if (updates > 0 || content !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${path.basename(file)} with ${updates} changes`);
    totalUpdates += updates;
  }
});

console.log(`\nTotal updates made: ${totalUpdates}`);
console.log('JSON-RPC format fixes completed!');