# Detailed Setup Guide

## Table of Contents
1. [Windows VM Setup](#windows-vm-setup)
2. [Mac Client Setup](#mac-client-setup)
3. [Security Configuration](#security-configuration)
4. [Testing the Connection](#testing-the-connection)
5. [Advanced Configuration](#advanced-configuration)

## Windows VM Setup

### Prerequisites
- Windows 11 (or Windows 10)
- Administrator access
- PowerShell 5.1 or higher

### Step 1: Download Files

1. Mount or copy this repository to your Windows VM
2. Navigate to the directory in PowerShell:
   ```powershell
   cd C:\path\to\windows-mcp
   ```

### Step 2: Run Setup Script

1. Open PowerShell as Administrator
2. Allow script execution:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. Run the setup script:
   ```powershell
   .\windows-setup.ps1
   ```

The script will:
- Install Chocolatey package manager
- Install Node.js and Git
- Create the MCP server directory
- Install required npm packages
- Configure Windows Firewall

### Step 3: Configure the Server

1. Navigate to the server directory:
   ```powershell
   cd C:\mcp-server
   ```

2. Edit the `.env` file:
   ```powershell
   notepad .env
   ```

3. Set your configuration:
   ```env
   # Required
   WINDOWS_VM_IP=192.168.64.3  # Your VM's IP
   MCP_SERVER_PORT=8080
   
   # Required for production
   MCP_AUTH_TOKEN=your-generated-token-here
   
   # Optional security
   ALLOWED_IPS=192.168.64.2  # Your Mac's IP
   ```

### Step 4: Generate Auth Token

Using Git Bash or WSL:
```bash
openssl rand -hex 32
```

Or using PowerShell:
```powershell
-join ((1..32) | ForEach {'{0:X}' -f (Get-Random -Max 256)})
```

### Step 5: Start the Server

```powershell
npm start
```

You should see:
```
MCP server (HTTP) running on http://0.0.0.0:8080
Health check: http://192.168.64.3:8080/health
MCP endpoint: http://192.168.64.3:8080/mcp
```

## Mac Client Setup

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd windows-mcp

# Install dependencies
npm install
```

### Step 2: Configure Connection

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:
   ```bash
   nano .env
   ```

3. Add your configuration:
   ```env
   WINDOWS_VM_IP=192.168.64.3
   MCP_SERVER_PORT=8080
   MCP_AUTH_TOKEN=your-token-from-windows-setup
   ```

### Step 3: Add to Claude Code

```bash
# Add as user-level server (available in all projects)
claude mcp add --user windows-build-server

# Or add as project-level server
claude mcp add --project windows-build-server
```

### Step 4: Verify Installation

```bash
claude mcp list
```

## Security Configuration

### Basic Security (Development)

Minimum configuration for local development:
```env
MCP_AUTH_TOKEN=any-random-string
```

### Production Security

For production or internet-exposed servers:

1. **Strong Authentication Token:**
   ```bash
   openssl rand -hex 32
   ```

2. **IP Whitelisting:**
   ```env
   ALLOWED_IPS=192.168.1.100,192.168.1.101
   ```

3. **HTTPS Configuration:**
   
   Generate self-signed certificate:
   ```powershell
   # In Git Bash or WSL
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
   ```
   
   Update `.env`:
   ```env
   ENABLE_HTTPS=true
   HTTPS_CERT_PATH=C:\mcp-server\cert.pem
   HTTPS_KEY_PATH=C:\mcp-server\key.pem
   ```

## Testing the Connection

### 1. Test Server Health

From Mac:
```bash
curl http://192.168.64.3:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "server": "windows-build-server",
  "version": "1.0.0",
  "secure": true
}
```

### 2. Test with Claude Code

```bash
# List available tools
claude "What tools does @windows-build-server provide?"

# Test PowerShell command
claude "@windows-build-server run_powershell command='Get-Date'"

# Test .NET build (if you have a project)
claude "@windows-build-server build_dotnet projectPath='C:\\projects\\test.csproj'"
```

## Advanced Configuration

### Custom Build Tools

To add custom build tools, edit `secure-server.js`:

```javascript
// Add to tools array
{
  name: 'build_python',
  description: 'Run Python scripts',
  inputSchema: {
    type: 'object',
    properties: {
      scriptPath: { type: 'string' }
    },
    required: ['scriptPath']
  }
}

// Add to switch statement
case 'build_python':
  result = await executeBuild('python', [args.scriptPath]);
  break;
```

### Logging Configuration

```env
# Options: error, warn, info, debug
LOG_LEVEL=debug
```

### Performance Tuning

```env
# Increase timeout for large builds (milliseconds)
BUILD_TIMEOUT=600000  # 10 minutes

# Increase output limit (bytes)
MAX_OUTPUT_SIZE=5000000  # 5MB
```

## Common Issues

### "Cannot connect to server"

1. Check Windows Firewall:
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 8080
   ```

2. Verify server is running:
   ```powershell
   netstat -an | findstr :8080
   ```

### "Unauthorized" errors

1. Ensure auth tokens match in both .env files
2. Check token doesn't have extra spaces
3. Verify header format in requests

### "Command not allowed"

Only safe PowerShell commands are allowed by default. To add more:
1. Edit `secure-server.js`
2. Add to `safeCommands` array
3. Restart server

## Next Steps

1. **Add more build tools** - Extend the server for your specific needs
2. **Set up CI/CD** - Integrate with your build pipeline
3. **Monitor usage** - Add logging and metrics
4. **Automate startup** - Configure as Windows service