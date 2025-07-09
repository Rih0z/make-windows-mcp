# Clean up .env file and set correct COMMAND_TIMEOUT
$envPath = "C:\mcp-server\.env"

# Read the first few important lines
$cleanContent = @(
    "WINDOWS_VM_IP=100.71.150.41",
    "MCP_SERVER_PORT=8080",
    "NORDVPN_ENABLED=true",
    "NORDVPN_HOSTS=100.71.150.41",
    "REMOTE_USERNAME=Administrator",
    "REMOTE_PASSWORD=",
    "SSH_TIMEOUT=30000",
    "MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd",
    "ALLOWED_IPS=",
    "ALLOWED_BUILD_PATHS=C:\\Users\\koki\\make-windows-mcp\\",
    "LOG_LEVEL=info",
    "",
    "# Security Settings",
    "ENABLE_DANGEROUS_MODE=true",
    "ENABLE_SECURITY_MONITORING=true",
    "MAX_LOG_SIZE=10485760",
    "MAX_LOG_FILES=5",
    "MAX_SSH_CONNECTIONS=5",
    "",
    "# Command Settings",
    "COMMAND_TIMEOUT=1800000",
    "ENABLE_DEV_COMMANDS=false",
    "ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd",
    "DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\",
    "ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\"
)

# Write clean content
$cleanContent | Out-File -FilePath $envPath -Encoding UTF8

Write-Host "✅ .env file cleaned and COMMAND_TIMEOUT set to 1800000 (30 minutes)" -ForegroundColor Green