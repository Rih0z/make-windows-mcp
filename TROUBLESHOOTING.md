# Windows MCP Server - トラブルシューティングガイド

## 🔍 はじめに

このガイドでは、Windows MCP ServerをClaude Codeで使用する際によく発生する問題とその解決方法について説明します。

## 📋 目次

1. [接続問題](#接続問題)
2. [認証エラー](#認証エラー)
3. [コマンド実行エラー](#コマンド実行エラー)
4. [パフォーマンス問題](#パフォーマンス問題)
5. [ビルドエラー](#ビルドエラー)
6. [ログ分析](#ログ分析)
7. [設定問題](#設定問題)
8. [システム要件](#システム要件)

## 🌐 接続問題

### 問題1: MCP接続失敗

```
Error: MCP connection failed
Error: Connection refused
```

**考えられる原因**:
- サーバーが起動していない
- ポートが他のプロセスによって使用されている
- ファイアウォールによってブロックされている

**解決方法**:

1. **サーバー状態の確認**
```powershell
# サーバーが起動しているか確認
Get-Process | Where-Object {$_.ProcessName -eq "node"}

# ポートが使用されているか確認
netstat -ano | findstr :8080
```

2. **手動サーバー起動**
```powershell
# サーバーを手動で起動
cd path\to\windows-mcp-server
node server\src\server.js
```

3. **ポート変更**
```json
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "MCP_SERVER_PORT": "8081-8090"
      }
    }
  }
}
```

または`.env`ファイルで設定：
```env
MCP_SERVER_PORT=8081-8090
```

### 問題2: タイムアウトエラー

```
Error: Request timeout
Error: MCP_TIMEOUT exceeded
```

**解決方法**:

1. **タイムアウト値の増加**
```json
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "MCP_SERVER_PORT": "8080-8089",
        "MCP_TIMEOUT": "60000",
        "COMMAND_TIMEOUT": "60000"
      }
    }
  }
}
```

または`.env`ファイルで設定：
```env
MCP_SERVER_PORT=8080-8089
COMMAND_TIMEOUT=60000
```

2. **システムリソースの確認**
```powershell
# メモリ使用量確認
Get-WmiObject -Class Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory

# CPU使用率確認
Get-WmiObject -Class Win32_Processor | Select-Object LoadPercentage
```

## 🔐 認証エラー

### 問題1: 認証トークンエラー

```
Error: Invalid authorization token
Error: Authentication failed
```

**解決方法**:

1. **トークンの確認**
```powershell
# 環境変数の確認
Get-Content .env | Select-String "MCP_AUTH_TOKEN"

# 設定ファイルの確認
Get-Content ~/.claude.json | ConvertFrom-Json | Select-Object -ExpandProperty mcpServers
```

2. **新しいトークンの生成**
```powershell
# 新しいトークンを生成
$token = [System.Web.Security.Membership]::GeneratePassword(32, 0)
Write-Host "新しいトークン: $token"
```

3. **設定ファイルの更新**
```powershell
# 自動更新スクリプトを実行
.\setup-claude-code.ps1 -Force
```

### 問題2: 権限エラー

```
Error: Access denied
Error: Insufficient permissions
```

**解決方法**:

1. **管理者権限での実行**
```powershell
# 管理者権限でPowerShellを起動
Start-Process PowerShell -Verb RunAs
```

2. **ファイル権限の確認**
```powershell
# ファイル権限を確認
Get-Acl "path\to\windows-mcp-server" | Format-List
```

## ⚙️ コマンド実行エラー

### 問題1: PowerShell実行ポリシーエラー

```
Error: Execution policy restricted
Error: PowerShell script execution is disabled
```

**解決方法**:

1. **実行ポリシーの確認**
```powershell
Get-ExecutionPolicy
```

2. **実行ポリシーの変更**
```powershell
# 現在のユーザーのみ変更
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# システム全体で変更（管理者権限必要）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
```

### 問題2: パス関連エラー

```
Error: Path not allowed
Error: Directory not found
```

**解決方法**:

1. **許可パスの確認**
```powershell
# 設定されている許可パスを確認
Get-Content .env | Select-String "ALLOWED_BUILD_PATHS"
```

2. **パスの追加**
```env
ALLOWED_BUILD_PATHS=C:\builds\;C:\projects\;C:\your\new\path\
```

3. **パスの存在確認**
```powershell
# パスが存在するか確認
Test-Path "C:\your\path"
```

## 🚀 パフォーマンス問題

### 問題1: 応答が遅い

```
Response time is slow
High CPU usage
```

**解決方法**:

1. **リソース監視**
```powershell
# プロセス監視
Get-Process node | Select-Object CPU,WorkingSet,ProcessName

# システム負荷確認
Get-Counter "\Process(node)\% Processor Time"
```

2. **設定の最適化**
```json
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "RATE_LIMIT_REQUESTS": "30",
        "COMMAND_TIMEOUT": "30000",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### 問題2: メモリ不足

```
Error: Out of memory
Error: ENOMEM
```

**解決方法**:

1. **メモリ使用量の確認**
```powershell
# Node.jsプロセスのメモリ使用量
Get-Process node | Select-Object WorkingSet,VirtualMemorySize
```

2. **メモリ制限の設定**
```json
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "NODE_OPTIONS": "--max-old-space-size=4096"
      }
    }
  }
}
```

## 🔨 ビルドエラー

### 問題1: .NETビルドエラー

```
Error: MSB1003
Error: Build failed
```

**解決方法**:

1. **.NET SDKの確認**
```powershell
# .NET SDKのバージョン確認
dotnet --version
dotnet --list-sdks
```

2. **プロジェクトファイルの確認**
```powershell
# プロジェクトファイルの構文チェック
dotnet build --verbosity diagnostic
```

### 問題2: Node.jsビルドエラー

```
Error: Module not found
Error: npm install failed
```

**解決方法**:

1. **Node.jsとnpmの確認**
```powershell
node --version
npm --version
```

2. **キャッシュクリア**
```powershell
npm cache clean --force
```

## 📊 ログ分析

### ログファイルの場所

```
server/src/logs/
├── app.log          # アプリケーションログ
├── error.log        # エラーログ
├── security.log     # セキュリティログ
└── access.log       # アクセスログ
```

### ログ分析コマンド

```powershell
# 最新のエラーログを確認
Get-Content server\src\logs\error.log -Tail 50

# 特定のエラーを検索
Select-String -Path server\src\logs\*.log -Pattern "Error"

# 日付でフィルター
Get-Content server\src\logs\app.log | Select-String "2023-12-01"
```

### ログレベルの調整

```json
{
  "env": {
    "LOG_LEVEL": "debug"
  }
}
```

## ⚙️ 設定問題

### 問題1: 設定ファイルが見つからない

```
Error: Configuration file not found
Error: Invalid configuration
```

**解決方法**:

1. **設定ファイルの場所確認**
```powershell
# ユーザー設定
Test-Path "~\.claude.json"

# プロジェクト設定
Test-Path ".claude.json"

# ローカル設定
Test-Path ".claude\settings.local.json"
```

2. **設定ファイルの再生成**
```powershell
.\setup-claude-code.ps1 -Force
```

### 問題2: JSON構文エラー

```
Error: Invalid JSON
Error: Unexpected token
```

**解決方法**:

1. **JSON構文の確認**
```powershell
# JSON構文チェック
Get-Content ~/.claude.json | ConvertFrom-Json
```

2. **設定ファイルの修正**
```json
{
  "mcpServers": {
    "windows-build-server": {
      "type": "stdio",
      "command": "node",
      "args": ["server/src/server.js"]
    }
  }
}
```

## 💻 システム要件

### 最小要件

- **OS**: Windows 10 (1903以降) / Windows 11
- **Node.js**: v18.0.0以上
- **PowerShell**: 5.1以上
- **メモリ**: 4GB以上
- **ディスク**: 500MB以上の空き容量

### 推奨要件

- **OS**: Windows 11 (最新版)
- **Node.js**: v20.0.0以上
- **PowerShell**: 7.0以上
- **メモリ**: 8GB以上
- **ディスク**: 2GB以上の空き容量

### 依存関係の確認

```powershell
# システム情報取得
Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,TotalPhysicalMemory

# 必要なツールの確認
node --version
npm --version
$PSVersionTable.PSVersion
```

## 🔧 高度なトラブルシューティング

### デバッグモードの有効化

```json
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "DEBUG": "*",
        "LOG_LEVEL": "debug",
        "ENABLE_DEV_COMMANDS": "true"
      }
    }
  }
}
```

### プロセス監視

```powershell
# プロセス監視スクリプト
while ($true) {
    Get-Process node | Select-Object CPU,WorkingSet,ProcessName,StartTime
    Start-Sleep -Seconds 5
}
```

### ネットワーク診断

```powershell
# ポート接続テスト
Test-NetConnection -ComputerName localhost -Port 8080

# DNS解決テスト
Resolve-DnsName localhost
```

## 📞 サポートリソース

### 公式ドキュメント

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/claude-code)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Node.js Documentation](https://nodejs.org/docs/)

### コミュニティサポート

- GitHub Issues: [プロジェクトのIssuesページ]
- Discord: [開発者コミュニティ]
- Stack Overflow: [タグ: claude-code, mcp]

### 問題報告テンプレート

```markdown
## 問題の概要
[問題の簡潔な説明]

## 環境情報
- OS: Windows 11
- Node.js: v20.0.0
- PowerShell: 7.3.0
- Windows MCP Server: v1.0.40

## 再現手順
1. [手順1]
2. [手順2]
3. [手順3]

## 期待される結果
[期待していた動作]

## 実際の結果
[実際に発生した動作]

## エラーメッセージ
```
[エラーメッセージをここに]
```

## ログファイル
[関連するログファイルの内容]
```

## 🎯 予防策

### 定期メンテナンス

```powershell
# 定期的なログクリーンアップ
Get-ChildItem server\src\logs\*.log | Where-Object LastWriteTime -lt (Get-Date).AddDays(-7) | Remove-Item

# 依存関係の更新
npm update

# キャッシュクリア
npm cache clean --force
```

### 監視スクリプト

```powershell
# ヘルスチェックスクリプト
function Test-MCPServer {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -Method GET -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ MCP Server is healthy" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ MCP Server is not responding" -ForegroundColor Red
    }
}

# 5分ごとにヘルスチェック
while ($true) {
    Test-MCPServer
    Start-Sleep -Seconds 300
}
```

---

**🆘 それでも問題が解決しない場合は、ログファイルと設定ファイルを添付してサポートチームにお問い合わせください。**