# Windows MCP Server

This is the server component that runs on Windows VM to execute build commands and PowerShell scripts.

## Setup

1. **Prerequisites**
   - Windows 10/11
   - Node.js 18+
   - .NET SDK (for building .NET projects)
   - Administrator privileges

2. **Installation**
   ```powershell
   # Run the setup script
   cd setup
   .\windows-setup.ps1
   
   # Or manually install dependencies
   npm install
   ```

3. **Configuration**
   Create a `.env` file in the server directory with:
   ```env
   MCP_SERVER_PORT=8080
   MCP_AUTH_TOKEN=your-secure-token-here
   ALLOWED_IPS=192.168.1.100,192.168.1.101
   ```

4. **Running the Server**
   ```powershell
   npm start
   ```

## Available Commands

- `build_dotnet` - Build .NET projects
- `run_powershell` - Execute PowerShell commands
- `ping_host` - Check connectivity
- `ssh_command` - Execute commands via SSH

## Security

- Uses Bearer token authentication
- IP whitelist support
- Rate limiting
- Command validation