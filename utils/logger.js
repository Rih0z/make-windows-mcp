const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logDir = path.join(__dirname, '..', 'logs');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    this.createLogDirectory();
  }

  createLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n`;
  }

  writeToFile(filename, message) {
    const filePath = path.join(this.logDir, filename);
    
    try {
      // Check file size and rotate if necessary
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > this.maxLogSize) {
          this.rotateLogFile(filePath);
        }
      }
      
      fs.appendFileSync(filePath, message);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  rotateLogFile(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    
    // Rotate existing files
    for (let i = this.maxLogFiles - 1; i > 0; i--) {
      const oldFile = path.join(dir, `${basename}.${i}${ext}`);
      const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
      
      if (fs.existsSync(oldFile)) {
        if (i === this.maxLogFiles - 1) {
          fs.unlinkSync(oldFile); // Delete oldest file
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }
    
    // Move current file to .1
    const rotatedFile = path.join(dir, `${basename}.1${ext}`);
    fs.renameSync(filePath, rotatedFile);
  }

  error(message, metadata = {}) {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, metadata);
      console.error(formatted.trim());
      this.writeToFile('error.log', formatted);
      this.writeToFile('app.log', formatted);
    }
  }

  warn(message, metadata = {}) {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, metadata);
      console.warn(formatted.trim());
      this.writeToFile('app.log', formatted);
    }
  }

  info(message, metadata = {}) {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, metadata);
      console.log(formatted.trim());
      this.writeToFile('app.log', formatted);
    }
  }

  debug(message, metadata = {}) {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, metadata);
      console.log(formatted.trim());
      this.writeToFile('debug.log', formatted);
    }
  }

  // Security-specific logging
  security(event, details = {}) {
    const message = `SECURITY EVENT: ${event}`;
    const formatted = this.formatMessage('warn', message, details);
    console.warn(formatted.trim());
    this.writeToFile('security.log', formatted);
    this.writeToFile('app.log', formatted);
  }

  // Access logging for audit
  access(req, res, duration) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;
    
    const accessLog = {
      clientIP,
      method,
      url,
      status,
      duration,
      userAgent,
      timestamp: new Date().toISOString()
    };
    
    const message = `${clientIP} - ${method} ${url} ${status} ${duration}ms`;
    const formatted = this.formatMessage('info', message, { userAgent });
    this.writeToFile('access.log', formatted);
  }
}

module.exports = new Logger();