/**
 * Common utility functions to reduce code redundancy
 */

/**
 * Extract client IP address from request
 */
function getClientIP(req) {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
}

/**
 * Create standardized text result for MCP responses
 */
function createTextResult(message) {
  return {
    content: [{
      type: 'text',
      text: message
    }]
  };
}

/**
 * Handle validation errors consistently
 */
function handleValidationError(error, operation, logger, clientIP, context = {}) {
  logger.security(`${operation} validation failed`, { 
    clientIP, 
    error: error.message, 
    ...context 
  });
  return createTextResult(`Validation error: ${error.message}`);
}

/**
 * Parse numeric environment variable with default value
 */
function getNumericEnv(varName, defaultValue) {
  const value = parseInt(process.env[varName]);
  return isNaN(value) ? defaultValue : value;
}

/**
 * Create directory if not exists command for Windows
 */
function createDirCommand(dirPath) {
  return `if not exist "${dirPath}" mkdir "${dirPath}"`;
}

/**
 * Execute command locally or remotely based on remoteHost parameter
 */
async function executeCommand(args, command, executeBuild, executeRemoteCommand, security) {
  if (args.remoteHost) {
    const validatedHost = security.validateIPAddress(args.remoteHost);
    return await executeRemoteCommand(validatedHost, command);
  } else {
    return await executeBuild(command.cmd, command.args);
  }
}

module.exports = {
  getClientIP,
  createTextResult,
  handleValidationError,
  getNumericEnv,
  createDirCommand,
  executeCommand
};