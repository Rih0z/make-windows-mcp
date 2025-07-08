# Fix .env file and restart MCP server with 30-minute timeout
Write-Host "=== Fixing .env and Restarting MCP Server ===" -ForegroundColor Cyan

# Step 1: Create clean .env file
$envPath = "C:\mcp-server\.env"
$cleanContent = @"
WINDOWS_VM_IP=100.71.150.41
MCP_SERVER_PORT=8080
NORDVPN_ENABLED=true
NORDVPN_HOSTS=100.71.150.41
REMOTE_USERNAME=Administrator
REMOTE_PASSWORD=
SSH_TIMEOUT=30000
MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd
ALLOWED_IPS=
ALLOWED_BUILD_PATHS=C:\\Users\\koki\\make-windows-mcp\\
LOG_LEVEL=info

# Security Settings
ENABLE_DANGEROUS_MODE=true
ENABLE_SECURITY_MONITORING=true
MAX_LOG_SIZE=10485760
MAX_LOG_FILES=5
MAX_SSH_CONNECTIONS=5

# Command Settings
COMMAND_TIMEOUT=1800000
ENABLE_DEV_COMMANDS=false
ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd
DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\
"@

# Write clean content
$cleanContent | Out-File -FilePath $envPath -Encoding UTF8
Write-Host "✅ .env file cleaned with COMMAND_TIMEOUT=1800000 (30 minutes)" -ForegroundColor Green

# Step 2: Stop all node processes
Write-Host "`nStopping existing Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# Step 3: Start server in dangerous mode
Write-Host "Starting server in dangerous mode..." -ForegroundColor Yellow
Set-Location C:\mcp-server
$env:ENABLE_DANGEROUS_MODE = "true"
Start-Process powershell -ArgumentList "-Command", "cd 'C:\mcp-server'; npm run dangerous" -WindowStyle Normal

Write-Host "`n✅ Server restart initiated!" -ForegroundColor Green
Start-Sleep -Seconds 10

# Step 4: Verify server is running
$nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcess) {
    Write-Host "✅ Server is running (PID: $($nodeProcess.Id))" -ForegroundColor Green
    
    # Wait a bit more for server to fully initialize
    Start-Sleep -Seconds 5
    
    # Try to check health endpoint
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 5
        Write-Host "✅ Server health check passed!" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Server is starting up, health check not yet available" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ Server is not running!" -ForegroundColor Red
}

Write-Host "`n=== Operation Complete ===" -ForegroundColor Cyan
Write-Host "The server should now be running with a 30-minute timeout." -ForegroundColor Green
Write-Host "Check the server console for the timeout display." -ForegroundColor Yellow

# Additional verification
Write-Host "`nTo verify the timeout setting, check the server console output for:" -ForegroundColor Yellow
Write-Host "  'Command Timeout: 30 minutes (1800s)'" -ForegroundColor White
Write-Host "`nYou can also verify the .env file:" -ForegroundColor Yellow
Write-Host "  Get-Content C:\mcp-server\.env | Select-String 'COMMAND_TIMEOUT'" -ForegroundColor White