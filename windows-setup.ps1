# Windows MCP Server Setup Script
# Run this script in PowerShell as Administrator

param(
    [string]$InstallPath = "C:\mcp-server"
)

Write-Host "=== Windows MCP Server Setup ===" -ForegroundColor Cyan
Write-Host "Installation path: $InstallPath" -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Please run as Administrator." -ForegroundColor Red
    exit 1
}

# Function to test command availability
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# 1. Install Chocolatey if not present
if (!(Test-Command choco)) {
    Write-Host "`n[1/5] Installing Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

# 2. Install Node.js
Write-Host "`n[2/5] Installing Node.js..." -ForegroundColor Yellow
if (!(Test-Command node)) {
    choco install nodejs -y
    refreshenv
}

# 3. Install Git
Write-Host "`n[3/5] Installing Git..." -ForegroundColor Yellow
if (!(Test-Command git)) {
    choco install git -y
    refreshenv
}

# 4. Create MCP server directory
Write-Host "`n[4/5] Setting up MCP server..." -ForegroundColor Yellow
if (!(Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
}

Set-Location $InstallPath

# Copy server files
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$scriptDir\secure-server.js" -Destination "$InstallPath\server.js" -Force
Copy-Item "$scriptDir\.env.example" -Destination "$InstallPath\.env.example" -Force

# Initialize package.json if not exists
if (!(Test-Path "package.json")) {
    npm init -y | Out-Null
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Green
npm install express cors dotenv

# Update package.json scripts
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.scripts = @{
    "start" = "node server.js"
}
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8

# Create .env file if not exists
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" -Destination ".env"
    Write-Host "`nIMPORTANT: Edit $InstallPath\.env to configure your server" -ForegroundColor Yellow
}

# 5. Configure Windows Firewall
Write-Host "`n[5/5] Configuring Windows Firewall..." -ForegroundColor Yellow
$ruleName = "MCP Server"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "Firewall rule already exists" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any | Out-Null
    Write-Host "Firewall rule added for port 8080" -ForegroundColor Green
}

# Get IP address
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1"}).IPAddress | Select-Object -First 1

# Display completion message
Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "`nServer location: $InstallPath" -ForegroundColor Cyan
Write-Host "Your IP address: $ipAddress" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Edit $InstallPath\.env with your settings" -ForegroundColor White
Write-Host "2. Generate auth token: openssl rand -hex 32" -ForegroundColor White
Write-Host "3. Start server: cd $InstallPath && npm start" -ForegroundColor White