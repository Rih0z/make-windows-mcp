# Windows MCP Server - Claude Code セットアップガイド

## 🚀 概要

このガイドでは、Windows MCP ServerをClaude Codeで使用できるように設定する手順を説明します。

## 📋 前提条件

- Windows 10/11 (推奨)
- Node.js v18+ インストール済み
- PowerShell 5.1+ または PowerShell Core 7+
- 管理者権限での実行可能性

## 🔧 セットアップ手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/your-username/windows-mcp-server.git
cd windows-mcp-server
```

### 2. 依存関係のインストール

```bash
# 全コンポーネントのインストール
npm run install:all

# または個別インストール
npm install
cd server && npm install
cd ../client && npm install
```

### 3. 環境設定

#### 3.1 環境変数ファイルの作成

```bash
# .envファイルを作成
copy .env.example .env
```

#### 3.2 基本設定の編集

`.env`ファイルを編集して以下を設定：

```env
# 🔑 認証設定
MCP_AUTH_TOKEN=your-secure-token-here

# 🌐 サーバー設定
MCP_SERVER_PORT=8080-8089
MCP_SERVER_HOST=localhost

# 📁 ビルドパス設定
ALLOWED_BUILD_PATHS=C:\builds\

# ⏱️ タイムアウト設定
COMMAND_TIMEOUT=30000
SSH_TIMEOUT=5000

# 🚦 レート制限設定
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60000

# 🔒 セキュリティ設定
ENABLE_DEV_COMMANDS=true
ENABLE_DANGEROUS_MODE=false
```

### 4. Claude Code 設定

#### 4.1 Claude Code設定ファイルの作成

Claude Codeの設定ディレクトリに移動：

**Windows:**
```cmd
cd %APPDATA%\Claude\mcp_settings
```

**macOS:**
```bash
cd ~/.config/claude-code/mcp_settings
```

#### 4.2 MCP設定ファイルの作成

**`.mcp.json`ファイルの作成 (プロジェクトルートに配置)**

```json
{
  "mcpServers": {
    "windows-build-server": {
      "type": "stdio",
      "command": "node",
      "args": ["./server/src/server.js"],
      "env": {
        "MCP_SERVER_PORT": "8080-8089",
        "ALLOWED_BUILD_PATHS": "C:\\builds\\",
        "COMMAND_TIMEOUT": "30000",
        "RATE_LIMIT_REQUESTS": "60",
        "ENABLE_DEV_COMMANDS": "true",
        "ENABLE_DANGEROUS_MODE": "false",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Claude Code設定ファイル (`claude_desktop_config.json`) の作成**

```json
{
  "mcpServers": {
    "windows-build-server": {
      "command": "node",
      "args": ["C:\\path\\to\\windows-mcp-server\\server\\src\\server.js"],
      "env": {
        "MCP_SERVER_PORT": "8080-8089",
        "ALLOWED_BUILD_PATHS": "C:\\builds\\",
        "COMMAND_TIMEOUT": "30000",
        "RATE_LIMIT_REQUESTS": "60",
        "ENABLE_DEV_COMMANDS": "true",
        "ENABLE_DANGEROUS_MODE": "false"
      }
    }
  }
}
```

### 5. 自動セットアップスクリプトの実行

便利な自動セットアップスクリプトを使用（推奨）：

```powershell
# 管理者権限でPowerShellを起動
.\setup-claude-code.ps1
```

このスクリプトは以下を自動実行します：
- 認証トークンの自動生成
- `.env`ファイルの作成
- `.mcp.json`ファイルの作成（トークンなし）
- ポート範囲設定（8080-8089）
- セキュアなビルドパス設定（C:\builds\）

### 6. 接続テスト

#### 6.1 サーバー単体テスト

```bash
# サーバーの起動テスト
npm start

# 別のターミナルで接続テスト
npm run test:connection
```

#### 6.2 Claude Code接続テスト

1. Claude Codeを起動
2. 新しいチャットを開始
3. 以下のコマンドを実行：

```
@windows-build-server tools/list
```

成功すると、利用可能なツールのリストが表示されます：

```
Available tools:
- build_dotnet: .NET project build
- build_java: Java project build  
- build_python: Python project build
- run_powershell: PowerShell command execution
- run_batch: Batch file execution
- mcp_self_build: MCP server self-management
- process_manager: Windows process management
- file_sync: File synchronization
```

## 🛠️ 使用例

### .NETプロジェクトのビルド

```
@windows-build-server build_dotnet projectPath="C:\projects\MyApp.csproj" buildTool="dotnet" configuration="Release"
```

### PowerShellコマンドの実行

```
@windows-build-server run_powershell command="Get-Process" workingDirectory="C:\temp"
```

### Javaプロジェクトのビルド

```
@windows-build-server build_java projectPath="C:\projects\java-app" buildTool="maven"
```

### Pythonプロジェクトのビルド

```
@windows-build-server build_python projectPath="C:\projects\python-app" requirements="requirements.txt"
```

## 🔒 セキュリティ設定

### 認証トークンの生成

```powershell
# 安全な認証トークンの生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 許可パスの設定

セキュリティのため、ビルドを許可するパスを制限：

```env
ALLOWED_BUILD_PATHS=C:\builds\;C:\projects\;C:\development\
```

### 開発モードの有効化

開発時のみ有効化：

```env
ENABLE_DEV_COMMANDS=true
DEV_COMMAND_PATHS=C:\development\;C:\temp\
```

## 🐛 トラブルシューティング

### 問題1: 接続エラー

```
Error: MCP connection failed
```

**解決方法:**
1. サーバーが起動していることを確認
2. ポート8080が使用可能であることを確認
3. 認証トークンが正しく設定されていることを確認

### 問題2: コマンド実行エラー

```
Error: Command execution failed
```

**解決方法:**
1. PowerShellの実行ポリシーを確認
2. 必要な権限があることを確認
3. パスが許可リストに含まれていることを確認

### 問題3: ビルドエラー

```
Error: Build tool not found
```

**解決方法:**
1. 必要なビルドツールがインストールされていることを確認
2. PATH環境変数が正しく設定されていることを確認
3. プロジェクトパスが正しいことを確認

## 📊 ログとモニタリング

### ログファイルの確認

```powershell
# アプリケーションログ
Get-Content server\src\logs\app.log -Tail 50

# エラーログ
Get-Content server\src\logs\error.log -Tail 50

# セキュリティログ
Get-Content server\src\logs\security.log -Tail 50
```

### サーバー状態の確認

```
@windows-build-server ping_host host="localhost"
```

## 🔄 アップデート

### 自動アップデート

```
@windows-build-server mcp_self_build action="update" options='{"autoStart": true}'
```

### 手動アップデート

```bash
npm run update
```

## 📁 ディレクトリ構造

```
windows-mcp-server/
├── server/
│   ├── src/
│   │   ├── server.js          # メインサーバー
│   │   ├── utils/             # ユーティリティ
│   │   └── logs/              # ログファイル
│   └── package.json
├── client/
│   ├── src/
│   │   └── mcp-client.js      # クライアント
│   └── package.json
├── tests/                     # テストファイル
├── .env.example              # 環境変数テンプレート
└── CLAUDE_CODE_SETUP.md      # このファイル
```

## 🎯 高度な設定

### カスタムツールの追加

新しいツールを追加する場合：

1. `server/src/server.js`の`tools`配列に追加
2. 適切なセキュリティ検証を実装
3. テストケースを追加

### セキュリティ強化

本番環境での推奨設定：

```env
# 厳格なセキュリティ設定
ENABLE_DANGEROUS_MODE=false
RATE_LIMIT_REQUESTS=30
ALLOWED_BUILD_PATHS=C:\builds\
LOG_LEVEL=info
```

## 🆘 サポート

### 公式ドキュメント

- [MCP Protocol Documentation](https://spec.modelcontextprotocol.io/)
- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/claude-code)

### 問題報告

GitHub Issues: [https://github.com/your-username/windows-mcp-server/issues](https://github.com/your-username/windows-mcp-server/issues)

## 📝 ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

---

**🎉 セットアップ完了！**

Windows MCP ServerがClaude Codeで使用できるようになりました。質問やサポートが必要な場合は、上記のサポートリンクをご利用ください。