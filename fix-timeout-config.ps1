# Fix timeout configuration specifically
Write-Host "=== Timeout Configuration Fix ===" -ForegroundColor Red

$serverPath = "C:\mcp-server"
Set-Location $serverPath

Write-Host "`n[1] Checking current timeout configuration..." -ForegroundColor Yellow
$envPath = ".env"
$envExamplePath = ".env.example"

if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    
    # Check current COMMAND_TIMEOUT value
    if ($envContent -match 'COMMAND_TIMEOUT=(\d+)') {
        $currentTimeout = $matches[1]
        Write-Host "Current COMMAND_TIMEOUT: $currentTimeout milliseconds" -ForegroundColor Yellow
        
        if ($currentTimeout -eq "1800") {
            Write-Host "PROBLEM DETECTED: Timeout is 1800 milliseconds (1.8 seconds)" -ForegroundColor Red
            Write-Host "Fixing to 1800000 milliseconds (30 minutes)..." -ForegroundColor Green
            
            # Fix the timeout
            $envContent = $envContent -replace 'COMMAND_TIMEOUT=1800\b', 'COMMAND_TIMEOUT=1800000'
            Set-Content -Path $envPath -Value $envContent -Encoding UTF8
            
            Write-Host "FIXED: COMMAND_TIMEOUT updated to 1800000" -ForegroundColor Green
        } elseif ($currentTimeout -eq "1800000") {
            Write-Host "GOOD: Timeout is already correct (30 minutes)" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Unusual timeout value: $currentTimeout" -ForegroundColor Yellow
        }
    } else {
        Write-Host "No COMMAND_TIMEOUT found in .env file - adding it..." -ForegroundColor Yellow
        $envContent += "`nCOMMAND_TIMEOUT=1800000"
        Set-Content -Path $envPath -Value $envContent -Encoding UTF8
        Write-Host "Added COMMAND_TIMEOUT=1800000 to .env" -ForegroundColor Green
    }
} else {
    Write-Host "No .env file found - creating from .env.example..." -ForegroundColor Yellow
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envPath
        Write-Host "Created .env from .env.example" -ForegroundColor Green
    } else {
        Write-Host "ERROR: No .env.example file found!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n[2] Verifying the fix..." -ForegroundColor Yellow
$newEnvContent = Get-Content $envPath -Raw
if ($newEnvContent -match 'COMMAND_TIMEOUT=(\d+)') {
    $newTimeout = $matches[1]
    $timeoutMinutes = [int]$newTimeout / 60000
    Write-Host "Verified COMMAND_TIMEOUT: $newTimeout milliseconds ($timeoutMinutes minutes)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Could not verify COMMAND_TIMEOUT!" -ForegroundColor Red
}

Write-Host "`n[3] Checking other timeout-related settings..." -ForegroundColor Yellow
# Check for other timeout settings
$timeoutSettings = @(
    "PDF_PROCESSING_TIMEOUT",
    "MAX_ALLOWED_TIMEOUT",
    "SSH_TIMEOUT"
)

foreach ($setting in $timeoutSettings) {
    if ($newEnvContent -match "$setting=(\d+)") {
        $value = $matches[1]
        Write-Host "$setting: $value milliseconds" -ForegroundColor Gray
    } else {
        Write-Host "$setting: Not set" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Configuration Fix Complete ===" -ForegroundColor Green
Write-Host "Server restart required for changes to take effect." -ForegroundColor Yellow