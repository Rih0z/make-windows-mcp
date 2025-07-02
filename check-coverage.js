#!/usr/bin/env node
const { execSync } = require('child_process');

console.log('Running coverage tests...\n');

try {
  // Run tests with coverage
  const output = execSync('npm test -- --coverage --silent', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Extract coverage summary
  const lines = output.split('\n');
  const summaryIndex = lines.findIndex(line => line.includes('Coverage summary'));
  
  if (summaryIndex !== -1) {
    console.log('Coverage Report:');
    console.log('================');
    for (let i = summaryIndex + 1; i < lines.length && i < summaryIndex + 6; i++) {
      if (lines[i].trim()) {
        console.log(lines[i]);
      }
    }
  }
  
  // Check if coverage is 100%
  const coverageMatch = output.match(/Statements\s*:\s*([\d.]+)%/);
  if (coverageMatch) {
    const coverage = parseFloat(coverageMatch[1]);
    console.log(`\nStatement Coverage: ${coverage}%`);
    
    if (coverage === 100) {
      console.log('✅ Coverage goal achieved! 100%');
    } else {
      console.log(`❌ Coverage is ${coverage}%, not yet 100%`);
    }
  }
} catch (error) {
  console.error('Error running tests:', error.message);
  
  // Try to extract any coverage info from error output
  const errorOutput = error.stdout || error.output?.join('') || '';
  const coverageMatch = errorOutput.match(/Statements\s*:\s*([\d.]+)%/);
  if (coverageMatch) {
    console.log(`\nCurrent coverage: ${coverageMatch[1]}%`);
  }
}