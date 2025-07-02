# Windows MCP Client

This is the client component that connects Claude Code to the Windows MCP Server.

## Setup

1. **Prerequisites**
   - Node.js 18+
   - Claude Code CLI installed
   - Access to Windows MCP Server

2. **Installation**
   ```bash
   npm install
   ```

3. **Configuration**
   Create a `.env` file in the project root (or client directory) with:
   ```env
   WINDOWS_VM_IP=192.168.1.100
   MCP_SERVER_PORT=8080
   MCP_AUTH_TOKEN=your-secure-token-here
   ```

4. **Register with Claude Code**
   ```bash
   claude mcp add --user windows-build-server
   ```

## Usage

Once registered, use the `@windows-build-server` prefix in Claude Code:

```bash
@windows-build-server run_powershell command="dotnet --version"
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj"
```

## Production Setup

For production environments, run:
```bash
npm run setup
```

This will generate:
- Secure authentication tokens
- systemd service configuration
- Firewall rules