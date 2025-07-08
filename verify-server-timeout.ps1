# Verify MCP Server Timeout Configuration
Write-Host "=== Verifying MCP Server Timeout Configuration ===" -ForegroundColor Cyan

# Check .env file
Write-Host "`nChecking .env file..." -ForegroundColor Yellow
$envPath = "C:\mcp-server\.env"
if (Test-Path $envPath) {
    $timeoutLine = Get-Content $envPath | Select-String "COMMAND_TIMEOUT"
    if ($timeoutLine) {
        Write-Host "Found: $timeoutLine" -ForegroundColor Green
        if ($timeoutLine -match "1800000") {
            Write-Host "✅ COMMAND_TIMEOUT is correctly set to 1800000 (30 minutes)" -ForegroundColor Green
        } else {
            Write-Host "❌ COMMAND_TIMEOUT is not set to 1800000" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ COMMAND_TIMEOUT not found in .env file" -ForegroundColor Red
    }
} else {
    Write-Host "❌ .env file not found at $envPath" -ForegroundColor Red
}

# Check if server is running
Write-Host "`nChecking server status..." -ForegroundColor Yellow
$nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcess) {
    Write-Host "✅ Node.js server is running (PID: $($nodeProcess.Id))" -ForegroundColor Green
    
    # Try health check
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 5
        Write-Host "✅ Server health check passed" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Server health check failed or not available" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Node.js server is not running" -ForegroundColor Red
}

# Display current environment variables
Write-Host "`nCurrent timeout-related environment variables:" -ForegroundColor Yellow
$env:COMMAND_TIMEOUT
if ($env:COMMAND_TIMEOUT) {
    Write-Host "COMMAND_TIMEOUT (env): $($env:COMMAND_TIMEOUT)" -ForegroundColor White
}

# Instructions
Write-Host "`n=== Instructions ===" -ForegroundColor Cyan
Write-Host "1. To fix timeout issues, run: .\fix-env-timeout.ps1" -ForegroundColor White
Write-Host "2. Check the server console for 'Command Timeout: 30 minutes (1800s)'" -ForegroundColor White
Write-Host "3. The timeout affects all commands executed through the MCP server" -ForegroundColor White