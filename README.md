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

## 概要

このシステムは以下の2つのコンポーネントで構成されています：

1. **サーバー側（Windows VM）**: `server.js` - MCPプロトコルを実装したExpressサーバー
2. **クライアント側（Mac/Linux）**: `mcp-client.js` - Claude CodeとMCPサーバーを接続するラッパー

## 必要要件

- **Windows VM**: Windows 10/11、PowerShell 5.1以上
- **クライアント**: Claude Code CLIがインストールされたmacOS/Linux
- **ネットワーク**: クライアントとWindows VM間の接続
- **権限**: Windows VMの管理者アクセス
- **オプション**: NordVPNメッシュネットワーク（リモートWindows用）

## クイックスタート

### 1. Windows VMのセットアップ（サーバー側）

```powershell
# 管理者権限で実行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# サーバーディレクトリに移動
cd server\setup
.\windows-setup.ps1

# サーバーディレクトリに移動
cd C:\mcp-server

# サーバーファイルをコピー
copy Z:\windows\server\src\*.* . /Y
copy Z:\windows\server\src\utils\*.* utils\ /Y

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

### セットアップスクリプトの使い方

#### Windows側セットアップスクリプト（server/setup/windows-setup.ps1）
```powershell
# 管理者権限でPowerShellを起動して実行
cd server\setup
.\windows-setup.ps1

# スクリプトが実行する内容：
# 1. Node.js（Chocolatey経由）のインストール
# 2. .NET SDK 8のインストール
# 3. MCPサーバーディレクトリ（C:\mcp-server）の作成
# 4. package.jsonファイルの作成
# 5. npmパッケージのインストール
# 6. ファイアウォールルールの設定
# 7. 実行ポリシーの設定
```

#### クライアント側設定
```bash
# client/setup/production-setup.jsを使用して本番環境をセットアップ
cd client
node setup/production-setup.js

# このスクリプトは以下を実行：
# 1. 認証トークンの生成
# 2. ファイアウォールコマンドの提供
# 3. systemdサービス設定の生成
```

### クライアント側プログラムの使い方

#### 基本的な起動方法
```bash
# MCPクライアントを起動
cd client
node src/mcp-client.js

# または、実行権限を付与して直接実行
chmod +x src/mcp-client.js
./src/mcp-client.js
```

#### Claude Codeでの使用
```bash
# Claude Codeに登録（初回のみ）
claude mcp add --user windows-build-server

# 登録後は@プレフィックスで使用
@windows-build-server run_powershell command="echo 'Hello from Windows'"
```

### サーバー側プログラムの使い方

#### サーバーの起動
```powershell
# Windows VM上で実行
cd C:\mcp-server
npm start

# バックグラウンドで実行する場合
Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory "C:\mcp-server" -WindowStyle Hidden
```

#### サーバーの停止
```powershell
# プロセスを確認
Get-Process node

# プロセスを停止
Stop-Process -Name node
```

### クライアント設定の引き継ぎ（他のプロジェクトで使用する場合）

他のプロジェクトでWindows MCPサーバーを利用する場合、以下のファイルをコピーしてください：

#### 必須ファイル一式
```bash
# ディレクトリ構造
make-windows-mcp/
├── client/
│   ├── src/
│   │   └── mcp-client.js  # MCPクライアントラッパー（必須）
│   └── package.json       # クライアント依存関係（必須）
└── .env                   # 環境変数設定（必須・要編集）
```

#### 設定手順
1. 上記ファイルを新しいプロジェクトにコピー
2. `.env`ファイルを編集してWindows VMのIPアドレスを設定
3. `cd client && npm install`を実行
4. `claude mcp add --user windows-build-server`でClaude Codeに登録

### 使用例

#### .NETアプリケーションのビルド

```bash
# ローカルディレクトリからビルド（推奨）
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" configuration="Release"

# ネットワークドライブの場合は、まずローカルにコピー
@windows-build-server run_powershell command="Copy-Item -Path Z:\\myproject -Destination C:\\temp\\myproject -Recurse"
@windows-build-server build_dotnet projectPath="C:\\temp\\myproject\\app.csproj" configuration="Debug"
```

**⚠️ 重要**: ネットワークドライブ（Z:）から直接ビルドすると失敗する可能性があります。必ずローカルディレクトリ（C:）にコピーしてからビルドしてください。

#### PowerShellコマンドの実行

```bash
# .NETバージョンを確認
@windows-build-server run_powershell command="dotnet --version"

# ファイル一覧
@windows-build-server run_powershell command="Get-ChildItem C:\\projects"

# プロセス確認
@windows-build-server run_powershell command="Get-Process | Select-Object -First 5"

# システム情報の取得
@windows-build-server run_powershell command="Get-ComputerInfo | Select-Object CsName, OsName, OsVersion"

# サービスの管理
@windows-build-server run_powershell command="Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object -First 10"
```

#### NordVPNメッシュネットワーク経由での操作

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

#### VM管理（Hyper-V）

```bash
# VM一覧を取得
@windows-build-server run_powershell command="Get-VM"

# VMを起動
@windows-build-server run_powershell command="Start-VM -Name 'TestVM'"

# VMの状態を確認
@windows-build-server run_powershell command="Get-VM -Name 'TestVM' | Select-Object Name, State, CPUUsage, MemoryAssigned"

# スナップショットを作成
@windows-build-server run_powershell command="Checkpoint-VM -Name 'TestVM' -SnapshotName 'BeforeTesting'"
```

## プロジェクト構成

```
.
├── server/                    # Windows VM上で動作するサーバー側
│   ├── src/                   
│   │   ├── server.js          # MCPサーバー本体
│   │   └── utils/             # サーバー用ユーティリティ
│   │       ├── logger.js      # ロギング機能
│   │       ├── rate-limiter.js # レート制限
│   │       └── security.js    # セキュリティ検証
│   ├── setup/
│   │   └── windows-setup.ps1  # Windowsサーバーセットアップ
│   └── package.json           # サーバー側の依存関係
├── client/                    # Mac/Linux上で動作するクライアント側
│   ├── src/
│   │   └── mcp-client.js      # MCPクライアント
│   ├── setup/
│   │   └── production-setup.js # 本番環境セットアップ
│   └── package.json           # クライアント側の依存関係
├── examples/                  # サンプルアプリケーション
│   ├── hello-world/
│   └── test-dotnet/
├── tests/                     # テストファイル
├── docs/                      # ドキュメント
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

---

## 付録

### A. クライアント側プログラム（mcp-client.js）の詳細

#### 概要
`mcp-client.js`は、Claude CodeとWindows MCPサーバーを接続するNode.jsラッパースクリプトです。環境変数から設定を読み込み、適切な認証情報とともに`npx mcp-remote`コマンドを実行します。

#### 主な機能
1. **環境変数の読み込み**: `.env`ファイルから接続設定を取得
2. **設定の検証**: 必要な環境変数が設定されているかチェック
3. **認証ヘッダーの追加**: トークンが設定されている場合、Authorizationヘッダーを追加
4. **プロセス管理**: MCPクライアントプロセスの起動と終了コードの伝播

#### コード構造
```javascript
// 環境変数の読み込み
require('dotenv').config({ path: envPath });

// MCPサーバーURLの構築
const serverUrl = `${protocol}://${WINDOWS_VM_IP}:${MCP_SERVER_PORT}/mcp`;

// npx mcp-remoteコマンドの実行
const mcpProcess = spawn('npx', args, {
  stdio: 'inherit',  // 標準入出力を継承
  env: process.env   // 環境変数を渡す
});
```

### B. サーバー側プログラム（server.js）の詳細

#### 概要
`server.js`は、Windows VM上で動作するMCPプロトコルサーバーです。Express.jsフレームワークを使用し、PowerShellコマンドの実行、.NETビルド、リモート実行などの機能を提供します。

#### アーキテクチャ

1. **セキュリティレイヤー**
   - Helmet.js: セキュリティヘッダーの設定
   - CORS: クロスオリジンリクエストの制御
   - レート制限: DoS攻撃の防止
   - IPホワイトリスト: アクセス元の制限
   - Bearer認証: トークンベースの認証

2. **MCPプロトコル実装**
   - `/mcp`エンドポイント: MCPリクエストの処理
   - `tools/list`: 利用可能なツールのリスト
   - `tools/call`: ツールの実行

3. **実行エンジン**
   - **ローカル実行**: `child_process.spawn`を使用
   - **リモート実行**: `ssh2`ライブラリを使用したSSH接続

#### 主要コンポーネント

**ミドルウェアスタック**:
```javascript
app.use(helmet());           // セキュリティヘッダー
app.use(cors());            // CORS設定
app.use(express.json());    // JSONパーサー
app.use(accessLogger);      // アクセスログ
app.use(rateLimiter);       // レート制限
app.use(ipWhitelist);       // IPホワイトリスト
app.use(authentication);    // 認証
```

**ツール定義**:
- `build_dotnet`: .NETプロジェクトのビルド
- `run_powershell`: PowerShellコマンドの実行
- `ping_host`: ホストへの接続確認
- `ssh_command`: SSH経由でのコマンド実行

**セキュリティ検証**:
```javascript
// コマンド検証
const validatedCommand = security.validatePowerShellCommand(args.command);

// パス検証
const validatedPath = security.validatePath(args.projectPath);

// IP検証
const validatedHost = security.validateIPAddress(args.host);
```

### C. ユーティリティモジュール

#### security.js
- PowerShellコマンドの検証とサニタイズ
- ファイルパスのディレクトリトラバーサル防止
- IPアドレスの形式チェック
- SSH認証情報の検証

#### rate-limiter.js
- クライアントごとのリクエスト数管理
- 時間窓内でのレート制限
- ブロック機能とタイムアウト管理

#### logger.js
- 構造化ログの記録
- ログファイルのローテーション
- アクセスログとセキュリティイベントの記録

### D. セットアップスクリプト

#### windows-setup.ps1
Windows VM上で実行される自動セットアップスクリプト：
1. Chocolateyのインストール
2. Node.jsと.NET SDKのインストール
3. サーバーディレクトリの作成
4. 依存関係のインストール
5. ファイアウォールルールの設定

#### production-setup.js
本番環境用の設定生成スクリプト：
1. セキュアなトークンの生成
2. systemdサービス設定の作成
3. ファイアウォールコマンドの提供