/**
 * Authentication Test Utility
 * Comprehensive testing for authentication stability
 */

const authManager = require('./auth-manager');

class AuthTest {
  constructor() {
    this.testResults = [];
  }
  
  /**
   * Run comprehensive authentication tests
   */
  async runAllTests() {
    console.log('🧪 Starting comprehensive authentication tests...\n');
    
    await this.testTokenExtraction();
    await this.testTokenValidation();
    await this.testSecurityFeatures();
    await this.testConcurrency();
    await this.testEdgeCases();
    
    this.reportResults();
  }
  
  /**
   * Test token extraction functionality
   */
  async testTokenExtraction() {
    console.log('📋 Testing token extraction...');
    
    const testCases = [
      { input: 'Bearer JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd', expected: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd' },
      { input: 'bearer JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd', expected: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd' },
      { input: ' Bearer  JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd ', expected: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd' },
      { input: 'BEARER JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd', expected: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd' },
      { input: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd', expected: 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd' },
      { input: '', expected: null },
      { input: null, expected: null },
      { input: undefined, expected: null },
      { input: 'Bearer ', expected: null },
      { input: 'InvalidFormat', expected: 'InvalidFormat' }
    ];
    
    let passed = 0;
    for (const test of testCases) {
      const result = authManager.extractToken(test.input);
      const success = result === test.expected;
      
      if (success) {
        passed++;
      } else {
        console.log(`❌ Failed: input="${test.input}" expected="${test.expected}" got="${result}"`);
      }
    }
    
    this.testResults.push({
      name: 'Token Extraction',
      passed,
      total: testCases.length,
      success: passed === testCases.length
    });
    
    console.log(`✅ Token extraction: ${passed}/${testCases.length} tests passed\n`);
  }
  
  /**
   * Test token validation functionality
   */
  async testTokenValidation() {
    console.log('🔐 Testing token validation...');
    
    const validToken = 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd';
    const testCases = [
      { token: validToken, expected: true },
      { token: 'invalidtoken', expected: false },
      { token: '', expected: false },
      { token: null, expected: false },
      { token: undefined, expected: false },
      { token: validToken + 'extra', expected: false },
      { token: validToken.substring(1), expected: false }
    ];
    
    let passed = 0;
    for (const test of testCases) {
      const result = authManager.validateToken(test.token);
      const success = result === test.expected;
      
      if (success) {
        passed++;
      } else {
        console.log(`❌ Failed: token="${test.token}" expected="${test.expected}" got="${result}"`);
      }
    }
    
    this.testResults.push({
      name: 'Token Validation',
      passed,
      total: testCases.length,
      success: passed === testCases.length
    });
    
    console.log(`✅ Token validation: ${passed}/${testCases.length} tests passed\n`);
  }
  
  /**
   * Test security features
   */
  async testSecurityFeatures() {
    console.log('🔒 Testing security features...');
    
    let passed = 0;
    const total = 4;
    
    // Test secure comparison
    const result1 = authManager.secureCompare('test', 'test');
    const result2 = authManager.secureCompare('test', 'different');
    const result3 = authManager.secureCompare('', '');
    const result4 = authManager.secureCompare(null, 'test');
    
    if (result1 === true) passed++;
    else console.log('❌ Secure compare failed for identical strings');
    
    if (result2 === false) passed++;
    else console.log('❌ Secure compare failed for different strings');
    
    if (result3 === true) passed++;
    else console.log('❌ Secure compare failed for empty strings');
    
    if (result4 === false) passed++;
    else console.log('❌ Secure compare failed for null input');
    
    this.testResults.push({
      name: 'Security Features',
      passed,
      total,
      success: passed === total
    });
    
    console.log(`✅ Security features: ${passed}/${total} tests passed\n`);
  }
  
  /**
   * Test concurrency and race conditions
   */
  async testConcurrency() {
    console.log('⚡ Testing concurrency...');
    
    const validToken = 'JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd';
    const concurrentRequests = 100;
    
    const promises = [];
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(new Promise((resolve) => {
        const token = authManager.extractToken(`Bearer ${validToken}`);
        const isValid = authManager.validateToken(token);
        resolve(isValid);
      }));
    }
    
    const results = await Promise.all(promises);
    const passed = results.filter(r => r === true).length;
    
    this.testResults.push({
      name: 'Concurrency',
      passed,
      total: concurrentRequests,
      success: passed === concurrentRequests
    });
    
    console.log(`✅ Concurrency: ${passed}/${concurrentRequests} tests passed\n`);
  }
  
  /**
   * Test edge cases and error conditions
   */
  async testEdgeCases() {
    console.log('🔍 Testing edge cases...');
    
    let passed = 0;
    let total = 0;
    
    // Test partial token generation
    total++;
    const partial1 = authManager.getPartialToken('JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd');
    if (partial1 === 'JIGr...DUEd') {
      passed++;
    } else {
      console.log(`❌ Partial token failed: got "${partial1}"`);
    }
    
    // Test short token
    total++;
    const partial2 = authManager.getPartialToken('short');
    if (partial2 === 'too short') {
      passed++;
    } else {
      console.log(`❌ Short token failed: got "${partial2}"`);
    }
    
    // Test null token
    total++;
    const partial3 = authManager.getPartialToken(null);
    if (partial3 === 'null') {
      passed++;
    } else {
      console.log(`❌ Null token failed: got "${partial3}"`);
    }
    
    this.testResults.push({
      name: 'Edge Cases',
      passed,
      total,
      success: passed === total
    });
    
    console.log(`✅ Edge cases: ${passed}/${total} tests passed\n`);
  }
  
  /**
   * Report test results
   */
  reportResults() {
    console.log('📊 Test Results Summary:');
    console.log('═'.repeat(50));
    
    let allPassed = true;
    for (const result of this.testResults) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.name}: ${result.passed}/${result.total}`);
      
      if (!result.success) {
        allPassed = false;
      }
    }
    
    console.log('═'.repeat(50));
    console.log(allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed!');
    
    return allPassed;
  }
}

// Export for use in tests
module.exports = AuthTest;

// Run tests if called directly
if (require.main === module) {
  const test = new AuthTest();
  test.runAllTests();
}