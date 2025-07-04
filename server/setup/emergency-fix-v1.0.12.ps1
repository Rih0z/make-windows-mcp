# Emergency Fix for v1.0.12 - Process Module Initialization Error
Write-Host "🚨 Emergency Fix for Windows MCP Server v1.0.12" -ForegroundColor Red
Write-Host "=============================================" -ForegroundColor Red
Write-Host ""
Write-Host "📋 修正内容:" -ForegroundColor Yellow
Write-Host "   - processモジュール初期化エラーの修正" -ForegroundColor White
Write-Host "   - 変数名の衝突を解決（process → childProcess）" -ForegroundColor White
Write-Host ""

$serverDir = "C:\mcp-server"
Set-Location $serverDir

# Step 1: Stop current server
Write-Host "📋 Step 1: 現在のサーバーを停止..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    foreach ($proc in $nodeProcesses) {
        if ($proc.CommandLine -like "*mcp-server*" -or $proc.Path -like "*node.exe*") {
            Write-Host "   Stopping process $($proc.Id)..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force
        }
    }
    Start-Sleep -Seconds 2
}

# Step 2: Backup current files
Write-Host "`n📋 Step 2: バックアップ作成..." -ForegroundColor Yellow
$backupDir = "C:\mcp-server-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path $serverDir -Destination $backupDir -Recurse -Force
Write-Host "   ✅ バックアップ完了: $backupDir" -ForegroundColor Green

# Step 3: Download the fixed server.js
Write-Host "`n📋 Step 3: 修正済みファイルをダウンロード..." -ForegroundColor Yellow
try {
    # Download fixed server.js
    $serverUrl = "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/src/server.js"
    $serverPath = Join-Path $serverDir "src\server.js"
    
    # Create src directory if it doesn't exist
    if (-not (Test-Path (Join-Path $serverDir "src"))) {
        New-Item -ItemType Directory -Path (Join-Path $serverDir "src") -Force | Out-Null
    }
    
    Invoke-WebRequest -Uri $serverUrl -OutFile $serverPath -UseBasicParsing
    Write-Host "   ✅ server.js をダウンロード" -ForegroundColor Green
    
    # Update package.json versions
    $packageJsonPath = Join-Path $serverDir "package.json"
    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        $packageJson.version = "1.0.12"
        $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8
        Write-Host "   ✅ package.json を v1.0.12 に更新" -ForegroundColor Green
    }
    
} catch {
    Write-Host "   ❌ ダウンロード失敗: $_" -ForegroundColor Red
    Write-Host "   📝 手動修正が必要です" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "手動修正手順:" -ForegroundColor Cyan
    Write-Host "1. src\server.js を開く" -ForegroundColor White
    Write-Host "2. executeBuild 関数内（約2539行目）で:" -ForegroundColor White
    Write-Host "   const process = spawn(...) → const childProcess = spawn(...)" -ForegroundColor Yellow
    Write-Host "3. その後のすべての process. を childProcess. に変更:" -ForegroundColor White
    Write-Host "   - process.kill() → childProcess.kill()" -ForegroundColor Gray
    Write-Host "   - process.stdout → childProcess.stdout" -ForegroundColor Gray
    Write-Host "   - process.stderr → childProcess.stderr" -ForegroundColor Gray
    Write-Host "   - process.on() → childProcess.on()" -ForegroundColor Gray
    Write-Host ""
    
    $manual = Read-Host "手動で修正しましたか？ (y/n)"
    if ($manual -ne 'y') {
        Write-Host "修正をキャンセルしました" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Test the fix
Write-Host "`n📋 Step 4: 修正をテスト..." -ForegroundColor Yellow
Write-Host "   サーバーを起動してテストします..." -ForegroundColor White

# Create a test script
$testScript = @'
cd C:\mcp-server
$env:MCP_AUTH_TOKEN = "test-token-12345"
$process = Start-Process -FilePath "node" -ArgumentList "src\server.js" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

# Test health check
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ ヘルスチェック: 成功" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ ヘルスチェック: 失敗" -ForegroundColor Red
}

# Test PowerShell command
$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/call"
    params = @{
        name = "run_powershell"
        arguments = @{
            command = "echo 'Process test successful'"
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/mcp" `
        -Method POST `
        -Headers @{ "Authorization" = "Bearer test-token-12345" } `
        -ContentType "application/json" `
        -Body $body
    
    if ($response.content) {
        Write-Host "   ✅ PowerShellコマンド実行: 成功" -ForegroundColor Green
        Write-Host "   応答: $($response.content[0].text)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ PowerShellコマンド実行: 失敗" -ForegroundColor Red
    Write-Host "   エラー: $_" -ForegroundColor Red
}

Stop-Process -Id $process.Id -Force
'@

$testScript | Out-File -FilePath "$env:TEMP\test-mcp.ps1" -Encoding UTF8
& powershell -ExecutionPolicy Bypass -File "$env:TEMP\test-mcp.ps1"
Remove-Item "$env:TEMP\test-mcp.ps1" -Force

# Step 5: Display results
Write-Host "`n✅ 緊急修正完了!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 修正内容:" -ForegroundColor Cyan
Write-Host "   - processモジュール初期化エラーを修正" -ForegroundColor White
Write-Host "   - 変数名の衝突を解決" -ForegroundColor White
Write-Host "   - バージョンを v1.0.12 に更新" -ForegroundColor White
Write-Host ""
Write-Host "🚀 次のステップ:" -ForegroundColor Yellow
Write-Host "   1. cd C:\mcp-server" -ForegroundColor White
Write-Host "   2. npm start" -ForegroundColor White
Write-Host ""
Write-Host "📝 問題が続く場合:" -ForegroundColor Yellow
Write-Host "   - バックアップから復元: Copy-Item -Path '$backupDir\*' -Destination 'C:\mcp-server' -Recurse -Force" -ForegroundColor White
Write-Host "   - GitHubで最新版を確認: https://github.com/Rih0z/make-windows-mcp" -ForegroundColor White