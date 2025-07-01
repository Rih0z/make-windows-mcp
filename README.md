# Windows MCP Build Server

A secure MCP (Model Context Protocol) server that enables Claude Code on macOS/Linux to build Windows applications remotely on a Windows VM. This project provides a bridge between cross-platform development environments and Windows-specific build tools.

## Features

- 🔨 **Remote .NET Builds** - Build .NET applications from any OS
- 💻 **Safe PowerShell Execution** - Run whitelisted PowerShell commands
- 🔒 **Secure Authentication** - Token-based authentication for production
- 🛡️ **Security First** - IP whitelisting, rate limiting, path restrictions
- 📝 **Comprehensive Logging** - Detailed request/response logging
- ⚡ **Easy Setup** - Automated installation scripts

## Prerequisites

- **Windows VM**: Windows 10/11 with PowerShell 5.1+
- **Client**: macOS/Linux with Claude Code CLI installed
- **Network**: Connectivity between client and Windows VM
- **Permissions**: Administrator access on Windows VM

## Quick Start

### 1. Windows VM Setup

```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\windows-setup.ps1

# Navigate to server directory
cd C:\mcp-server

# Copy server file from mounted directory
copy Z:\windows\server.js server.js /Y

# Start the server
npm start
```

### 2. Client Setup (Mac/Linux)

```bash
# Clone and setup
git clone https://github.com/yourusername/windows-mcp-build-server.git
cd windows-mcp-build-server
npm install

# Configure connection
cp .env.example .env
# Edit .env with your Windows VM IP
nano .env

# Add to Claude Code
claude mcp add --user windows-build-server
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `WINDOWS_VM_IP` | IP address of Windows VM | Yes | - |
| `MCP_SERVER_PORT` | Server port | No | 8080 |
| `MCP_AUTH_TOKEN` | Authentication token | Yes (production) | - |
| `ALLOWED_IPS` | Comma-separated allowed IPs | No | All |
| `ENABLE_HTTPS` | Enable HTTPS | No | false |
| `LOG_LEVEL` | Logging level | No | info |

### Security Best Practices

1. **Always use authentication in production:**
   ```bash
   # Generate a secure token
   openssl rand -hex 32
   ```

2. **Restrict IP access:**
   ```env
   ALLOWED_IPS=192.168.1.50,192.168.1.51
   ```

3. **Enable HTTPS for sensitive data:**
   ```env
   ENABLE_HTTPS=true
   HTTPS_CERT_PATH=C:\certs\server.crt
   HTTPS_KEY_PATH=C:\certs\server.key
   ```

## Usage

### Building .NET Applications

```bash
# In Claude Code conversation
@windows-build-server build_dotnet projectPath="Z:\\myproject\\app.csproj" configuration="Debug"
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" configuration="Release"
```

### Running PowerShell Commands

```bash
# Check .NET version
@windows-build-server run_powershell command="dotnet --version"

# List files
@windows-build-server run_powershell command="Get-ChildItem C:\\projects"

# Check running processes
@windows-build-server run_powershell command="Get-Process | Select-Object -First 5"
```

## Project Structure

```
.
├── scripts/
│   ├── mcp-client.js          # MCP client wrapper
│   └── configure.js           # Interactive setup
├── sample-apps/               # Example applications
│   ├── HelloWorld.cs          # .NET console app
│   └── HelloWorld.csproj
├── windows-setup.ps1          # Windows installer
├── secure-server.js           # MCP server implementation
├── claude-code-config.template.json  # Claude Code config
└── .env.example               # Environment template
```

## Troubleshooting

### Connection Issues

1. **Check firewall:**
   ```powershell
   Get-NetFirewallRule -DisplayName "MCP Server"
   ```

2. **Test connectivity:**
   ```bash
   curl http://YOUR_VM_IP:8080/health
   ```

3. **Verify auth token:**
   - Ensure the same token is set in both .env files
   - Token should not contain spaces or special characters

### Build Errors

1. **Missing .NET SDK:**
   ```powershell
   dotnet --version
   # If not installed:
   choco install dotnet-sdk -y
   ```

2. **Path issues:**
   - Use absolute paths for project files
   - Ensure paths don't contain '..'

## Security Best Practices

### Development Environment
- Leave `MCP_AUTH_TOKEN` empty for local development
- Use IP whitelisting even in development
- Monitor logs regularly

### Production Environment
1. **Always set authentication token**:
   ```bash
   openssl rand -hex 32  # Generate secure token
   ```

2. **Configure IP whitelisting**:
   ```env
   ALLOWED_IPS=192.168.1.100,192.168.1.101
   ```

3. **Restrict build paths**:
   ```env
   ALLOWED_BUILD_PATHS=C:\projects\,D:\builds\
   ```

4. **Use HTTPS** (if exposing to internet):
   - Generate SSL certificates
   - Use reverse proxy (nginx/Apache)
   - Never expose directly to internet

### Security Features
- **Path Traversal Protection**: Prevents `..` in paths
- **Command Whitelisting**: Only safe PowerShell commands allowed
- **Rate Limiting**: 100 requests/minute per IP
- **Request Logging**: All requests logged with timestamp and IP
- **Output Limiting**: 1MB max output per command

## Advanced Configuration

### Adding Custom PowerShell Commands

Edit `mcp-server.js` and add to the `safeCommands` array:

```javascript
const safeCommands = [
  /^Get-Process/i,
  /^Get-Service/i,
  /^Your-Custom-Command/i  // Add your command
];
```

### Changing Allowed Build Paths

Update `.env` file:
```env
ALLOWED_BUILD_PATHS=C:\src\,D:\projects\,E:\builds\
```

## Monitoring and Maintenance

### View Logs
```powershell
# Real-time logs
Get-Content C:\mcp-server\server.log -Wait

# Filter by date
Select-String "2024-01-01" C:\mcp-server\server.log
```

### Health Check
```bash
curl http://YOUR_VM_IP:8080/health
```

## Common Issues

### .NET SDK Not Found
```powershell
# Install .NET SDK
winget install Microsoft.DotNet.SDK.8
# Or
choco install dotnet-sdk
```

### Firewall Blocking Connection
```powershell
# Add firewall rule
New-NetFirewallRule -DisplayName "MCP Server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

### Build Timeouts
Increase timeout in `mcp-server.js`:
```javascript
const timeout = setTimeout(() => {...}, 600000); // 10 minutes
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Built for [Claude Code](https://claude.ai/code) by Anthropic
- Uses [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- Powered by Node.js and Express