# Windows MCP Server Update Script (from Git repository)
# Run this script in PowerShell as Administrator

param(
    [string]$InstallPath = "C:\mcp-server",
    [string]$TempDir = "$env:TEMP\mcp-update-$(Get-Date -Format 'yyyyMMddHHmmss')",
    [switch]$Force = $false
)

Write-Host "=== Windows MCP Server Git Update ===" -ForegroundColor Cyan
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

# Function to test command availability
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Check if Git is installed
if (!(Test-Command git)) {
    Write-Host "Error: Git is not installed. Installing Git..." -ForegroundColor Yellow
    choco install git -y
    refreshenv
    
    if (!(Test-Command git)) {
        Write-Host "Error: Failed to install Git. Please install manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n[1/6] Backing up current configuration..." -ForegroundColor Yellow
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

Write-Host "`n[2/6] Cloning latest version from GitHub..." -ForegroundColor Yellow
# Create temp directory
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Clone the repository
$gitUrl = "https://github.com/Rih0z/make-windows-mcp.git"
git clone $gitUrl $TempDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to clone repository" -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "`n[3/6] Cleaning and refreshing server files..." -ForegroundColor Yellow
Set-Location $InstallPath

# Remove all existing code files (preserve .env and backups only)
Write-Host "Removing old code files..." -ForegroundColor Yellow
$itemsToRemove = @(
    "src",
    "utils", 
    "server.js",
    "package-lock.json",
    "README.md",
    "LICENSE"
)

foreach ($item in $itemsToRemove) {
    if (Test-Path $item) {
        Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   Removed: $item" -ForegroundColor Gray
    }
}

# Copy entire server directory structure from Git
Write-Host "Copying fresh code from Git repository..." -ForegroundColor Yellow
$serverSource = "$TempDir\server"

# Copy all directories
$directories = Get-ChildItem $serverSource -Directory
foreach ($dir in $directories) {
    $destPath = Join-Path $InstallPath $dir.Name
    Copy-Item $dir.FullName -Destination $InstallPath -Recurse -Force
    Write-Host "   Copied: $($dir.Name)/" -ForegroundColor Green
}

# Copy all files from server root
$files = Get-ChildItem $serverSource -File
foreach ($file in $files) {
    Copy-Item $file.FullName -Destination $InstallPath -Force
    Write-Host "   Copied: $($file.Name)" -ForegroundColor Green
}

Write-Host "`n[4/6] Updating dependencies..." -ForegroundColor Yellow
# Update npm packages only if package.json changed
npm install

Write-Host "`n[5/6] Updating environment configuration..." -ForegroundColor Yellow
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
        "MAX_SSH_CONNECTIONS=5",
        "ENABLE_DEV_COMMANDS=false",
        "ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd",
        "DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\",
        "ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\"
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

Write-Host "`n[6/6] Cleaning up..." -ForegroundColor Yellow
# Remove temporary directory
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleaned up temporary files" -ForegroundColor Green

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
Write-Host "1. Start server: npm start" -ForegroundColor White
Write-Host "2. Start in dangerous mode: npm run dangerous" -ForegroundColor White
Write-Host "3. If issues occur, restore from: $backupPath" -ForegroundColor White

Write-Host "`nUpdate completed successfully!" -ForegroundColor Green