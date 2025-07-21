# Windows MCP Server 外部ユーザー接続ガイド
**Windows開発環境完全対応版**

## 🌟 概要

Windows MCP Serverを使用することで、**Mac/LinuxでClaude Codeを使って開発しながら、Windows環境でビルド・テスト・デプロイを実行**できます。

### 🎯 できること
- 🍎 **Mac開発者**: macOS + Claude Code → Windows環境でWPF/WinFormsビルド
- 🐧 **Linux開発者**: Ubuntu/Arch等 → Windows固有処理実行  
- 💻 **Windows開発者**: ローカル → リモートWindows環境で処理
- 🔧 **自動プロジェクト判定**: WPF/MAUI/Xamarinプロジェクト自動検出と最適環境推奨

---

## 🚀 Step 1: Windows環境での初期セットアップ

### 1.1 必要な環境
- **Windows 10/11** (推奨)
- **PowerShell 5.1+** (Windows標準)
- **.NET SDK 6.0/8.0/9.0** ([Microsoft公式](https://dotnet.microsoft.com/download)からダウンロード)
- **Node.js 18+** ([公式サイト](https://nodejs.org/)からダウンロード)

### 1.2 サーバーインストール
```powershell
# 管理者権限でPowerShellを起動
git clone https://github.com/your-repo/windows-mcp-server.git
cd windows-mcp-server
.\setup-claude-code.ps1
```

### 1.3 環境設定ファイル作成
```powershell
# .envファイルを作成
@"
MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd
MCP_SERVER_PORT=8080-8089
ALLOWED_BUILD_PATHS=C:\builds\
ENABLE_DEV_COMMANDS=true
ENABLE_DANGEROUS_MODE=true
BUILD_BASE_DIR=C:\build
"@ | Out-File -FilePath .env -Encoding UTF8
```

### 1.4 サーバー起動
```powershell
# 通常モード
npm start

# 危険モード（全機能利用可能）
npm run dangerous
```

---

## 🔌 Step 2: クライアント側（Mac/Linux）セットアップ

### 2.1 Claude Code設定
プロジェクトルートに`.mcp.json`を作成：

```json
{
  "mcpServers": {
    "windows-build-server": {
      "command": "npx",
      "args": [
        "-y",
        "windows-mcp-client",
        "--server-url", "http://YOUR_WINDOWS_IP:8080",
        "--auth-token", "JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd"
      ]
    }
  }
}
```

### 2.2 認証トークンの設定
Mac/Linuxの`.env`ファイル（クライアント側）:
```bash
MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd
MCP_SERVER_URL=http://YOUR_WINDOWS_IP:8080
```

---

## 🔧 Step 3: 基本的な使用方法

### 3.1 環境確認と分析
```bash
# Windows環境の状態確認
@windows-build-server environment_info includeSystemInfo=true

# プロジェクト分析（WPF/WinForms/MAUI自動判定）
@windows-build-server environment_info projectPath="C:/MyProject" analyzeProject=true
```

### 3.2 WPFプロジェクトのビルド
```bash
# WPFアプリケーション完全ビルド
@windows-build-server build_dotnet project_path="C:/MyWpfApp/MyWpfApp.csproj" configuration="Release"

# 出力確認
# → C:\build\MyWpfApp\release\ にEXEファイル生成
```

### 3.3 リモートIP指定でのビルド
```bash
# 特定のWindows環境を指定（例: 192.168.1.100）
@windows-build-server build_dotnet project_path="C:/MyWpfApp.csproj" configuration="Release" remoteHost="192.168.1.100"
```

---

## 🛠️ Step 4: 利用可能なツール一覧

### 4.1 ビルドツール
| ツール | 対応プロジェクト | 使用例 |
|--------|-----------------|--------|
| `build_dotnet` | WPF, WinForms, WinUI, .NET Core | `build_dotnet project_path="C:/App.csproj"` |
| `build_python` | Python (仮想環境対応) | `build_python project_path="C:/PyApp" create_venv=true` |
| `build_java` | Java, Maven, Gradle | `build_java project_path="C:/JavaApp" build_tool="maven"` |
| `build_nodejs` | React, Vue, Angular | `build_nodejs project_path="C:/ReactApp" action="build"` |

### 4.2 システムツール
| ツール | 機能 | 使用例 |
|--------|------|--------|
| `run_powershell` | PowerShellコマンド実行 | `run_powershell command="Get-Process"` |
| `run_batch` | バッチファイル実行 | `run_batch file_path="C:/scripts/deploy.bat"` |
| `environment_info` | 環境分析・プロジェクト判定 | `environment_info analyzeProject=true` |

### 4.3 ネットワークツール
| ツール | 機能 | 使用例 |
|--------|------|--------|
| `http_json_request` | AI APIテスト | `http_json_request url="http://localhost:8090/api/chat"` |
| `ping_host` | 接続確認 | `ping_host host="google.com"` |

---

## 📋 Step 5: 実際のワークフロー例

### 5.1 WPFアプリケーションの完全ビルド手順

```bash
# 1. プロジェクト分析
@windows-build-server environment_info projectPath="C:/MyWpfApp" analyzeProject=true

# 出力例:
# 🔍 Project Analysis
# 📊 Detected Project Types (1):
#    1. WPF Desktop Application (95% confidence)
#       Environment: WINDOWS
# 🎯 Recommended Environment: WINDOWS
# 🛠️ Recommended Tools: • build_dotnet

# 2. WPFプロジェクトビルド実行
@windows-build-server build_dotnet project_path="C:/MyWpfApp/MyWpfApp.csproj" configuration="Release"

# 3. ビルド結果確認
@windows-build-server run_powershell command="Get-ChildItem C:\build\MyWpfApp\release\"

# 4. アプリケーション実行テスト
@windows-build-server run_powershell command="cd C:\build\MyWpfApp\release; .\MyWpfApp.exe"
```

### 5.2 Python仮想環境プロジェクトのビルド

```bash
# 1. Python環境分析
@windows-build-server environment_info projectPath="C:/MyPythonApp" analyzeProject=true

# 2. 仮想環境作成とビルド
@windows-build-server build_python project_path="C:/MyPythonApp" action="build" create_venv=true

# 3. テスト実行
@windows-build-server build_python project_path="C:/MyPythonApp" action="test" create_venv=true
```

---

## 🔧 Step 6: トラブルシューティング

### 6.1 接続エラー
```bash
# エラー: "Connection refused"
# 解決方法:
# 1. Windows側でサーバーが起動しているか確認
@windows-build-server run_powershell command="Get-Process -Name node"

# 2. ファイアウォール設定確認
@windows-build-server run_powershell command="netstat -an | findstr :8080"
```

### 6.2 認証エラー
```bash
# エラー: "Invalid authorization token"
# 解決方法: 両方の.envファイルでトークンが一致しているか確認

# Windows側 (.env)
MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd

# クライアント側 (.env)  
MCP_AUTH_TOKEN=JIGrimGrHsJ7rTMReMZJJbPNOmkODUEd
```

### 6.3 ビルドエラー
```bash
# .NET SDKが見つからない場合
@windows-build-server run_powershell command="dotnet --list-sdks"

# PowerShell実行ポリシーエラー
@windows-build-server run_powershell command="Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
```

---

## ⚙️ Step 7: 高度な設定

### 7.1 セキュリティ設定

```bash
# 通常モード（推奨）
npm start

# 開発モード（開発用コマンド追加）
ENABLE_DEV_COMMANDS=true npm start

# 危険モード（全機能、本番非推奨）
ENABLE_DANGEROUS_MODE=true npm start
```

### 7.2 環境変数の詳細設定

```env
# サーバー設定
MCP_SERVER_PORT=8080-8089          # ポート範囲
RATE_LIMIT_REQUESTS=60             # レート制限
COMMAND_TIMEOUT=1800000            # コマンドタイムアウト

# ビルド設定
BUILD_BASE_DIR=C:\build            # ビルド出力ベースディレクトリ
ALLOWED_BUILD_PATHS=C:\builds\     # 許可されたビルドパス

# 開発設定
ENABLE_DEV_COMMANDS=true           # 開発コマンド有効化
ENABLE_DANGEROUS_MODE=false        # 危険モード（本番ではfalse）

# ログ設定  
MAX_LOG_SIZE=10485760             # ログファイル最大サイズ
MAX_LOG_FILES=5                   # ログファイル保持数
```

### 7.3 リモートホスト接続設定

```bash
# 複数のWindows環境を使い分け
# 開発環境
@windows-build-server build_dotnet remoteHost="192.168.1.100" project_path="C:/App.csproj"

# ステージング環境  
@windows-build-server build_dotnet remoteHost="10.0.1.50" project_path="C:/App.csproj"

# 本番環境
@windows-build-server build_dotnet remoteHost="203.0.113.10" project_path="C:/App.csproj"
```

---

## 📊 Step 8: 運用・監視

### 8.1 サーバー状態監視
```bash
# サーバー状態確認
@windows-build-server environment_info includeSystemInfo=false

# 出力例:
# 🌐 Connection Status
# ✅ MCP Server: Active and responding
# 🔐 Authentication: Enabled  
# ⚡ Dangerous Mode: 🟢 Disabled
# 📝 Rate Limiting: Active
```

### 8.2 ログ確認
```bash
# アプリケーションログ
@windows-build-server run_powershell command="Get-Content C:\mcp-server\server\src\logs\app.log -Tail 20"

# エラーログ
@windows-build-server run_powershell command="Get-Content C:\mcp-server\server\src\logs\error.log -Tail 20"

# セキュリティログ  
@windows-build-server run_powershell command="Get-Content C:\mcp-server\server\src\logs\security.log -Tail 20"
```

### 8.3 定期メンテナンス
```bash
# サーバー更新（最新版取得）
@windows-build-server run_powershell command="cd C:\mcp-server; npm run update"

# サービス再起動
@windows-build-server run_powershell command="cd C:\mcp-server; npm run dangerous"

# ログローテーション（自動実行されるが、手動でも可能）
@windows-build-server run_powershell command="cd C:\mcp-server\server\src\logs; Get-ChildItem *.log"
```

---

## 🔒 Step 9: セキュリティベストプラクティス

### 9.1 認証トークン管理
```bash
# 新しい認証トークンの生成
@windows-build-server run_powershell command="node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""

# 生成例: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### 9.2 IP制限設定
```env
# .env ファイル
ALLOWED_IPS=192.168.1.0/24,10.0.1.0/24,203.0.113.0/24
ENABLE_IP_RESTRICTION=true
```

### 9.3 ファイアウォール設定
```powershell
# Windows Defender ファイアウォール設定
New-NetFirewallRule -DisplayName "MCP Server" -Direction Inbound -Protocol TCP -LocalPort 8080-8089 -Action Allow
```

---

## 🎯 Step 10: 使用例集

### 10.1 WPF開発者向け
```bash
# WPFプロジェクト開発の完全ワークフロー

# 1. プロジェクト分析
@windows-build-server environment_info projectPath="C:/MyWpfApp" analyzeProject=true

# 2. デバッグビルド
@windows-build-server build_dotnet project_path="C:/MyWpfApp/MyWpfApp.csproj" configuration="Debug"

# 3. テスト実行
@windows-build-server run_powershell command="cd C:\build\MyWpfApp\release; dotnet test"

# 4. リリースビルド
@windows-build-server build_dotnet project_path="C:/MyWpfApp/MyWpfApp.csproj" configuration="Release"

# 5. 実行ファイル確認
@windows-build-server run_powershell command="Get-ChildItem C:\build\MyWpfApp\release\*.exe"
```

### 10.2 Python開発者向け
```bash
# Python + AI統合アプリケーション開発

# 1. 仮想環境セットアップ
@windows-build-server build_python project_path="C:/MyAiApp" action="setup" create_venv=true

# 2. 依存関係インストール  
@windows-build-server build_python project_path="C:/MyAiApp" action="install" create_venv=true

# 3. AI APIテスト
@windows-build-server http_json_request url="http://localhost:8090/api/chat" jsonPayload="{\"message\":\"Hello AI\",\"model\":\"gpt-4\"}"

# 4. アプリケーションテスト
@windows-build-server build_python project_path="C:/MyAiApp" action="test" create_venv=true
```

### 10.3 フルスタック開発者向け
```bash
# React + .NET API + SQLServer 統合開発

# 1. フロントエンド（React）ビルド
@windows-build-server build_nodejs project_path="C:/MyApp/frontend" action="build"

# 2. バックエンド（.NET API）ビルド
@windows-build-server build_dotnet project_path="C:/MyApp/backend/MyApi.csproj" configuration="Release"

# 3. データベースマイグレーション
@windows-build-server run_powershell command="cd C:\MyApp\backend; dotnet ef database update"

# 4. 統合テスト実行
@windows-build-server run_powershell command="cd C:\build\MyApi\release; .\MyApi.exe --environment=Testing"

# 5. APIエンドポイントテスト
@windows-build-server http_json_request url="http://localhost:5000/api/health" method="GET" jsonPayload="{}"
```

---

## 🚀 まとめ

Windows MCP Server v1.0.44により、以下が可能になりました：

### ✅ **完全対応済み**
- **WPF/WinForms/WinUI**: 完全ビルド・デプロイ対応
- **Cross-platform開発**: Mac/Linux開発 → Windows配布
- **自動プロジェクト判定**: 最適環境・ツール推奨
- **リモートIP指定**: 複数Windows環境対応
- **AI統合開発**: AI APIテスト・統合ワークフロー

### 🎯 **あらゆるWindowsアプリケーション対応**
WPF、WinForms、WinUIアプリケーションは、このガイドに従って完全にビルド・配布可能です。

### 🔧 **サポート**
技術的な質問や問題が発生した場合は、GitHub Issues または `environment_info` ツールでの詳細分析結果をご提供ください。

---

**最終更新**: 2025-07-21  
**対応バージョン**: Windows MCP Server v1.0.44  
**ステータス**: ✅ Production Ready