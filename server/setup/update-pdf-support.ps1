# Windows MCP Server v1.0.11 Update Script
# PDF Converter Support Phase 1

Write-Host "🚀 Windows MCP Server v1.0.11 Update - PDF Converter Support" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

# Define paths
$serverDir = "C:\mcp-server"
$backupDir = "C:\mcp-server-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "⚠️  Warning: Not running as administrator. Some operations may fail." -ForegroundColor Yellow
}

# Step 1: Stop current server
Write-Host "`n📋 Step 1: Stopping current server..." -ForegroundColor Yellow
$mcpProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*mcp-server*"}
if ($mcpProcess) {
    Write-Host "   Stopping MCP server process..." -ForegroundColor Yellow
    Stop-Process -Id $mcpProcess.Id -Force
    Start-Sleep -Seconds 2
}

# Step 2: Backup current installation
Write-Host "`n📋 Step 2: Creating backup..." -ForegroundColor Yellow
if (Test-Path $serverDir) {
    Write-Host "   Backing up to: $backupDir" -ForegroundColor Green
    Copy-Item -Path $serverDir -Destination $backupDir -Recurse -Force
    Write-Host "   ✅ Backup created successfully" -ForegroundColor Green
} else {
    Write-Host "   ❌ Server directory not found!" -ForegroundColor Red
    exit 1
}

# Step 3: Download latest version from GitHub
Write-Host "`n📋 Step 3: Downloading v1.0.11 from GitHub..." -ForegroundColor Yellow
$tempDir = "$env:TEMP\mcp-update-$(Get-Date -Format 'yyyyMMddHHmmss')"
$gitUrl = "https://github.com/Rih0z/make-windows-mcp.git"

try {
    git clone $gitUrl $tempDir
    Write-Host "   ✅ Downloaded successfully" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Git clone failed. Trying alternative method..." -ForegroundColor Red
    # Alternative: Download as ZIP
    $zipUrl = "https://github.com/Rih0z/make-windows-mcp/archive/refs/heads/main.zip"
    $zipFile = "$tempDir.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile
    Expand-Archive -Path $zipFile -DestinationPath $tempDir
    $tempDir = "$tempDir\make-windows-mcp-main"
}

# Step 4: Update server files
Write-Host "`n📋 Step 4: Updating server files..." -ForegroundColor Yellow

# Copy new files while preserving .env
$envFile = Join-Path $serverDir ".env"
$envBackup = ""
if (Test-Path $envFile) {
    $envBackup = Get-Content $envFile -Raw
}

# Update server files
Copy-Item -Path "$tempDir\server\*" -Destination $serverDir -Recurse -Force
Write-Host "   ✅ Server files updated" -ForegroundColor Green

# Restore .env
if ($envBackup) {
    Set-Content -Path $envFile -Value $envBackup -Force
    Write-Host "   ✅ Configuration preserved" -ForegroundColor Green
}

# Step 5: Install dependencies
Write-Host "`n📋 Step 5: Installing dependencies..." -ForegroundColor Yellow
Set-Location $serverDir
npm install
Write-Host "   ✅ Dependencies installed" -ForegroundColor Green

# Step 6: Update .env with new settings
Write-Host "`n📋 Step 6: Updating configuration..." -ForegroundColor Yellow
$envContent = Get-Content $envFile -Raw

# Add new PDF settings if not present
if (-not ($envContent -match "PDF_PROCESSING_TIMEOUT")) {
    $newSettings = @"

# PDF Processing Support (v1.0.11)
# Maximum timeout for PDF conversion operations (default: 10 minutes)
PDF_PROCESSING_TIMEOUT=600000

# Absolute maximum allowed timeout (default: 30 minutes)
MAX_ALLOWED_TIMEOUT=1800000
"@
    
    Add-Content -Path $envFile -Value $newSettings
    Write-Host "   ✅ Added PDF processing configuration" -ForegroundColor Green
}

# Step 7: Verify installation
Write-Host "`n📋 Step 7: Verifying installation..." -ForegroundColor Yellow
$packageJson = Get-Content (Join-Path $serverDir "package.json") | ConvertFrom-Json
if ($packageJson.version -eq "1.0.11") {
    Write-Host "   ✅ Version verified: v1.0.11" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Version mismatch. Manual verification needed." -ForegroundColor Yellow
}

# Step 8: Display new features
Write-Host "`n🎉 Update Complete! New Features in v1.0.11:" -ForegroundColor Green
Write-Host ""
Write-Host "📄 PDF Converter Support Phase 1:" -ForegroundColor Cyan
Write-Host "   ✅ Timeout extension (up to 30 minutes)" -ForegroundColor White
Write-Host "   ✅ Stop-Process and Wait-Process commands" -ForegroundColor White
Write-Host "   ✅ Process management with security validation" -ForegroundColor White
Write-Host "   ✅ Enhanced error reporting with ETIMEDOUT" -ForegroundColor White

Write-Host "`n📋 Usage Example:" -ForegroundColor Cyan
Write-Host @'
# 10-minute timeout for PDF conversion:
curl -X POST "http://localhost:8080/mcp" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "run_powershell",
      "arguments": {
        "command": "C:\\builds\\StandardTaxPdfConverter.UI.exe -input images -output output.pdf",
        "timeout": 600
      }
    }
  }'
'@ -ForegroundColor Gray

Write-Host "`n🚀 Starting server..." -ForegroundColor Yellow
Write-Host "   Run: npm start" -ForegroundColor White
Write-Host "   Or : npm run dangerous (for unrestricted mode)" -ForegroundColor White

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`n✅ Update script completed!" -ForegroundColor Green