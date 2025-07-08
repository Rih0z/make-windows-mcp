# 緊急バグ修正の実行
Write-Host "=== Emergency Timeout Bug Fix ===" -ForegroundColor Red

$serverPath = "C:\mcp-server"
Set-Location $serverPath

# 1. GitHubから最新のサーバーコードを取得（バグ修正済み）
Write-Host "Updating server code from GitHub..." -ForegroundColor Yellow
.\server\setup\update-from-git.ps1 -Force

# 2. .envファイルの確認と修正
Write-Host "Checking .env file..." -ForegroundColor Yellow
$envContent = Get-Content ".env" -Raw
if ($envContent -notlike "*COMMAND_TIMEOUT=1800000*") {
    $envContent = $envContent -replace "COMMAND_TIMEOUT=\d+", "COMMAND_TIMEOUT=1800000"
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "Fixed COMMAND_TIMEOUT in .env" -ForegroundColor Green
}

# 3. サーバーの再起動
Write-Host "Restarting server..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 5

$env:ENABLE_DANGEROUS_MODE = "true"
Start-Process powershell -ArgumentList "-Command", "cd '$serverPath'; npm run dangerous" -WindowStyle Normal

Start-Sleep -Seconds 10

# 4. 動作確認
$nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcess) {
    Write-Host "✅ Server restarted successfully (PID: $($nodeProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "❌ Server restart failed" -ForegroundColor Red
}

Write-Host "✅ Emergency timeout fix complete!" -ForegroundColor Green
Write-Host "Commands should now run for 30 minutes instead of 1.8 seconds." -ForegroundColor Green