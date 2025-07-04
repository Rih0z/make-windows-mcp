#!/usr/bin/env node

// Simple server test without mocks
process.env.MCP_AUTH_TOKEN = 'test-token';
process.env.ENABLE_DANGEROUS_MODE = 'false';
process.env.NODE_ENV = 'test';

try {
  console.log('Loading server...');
  const app = require('./server/src/server');
  console.log('Server loaded successfully');
  
  const port = 3001;
  const server = app.listen(port, () => {
    console.log(`Test server running on port ${port}`);
    console.log('Shutting down...');
    server.close();
    process.exit(0);
  });
} catch (error) {
  console.error('Server startup error:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}