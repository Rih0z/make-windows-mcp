# Debug timeout configuration
Write-Host "=== MCP Server Timeout Debug Info ===" -ForegroundColor Cyan

$serverPath = "C:\mcp-server"
Set-Location $serverPath

Write-Host "`n[1] Checking current .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    Write-Host "Current .env content:" -ForegroundColor Gray
    Write-Host "--------------------" -ForegroundColor Gray
    $envContent | Out-String | Write-Host
    Write-Host "--------------------" -ForegroundColor Gray
    
    # Check specific timeout settings
    if ($envContent -match 'COMMAND_TIMEOUT=(\d+)') {
        $timeout = $matches[1]
        $timeoutSeconds = [int]$timeout / 1000
        Write-Host "`nCOMMAND_TIMEOUT detected: $timeout milliseconds ($timeoutSeconds seconds)" -ForegroundColor Green
        
        if ($timeout -eq "1800") {
            Write-Host "ERROR: Timeout is 1800 milliseconds (1.8 seconds) - TOO SHORT!" -ForegroundColor Red
            Write-Host "Should be 1800000 milliseconds (30 minutes)" -ForegroundColor Red
        } elseif ($timeout -eq "1800000") {
            Write-Host "SUCCESS: Timeout is correctly set to 30 minutes" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Unusual timeout value: $timeout" -ForegroundColor Yellow
        }
    } else {
        Write-Host "No COMMAND_TIMEOUT found in .env file!" -ForegroundColor Red
    }
} else {
    Write-Host "No .env file found!" -ForegroundColor Red
}

Write-Host "`n[2] Checking server process..." -ForegroundColor Yellow
$nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcess) {
    Write-Host "Node.js process found (PID: $($nodeProcess.Id))" -ForegroundColor Green
    Write-Host "Command line: $($nodeProcess.CommandLine)" -ForegroundColor Gray
} else {
    Write-Host "No Node.js process found - server is not running" -ForegroundColor Red
}

Write-Host "`n[3] Checking package.json scripts..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    Write-Host "Available scripts:" -ForegroundColor Gray
    $packageJson.scripts | Format-List
} else {
    Write-Host "No package.json found!" -ForegroundColor Red
}

Write-Host "`n[4] Checking server logs..." -ForegroundColor Yellow
$logPath = ".\src\logs"
if (Test-Path $logPath) {
    $latestLog = Get-ChildItem $logPath -Name "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestLog) {
        Write-Host "Latest log file: $latestLog" -ForegroundColor Green
        Write-Host "Last 10 lines:" -ForegroundColor Gray
        Get-Content "$logPath\$latestLog" -Tail 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } else {
        Write-Host "No log files found" -ForegroundColor Yellow
    }
} else {
    Write-Host "Log directory not found" -ForegroundColor Red
}

Write-Host "`n=== Debug Complete ===" -ForegroundColor Cyan