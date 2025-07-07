# Windows MCP Server Update Script (Legacy - for local file updates)
# For Git-based updates, use update-from-git.ps1 instead
# Run this script in PowerShell as Administrator

param(
    [string]$InstallPath = "C:\mcp-server",
    [switch]$Force = $false
)

Write-Host "=== Windows MCP Server Update (Local Files) ===" -ForegroundColor Cyan
Write-Host "Note: This script updates from local files. For Git updates, use update-from-git.ps1" -ForegroundColor Yellow
Write-Host "Update path: $InstallPath" -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Please run as Administrator." -ForegroundColor Red
    exit 1
}

# Check if installation exists
if (!(Test-Path $InstallPath)) {
    Write-Host "Error: MCP server not found at $InstallPath" -ForegroundColor Red
    Write-Host "Please run windows-setup.ps1 first for initial installation" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[1/5] Backing up current configuration..." -ForegroundColor Yellow
$backupPath = "$InstallPath\backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null

# Backup important files
if (Test-Path "$InstallPath\.env") {
    Copy-Item "$InstallPath\.env" -Destination "$backupPath\.env" -Force
    Write-Host "Backed up .env file" -ForegroundColor Green
}
if (Test-Path "$InstallPath\package.json") {
    Copy-Item "$InstallPath\package.json" -Destination "$backupPath\package.json" -Force
    Write-Host "Backed up package.json" -ForegroundColor Green
}

Write-Host "`n[2/5] Updating server files..." -ForegroundColor Yellow
Set-Location $InstallPath

# Copy new server files from repository
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$serverSrcDir = Join-Path $projectRoot "src"

# Update main server file
if (Test-Path "$serverSrcDir\server.js") {
    Copy-Item "$serverSrcDir\server.js" -Destination "$InstallPath\server.js" -Force
    Write-Host "Updated server.js" -ForegroundColor Green
} else {
    Write-Host "Warning: server.js not found in source" -ForegroundColor Yellow
}

# Update utils directory
$utilsSource = Join-Path $serverSrcDir "utils"
$utilsDest = Join-Path $InstallPath "utils"
if (Test-Path $utilsSource) {
    if (!(Test-Path $utilsDest)) {
        New-Item -ItemType Directory -Force -Path $utilsDest | Out-Null
    }
    Copy-Item "$utilsSource\*" -Destination $utilsDest -Force
    Write-Host "Updated utils directory" -ForegroundColor Green
}

Write-Host "`n[3/5] Updating dependencies..." -ForegroundColor Yellow
# Update package.json dependencies
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.dependencies = @{
    "express" = "^4.18.2"
    "cors" = "^2.8.5"
    "dotenv" = "^16.3.1"
    "ssh2" = "^1.15.0"
    "ping" = "^0.4.4"
    "helmet" = "^7.1.0"
}
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8

# Update npm packages
npm install

Write-Host "`n[4/5] Updating environment configuration..." -ForegroundColor Yellow
# Update .env file with new settings if they don't exist
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    
    # Add new environment variables if they don't exist
    $newVars = @(
        "ENABLE_DANGEROUS_MODE=false",
        "ENABLE_SECURITY_MONITORING=true",
        "MAX_LOG_SIZE=10485760",
        "MAX_LOG_FILES=5",
        "COMMAND_TIMEOUT=1800000",
        "MAX_SSH_CONNECTIONS=5"
    )
    
    foreach ($var in $newVars) {
        $varName = $var.Split('=')[0]
        if ($envContent -notmatch "^$varName=") {
            $envContent += "`n$var"
            Write-Host "Added new setting: $varName" -ForegroundColor Green
        }
    }
    
    Set-Content -Path ".env" -Value $envContent -Encoding UTF8
}

Write-Host "`n[5/5] Verifying update..." -ForegroundColor Yellow
# Test if server can start
$testProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -NoNewWindow -PassThru
Start-Sleep -Seconds 3
if (!$testProcess.HasExited) {
    Stop-Process -Id $testProcess.Id -Force
    Write-Host "Server test successful" -ForegroundColor Green
} else {
    Write-Host "Warning: Server test failed" -ForegroundColor Yellow
}

# Get IP address for display
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1"}).IPAddress | Select-Object -First 1

Write-Host "`n=== Update Complete! ===" -ForegroundColor Green
Write-Host "`nBackup location: $backupPath" -ForegroundColor Cyan
Write-Host "Server location: $InstallPath" -ForegroundColor Cyan
Write-Host "Your Windows IP address: $ipAddress" -ForegroundColor Cyan

# Check current auth token
$currentEnv = Get-Content ".env" -Raw
if ($currentEnv -match 'MCP_AUTH_TOKEN=(.+)') {
    $currentToken = $matches[1].Trim()
    if ($currentToken -and $currentToken -ne '') {
        Write-Host "`n=== Current Authentication Token ===" -ForegroundColor Yellow
        Write-Host "MCP_AUTH_TOKEN: $currentToken" -ForegroundColor Cyan
        Write-Host "Make sure your client .env file has the same token" -ForegroundColor Yellow
    }
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Start server: cd $InstallPath && npm start" -ForegroundColor White
Write-Host "2. If issues occur, check backup at: $backupPath" -ForegroundColor White
Write-Host "3. For new authentication token, run windows-setup.ps1" -ForegroundColor White

Write-Host "`nUpdate completed successfully!" -ForegroundColor Green