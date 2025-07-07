# Remote Update and Auto-Restart Script for Windows MCP Server
# This script downloads the latest update script and executes it with auto-restart

param(
    [string]$ServerPath = "C:\mcp-server",
    [int]$RestartDelay = 30
)

Write-Host "=== Remote MCP Server Update & Auto-Restart ===" -ForegroundColor Cyan

try {
    # Download the latest update script
    $updateUrl = "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/setup/update-from-git.ps1"
    $updateScript = "$env:TEMP\update-from-git-latest.ps1"
    
    Write-Host "Downloading latest update script..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $updateUrl -OutFile $updateScript -UseBasicParsing
    
    Write-Host "Executing update with auto-restart..." -ForegroundColor Yellow
    
    # Execute the update script with auto-restart enabled
    & $updateScript -InstallPath $ServerPath -AutoRestart -RestartDelay $RestartDelay
    
    Write-Host "Update and auto-restart initiated!" -ForegroundColor Green
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Falling back to npm run update..." -ForegroundColor Yellow
    
    # Fallback to npm update
    Set-Location $ServerPath
    npm run update
    
    # Manual restart
    Write-Host "Manually restarting server..." -ForegroundColor Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    
    $env:ENABLE_DANGEROUS_MODE = "true"
    Start-Process powershell -ArgumentList "-Command", "cd '$ServerPath'; npm run dangerous" -WindowStyle Minimized
    
    Write-Host "Manual restart completed!" -ForegroundColor Green
}