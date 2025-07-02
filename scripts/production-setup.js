#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class ProductionSetup {
  constructor() {
    this.envPath = path.join(__dirname, '..', '.env');
    this.requiredSettings = [
      'MCP_AUTH_TOKEN',
      'ALLOWED_IPS',
      'ALLOWED_BUILD_PATHS'
    ];
  }

  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  validateProductionSettings() {
    if (!fs.existsSync(this.envPath)) {
      console.error('❌ .env file not found. Please create it from .env.example');
      return false;
    }

    const envContent = fs.readFileSync(this.envPath, 'utf8');
    const missingSettings = [];

    for (const setting of this.requiredSettings) {
      const regex = new RegExp(`^${setting}=(.+)$`, 'm');
      const match = envContent.match(regex);
      
      if (!match || !match[1] || match[1].trim() === '') {
        missingSettings.push(setting);
      }
    }

    if (missingSettings.length > 0) {
      console.error('❌ Missing required production settings:');
      missingSettings.forEach(setting => {
        console.error(`   - ${setting}`);
      });
      return false;
    }

    return true;
  }

  checkSecuritySettings() {
    const envContent = fs.readFileSync(this.envPath, 'utf8');
    const warnings = [];

    // Check for default/weak auth token
    const tokenMatch = envContent.match(/^MCP_AUTH_TOKEN=(.+)$/m);
    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1].trim();
      if (token === 'change-this-to-a-secure-random-token' || token.length < 32) {
        warnings.push('MCP_AUTH_TOKEN is weak or default. Use: openssl rand -hex 32');
      }
    }

    // Check if IP whitelist is configured
    const ipMatch = envContent.match(/^ALLOWED_IPS=(.+)$/m);
    if (!ipMatch || !ipMatch[1] || ipMatch[1].trim() === '') {
      warnings.push('ALLOWED_IPS is not configured. Consider restricting access to specific IP addresses');
    }

    // Check logging level
    const logMatch = envContent.match(/^LOG_LEVEL=(.+)$/m);
    if (logMatch && logMatch[1] && logMatch[1].trim() === 'debug') {
      warnings.push('LOG_LEVEL is set to debug. Consider using "info" or "warn" for production');
    }

    return warnings;
  }

  setupProductionEnvironment() {
    console.log('🔧 Setting up production environment...\n');

    // Validate settings
    if (!this.validateProductionSettings()) {
      console.log('\n📝 To fix missing settings:');
      console.log('1. Copy .env.example to .env: cp .env.example .env');
      console.log('2. Edit .env with your production values');
      console.log('3. Generate secure token: openssl rand -hex 32');
      console.log('4. Set ALLOWED_IPS to your client IP addresses');
      console.log('5. Configure ALLOWED_BUILD_PATHS appropriately');
      process.exit(1);
    }

    // Check for security warnings
    const warnings = this.checkSecuritySettings();
    if (warnings.length > 0) {
      console.log('⚠️  Security warnings:');
      warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
      console.log('');
    }

    // Create logs directory
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('✅ Created logs directory');
    }

    // Create SSL directory if HTTPS is enabled
    const envContent = fs.readFileSync(this.envPath, 'utf8');
    const httpsMatch = envContent.match(/^ENABLE_HTTPS=(.+)$/m);
    if (httpsMatch && httpsMatch[1] && httpsMatch[1].trim() === 'true') {
      const sslDir = path.join(__dirname, '..', 'ssl');
      if (!fs.existsSync(sslDir)) {
        fs.mkdirSync(sslDir, { recursive: true });
        console.log('✅ Created SSL directory');
        console.log('   Please place your SSL certificate and key files in the ssl/ directory');
      }
    }

    console.log('✅ Production environment setup completed');
    
    if (warnings.length === 0) {
      console.log('🎉 All security settings look good!');
    } else {
      console.log('⚠️  Please review and fix the security warnings above');
    }

    console.log('\n🚀 Ready for production deployment');
    console.log('\nNext steps:');
    console.log('1. Run tests: npm test');
    console.log('2. Start server: npm start');
    console.log('3. Monitor logs in logs/ directory');
  }

  generateProductionEnv() {
    console.log('🔧 Generating production .env file...\n');

    const token = this.generateSecureToken();
    
    const productionEnv = `# === Windows MCP Server Production Configuration ===
# Generated on ${new Date().toISOString()}

# === Local Windows VM Settings ===
WINDOWS_VM_IP=YOUR_WINDOWS_VM_IP
MCP_SERVER_PORT=8080

# === NordVPN Mesh Network Settings ===
NORDVPN_ENABLED=false
NORDVPN_HOSTS=
REMOTE_USERNAME=Administrator
REMOTE_PASSWORD=
SSH_TIMEOUT=30000
MAX_CONNECTIONS=5

# === Security Settings (REQUIRED for production) ===
MCP_AUTH_TOKEN=${token}

# === IP Whitelist (REQUIRED for production) ===
# Add your client IP addresses here
ALLOWED_IPS=192.168.1.0/24

# === Path Restrictions ===
ALLOWED_BUILD_PATHS=C:\\projects\\,D:\\builds\\

# === CORS Settings ===
ALLOWED_ORIGINS=

# === Logging ===
LOG_LEVEL=info

# === Rate Limiting ===
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60000

# === SSL/TLS ===
ENABLE_HTTPS=false
SSL_CERT_PATH=
SSL_KEY_PATH=

# === Monitoring ===
ENABLE_SECURITY_MONITORING=true
MAX_LOG_SIZE=10485760
MAX_LOG_FILES=5

# === Performance ===
COMMAND_TIMEOUT=300000
MAX_SSH_CONNECTIONS=5
`;

    const outputPath = path.join(__dirname, '..', '.env.production');
    fs.writeFileSync(outputPath, productionEnv);
    
    console.log(`✅ Generated production .env file: ${outputPath}`);
    console.log('\n📝 Please review and update the following settings:');
    console.log('   - WINDOWS_VM_IP: Set to your Windows VM IP address');
    console.log('   - ALLOWED_IPS: Set to your client IP addresses');
    console.log('   - REMOTE_PASSWORD: Set if using NordVPN mesh network');
    console.log('\n🔒 Secure token generated automatically');
    console.log(`   Token: ${token}`);
  }
}

// CLI interface
const setup = new ProductionSetup();

const command = process.argv[2];

switch (command) {
  case 'check':
    console.log('🔍 Checking production readiness...\n');
    setup.setupProductionEnvironment();
    break;
    
  case 'generate':
    setup.generateProductionEnv();
    break;
    
  default:
    console.log('Windows MCP Server - Production Setup\n');
    console.log('Usage:');
    console.log('  node scripts/production-setup.js check    - Check production readiness');
    console.log('  node scripts/production-setup.js generate - Generate production .env file');
    console.log('');
    console.log('Examples:');
    console.log('  npm run production:check');
    console.log('  npm run production:generate');
}