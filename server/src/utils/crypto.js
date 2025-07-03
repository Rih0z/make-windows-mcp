const crypto = require('crypto');

class CryptoManager {
  constructor() {
    // Use a derived key from environment or generate one
    this.algorithm = 'aes-256-gcm';
    this.saltLength = 32;
    this.tagLength = 16;
    this.ivLength = 16;
    this.iterations = 100000;
    this.keyLength = 32;
    
    // Initialize encryption key
    this.initializeKey();
  }

  initializeKey() {
    const masterKey = process.env.ENCRYPTION_KEY || process.env.MCP_AUTH_TOKEN;
    
    if (!masterKey) {
      // Generate a warning - in production, this should be set
      console.warn('⚠️  No ENCRYPTION_KEY set. SSH passwords will be stored in plaintext.');
      this.encryptionEnabled = false;
      return;
    }
    
    // Derive a key from the master key
    const salt = crypto.createHash('sha256').update('mcp-ssh-salt').digest();
    this.key = crypto.pbkdf2Sync(masterKey, salt, this.iterations, this.keyLength, 'sha256');
    this.encryptionEnabled = true;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    if (!this.encryptionEnabled || !text) {
      return text;
    }

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv, tag, and encrypted data
      const combined = Buffer.concat([
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);
      
      return 'enc:' + combined.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error.message);
      return text;
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedText) {
    if (!this.encryptionEnabled || !encryptedText || !encryptedText.startsWith('enc:')) {
      return encryptedText;
    }

    try {
      const combined = Buffer.from(encryptedText.slice(4), 'base64');
      
      const iv = combined.slice(0, this.ivLength);
      const tag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.slice(this.ivLength + this.tagLength);
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error.message);
      throw new Error('Failed to decrypt credentials');
    }
  }

  /**
   * Hash sensitive data for logging (one-way)
   */
  hashForLogging(data) {
    if (!data) return 'null';
    
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash.substring(0, 8) + '...';
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const issues = [];
    
    if (password.length < minLength) {
      issues.push(`Password must be at least ${minLength} characters long`);
    }
    
    if (!hasUpperCase) {
      issues.push('Password must contain at least one uppercase letter');
    }
    
    if (!hasLowerCase) {
      issues.push('Password must contain at least one lowercase letter');
    }
    
    if (!hasNumbers) {
      issues.push('Password must contain at least one number');
    }
    
    if (!hasSpecialChar) {
      issues.push('Password must contain at least one special character');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

module.exports = new CryptoManager();