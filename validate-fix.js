#!/usr/bin/env node

/**
 * Validation Script for v1.0.32 Critical Regression Fix
 * Validates the PowerShell parameter fix without requiring server startup
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating v1.0.32 Critical Regression Fix');
console.log('=' .repeat(50));
console.log('');

// 1. Verify invalid parameters are removed
const powershellEnhancedPath = path.join(__dirname, 'server', 'src', 'utils', 'powershell-enhanced.js');

if (!fs.existsSync(powershellEnhancedPath)) {
  console.log('❌ powershell-enhanced.js not found');
  process.exit(1);
}

const content = fs.readFileSync(powershellEnhancedPath, 'utf8');

console.log('1. 🔧 Checking for invalid parameters removal...');

// Check for the problematic parameters that caused the regression
const hasInvalidOutputEncoding = content.includes("'-OutputEncoding', 'UTF8'");
const hasInvalidInputFormat = content.includes("'-InputFormat', 'Text'");

if (hasInvalidOutputEncoding) {
  console.log('   ❌ FAIL: Invalid -OutputEncoding parameter still present');
  console.log('   This would cause: "The term \'-OutputEncoding\' is not recognized"');
} else {
  console.log('   ✅ PASS: Invalid -OutputEncoding parameter removed');
}

if (hasInvalidInputFormat) {
  console.log('   ❌ FAIL: Invalid -InputFormat parameter still present');
  console.log('   This would cause: "The term \'-InputFormat\' is not recognized"');
} else {
  console.log('   ✅ PASS: Invalid -InputFormat parameter removed');
}

console.log('');

// 2. Verify correct UTF-8 implementation is preserved
console.log('2. 🌐 Checking UTF-8 encoding implementation...');

const hasConsoleOutputEncoding = content.includes('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
const hasConsoleInputEncoding = content.includes('[Console]::InputEncoding = [System.Text.Encoding]::UTF8');
const hasOutputEncodingVar = content.includes('$OutputEncoding = [System.Text.Encoding]::UTF8');

if (hasConsoleOutputEncoding) {
  console.log('   ✅ PASS: Console.OutputEncoding UTF-8 setup present');
} else {
  console.log('   ❌ FAIL: Console.OutputEncoding UTF-8 setup missing');
}

if (hasConsoleInputEncoding) {
  console.log('   ✅ PASS: Console.InputEncoding UTF-8 setup present');
} else {
  console.log('   ❌ FAIL: Console.InputEncoding UTF-8 setup missing');
}

if (hasOutputEncodingVar) {
  console.log('   ✅ PASS: $OutputEncoding variable setup present');
} else {
  console.log('   ❌ FAIL: $OutputEncoding variable setup missing');
}

console.log('');

// 3. Check PowerShell command structure
console.log('3. ⚙️  Checking PowerShell command structure...');

const hasNoProfile = content.includes("'-NoProfile'");
const hasNonInteractive = content.includes("'-NonInteractive'");
const hasExecutionPolicy = content.includes("'-ExecutionPolicy', 'Bypass'");
const hasCommand = content.includes("'-Command'");

if (hasNoProfile && hasNonInteractive && hasExecutionPolicy && hasCommand) {
  console.log('   ✅ PASS: Correct PowerShell arguments structure');
} else {
  console.log('   ❌ FAIL: PowerShell arguments structure incomplete');
  console.log(`      NoProfile: ${hasNoProfile}`);
  console.log(`      NonInteractive: ${hasNonInteractive}`);
  console.log(`      ExecutionPolicy: ${hasExecutionPolicy}`);
  console.log(`      Command: ${hasCommand}`);
}

console.log('');

// 4. Verify test files exist
console.log('4. 🧪 Checking test implementation...');

const testPath = path.join(__dirname, 'tests', 'critical-regression-fix.test.js');
if (fs.existsSync(testPath)) {
  const testContent = fs.readFileSync(testPath, 'utf8');
  const testCount = (testContent.match(/test\(/g) || []).length;
  console.log(`   ✅ PASS: Test file exists with ${testCount} test cases`);
} else {
  console.log('   ❌ FAIL: Test file missing');
}

console.log('');

// 5. Version check
console.log('5. 📋 Checking version information...');

const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const packageContent = fs.readFileSync(packagePath, 'utf8');
  const packageData = JSON.parse(packageContent);
  
  if (packageData.version === '1.0.32') {
    console.log('   ✅ PASS: Version updated to 1.0.32');
  } else {
    console.log(`   ❌ FAIL: Version is ${packageData.version}, expected 1.0.32`);
  }
} else {
  console.log('   ❌ FAIL: package.json not found');
}

console.log('');

// Summary
console.log('🏁 Validation Summary');
console.log('=' .repeat(50));

const allChecks = [
  !hasInvalidOutputEncoding,
  !hasInvalidInputFormat,
  hasConsoleOutputEncoding,
  hasConsoleInputEncoding,
  hasOutputEncodingVar,
  hasNoProfile && hasNonInteractive && hasExecutionPolicy && hasCommand,
  fs.existsSync(testPath)
];

const passedChecks = allChecks.filter(Boolean).length;
const totalChecks = allChecks.length;

console.log(`✅ Passed: ${passedChecks}/${totalChecks} checks`);

if (passedChecks === totalChecks) {
  console.log('');
  console.log('🎉 ALL VALIDATIONS PASSED!');
  console.log('✅ Critical regression fix v1.0.32 is correctly implemented');
  console.log('✅ Invalid PowerShell parameters removed');
  console.log('✅ UTF-8 encoding properly preserved');
  console.log('✅ Command structure is correct');
  console.log('✅ Tests are in place');
  console.log('');
  console.log('🚀 Ready for deployment - AIServer Enterprise v2.0 unblocked!');
} else {
  console.log('');
  console.log('⚠️  VALIDATION ISSUES DETECTED');
  console.log('❌ Some checks failed - manual review required');
}

console.log('');