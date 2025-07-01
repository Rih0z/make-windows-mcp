# Windows MCP ビルドサーバー

Windows VM上でMCP（Model Context Protocol）サーバーを構築し、macOS/LinuxのClaude CodeからWindows アプリケーションをリモートビルドできるようにするプロジェクトです。

## 機能

- 🔨 **リモート.NETビルド** - どのOSからでも.NETアプリケーションをビルド
- 💻 **PowerShellコマンド実行** - 安全なPowerShellコマンドの実行
- 🌐 **NordVPNメッシュネットワーク対応** - 複数のWindowsマシンを統合管理
- 🔗 **SSH経由リモート実行** - SSHでWindows間を接続
- 🔒 **セキュア通信** - トークンベース認証（本番環境用）
- 🛡️ **セキュリティ機能** - IPホワイトリスト、レート制限、パス制限
- 📝 **詳細なログ** - リクエスト/レスポンスの記録
- ⚡ **簡単セットアップ** - 自動インストールスクリプト付き

## 必要要件

- **Windows VM**: Windows 10/11、PowerShell 5.1以上
- **クライアント**: Claude Code CLIがインストールされたmacOS/Linux
- **ネットワーク**: クライアントとWindows VM間の接続
- **権限**: Windows VMの管理者アクセス
- **オプション**: NordVPNメッシュネットワーク（リモートWindows用）

## クイックスタート

### 1. Windows VMのセットアップ

```powershell
# 管理者権限で実行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\windows-setup.ps1

# サーバーディレクトリに移動
cd C:\mcp-server

# サーバーファイルをコピー
copy Z:\windows\server.js server.js /Y

# サーバーを起動
npm start
```

### 2. クライアント設定（Mac/Linux）

```bash
# リポジトリをクローン
git clone https://github.com/Rih0z/make-windows-mcp.git
cd make-windows-mcp
npm install

# 接続設定
cp .env.example .env
# .envファイルを編集してWindows VMのIPアドレスを設定
nano .env

# Claude Codeに追加
claude mcp add --user windows-build-server
```

## 設定

### 環境変数

| 変数名 | 説明 | 必須 | デフォルト |
|--------|------|------|------------|
| `WINDOWS_VM_IP` | Windows VMのIPアドレス | はい | - |
| `MCP_SERVER_PORT` | サーバーポート | いいえ | 8080 |
| `NORDVPN_ENABLED` | NordVPNメッシュネットワーク有効化 | いいえ | false |
| `NORDVPN_HOSTS` | NordVPNメッシュホストIP（カンマ区切り） | いいえ | - |
| `REMOTE_USERNAME` | リモートWindows認証ユーザー名 | いいえ | Administrator |
| `REMOTE_PASSWORD` | リモートWindows認証パスワード | いいえ | - |
| `SSH_TIMEOUT` | SSH接続タイムアウト（ms） | いいえ | 30000 |
| `MCP_AUTH_TOKEN` | 認証トークン | はい（本番環境） | - |
| `ALLOWED_IPS` | 許可IPリスト（カンマ区切り） | いいえ | すべて許可 |
| `ALLOWED_BUILD_PATHS` | ビルド許可パス | いいえ | Z:\,C:\projects\ |
| `LOG_LEVEL` | ログレベル | いいえ | info |

## 使い方

### .NETアプリケーションのビルド

```bash
# ローカルディレクトリからビルド（推奨）
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" configuration="Release"

# ネットワークドライブの場合は、まずローカルにコピー
@windows-build-server run_powershell command="Copy-Item -Path Z:\\myproject -Destination C:\\temp\\myproject -Recurse"
@windows-build-server build_dotnet projectPath="C:\\temp\\myproject\\app.csproj" configuration="Debug"
```

**⚠️ 重要**: ネットワークドライブ（Z:）から直接ビルドすると失敗する可能性があります。必ずローカルディレクトリ（C:）にコピーしてからビルドしてください。

### PowerShellコマンドの実行

```bash
# .NETバージョンを確認
@windows-build-server run_powershell command="dotnet --version"

# ファイル一覧
@windows-build-server run_powershell command="Get-ChildItem C:\\projects"

# プロセス確認
@windows-build-server run_powershell command="Get-Process | Select-Object -First 5"
```

### NordVPNメッシュネットワーク経由での操作

```bash
# リモートホストの接続テスト
@windows-build-server ping_host host="10.5.0.2"

# リモートWindows上でビルド実行
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" remoteHost="10.5.0.2"

# リモートでPowerShellコマンド実行
@windows-build-server run_powershell command="Get-Process" remoteHost="10.5.0.2"

# SSH経由で直接コマンド実行
@windows-build-server ssh_command host="10.5.0.2" username="Administrator" password="your_password" command="dotnet --version"
```

## プロジェクト構成

```
.
├── scripts/                    # ユーティリティスクリプト
│   ├── mcp-client.js          # MCPクライアントラッパー
│   └── configure.js           # 対話式設定スクリプト
├── sample-apps/               # サンプルアプリケーション
│   ├── HelloWorld.cs          # .NETコンソールアプリ
│   └── HelloWorld.csproj      # プロジェクトファイル
├── test-dotnet/               # テスト済み.NETアプリ
├── windows-setup.ps1          # Windowsインストーラー
├── server.js                  # MCPサーバー実装
├── claude-code-config.template.json  # Claude Code設定テンプレート
└── .env.example               # 環境変数テンプレート
```

## NordVPNメッシュネットワークセットアップ

### 1. NordVPN設定
1. NordVPNアプリでMeshnet機能を有効化
2. 各Windowsマシンを同じMeshnetに追加
3. 各マシンのMeshnet IPアドレスを確認

### 2. Windows設定（各リモートマシン）
```powershell
# OpenSSHサーバーを有効化
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# ファイアウォール設定
New-NetFirewallRule -Name "SSH" -DisplayName "SSH" -Protocol TCP -LocalPort 22 -Action Allow
```

### 3. 環境変数設定
```env
NORDVPN_ENABLED=true
NORDVPN_HOSTS=10.5.0.2,10.5.0.3,10.5.0.4
REMOTE_USERNAME=Administrator
REMOTE_PASSWORD=your_secure_password
```

## セキュリティのベストプラクティス

### 開発環境
- `MCP_AUTH_TOKEN`は空のままでOK
- IPホワイトリストの使用を推奨
- ログを定期的に確認

### 本番環境
1. **認証トークンを必ず設定**：
   ```bash
   openssl rand -hex 32  # セキュアなトークンを生成
   ```

2. **IPホワイトリストを設定**：
   ```env
   ALLOWED_IPS=192.168.1.100,192.168.1.101,10.5.0.0/24
   ```

3. **ビルドパスを制限**：
   ```env
   ALLOWED_BUILD_PATHS=C:\\projects\\,D:\\builds\\
   ```

4. **SSH認証の強化**：
   - 強力なパスワードまたはキーベース認証を使用
   - 必要に応じてSSHポートを変更

## トラブルシューティング

### .NET SDKが見つからない
```powershell
# .NET SDKをインストール
winget install Microsoft.DotNet.SDK.8
# または
choco install dotnet-sdk
```

### ファイアウォールがブロックしている
```powershell
# ファイアウォールルールを追加
New-NetFirewallRule -DisplayName "MCP Server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

### ビルドタイムアウト
`server.js`でタイムアウトを増やす：
```javascript
const timeout = setTimeout(() => {...}, 600000); // 10分
```

## 動作確認済み環境

- Windows 11 VM
- .NET SDK 8.0.411
- Node.js 18+
- PowerShell 5.1

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照

## 謝辞

- [Claude Code](https://claude.ai/code) by Anthropic向けに開発
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)を使用
- Node.jsとExpressで構築