#!/usr/bin/env node

/**
 * Utility to encrypt passwords for secure storage in environment variables
 * Usage: node encrypt-password.js <password>
 */

const crypto = require('../src/utils/crypto');
const readline = require('readline');

async function getPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Hide password input
    rl.stdoutMuted = true;
    rl.question('Enter password to encrypt: ', (password) => {
      rl.close();
      console.log(''); // New line after password
      resolve(password);
    });

    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted)
        rl.output.write("*");
      else
        rl.output.write(stringToWrite);
    };
  });
}

async function main() {
  try {
    // Check if encryption is available
    if (!crypto.encryptionEnabled) {
      console.error('⚠️  Encryption is not available. Please set ENCRYPTION_KEY or MCP_AUTH_TOKEN environment variable.');
      process.exit(1);
    }

    // Get password from command line or prompt
    let password;
    if (process.argv[2]) {
      password = process.argv[2];
    } else {
      password = await getPassword();
    }

    if (!password) {
      console.error('❌ No password provided');
      process.exit(1);
    }

    // Validate password strength
    const validation = crypto.validatePasswordStrength(password);
    if (!validation.isValid) {
      console.warn('⚠️  Password does not meet security requirements:');
      validation.issues.forEach(issue => console.warn(`   - ${issue}`));
      console.warn('\nContinuing anyway...\n');
    }

    // Encrypt the password
    const encrypted = crypto.encrypt(password);
    
    console.log('✅ Password encrypted successfully!\n');
    console.log('Add this to your .env file:');
    console.log(`REMOTE_PASSWORD=${encrypted}`);
    console.log('\nThe password will be automatically decrypted when used.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}