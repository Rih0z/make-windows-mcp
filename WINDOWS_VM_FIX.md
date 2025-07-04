# Windows VM サーバーエラー修正手順

## 🚨 エラー内容
```
Error: Cannot find module 'C:\mcp-server\src\server.js'
```

## 🔧 即座の修正方法

### 方法1: Emergency Fix スクリプト実行（推奨）

Windows VM で以下のコマンドを実行：

```powershell
# 1. 修正スクリプトをダウンロード
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Rih0z/make-windows-mcp/main/server/setup/emergency-fix.ps1" -OutFile "C:\mcp-server\emergency-fix.ps1"

# 2. スクリプトを実行
powershell -ExecutionPolicy Bypass -File "C:\mcp-server\emergency-fix.ps1"

# 3. サーバーを起動
cd C:\mcp-server
npm run dangerous
```

### 方法2: 手動修正

1. **現在のディレクトリ構造を確認**：
```powershell
cd C:\mcp-server
dir
dir src
```

2. **package.json を手動で修正**：

もし `src\server.js` が存在する場合：
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "set NODE_ENV=development && node src/server.js",
    "dangerous": "set ENABLE_DANGEROUS_MODE=true && node src/server.js"
  }
}
```

もし `server.js` がルートにある場合：
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "set NODE_ENV=development && node server.js",
    "dangerous": "set ENABLE_DANGEROUS_MODE=true && node server.js"
  }
}
```

3. **バージョンを更新**：
```json
"version": "1.0.10"
```

### 方法3: GitHub から最新版を取得

```powershell
# 1. 現在のディレクトリをバックアップ
cd C:\
rename mcp-server mcp-server-backup

# 2. 最新版をクローン
git clone https://github.com/Rih0z/make-windows-mcp.git mcp-temp

# 3. サーバーディレクトリをコピー
xcopy mcp-temp\server C:\mcp-server\ /E /I /Y

# 4. .env ファイルを復元
copy C:\mcp-server-backup\.env C:\mcp-server\.env

# 5. 依存関係をインストール
cd C:\mcp-server
npm install

# 6. サーバーを起動
npm run dangerous

# 7. テンポラリファイルを削除
rmdir C:\mcp-temp /S /Q
```

## 📋 トラブルシューティング

### server.js が見つからない場合

```powershell
# ファイルの場所を検索
dir C:\mcp-server\*.js /S /B | findstr server.js
```

### npm コマンドが動作しない場合

```powershell
# Node.js のインストール確認
node --version
npm --version

# PATH の確認
echo %PATH%
```

### 権限エラーの場合

```powershell
# 管理者として PowerShell を実行
Start-Process powershell -Verb RunAs
```

## 🎯 確認手順

修正が完了したら、以下を確認：

1. **バージョン確認**：
```powershell
type C:\mcp-server\package.json | findstr version
```
→ "version": "1.0.10" が表示されること

2. **サーバー起動テスト**：
```powershell
cd C:\mcp-server
npm start
```
→ "Windows MCP Server v1.0.10" が表示されること

3. **危険モード起動**：
```powershell
npm run dangerous
```
→ "🔥🔥🔥 MCP SERVER v1.0.10 - DANGEROUS MODE 🔥🔥🔥" が表示されること

## 💡 今後の自動更新

修正後は、以下のコマンドで自動更新が可能：

```powershell
cd C:\mcp-server
npm run update
```

## 🆘 それでも解決しない場合

1. C:\mcp-server の内容を確認：
   - `dir C:\mcp-server`
   - `dir C:\mcp-server\src`

2. エラーメッセージの詳細を確認

3. .env ファイルの存在確認：
   - `type C:\mcp-server\.env`

この情報を提供していただければ、より具体的な解決策を提案します。