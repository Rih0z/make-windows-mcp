@echo off
echo === Emergency Timeout Bug Fix ===
echo.

set "SERVER_PATH=C:\mcp-server"
cd /d "%SERVER_PATH%"

echo [1/4] Updating server code from GitHub...
powershell -ExecutionPolicy Bypass -File ".\server\setup\update-from-git.ps1" -Force

echo.
echo [2/4] Checking .env file...
powershell -Command "& { $envContent = Get-Content '.env' -Raw; if ($envContent -notlike '*COMMAND_TIMEOUT=1800000*') { $envContent = $envContent -replace 'COMMAND_TIMEOUT=\d+', 'COMMAND_TIMEOUT=1800000'; $envContent | Out-File -FilePath '.env' -Encoding UTF8; Write-Host 'Fixed COMMAND_TIMEOUT in .env' -ForegroundColor Green } else { Write-Host 'COMMAND_TIMEOUT already correct' -ForegroundColor Yellow } }"

echo.
echo [3/4] Restarting server...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 5 /nobreak >nul

set "ENABLE_DANGEROUS_MODE=true"
start "MCP Server" powershell -Command "cd '%SERVER_PATH%'; npm run dangerous"

timeout /t 10 /nobreak >nul

echo.
echo [4/4] Verifying server status...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Server restarted successfully!
) else (
    echo [ERROR] Server restart failed!
)

echo.
echo === Emergency timeout fix complete! ===
echo Commands should now run for 30 minutes instead of 1.8 seconds.
echo.
pause