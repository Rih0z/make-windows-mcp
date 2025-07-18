# Windows MCP Server - セキュリティガイド

## 🔒 セキュリティ設計原則

### 1. 秘密情報の分離
- **秘密情報**: `.env`ファイルで管理（Git除外対象）
- **設定情報**: `.mcp.json`で管理（Git追跡対象）

### 2. 認証トークンの管理

#### ✅ 正しい設定
```bash
# .env ファイル（Git除外対象）
MCP_AUTH_TOKEN=your-secure-32-character-token-here
```

```json
// .mcp.json ファイル（Git追跡対象）
{
  "mcpServers": {
    "windows-build-server": {
      "type": "stdio",
      "command": "node",
      "args": ["./server/src/server.js"],
      "env": {
        "MCP_SERVER_PORT": "8080-8089",
        "ALLOWED_BUILD_PATHS": "C:\\builds\\",
        "ENABLE_DEV_COMMANDS": "false"
      }
    }
  }
}
```

#### ❌ 危険な設定
```json
// .mcp.json にトークンを直接記載（危険）
{
  "mcpServers": {
    "windows-build-server": {
      "env": {
        "MCP_AUTH_TOKEN": "your-token-here"  // ❌ Git履歴に残る
      }
    }
  }
}
```

### 3. セキュリティ設定の階層

#### 最小権限の原則
```env
# 最小限の権限（推奨）
ALLOWED_BUILD_PATHS=C:\builds\
ENABLE_DEV_COMMANDS=false
ENABLE_DANGEROUS_MODE=false
```

#### 開発環境での追加権限
```env
# 開発環境のみ
ENABLE_DEV_COMMANDS=true
ENABLE_DANGEROUS_MODE=false  # 危険モードは本番環境で絶対に使用禁止
```

### 4. トークン生成

#### 安全なトークン生成方法
```bash
# PowerShell
-join ((1..32) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) })

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

### 5. ファイル権限

#### .envファイルの権限設定
```bash
# Windows
icacls .env /grant:r "%USERNAME%":F /inheritance:r
icacls .env /remove "Everyone" "Users" "Authenticated Users"

# Linux/macOS
chmod 600 .env
```

### 6. Git設定

#### .gitignoreの確認
```gitignore
# 必須：秘密情報を含むファイル
.env
.env.local
.env.production

# ログファイル
server/src/logs/
*.log

# 認証関連
auth-tokens.txt
credentials.json
```

### 7. 環境変数の継承

サーバーは以下の順序で環境変数を読み込みます：

1. **システム環境変数**
2. **プロセス環境変数**
3. **`.env`ファイル**
4. **`.mcp.json`の`env`設定**

優先度：システム環境変数 > プロセス環境変数 > .env > .mcp.json

### 8. セキュリティベストプラクティス

#### 本番環境
- `ENABLE_DANGEROUS_MODE=false`（必須）
- `ENABLE_DEV_COMMANDS=false`（推奨）
- `ALLOWED_BUILD_PATHS=C:\builds\`（最小限）
- `RATE_LIMIT_REQUESTS=30`（低い値）
- `LOG_LEVEL=warn`（最小限のログ）

#### 開発環境
- `ENABLE_DANGEROUS_MODE=false`（危険モード禁止）
- `ENABLE_DEV_COMMANDS=true`（開発コマンド許可）
- `ALLOWED_BUILD_PATHS=C:\builds\`（制限維持）
- `RATE_LIMIT_REQUESTS=100`（開発用）
- `LOG_LEVEL=debug`（デバッグ用）

### 9. 監査とログ

#### セキュリティログの監視
```bash
# セキュリティイベントの確認
Get-Content server/src/logs/security.log -Tail 50

# 認証エラーの確認
Select-String -Path server/src/logs/*.log -Pattern "Authentication failed"
```

### 10. 緊急時の対応

#### トークンの無効化
```bash
# .envファイルのトークンを変更
# サーバーを再起動
npm restart
```

#### 完全なセキュリティリセット
```bash
# 新しいトークンを生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# .envファイルを更新
# ログファイルをクリア
Remove-Item server/src/logs/*.log

# サーバーを再起動
npm restart
```

## 🚨 重要な注意事項

1. **絶対に行ってはいけない**：
   - `.mcp.json`にトークンを直接記載
   - `ENABLE_DANGEROUS_MODE=true`を本番環境で使用
   - `.env`ファイルをGitにコミット

2. **必ず実行する**：
   - `.env`ファイルの権限設定
   - `.gitignore`の確認
   - 定期的なトークン更新

3. **推奨事項**：
   - 最小権限の原則に従う
   - 定期的なセキュリティログの監視
   - 開発環境と本番環境の分離

## 📞 セキュリティ問題の報告

セキュリティ問題を発見した場合は、以下の手順で報告してください：

1. **機密情報を含む問題**：非公開チャンネルで報告
2. **一般的な問題**：GitHubのIssueで報告
3. **緊急性の高い問題**：開発チームに直接連絡

---

**🔒 セキュリティは継続的なプロセスです。定期的な見直しと更新を行ってください。**