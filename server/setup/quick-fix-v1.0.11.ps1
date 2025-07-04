# Quick Fix for v1.0.11 - Server Path Issue
Write-Host "🚨 Quick Fix for Windows MCP Server v1.0.11" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

$serverDir = "C:\mcp-server"
Set-Location $serverDir

# Check current structure
Write-Host "`n📁 Checking current structure..." -ForegroundColor Cyan
$hasServerJs = Test-Path "server.js"
$hasSrcServerJs = Test-Path "src\server.js"

Write-Host "   server.js exists: $hasServerJs" -ForegroundColor White
Write-Host "   src\server.js exists: $hasSrcServerJs" -ForegroundColor White

# Fix package.json based on actual structure
if ($hasSrcServerJs) {
    Write-Host "`n✅ Found src\server.js - Updating package.json..." -ForegroundColor Green
    $packageJson = @"
{
  "name": "windows-mcp-server",
  "version": "1.0.11",
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
  "keywords": ["mcp", "windows", "build-server"],
  "author": "",
  "license": "MIT"
}
"@
} elseif ($hasServerJs) {
    Write-Host "`n✅ Found server.js in root - Updating package.json..." -ForegroundColor Green
    $packageJson = @"
{
  "name": "windows-mcp-server",
  "version": "1.0.11",
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
  "keywords": ["mcp", "windows", "build-server"],
  "author": "",
  "license": "MIT"
}
"@
} else {
    Write-Host "`n❌ No server.js found! Downloading from GitHub..." -ForegroundColor Red
    
    # Download the missing files
    Write-Host "📥 Downloading server files..." -ForegroundColor Yellow
    
    # Create src directory if it doesn't exist
    if (-not (Test-Path "src")) {
        New-Item -ItemType Directory -Path "src" -Force | Out-Null
        New-Item -ItemType Directory -Path "src\utils" -Force | Out-Null
    }
    
    # Download server.js
    $serverUrl = "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/src/server.js"
    Invoke-WebRequest -Uri $serverUrl -OutFile "src\server.js"
    
    # Download security.js
    $securityUrl = "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/src/utils/security.js"
    Invoke-WebRequest -Uri $securityUrl -OutFile "src\utils\security.js"
    
    # Download other utils
    $utilFiles = @("helpers.js", "logger.js", "rate-limiter.js", "crypto.js")
    foreach ($file in $utilFiles) {
        $url = "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/src/utils/$file"
        Invoke-WebRequest -Uri $url -OutFile "src\utils\$file"
    }
    
    Write-Host "✅ Server files downloaded" -ForegroundColor Green
    
    # Use src structure
    $packageJson = @"
{
  "name": "windows-mcp-server",
  "version": "1.0.11",
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
  "keywords": ["mcp", "windows", "build-server"],
  "author": "",
  "license": "MIT"
}
"@
}

# Save package.json
Set-Content -Path "package.json" -Value $packageJson -Encoding UTF8
Write-Host "✅ package.json updated" -ForegroundColor Green

# Create .env if missing
if (-not (Test-Path ".env")) {
    Write-Host "`n📝 Creating .env file..." -ForegroundColor Yellow
    $envContent = @"
# Windows MCP Server Configuration
MCP_SERVER_PORT=8080
MCP_AUTH_TOKEN=change-this-to-a-secure-random-token

# Security Settings
ALLOWED_BUILD_PATHS=C:\\projects\\,Z:\\,C:\\build\\
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\

# Development Settings
ENABLE_DEV_COMMANDS=false
ENABLE_DANGEROUS_MODE=false

# Command Settings
COMMAND_TIMEOUT=300000
PDF_PROCESSING_TIMEOUT=600000
MAX_ALLOWED_TIMEOUT=1800000
"@
    Set-Content -Path ".env" -Value $envContent -Encoding UTF8
    Write-Host "✅ .env created" -ForegroundColor Green
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "`n✅ Quick fix complete!" -ForegroundColor Green
Write-Host "`n🚀 You can now run:" -ForegroundColor Cyan
Write-Host "   npm start          - Normal mode" -ForegroundColor White
Write-Host "   npm run dangerous  - Dangerous mode" -ForegroundColor White

Write-Host "`n💡 Testing dangerous mode now..." -ForegroundColor Yellow
npm run dangerous