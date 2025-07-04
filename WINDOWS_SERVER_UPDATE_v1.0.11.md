# Windows MCP Server v1.0.11 アップデート手順

## 🚀 新機能: PDFコンバーター対応 Phase 1

### アップデート内容
- **タイムアウト延長**: 最大30分まで対応
- **プロセス管理**: Stop-Process, Wait-Process コマンド追加
- **エラー改善**: 詳細なタイムアウトエラー情報

## 📋 アップデート方法

### 方法1: 自動アップデートスクリプト（推奨）

```powershell
# 1. スクリプトをダウンロード
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/setup/update-pdf-support.ps1" -OutFile "C:\temp\update-pdf-support.ps1"

# 2. 管理者権限で実行
powershell -ExecutionPolicy Bypass -File "C:\temp\update-pdf-support.ps1"

# 3. サーバー再起動
cd C:\mcp-server
npm start
```

### 方法2: 手動アップデート

```powershell
# 1. 現在のサーバーを停止
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# 2. バックアップ作成
$backup = "C:\mcp-server-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path "C:\mcp-server" -Destination $backup -Recurse

# 3. 最新版をダウンロード
cd C:\temp
git clone https://github.com/Rih0z/make-windows-mcp.git

# 4. サーバーファイルを更新
Copy-Item -Path "C:\temp\make-windows-mcp\server\*" -Destination "C:\mcp-server" -Recurse -Force

# 5. .envファイルを復元
Copy-Item -Path "$backup\.env" -Destination "C:\mcp-server\.env" -Force

# 6. 依存関係を更新
cd C:\mcp-server
npm install

# 7. 新しい設定を追加
Add-Content -Path .env -Value @"

# PDF Processing Support (v1.0.11)
PDF_PROCESSING_TIMEOUT=600000
MAX_ALLOWED_TIMEOUT=1800000
"@

# 8. サーバー起動
npm start
```

## 🔧 新機能の使い方

### 1. タイムアウト延長

```bash
# PowerShellから実行
$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/call"
    params = @{
        name = "run_powershell"
        arguments = @{
            command = "C:\builds\StandardTaxPdfConverter.UI.exe -input images -output output.pdf"
            timeout = 600  # 10分
        }
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:8080/mcp" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer YOUR_TOKEN" } `
    -ContentType "application/json" `
    -Body $body
```

### 2. プロセス管理

```bash
# プロセス停止
$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/call"
    params = @{
        name = "run_powershell"
        arguments = @{
            command = "Stop-Process -Name StandardTaxPdfConverter.UI -Force"
        }
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:8080/mcp" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer YOUR_TOKEN" } `
    -ContentType "application/json" `
    -Body $body
```

## ✅ 動作確認

### 1. バージョン確認
```powershell
# package.jsonを確認
type C:\mcp-server\package.json | findstr version
# → "version": "1.0.11" が表示される
```

### 2. 起動確認
```powershell
cd C:\mcp-server
npm start
# → "Windows MCP Server v1.0.11" が表示される
```

### 3. 新機能テスト
```powershell
# タイムアウトテスト（5秒で完了するコマンド）
curl -X POST "http://localhost:8080/mcp" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "run_powershell",
      "arguments": {
        "command": "Start-Sleep -Seconds 3; echo Done",
        "timeout": 10
      }
    }
  }'
```

## 🆘 トラブルシューティング

### エラー: "Cannot find module"
```powershell
cd C:\mcp-server
npm install
```

### エラー: "Command not allowed: stop-process"
新しいsecurity.jsが適用されていません。手動で更新：
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/src/utils/security.js" -OutFile "C:\mcp-server\src\utils\security.js"
```

### タイムアウトが効かない
.envファイルに新設定を追加：
```
PDF_PROCESSING_TIMEOUT=600000
MAX_ALLOWED_TIMEOUT=1800000
```

## 📈 改善効果

### Before (v1.0.10)
- ❌ 2分でタイムアウト
- ❌ プロセス管理は手動
- ❌ エラー詳細が不明

### After (v1.0.11)
- ✅ 最大30分まで実行可能
- ✅ APIでプロセス制御
- ✅ 詳細なエラー情報

## 🎉 アップデート完了

v1.0.11へのアップデートが完了したら、PDFコンバーターの長時間実行テストが可能になります。

問題が発生した場合は、バックアップから復元できます：
```powershell
# バックアップから復元
Copy-Item -Path "C:\mcp-server-backup-*\*" -Destination "C:\mcp-server" -Recurse -Force
```