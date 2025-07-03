const EventEmitter = require('events');

class MockProcess extends EventEmitter {
  constructor(exitCode = 0, stdout = '', stderr = '') {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = exitCode;
    this._stdout = stdout;
    this._stderr = stderr;
    this.killed = false;
    
    // Simulate process execution
    process.nextTick(() => {
      if (this._stdout) {
        this.stdout.emit('data', Buffer.from(this._stdout));
      }
      if (this._stderr) {
        this.stderr.emit('data', Buffer.from(this._stderr));
      }
      
      // Emit close event after data
      process.nextTick(() => {
        if (!this.killed) {
          this.emit('close', this.exitCode);
        }
      });
    });
  }
  
  kill(signal) {
    this.killed = true;
    this.emit('close', -1);
  }
}

// Helper to create spawn mock
function createSpawnMock(responses = {}) {
  return jest.fn((command, args) => {
    const key = `${command} ${args.join(' ')}`;
    
    // Default responses for common commands
    const defaultResponses = {
      'cmd.exe /c if not exist': { exitCode: 0, stdout: '' },
      'cmd.exe /c mkdir': { exitCode: 0, stdout: '' },
      'xcopy.exe': { exitCode: 0, stdout: '0 File(s) copied' },
      'dotnet.exe build': { exitCode: 0, stdout: 'Build successful' },
      'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command echo test': { 
        exitCode: 0, 
        stdout: 'test' 
      },
      'invalid-command': { exitCode: 1, stderr: 'Command not found' }
    };
    
    // Check for specific response or use default
    for (const [pattern, response] of Object.entries({ ...defaultResponses, ...responses })) {
      if (key.includes(pattern)) {
        return new MockProcess(
          response.exitCode || 0,
          response.stdout || '',
          response.stderr || ''
        );
      }
    }
    
    // Default mock process
    return new MockProcess(0, 'Default output');
  });
}

module.exports = {
  MockProcess,
  createSpawnMock
};