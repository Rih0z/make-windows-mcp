# Windows MCP Build Server

Windows VM上でMCP（Model Context Protocol）サーバーを構築し、macOS/LinuxからWindows アプリケーションをリモートビルドできるようにするプロジェクトです。

## 機能

- **リモート.NETビルド** - どのOSからでも.NETアプリケーションをビルド
- **PowerShellコマンド実行** - 安全なPowerShellコマンドの実行
- **NordVPNメッシュネットワーク対応** - 複数のWindowsマシンを統合管理
- **SSH経由リモート実行** - SSHでWindows間を接続
- **セキュア通信** - トークンベース認証（本番環境用）
- **セキュリティ機能** - IPホワイトリスト、レート制限、パス制限
- **詳細なログ** - リクエスト/レスポンスの記録
- **簡単セットアップ** - 自動インストールスクリプト付き

## 概要

このシステムは以下の2つの独立したコンポーネントで構成されています：

### サーバー側（Windows VM）
- **ファイル**: `server/src/server.js`
- **役割**: MCPプロトコルを実装したExpressサーバー
- **機能**: PowerShell実行、.NETビルド、SSH接続、セキュリティ制御
- **依存関係**: Express.js、SSH2、Helmet、Ping等

### クライアント側（Mac/Linux）
- **ファイル**: `client/src/mcp-client.js`
- **役割**: MCPクライアントとWindows MCPサーバーの接続ブリッジ
- **機能**: MCP通信、環境設定、認証ヘッダー管理
- **依存関係**: dotenv（最小構成）
- **対応クライアント**: Claude Code、Gemini-CLI、その他MCP対応ツール

### 通信フロー
```
MCPクライアント → client/mcp-client.js → Windows VM/server.js → PowerShell/dotnet
```

## MCP対応コマンド一覧

Windows MCPサーバーでは、以下の4つのMCPツールが利用可能です：

### 1. build_dotnet - .NETアプリケーションビルド

.NETプロジェクトをビルドします

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | .csprojファイルまたはソリューションファイルのパス |
| `configuration` | いいえ | ビルド構成 (Debug/Release)、デフォルト: Debug |
| `remoteHost` | いいえ | リモートホストIPアドレス（NordVPNメッシュ用） |

```bash
# ローカルビルド
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj"

# Releaseビルド
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" configuration="Release"

# リモートビルド
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" remoteHost="10.5.0.2"
```

### 2. run_powershell - PowerShellコマンド実行

安全なPowerShellコマンドを実行します

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `command` | はい | 実行するPowerShellコマンド |
| `remoteHost` | いいえ | リモートホストIPアドレス |

#### 利用可能なコマンド一覧

| カテゴリ | コマンド例 | 説明 |
|---------|------------|------|
| **開発ツール** | `dotnet`, `git`, `docker`, `kubectl` | 開発環境の管理 |
| **システム情報** | `Get-Process`, `Get-Service`, `Get-ComputerInfo` | システム状態の確認 |
| **ファイル操作** | `Get-ChildItem`, `Copy-Item`, `Remove-Item` | ファイル管理 |
| **ネットワーク** | `Test-Connection`, `ping`, `ipconfig` | ネットワーク診断 |
| **仮想化** | `Get-VM`, `Start-VM`, `Stop-VM`, `Checkpoint-VM` | Hyper-V管理 |
| **ログ解析** | `Get-WinEvent`, `Get-EventLog` | イベントログの確認 |

```bash
# システム情報の取得
@windows-build-server run_powershell command="Get-ComputerInfo | Select-Object CsName, OsName, TotalPhysicalMemory"

# サービス状態の確認
@windows-build-server run_powershell command="Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object -First 10"

# ファイル擜作
@windows-build-server run_powershell command="Get-ChildItem C:\\projects -Recurse -File | Measure-Object -Property Length -Sum"

# VM管理
@windows-build-server run_powershell command="Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned"
```

### 3. ping_host - ホスト接続テスト

リモートホストへの接続をテストします

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `host` | はい | テストするホストのIPアドレスまたはホスト名 |

```bash
# 公開DNSへのping
@windows-build-server ping_host host="8.8.8.8"

# リモートサーバーへのping
@windows-build-server ping_host host="192.168.1.100"

# NordVPNメッシュホストへのping
@windows-build-server ping_host host="10.5.0.2"
```

### 4. ssh_command - SSH経由コマンド実行

SSH経由でリモートWindowsでコマンドを実行します

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `host` | はい | SSH接続先のIPアドレス |
| `username` | はい | SSHユーザー名 |
| `password` | はい | SSHパスワード |
| `command` | はい | 実行するコマンド |

```bash
# リモートWindowsで.NETバージョン確認
@windows-build-server ssh_command host="10.5.0.2" username="Administrator" password="your_password" command="dotnet --version"

# リモートでビルド実行
@windows-build-server ssh_command host="10.5.0.2" username="Administrator" password="your_password" command="dotnet build C:\\projects\\MyApp.csproj"
```

---

## 必要要件

- **Windows VM**: Windows 10/11、PowerShell 5.1以上
- **クライアント**: MCP対応ツール（Claude Code、Gemini-CLI等）がインストールされたmacOS/Linux
- **ネットワーク**: クライアントとWindows VM間の接続
- **権限**: Windows VMの管理者アクセス
- **オプション**: NordVPNメッシュネットワーク（リモートWindows用）

### クライアントツール

- **Claude Code**: Anthropic製の公式CLIツール（推奨）
  - 自然言語でのコマンド操作が最適化されている
  - 直感的なインターフェースとエラーハンドリング
- **Gemini-CLI**: Google製のMCP対応ツール
  - 基本的なMCP機能をサポート
- **その他のMCP対応ツール**: 任意のMCPクライアント実装

**注意**: Claude Codeは必須要件ではありませんが、自然言語での操作性が向上します。

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
mkdir utils
copy Z:\windows\server\src\utils\*.* utils\ /Y

# アップデートスクリプトもコピー（今後のアップデート用）
mkdir setup
copy Z:\windows\server\setup\update-from-git.ps1 setup\ /Y

# package.jsonを更新（npmスクリプトを追加）
copy Z:\windows\server\package.json . /Y

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

# 重要: Windows側でMCP_AUTH_TOKENが設定されている場合
# Windows側の.envファイルまたはセットアップ完了時に表示されたトークンを
# クライアント側の.envファイルのMCP_AUTH_TOKENにも設定してください

# MCPクライアントツールに追加
claude mcp add --user windows-build-server  # Claude Code使用時
# または
gemini-cli mcp add windows-build-server      # Gemini-CLI使用時
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
| `MCP_AUTH_TOKEN` | 認証トークン（Windows/クライアント両方で同じ値を設定） | はい（本番環境） | - |
| `ALLOWED_IPS` | 許可IPリスト（カンマ区切り） | いいえ | すべて許可 |
| `ALLOWED_BUILD_PATHS` | ビルド許可パス | いいえ | Z:\,C:\projects\,C:\build |
| `LOG_LEVEL` | ログレベル | いいえ | info |
| `RATE_LIMIT_REQUESTS` | 1分間の最大リクエスト数（0で無効化） | いいえ | 60 |
| `RATE_LIMIT_WINDOW` | レート制限の時間窓（ms） | いいえ | 60000 |
| `ENABLE_HTTPS` | HTTPS有効化 | いいえ | false |
| `SSL_CERT_PATH` | SSL証明書パス | HTTPS時必須 | - |
| `SSL_KEY_PATH` | SSL秘密鍵パス | HTTPS時必須 | - |
| `ENABLE_SECURITY_MONITORING` | セキュリティ監視有効化 | いいえ | true |
| `MAX_LOG_SIZE` | ログファイル最大サイズ（バイト） | いいえ | 10485760 |
| `MAX_LOG_FILES` | 保持するログファイル数 | いいえ | 5 |
| `COMMAND_TIMEOUT` | コマンド実行タイムアウト（ms） | いいえ | 300000 |
| `MAX_SSH_CONNECTIONS` | 最大SSH同時接続数 | いいえ | 5 |
| `ENABLE_DANGEROUS_MODE` | ⚠️危険実行モード（全制限解除） | いいえ | false |

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
# 8. 認証トークン（MCP_AUTH_TOKEN）の自動生成と表示
#    - 生成されたトークンはWindows側の.envに自動設定
#    - クライアント側の.envにコピーする必要があります
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

#### MCPクライアントツールでの使用
```bash
# MCPクライアントツールに登録（初回のみ）
claude mcp add --user windows-build-server   # Claude Code使用時
gemini-cli mcp add windows-build-server       # Gemini-CLI使用時

# 登録後は@プレフィックスで使用（Claude Code）
@windows-build-server run_powershell command="echo 'Hello from Windows'"

# または直接コマンド呼び出し（Gemini-CLI）
gemini-cli mcp call windows-build-server run_powershell '{"command": "echo Hello from Windows"}'
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

#### npmスクリプト一覧
```powershell
npm start          # 通常モードで起動
npm run dev        # 開発モード（詳細ログ）
npm run dangerous  # ⚠️危険モード（全制限解除）
npm run update     # GitHubから最新版に更新
npm run update-local # ローカルファイルから更新
```

#### サーバーの停止
```powershell
# プロセスを確認
Get-Process node

# プロセスを停止
Stop-Process -Name node
```

### サーバーのアップデート方法

#### GitHubからの自動アップデート（推奨）
```powershell
# Windows VM上で実行（インターネット接続必須）
cd C:\mcp-server
npm run update

# アップデート完了後、Dangerousモードで起動
npm run dangerous
```

**Gitアップデートスクリプトの動作**：
- GitHubリポジトリから最新版を自動取得
- 現在の設定（.env）を自動バックアップ
- 認証トークンやカスタム設定は**そのまま保持**
- サーバープログラムのみ最新版に更新
- 依存関係（node_modules）も自動更新
- 更新前にバックアップフォルダを作成（例: backup-20250703-213045）
- Gitがインストールされていない場合は自動インストール

#### ローカルファイルからのアップデート
```powershell
# ネットワークドライブなどからファイルを更新する場合
cd C:\mcp-server
npm run update-local

# または手動でファイルをコピー
copy Z:\windows\server\src\server.js . /Y
copy Z:\windows\server\src\utils\*.js utils\ /Y
```

#### 初回セットアップ時のスクリプトコピー
```powershell
# セットアップ時に必要なスクリプトをコピー
cd C:\mcp-server
mkdir setup
copy Z:\windows\server\setup\update-from-git.ps1 setup\ /Y
copy Z:\windows\server\setup\update-server.ps1 setup\ /Y
```

### 特殊な起動モード

#### 危険実行モード（⚠️警告：セキュリティ制限を完全にバイパス）
```powershell
# 危険モードで起動（全てのコマンドが実行可能）
cd C:\mcp-server
npm run dangerous

# または環境変数で設定
ENABLE_DANGEROUS_MODE=true npm start
```

**危険モードの機能**：
- ✅ 全てのPowerShellコマンドが実行可能
- ✅ システムファイルの削除も可能
- ✅ レート制限なし（無制限通信）
- ✅ パス制限なし
- ⚠️ 完全に信頼できる環境でのみ使用

**危険モードでの使用例**：
```bash
# システム管理コマンド（通常モードでは制限される）
@windows-build-server run_powershell command="Get-Process | Where-Object {$_.CPU -gt 100} | Stop-Process -Force"

# レジストリ操作
@windows-build-server run_powershell command="reg add HKLM\\SOFTWARE\\Test /v TestValue /t REG_SZ /d TestData /f"

# ユーザー管理
@windows-build-server run_powershell command="net user testuser TestPass123! /add"

# システムファイル操作
@windows-build-server run_powershell command="Remove-Item C:\\Windows\\Temp\\* -Recurse -Force"

# サービス管理
@windows-build-server run_powershell command="Stop-Service -Name 'Windows Update' -Force"

# ネットワーク設定変更
@windows-build-server run_powershell command="New-NetFirewallRule -DisplayName 'Custom Rule' -Direction Inbound -LocalPort 9999 -Protocol TCP -Action Allow"

# リモートコマンド実行（SSH経由）
@windows-build-server ssh_command host="192.168.1.100" username="admin" password="pass" command="shutdown /r /t 0"
```

⚠️ **警告**: これらのコマンドはシステムに重大な影響を与える可能性があります。実行前に必ず内容を確認してください。

#### 開発モード（詳細ログ出力）
```powershell
npm run dev
```

### アップデート後にDangerousモードで起動する手順

```powershell
# 1. アップデートを実行
cd C:\mcp-server
npm run update

# 2. アップデート完了後、Dangerousモードで起動
npm run dangerous

# または.envファイルに設定を追加して通常起動
echo ENABLE_DANGEROUS_MODE=true >> .env
npm start
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
4. `claude mcp add --user windows-build-server`（Claude Code使用時）または対応するコマンドでMCPクライアントツールに登録

### 使用例

#### .NETアプリケーションのビルド

```bash
# ローカルディレクトリからビルド（推奨）
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp.csproj" configuration="Release"

# ビルド時のディレクトリ構造：
# C:\build\MyApp\              # プロジェクトのリポジトリ全体をコピー
# C:\build\MyApp\release\      # リリース可能なビルド成果物

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

このプロジェクトは、Windows VM上で動作するサーバー側とMac/Linux上で動作するクライアント側に明確に分離されています：

```
make-windows-mcp/
├── server/                    # Windows VM上で動作するサーバー側
│   ├── src/                   # サーバーソースコード
│   │   ├── server.js          # MCPサーバー本体（Express.js）
│   │   └── utils/             # サーバー用ユーティリティモジュール
│   │       ├── logger.js      # 構造化ログ・ローテーション機能
│   │       ├── rate-limiter.js # レート制限・DoS防止
│   │       └── security.js    # コマンド・パス・認証情報の検証
│   ├── setup/                 # セットアップスクリプト
│   │   └── windows-setup.ps1  # Windows環境自動セットアップ
│   ├── package.json           # サーバー側依存関係（Express、SSH2等）
│   └── README.md              # サーバー側セットアップ・運用ガイド
│
├── client/                    # Mac/Linux上で動作するクライアント側
│   ├── src/                   # クライアントソースコード
│   │   └── mcp-client.js      # MCPクライアント（Claude Code接続）
│   ├── setup/                 # セットアップスクリプト
│   │   └── production-setup.js # 本番環境セットアップ・認証設定
│   ├── package.json           # クライアント側依存関係（dotenv等）
│   └── README.md              # クライアント側セットアップ・使用ガイド
│
├── examples/                  # サンプルアプリケーション
│   ├── hello-world/           # シンプルな.NETコンソールアプリ
│   │   ├── HelloWorld.cs      # C#ソースコード
│   │   └── HelloWorld.csproj  # プロジェクトファイル
│   └── test-dotnet/           # テスト用.NETアプリケーション
│       ├── Program.cs         # メインプログラム
│       ├── TestApp.csproj     # プロジェクト設定
│       └── README.md          # アプリ説明
│
├── tests/                     # テストスイート（Jest）
│   ├── server*.test.js        # サーバー機能テスト
│   ├── security*.test.js      # セキュリティ機能テスト
│   ├── logger*.test.js        # ログ機能テスト
│   └── rate-limiter*.test.js  # レート制限テスト
│
├── docs/                      # ドキュメント
│   ├── CLAUDE.md              # Claude Code用セットアップガイド
│   └── SETUP.md               # 詳細セットアップ手順
│
├── package.json               # ルートプロジェクト設定（ワークスペース）
├── jest.config.js             # テスト設定
├── .env.example               # 環境変数テンプレート
├── install-all.sh             # 全依存関係一括インストール
└── README.md                  # このファイル（メインドキュメント）
```

### 各ディレクトリの役割

#### **server/** - Windows VM側
- **目的**: PowerShellコマンド実行、.NETビルド、SSH接続処理
- **動作環境**: Windows 10/11 + Node.js + .NET SDK
- **主要機能**: MCP API サーバー、セキュリティ検証、ログ管理

#### **client/** - Mac/Linux側  
- **目的**: Claude CodeとWindows MCPサーバーの橋渡し
- **動作環境**: macOS/Linux + Node.js + Claude Code CLI
- **主要機能**: MCP プロトコル接続、認証、環境設定

#### **examples/** - サンプル
- **目的**: 動作確認・学習用のサンプルアプリケーション
- **内容**: .NETプロジェクトのビルド例、テストケース

#### **tests/** - テスト
- **目的**: 全機能の自動テスト（カバレッジ91%+）
- **内容**: ユニットテスト、統合テスト、セキュリティテスト

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

## セキュリティ注意事項

### 重要なセキュリティ上の注意

#### 禁止されているコマンド
Windows MCPサーバーは以下の危険なコマンドを自動的にブロックします：

| 禁止カテゴリ | コマンド例 | 理由 |
|------------|----------|------|
| **システム破壊** | `rm -rf`, `del /s`, `format` | ファイル・ドライブの完全削除 |
| **システム制御** | `shutdown`, `reboot`, `restart` | システムの強制停止・再起動 |
| **権限変更** | `net user /add`, `reg add` | ユーザー作成・レジストリ変更 |
| **コマンドインジェクション** | バックチック `\``, コマンド結合 `&` | 悪意のあるコマンドの埋め込み |
| **タスク操作** | `schtasks /create`, `wmic process call create` | マルウェアの持続化 |

#### アクセス制御

1. **IPホワイトリスト**: 信頼できるIPアドレスからのみアクセスを許可
2. **パス制限**: 指定されたディレクトリ内のみアクセス可能
3. **レート制限**: 連続したリクエストを制限し、DoS攻撃を防止
4. **認証トークン**: 本番環境では必須

#### ログ監視

すべてのアクセスとコマンド実行が記録されます：
- **アクセスログ**: IPアドレス、タイムスタンプ、ユーザーエージェント
- **コマンドログ**: 実行されたコマンド、結果、エラー
- **セキュリティログ**: ブロックされたアクセス、不正なコマンド試行

### 推奨セキュリティ設定

#### 開発環境
```env
# 最小限の設定
WINDOWS_VM_IP=192.168.1.100
MCP_SERVER_PORT=8080
ALLOWED_IPS=192.168.1.0/24
ALLOWED_BUILD_PATHS=C:\\projects\\,D:\\builds\\
```

#### 本番環境
```env
# 強化されたセキュリティ
MCP_AUTH_TOKEN=$(openssl rand -hex 32)
ALLOWED_IPS=10.0.0.100,10.0.0.101  # 特定のIPのみ
ALLOWED_BUILD_PATHS=C:\\projects\\   # 特定パスのみ
RATE_LIMIT_REQUESTS=30              # リクエスト制限
RATE_LIMIT_WINDOW=60000             # 1分間
LOG_LEVEL=info                      # 詳細ログ
```

### 重要な注意事項

1. **パスワード管理**: 
   - SSHパスワードは強力なものを使用し、定期的に変更
   - パスワードの暗号化ツールを使用：`node server/setup/encrypt-password.js`
   - 暗号化されたパスワードは`enc:`プレフィックスで保存
2. **定期更新**: Windows VMとサーバーソフトウェアを最新に保つ
3. **モニタリング**: ログを定期的に監視し、不正アクセスを検出
4. **最小権限の原則**: 必要な機能のみを有効化
5. **ネットワーク隔離**: ファイアウォールで不要なポートをブロック

---

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
   - パスワードの暗号化：
     ```bash
     # パスワードを暗号化
     cd server
     node setup/encrypt-password.js
     # 出力された暗号化パスワードを.envに設定
     ```
   - 必要に応じてSSHポートを変更

### 新しいセキュリティ機能（v1.1.0）

1. **コマンドインジェクション対策強化**
   - `shell: true`を削除し、より安全な実行方式を採用
   - PowerShellとdotnetコマンドの引数を適切に分離

2. **タイムアウト処理**
   - すべてのコマンド実行に設定可能なタイムアウト
   - SSH接続にもタイムアウトを実装
   - ハングしたプロセスの自動終了

3. **環境変数検証**
   - 起動時に重要な設定の検証
   - 本番環境での必須設定のチェック
   - 数値パラメータの範囲検証

4. **暗号化サポート**
   - SSH認証情報の暗号化保存
   - AES-256-GCM暗号化アルゴリズム
   - 環境変数での安全な保存

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

### 認証エラー（Invalid authorization token）

#### 症状
```
SECURITY EVENT: Invalid authorization token 
{"expectedPartial":"your...oken","receivedPartial":"duOq...rQCB"}
```

#### 原因
サーバー側とクライアント側のMCP_AUTH_TOKENが一致していない

#### 解決方法

**1. トークンの確認**
```powershell
# Windows VM側で現在のトークンを確認
cd C:\mcp-server
type .env | findstr MCP_AUTH_TOKEN
```

```bash
# クライアント側で現在のトークンを確認
cat .env | grep MCP_AUTH_TOKEN
```

**2. 手動でトークンを統一**
```powershell
# Windows VM側の.envファイルを編集
# MCP_AUTH_TOKEN=クライアント側と同じ32文字のトークン
```

**3. セットアップスクリプトの再実行（推奨）**
```powershell
# Windows VM側でセットアップスクリプトを再実行
cd server\setup
.\windows-setup.ps1
# 新しいトークンが表示されるので、クライアント側の.envに設定
```

**4. デバッグモードでの確認**
```powershell
# サーバーをデバッグモードで起動
NODE_ENV=development npm start
```

#### よくある間違い
- トークンの前後に空白文字がある
- 引用符で囲んでいる（`"token"`は間違い、`token`が正しい）
- 改行文字が含まれている
- セットアップ時に既存の.envファイルがあるとトークンが更新されない（修正済み）

## 動作確認済み環境

- Windows 11 VM
- .NET SDK 8.0.411
- Node.js 18+
- PowerShell 5.1

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照

## 将来の拡張案

### 開発予定機能

#### 1. 言語サポート拡張
- **Rust開発サポート**: `cargo build`, `cargo test`, `cargo run`コマンドの実行
- **Go言語サポート**: `go build`, `go test`, `go run`コマンドの実行
- **Python環境**: `pip install`, `python -m venv`, `pytest`コマンドの実行
- **Java/.NETブリッジ**: Spring Boot + .NET Core統合ビルド環境

#### 2. コンテナ・仮想化強化
- **Docker統合**: Dockerfileビルド、イメージ管理、マルチステージビルド
- **Kubernetes管理**: `kubectl apply`, `helm install`、クラスター管理
- **VMware vSphere連携**: VM作成、スナップショット管理
- **Hyper-V強化**: 自動プロビジョニング、テンプレート管理

#### 3. CI/CD パイプライン統合
- **Azure DevOps連携**: パイプライン実行、アーティファクト管理
- **GitHub Actions**: ワークフロー実行、セルフホストランナー管理
- **Jenkins統合**: ジョブ実行、ビルド状況監視
- **自動テスト**: ユニットテスト、統合テスト、E2Eテスト実行

#### 4. モニタリング・観測可能性
- **パフォーマンス監視**: CPU、メモリ、ディスク使用量リアルタイム監視
- **ログ分析**: 構造化ログ、ELKスタック統合
- **アラート機能**: Slack、Teams、メール通知
- **ダッシュボード**: Grafana統合、メトリクス可視化

#### 5. セキュリティ強化
- **証明書管理**: Let's Encrypt自動更新、PKI統合
- **多要素認証**: TOTP、FIDO2対応
- **監査ログ**: SOX法対応、セキュリティイベント追跡
- **脆弱性スキャン**: 依存関係チェック、OWASP ZAP統合

#### 6. クラウド統合
- **AWS連携**: EC2管理、S3デプロイ、Lambda実行
- **Azure統合**: Virtual Machines、App Service、Functions
- **GCP対応**: Compute Engine、Cloud Run、Cloud Functions
- **マルチクラウド**: 統一インターフェースでの管理

### 技術的改善案

#### パフォーマンス最適化
- **並列処理**: 複数プロジェクトの同時ビルド
- **キャッシュ機能**: ビルドアーティファクトのインクリメンタルキャッシュ
- **リソース管理**: メモリ使用量の最適化、プロセスプール

#### 開発者体験向上
- **IDE統合**: VS Code拡張、Visual Studio統合
- **コマンド補完**: PowerShell、Bash用の自動補完機能
- **エラー診断**: 詳細なエラーメッセージ、解決案の提示

## 免責事項

本ソフトウェアは「現状のまま」提供され、明示的または暗黙的な保証はありません。作者は、本ソフトウェアの使用によって生じたいかなる損害についても責任を負いません。

**セキュリティに関する重要な注意**:
- 本システムは強力な権限でコマンドを実行します
- 本番環境では必ず認証とアクセス制御を設定してください
- Windows VMへの不正アクセスを防ぐため、適切なネットワーク設定を行ってください
- SSH認証情報は暗号化して保存することを強く推奨します

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