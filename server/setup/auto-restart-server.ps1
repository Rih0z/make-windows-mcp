# Windows MCP Server Auto-Restart Script
# This script can be used to automatically restart the server after updates

param(
    [string]$ServerPath = "C:\mcp-server",
    [int]$DelaySeconds = 30,
    [switch]$DangerousMode = $true
)

Write-Host "=== Windows MCP Server Auto-Restart ===" -ForegroundColor Cyan
Write-Host "Server path: $ServerPath" -ForegroundColor Yellow
Write-Host "Delay: $DelaySeconds seconds" -ForegroundColor Yellow
Write-Host "Dangerous mode: $DangerousMode" -ForegroundColor Yellow

# Change to server directory
Set-Location $ServerPath

# Wait for specified delay
Write-Host "`nWaiting $DelaySeconds seconds before restart..." -ForegroundColor Yellow
Start-Sleep -Seconds $DelaySeconds

# Kill any existing node processes
Write-Host "Stopping existing server processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Wait a bit more for cleanup
Start-Sleep -Seconds 5

# Start the server
Write-Host "Starting MCP server..." -ForegroundColor Green
if ($DangerousMode) {
    Write-Host "⚠️  Starting in DANGEROUS MODE" -ForegroundColor Red
    $env:ENABLE_DANGEROUS_MODE = "true"
    Start-Process powershell -ArgumentList "-Command", "cd '$ServerPath'; npm run dangerous" -WindowStyle Minimized
} else {
    Start-Process powershell -ArgumentList "-Command", "cd '$ServerPath'; npm start" -WindowStyle Minimized
}

Write-Host "Server restart initiated!" -ForegroundColor Green
Write-Host "Check server status with: Get-Process node" -ForegroundColor Yellow