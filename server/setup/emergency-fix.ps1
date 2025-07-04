# Emergency Fix Script for Windows MCP Server
# This script fixes the server path issues and restores functionality

Write-Host @"
🚨 Windows MCP Server Emergency Fix Script
==========================================
This script will fix the MODULE_NOT_FOUND error
"@ -ForegroundColor Yellow

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "⚠️  Warning: Not running as administrator. Some operations may fail." -ForegroundColor Yellow
}

# Define paths
$serverRoot = "C:\mcp-server"
$srcDir = Join-Path $serverRoot "src"
$serverJsPath = Join-Path $serverRoot "server.js"
$srcServerJsPath = Join-Path $srcDir "server.js"

# Navigate to server directory
if (Test-Path $serverRoot) {
    Set-Location $serverRoot
    Write-Host "📂 Changed to directory: $serverRoot" -ForegroundColor Green
} else {
    Write-Host "❌ Error: Server directory not found at $serverRoot" -ForegroundColor Red
    exit 1
}

# Check current structure
Write-Host "`n🔍 Analyzing current directory structure..." -ForegroundColor Cyan
Write-Host "Contents of C:\mcp-server:" -ForegroundColor Yellow
Get-ChildItem -Path $serverRoot | Format-Table Name, Mode, LastWriteTime

# Check if src directory exists
if (Test-Path $srcDir) {
    Write-Host "`nContents of C:\mcp-server\src:" -ForegroundColor Yellow
    Get-ChildItem -Path $srcDir | Format-Table Name, Mode, LastWriteTime
}

# Determine the correct approach
if (Test-Path $srcServerJsPath) {
    Write-Host "`n✅ Found server.js in src directory" -ForegroundColor Green
    Write-Host "🔧 Updating package.json to use src/server.js..." -ForegroundColor Yellow
    
    # Update package.json
    $packageJsonContent = @"
{
  "name": "windows-mcp-server",
  "version": "1.0.10",
  "description": "Windows MCP Server - Runs on Windows VM to execute build commands",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "set NODE_ENV=development && node src/server.js",
    "dangerous": "set ENABLE_DANGEROUS_MODE=true && node src/server.js",
    "update": "powershell -ExecutionPolicy Bypass -File setup/update-from-git.ps1",
    "update-local": "powershell -ExecutionPolicy Bypass -File setup/update-server.ps1"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ssh2": "^1.15.0",
    "ping": "^0.4.4",
    "helmet": "^7.1.0"
  },
  "keywords": [
    "mcp",
    "windows",
    "build-server"
  ],
  "author": "",
  "license": "MIT"
}
"@
    
} elseif (Test-Path $serverJsPath) {
    Write-Host "`n✅ Found server.js in root directory" -ForegroundColor Green
    Write-Host "🔧 Updating package.json to use server.js..." -ForegroundColor Yellow
    
    # Update package.json
    $packageJsonContent = @"
{
  "name": "windows-mcp-server",
  "version": "1.0.10",
  "description": "Windows MCP Server - Runs on Windows VM to execute build commands",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "set NODE_ENV=development && node server.js",
    "dangerous": "set ENABLE_DANGEROUS_MODE=true && node server.js",
    "update": "powershell -ExecutionPolicy Bypass -File setup/update-from-git.ps1",
    "update-local": "powershell -ExecutionPolicy Bypass -File setup/update-server.ps1"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ssh2": "^1.15.0",
    "ping": "^0.4.4",
    "helmet": "^7.1.0"
  },
  "keywords": [
    "mcp",
    "windows",
    "build-server"
  ],
  "author": "",
  "license": "MIT"
}
"@
    
} else {
    Write-Host "`n❌ Error: server.js not found in any expected location!" -ForegroundColor Red
    Write-Host "💡 The server files may be missing. Please run update script." -ForegroundColor Yellow
    exit 1
}

# Save the updated package.json
$packageJsonPath = Join-Path $serverRoot "package.json"
Set-Content -Path $packageJsonPath -Value $packageJsonContent -Encoding UTF8
Write-Host "✅ Updated package.json successfully" -ForegroundColor Green

# Create or update .env file if missing
$envPath = Join-Path $serverRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "`n📝 Creating default .env file..." -ForegroundColor Yellow
    $envContent = @"
# Windows MCP Server Configuration
MCP_SERVER_PORT=8080
MCP_AUTH_TOKEN=change-this-to-a-secure-random-token

# Security Settings
ALLOWED_IPS=
ALLOWED_BUILD_PATHS=C:\\projects\\,Z:\\,C:\\build\\
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\

# Development Settings
ENABLE_DEV_COMMANDS=false
DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\
ALLOWED_DEV_COMMANDS=tasklist,netstat,type,git,if,for,findstr,echo,set,call,start,cd,cmd,&

# Command Settings
COMMAND_TIMEOUT=300000
MAX_COMMAND_LENGTH=8192

# Rate Limiting
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60000

# SSH Settings (if using remote features)
REMOTE_USERNAME=Administrator
REMOTE_PASSWORD=
SSH_TIMEOUT=30000

# NordVPN Settings
NORDVPN_ENABLED=false

# Dangerous Mode - DO NOT ENABLE IN PRODUCTION
ENABLE_DANGEROUS_MODE=false
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "✅ Created default .env file" -ForegroundColor Green
}

Write-Host "`n🎉 Emergency fix complete!" -ForegroundColor Green
Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Test the server with: npm start" -ForegroundColor White
Write-Host "2. For dangerous mode: npm run dangerous" -ForegroundColor White
Write-Host "3. To update from GitHub: npm run update" -ForegroundColor White

Write-Host "`n💡 If server.js is still missing, run:" -ForegroundColor Yellow
Write-Host "   git clone https://github.com/Rih0z/make-windows-mcp.git temp" -ForegroundColor White
Write-Host "   xcopy temp\server\* . /E /Y" -ForegroundColor White
Write-Host "   rmdir temp /S /Q" -ForegroundColor White

Write-Host "`n✨ Ready to start the server!" -ForegroundColor Green