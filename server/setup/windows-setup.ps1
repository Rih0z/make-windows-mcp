# Windows MCP Server Setup Script
# Run this script in PowerShell as Administrator

param(
    [string]$InstallPath = "C:\mcp-server"
)

Write-Host "=== Windows MCP Server Setup ===" -ForegroundColor Cyan
Write-Host "Installation path: $InstallPath" -ForegroundColor Yellow

# Generate a simple random token at the beginning
$authToken = -join ((1..32) | ForEach-Object {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $chars[(Get-Random -Maximum $chars.Length)]
})

Write-Host "`n=== Generated Authentication Token ===" -ForegroundColor Yellow
Write-Host "MCP_AUTH_TOKEN: $authToken" -ForegroundColor Cyan
Write-Host "Please copy this token for client configuration" -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Yellow

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

# 3. Install Git and OpenSSH
Write-Host "`n[3/5] Installing Git and OpenSSH..." -ForegroundColor Yellow
if (!(Test-Command git)) {
    choco install git -y
    refreshenv
}

# Install OpenSSH Server for remote access
if (!(Get-WindowsCapability -Online | Where-Object Name -like "*OpenSSH.Server*" | Where-Object State -eq "Installed")) {
    Write-Host "Installing OpenSSH Server..." -ForegroundColor Green
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Start-Service sshd
    Set-Service -Name sshd -StartupType 'Automatic'
    
    # Configure firewall for SSH
    if (!(Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
    }
}

# 4. Create MCP server directory
Write-Host "`n[4/5] Setting up MCP server..." -ForegroundColor Yellow
if (!(Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
}

Set-Location $InstallPath

# Copy server files
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$serverSrcDir = Join-Path $projectRoot "src"

# Copy main server file
Copy-Item "$serverSrcDir\server.js" -Destination "$InstallPath\server.js" -Force

# Copy utils directory
$utilsSource = Join-Path $serverSrcDir "utils"
$utilsDest = Join-Path $InstallPath "utils"
if (!(Test-Path $utilsDest)) {
    New-Item -ItemType Directory -Force -Path $utilsDest | Out-Null
}
Copy-Item "$utilsSource\*" -Destination $utilsDest -Force

# Copy .env.example from root directory
$envExample = Join-Path (Split-Path -Parent $projectRoot) ".env.example"
Copy-Item $envExample -Destination "$InstallPath\.env.example" -Force

# Initialize package.json if not exists
if (!(Test-Path "package.json")) {
    npm init -y | Out-Null
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Green
npm install express@^4.18.2 cors@^2.8.5 dotenv@^16.3.1 ssh2@^1.15.0 ping@^0.4.4 helmet@^7.1.0

# Update package.json scripts
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.scripts = @{
    "start" = "node server.js"
}
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8

# Create .env file if not exists
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" -Destination ".env"
    
    # Update .env file with the generated token
    $envContent = Get-Content ".env" -Raw
    $envContent = $envContent -replace 'MCP_AUTH_TOKEN=.*', "MCP_AUTH_TOKEN=$authToken"
    Set-Content -Path ".env" -Value $envContent -Encoding UTF8
    
    Write-Host "`nAuthentication token has been set in $InstallPath\.env" -ForegroundColor Green
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
Write-Host "Your Windows IP address: $ipAddress" -ForegroundColor Cyan
Write-Host "`n=== IMPORTANT: Save these values for client configuration ===" -ForegroundColor Yellow
Write-Host "WINDOWS_VM_IP=$ipAddress" -ForegroundColor Cyan
Write-Host "MCP_AUTH_TOKEN=$authToken" -ForegroundColor Cyan
Write-Host "===========================================================`n" -ForegroundColor Yellow

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure client .env file with the values above" -ForegroundColor White
Write-Host "2. Start server: cd $InstallPath && npm start" -ForegroundColor White
Write-Host "`nFor NordVPN mesh network (optional):" -ForegroundColor Gray
Write-Host "   - Set NORDVPN_ENABLED=true" -ForegroundColor Gray
Write-Host "   - Add mesh IPs to NORDVPN_HOSTS" -ForegroundColor Gray
Write-Host "   - Set REMOTE_USERNAME and REMOTE_PASSWORD" -ForegroundColor Gray