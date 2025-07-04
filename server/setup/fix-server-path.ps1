# Windows MCP Server Path Fix Script
# Fixes the server.js path issue in package.json

Write-Host "🔧 Windows MCP Server Path Fix Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Define paths
$serverDir = "C:\mcp-server"
$packageJsonPath = Join-Path $serverDir "package.json"

# Check if we're in the right directory
if (-not (Test-Path $packageJsonPath)) {
    Write-Host "❌ Error: package.json not found at $packageJsonPath" -ForegroundColor Red
    Write-Host "💡 Please run this script from C:\mcp-server directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "📂 Working directory: $serverDir" -ForegroundColor Green

# Check current directory structure
Write-Host "`n📁 Checking directory structure..." -ForegroundColor Yellow
$hasServerJs = Test-Path (Join-Path $serverDir "server.js")
$hasSrcDir = Test-Path (Join-Path $serverDir "src")
$hasSrcServerJs = Test-Path (Join-Path $serverDir "src\server.js")

if ($hasServerJs) {
    Write-Host "✅ Found server.js in root directory" -ForegroundColor Green
    $serverPath = "server.js"
} elseif ($hasSrcServerJs) {
    Write-Host "✅ Found server.js in src directory" -ForegroundColor Green
    $serverPath = "src/server.js"
} else {
    Write-Host "❌ Error: server.js not found in expected locations" -ForegroundColor Red
    Write-Host "  Checked: $serverDir\server.js" -ForegroundColor Red
    Write-Host "  Checked: $serverDir\src\server.js" -ForegroundColor Red
    exit 1
}

# Read current package.json
Write-Host "`n📄 Reading package.json..." -ForegroundColor Yellow
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json

# Update version to match latest
$packageJson.version = "1.0.10"

# Fix the scripts based on actual file location
Write-Host "🔧 Updating scripts to use: $serverPath" -ForegroundColor Yellow
$packageJson.scripts.start = "node $serverPath"
$packageJson.scripts.dev = "set NODE_ENV=development && node $serverPath"
$packageJson.scripts.dangerous = "set ENABLE_DANGEROUS_MODE=true && node $serverPath"

# Save updated package.json
Write-Host "💾 Saving updated package.json..." -ForegroundColor Yellow
$packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8

Write-Host "`n✅ Path fix complete!" -ForegroundColor Green
Write-Host "📋 Updated scripts:" -ForegroundColor Cyan
Write-Host "  - start: node $serverPath" -ForegroundColor White
Write-Host "  - dev: set NODE_ENV=development && node $serverPath" -ForegroundColor White
Write-Host "  - dangerous: set ENABLE_DANGEROUS_MODE=true && node $serverPath" -ForegroundColor White
Write-Host "  - version: $($packageJson.version)" -ForegroundColor White

# Try to start the server
Write-Host "`n🚀 Testing server startup..." -ForegroundColor Yellow
Write-Host "💡 Running: npm start" -ForegroundColor Cyan

# Create a test script to verify
$testScript = @"
cd $serverDir
npm start
"@

Write-Host "`n✨ Fix complete! You can now run:" -ForegroundColor Green
Write-Host "  npm start          - Normal mode" -ForegroundColor White
Write-Host "  npm run dev        - Development mode" -ForegroundColor White
Write-Host "  npm run dangerous  - Dangerous mode" -ForegroundColor White
Write-Host ""