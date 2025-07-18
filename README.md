# Windows MCP Build Server v1.0.42

## 🌟 このプロジェクトについて

**好きな環境で開発、必要な環境で実行** - Mac/LinuxでClaude Codeを使って開発し、Windows環境でビルド・テスト・デプロイを実行できるMCPサーバーです。

### 🎯 できること

- 🍎 **Mac開発者**: macOS + Claude Code → Windows環境でビルド
- 🐧 **Linux開発者**: Ubuntu/Arch等 → Windows固有処理実行  
- 💻 **Windows開発者**: ローカル → リモートWindows環境で処理

### 💡 使用例

```bash
# Claude Codeから直接実行
@windows-build-server build_dotnet project_path="C:\MyApp" configuration="Release"
@windows-build-server run_powershell command="Get-Process"
@windows-build-server build_python project_path="C:\PythonApp" create_venv="true"
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

## 📋 対応言語・ツール

- ✅ .NET (dotnet)
- ✅ Java (mvn, gradle)
- ✅ Python (pip, pytest, venv)
- ✅ Node.js (npm, yarn)
- ✅ Go (go build)
- ✅ Rust (cargo)
- ✅ C++ (cmake, msbuild)
- ✅ Docker
- ✅ PowerShell

## 🔒 セキュリティ

- **3段階モード**: 通常/開発/危険モード
- **認証**: Bearer Token
- **制限**: IP制限、レート制限、コマンド検証
- **監査**: 全操作ログ記録

## 📚 詳細ドキュメント

- **[セットアップガイド](CLAUDE_CODE_SETUP.md)** - 詳細な設定手順
- **[設定テンプレート](config/claude-code/)** - 環境別設定例
- **[トラブルシューティング](TROUBLESHOOTING.md)** - 問題解決ガイド
- **[セキュリティガイド](SECURITY.md)** - セキュリティ設定

## 🔧 開発・貢献

```bash
# 開発環境セットアップ
npm run install:all
npm run build:all

# テスト実行
npm test
npm run test:coverage
```

## 📈 アップデート履歴

<details>
<summary>📜 詳細なアップデート履歴を表示</summary>

### v1.0.42 (2025-07-18)
- ✅ プロジェクト構造の完全整理
- ✅ セキュリティ強化（.env分離）
- ✅ ポート範囲機能（8080-8089）
- ✅ 開発機能デフォルト有効化

### v1.0.41 (2025-07-17)
- ✅ Claude Code統合システム完成
- ✅ 自動セットアップスクリプト
- ✅ 設定テンプレート追加

### v1.0.40 (2025-07-17)
- ✅ テスト強化・カバレッジ向上
- ✅ エンタープライズ機能拡張

### 過去のバージョン

#### v1.0.33 (2025-07-14)
- ✅ Python仮想環境サポート
- ✅ エンタープライズPython開発対応

#### v1.0.32 (2025-07-13)
- 🔧 PowerShell実行の回帰バグ修正

#### v1.0.31 (2025-07-12)
- 🔧 タイムアウト・エンコード・テスト強化

#### v1.0.30 (2025-07-11)
- ✅ JSON・UTF-8・ストリーミング対応

#### v1.0.29 (2025-07-10)
- ✅ 動的ヘルプシステム実装

#### v1.0.28 (2025-07-09)
- ✅ エンタープライズ認証システム強化

#### v1.0.27 (2025-07-08)
- ✅ PDF Base64エンコードツール実装

#### v1.0.26-25 (2025-07-07-06)
- ✅ スマートサーバー発見・ポート管理システム

</details>

## 📄 ライセンス

MIT License - 自由に使用・改変・配布可能

---

**環境に束縛されない開発体験を今すぐ始めましょう！**