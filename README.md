# Windows MCP Build Server v1.0.44

## 🌟 このプロジェクトについて

**好きな環境で開発、必要な環境で実行** - Mac/LinuxでClaude Codeを使って開発し、Windows環境でビルド・テスト・デプロイを実行できるMCPサーバーです。

### 🎯 できること

- 🍎 **Mac開発者**: macOS + Claude Code → Windows環境でWPF/WinFormsビルド
- 🐧 **Linux開発者**: Ubuntu/Arch等 → Windows固有処理実行  
- 💻 **Windows開発者**: ローカル → リモートWindows環境で処理
- 🔧 **自動プロジェクト判定**: WPF/MAUI/Xamarinプロジェクト自動検出と最適環境推奨

### 💡 使用例

```bash
# 環境分析とプロジェクト自動判定（New in v1.0.44）
@windows-build-server environment_info projectPath="C:\MyWpfApp" analyzeProject=true

# Claude Codeから直接実行
@windows-build-server build_dotnet project_path="C:\MyApp" configuration="Release"
@windows-build-server run_powershell command="Get-Process"
@windows-build-server build_python project_path="C:\PythonApp" create_venv="true"
```

## 📚 詳細な使用方法

**詳しい設定手順・使用方法・トラブルシューティングについては、以下のドキュメントをご覧ください:**

### 👥 [外部ユーザー向け接続ガイド](./docs/EXTERNAL_USER_GUIDE.md)
- **完全な設定手順**: Windows環境セットアップからクライアント設定まで
- **実際のワークフロー**: WPF/Python/フルスタック開発の具体例
- **トラブルシューティング**: 接続・認証・ビルドエラーの解決方法
- **高度な設定**: セキュリティ・リモートホスト・環境変数設定
- **運用・監視**: ログ確認・メンテナンス・ベストプラクティス

### 📚 その他のドキュメント
- **[ドキュメント一覧](./docs/README.md)** - 技術ドキュメント・API・アーキテクチャ
- **[変更履歴](./docs/CHANGELOG.md)** - バージョンごとの詳細な更新履歴
- **[使用例集](./docs/USE_CASES.md)** - 実際のプロジェクト例とワークフロー

**新機能（v1.0.44）:**
- 🔍 **environment_info**: 環境分析・プロジェクト判定ツール
- 🎯 **ProjectDetector**: WPF/WinForms/MAUI自動検出エンジン
- 📊 **Build Strategy**: プロジェクトタイプ別最適ツール推奨
- 🌐 **System Intelligence**: .NET SDK/PowerShell/Windows SDK検出

## ⚡ クイックスタート

**初回利用の方は、詳細な手順を [外部ユーザー向け接続ガイド](./docs/EXTERNAL_USER_GUIDE.md) でご確認ください。**

```powershell
# 1. Windows環境でのセットアップ
git clone https://github.com/your-repo/windows-mcp-server.git
cd windows-mcp-server
npm install
npm run dangerous

# 2. 環境確認（Claude Codeから実行）
@windows-build-server environment_info includeSystemInfo=true

# 3. プロジェクトビルド例
@windows-build-server build_dotnet project_path="C:/MyWpfApp.csproj" configuration="Release"
```

## 🚀 インストール方法

### 1. 自動セットアップ（推奨）

```powershell
# 管理者権限でPowerShellを起動
git clone https://github.com/your-repo/windows-mcp-server.git
cd windows-mcp-server
.\setup-claude-code.ps1
```

### 2. 手動セットアップ

1. **認証トークンを生成**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **環境設定ファイルを作成**
```env
# .env ファイル
MCP_AUTH_TOKEN=your-generated-token-here
MCP_SERVER_PORT=8080-8089
ALLOWED_BUILD_PATHS=C:\builds\
ENABLE_DEV_COMMANDS=true
```

3. **Claude Code設定**
プロジェクトルートに`.mcp.json`を作成：
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
        "ENABLE_DEV_COMMANDS": "true"
      }
    }
  }
}
```

## 🔄 アップデート方法

### 自動アップデート

```powershell
# ローカル実行
npm run update

# リモート実行（Claude Codeから）
@windows-build-server mcp_self_build action="update" options='{"autoStart": true}'
```

### 手動アップデート

```powershell
git pull origin main
npm run install:all
```

## 🛠️ 対応ツール

.NET, Java, Python, Node.js, Go, Rust, C++, Docker, PowerShell など11ツール対応

## 📚 各種ドキュメント

### 🚀 利用者向け
- **[外部ユーザー向け接続ガイド](./docs/EXTERNAL_USER_GUIDE.md)** - 完全セットアップ・使用方法
- **[使用例集](./docs/USE_CASES.md)** - 実際のプロジェクト例とワークフロー

### 🔧 技術者向け  
- **[API完全リファレンス](./docs/api/COMPLETE_COMMAND_REFERENCE.md)** - 全コマンド詳細
- **[エンタープライズ機能ガイド](./docs/api/ENTERPRISE_FEATURES_GUIDE.md)** - 高度な機能・設定
- **[アーキテクチャドキュメント](./docs/architecture/ARCHITECTURE.md)** - システム設計・構成

### 📋 運用・管理
- **[変更履歴](./docs/CHANGELOG.md)** - 詳細なバージョン履歴  
- **[テスト結果](./docs/messages/TEST_RESULTS.md)** - 動作確認状況
- **[バグレポート対応](./docs/messages/)** - 問題解決履歴

### 📖 完全ドキュメント一覧
**[→ docs/README.md](./docs/README.md)** で目的別に整理されたドキュメント一覧をご確認ください。

## 📄 ライセンス

MIT License

---

**Mac/Linux開発 → Windows実行の完全ワークフローを今すぐ体験！**