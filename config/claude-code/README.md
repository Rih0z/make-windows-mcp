# Claude Code 設定ファイルテンプレート

このディレクトリには、Windows MCP ServerをClaude Codeで使用するための設定ファイルテンプレートが含まれています。

## 📁 テンプレートファイル一覧

### 0. `.mcp.json`
**用途**: プロジェクトルート用の標準MCP設定ファイル
**配置場所**: プロジェクトルートディレクトリ
**特徴**:
- Claude Codeが自動的に認識
- 基本的なセキュリティ設定
- 標準的なパスとタイムアウト設定
- 開発環境での使用に適した設定

### 1. `user-scope.json`
**用途**: 個人用設定（ユーザー全体で共有）
**配置場所**: `~/.claude.json`
**特徴**:
- 個人の開発環境用
- 基本的なセキュリティ設定
- 標準的なパスとタイムアウト設定

### 2. `project-scope.json`
**用途**: プロジェクト固有設定
**配置場所**: `project-root/.claude.json`
**特徴**:
- プロジェクト固有のパス設定
- 開発コマンドが有効
- デバッグレベルのログ

### 3. `development.json`
**用途**: 開発環境用設定
**配置場所**: `project-root/.claude/settings.local.json`
**特徴**:
- 開発コマンドと危険モードが有効
- 長いタイムアウト設定
- 高いレート制限
- デバッグログ有効

### 4. `production.json`
**用途**: 本番環境用設定
**配置場所**: `~/.claude.json`
**特徴**:
- 厳格なセキュリティ設定
- 低いレート制限
- 警告レベルのログのみ
- 危険モード無効

### 5. `team-shared.json`
**用途**: チーム共有設定
**配置場所**: `project-root/.claude.json`
**特徴**:
- チーム共有パス設定
- 適度なレート制限
- チーム用認証設定

## 🔧 使用方法

### 1. 手動設定

1. 適切なテンプレートファイルを選択
2. パスとトークンを環境に合わせて編集
3. Claude Codeの設定ディレクトリに配置

### 2. 自動設定スクリプト使用

```powershell
# 基本設定 (.mcp.json を作成)
.\setup-claude-code.ps1

# プロジェクト設定
.\setup-claude-code.ps1 -Scope project

# 開発環境設定
.\setup-claude-code.ps1 -Scope local -DangerousMode
```

## 📝 設定のカスタマイズ

### 必須設定項目

1. **MCP_AUTH_TOKEN**: `.env`ファイルで管理（`.mcp.json`には記載しない）
2. **server.js のパス**: 実際のインストールパスに変更
3. **ALLOWED_BUILD_PATHS**: 許可するビルドパスに変更

### セキュリティ設定

**正しい設定方法**:
```bash
# .env ファイル（Git除外対象）
MCP_AUTH_TOKEN=your-secure-32-character-token-here
```

```json
// .mcp.json ファイル（Git追跡対象）
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "MCP_SERVER_PORT": "8080-8089",
        "ALLOWED_BUILD_PATHS": "C:\\builds\\"
      }
    }
  }
}
```

### オプション設定項目

```json
{
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
```

**⚠️ 重要**: `MCP_AUTH_TOKEN`は`.env`ファイルで管理し、`.mcp.json`には記載しないでください。

## 🔒 セキュリティ設定

### 開発環境
- `ENABLE_DEV_COMMANDS`: true
- `ENABLE_DANGEROUS_MODE`: true（注意して使用）
- `RATE_LIMIT_REQUESTS`: 1000（高い値）

### 本番環境
- `ENABLE_DEV_COMMANDS`: true（デフォルト、開発機能有効）
- `ENABLE_DANGEROUS_MODE`: false
- `RATE_LIMIT_REQUESTS`: 30（低い値）

## 🚀 設定の切り替え

### 環境別設定の管理

```powershell
# プロジェクトルート用 (.mcp.json)
copy claude-config-templates\.mcp.json .mcp.json

# 開発環境
copy claude-config-templates\development.json .claude\settings.local.json

# 本番環境
copy claude-config-templates\production.json ~/.claude.json

# チーム共有
copy claude-config-templates\team-shared.json .claude.json
```

## 📊 ログレベル設定

| レベル | 用途 | 出力内容 |
|--------|------|----------|
| `debug` | 開発 | 全てのログ |
| `info` | 標準 | 基本的な情報 |
| `warn` | 本番 | 警告以上 |
| `error` | 最小 | エラーのみ |

## 🔄 設定の更新

### 自動更新
```powershell
# 設定を再生成
.\setup-claude-code.ps1 -Force

# 特定のスコープで更新
.\setup-claude-code.ps1 -Scope project -Force
```

### 手動更新
1. 設定ファイルを編集
2. Claude Codeを再起動
3. 接続テストを実行

## 🐛 トラブルシューティング

### よくある問題

1. **認証エラー**: トークンが正しく設定されているか確認
2. **パスエラー**: server.jsのパスが正しいか確認
3. **権限エラー**: 必要な権限があるか確認

### デバッグ方法

1. ログレベルを`debug`に設定
2. サーバーを手動起動して確認
3. 設定ファイルの構文チェック

## 📚 参考資料

- [Claude Code MCP Documentation](https://docs.anthropic.com/claude/docs/claude-code)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Windows MCP Server Documentation](../CLAUDE_CODE_SETUP.md)