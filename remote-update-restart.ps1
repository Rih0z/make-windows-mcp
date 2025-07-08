# Remote script to update .env and restart MCP server on Windows VM
# This script can be run from your local machine to update the Windows VM

param(
    [string]$VMAddress = "100.71.150.41",
    [string]$Username = "Administrator",
    [string]$Password = "",
    [switch]$UseSSH = $false
)

Write-Host "=== Remote MCP Server Update Script ===" -ForegroundColor Cyan

if ($UseSSH) {
    Write-Host "Using SSH connection..." -ForegroundColor Yellow
    
    # Create the command to run on remote machine
    $remoteCommand = @'
# Update .env file with 30-minute timeout
$envContent = @"
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
ENABLE_DANGEROUS_MODE=true
ENABLE_SECURITY_MONITORING=true
MAX_LOG_SIZE=10485760
MAX_LOG_FILES=5
MAX_SSH_CONNECTIONS=5
COMMAND_TIMEOUT=1800000
ENABLE_DEV_COMMANDS=false
ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd
DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\
"@
$envContent | Out-File -FilePath C:\mcp-server\.env -Encoding UTF8

# Stop node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Start server in dangerous mode
cd C:\mcp-server
Start-Process powershell -ArgumentList "-Command", "cd C:\mcp-server; $env:ENABLE_DANGEROUS_MODE='true'; npm run dangerous" -WindowStyle Normal
'@
    
    # Execute via SSH
    ssh "$Username@$VMAddress" "powershell -Command `"$remoteCommand`""
    
} else {
    Write-Host "Using PowerShell Remoting..." -ForegroundColor Yellow
    
    # For PowerShell remoting
    if ($Password) {
        $SecurePassword = ConvertTo-SecureString $Password -AsPlainText -Force
        $Credential = New-Object System.Management.Automation.PSCredential ($Username, $SecurePassword)
        
        Invoke-Command -ComputerName $VMAddress -Credential $Credential -ScriptBlock {
            # Same update logic as above
            Write-Host "Updating .env file on remote server..." -ForegroundColor Yellow
            
            $envContent = @"
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
ENABLE_DANGEROUS_MODE=true
ENABLE_SECURITY_MONITORING=true
MAX_LOG_SIZE=10485760
MAX_LOG_FILES=5
MAX_SSH_CONNECTIONS=5
COMMAND_TIMEOUT=1800000
ENABLE_DEV_COMMANDS=false
ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd
DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\
"@
            $envContent | Out-File -FilePath C:\mcp-server\.env -Encoding UTF8
            
            Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
            Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
            Start-Sleep -Seconds 3
            
            Write-Host "Starting server in dangerous mode..." -ForegroundColor Yellow
            Set-Location C:\mcp-server
            Start-Process powershell -ArgumentList "-Command", "cd C:\mcp-server; `$env:ENABLE_DANGEROUS_MODE='true'; npm run dangerous" -WindowStyle Normal
            
            Write-Host "Server restart initiated!" -ForegroundColor Green
        }
    } else {
        Write-Host "Password required for PowerShell remoting. Use -Password parameter." -ForegroundColor Red
    }
}

Write-Host "`n=== Instructions ===" -ForegroundColor Cyan
Write-Host "1. For local execution on the VM, copy and run fix-env-timeout.ps1" -ForegroundColor White
Write-Host "2. For remote SSH: .\remote-update-restart.ps1 -UseSSH" -ForegroundColor White
Write-Host "3. For PowerShell remoting: .\remote-update-restart.ps1 -Password 'YourPassword'" -ForegroundColor White