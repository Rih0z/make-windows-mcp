# Windows MCP クライアント設定ガイド

このドキュメントは、Windows MCPサーバーのクライアント設定に必要な情報をまとめたものです。

## プロジェクトファイル構造

このプロジェクトはサーバー側とクライアント側に明確に分離されています：

```
make-windows-mcp/
├── server/                    # Windows VM側コンポーネント
│   ├── src/
│   │   ├── server.js          # MCPサーバー本体
│   │   └── utils/             # サーバー用ユーティリティ
│   └── setup/
│       └── windows-setup.ps1  # Windows環境セットアップ
│
├── client/                    # Mac/Linux側コンポーネント
│   ├── src/
│   │   └── mcp-client.js      # Claude Code接続クライアント
│   └── setup/
│       └── production-setup.js # 本番環境設定
│
├── examples/                  # サンプルアプリ
└── tests/                     # テストスイート
```

## クライアントに必要なファイル

他のプロジェクトでWindows MCPサーバーを利用する場合、以下のファイルが必要です：

```
make-windows-mcp/
├── client/
│   ├── src/
│   │   └── mcp-client.js  # MCPクライアントラッパー（必須）
│   └── package.json       # クライアント依存関係（必須）
└── .env                   # 環境変数設定（必須・要編集）
```

## 環境変数設定（.env）

### 最小構成（開発環境）
```bash
# Windows VMのIPアドレス（必須）
WINDOWS_VM_IP=192.168.1.100

# MCPサーバーポート（デフォルト: 8080）
MCP_SERVER_PORT=8080
```

### 本番環境設定
```bash
# 認証トークン（必須）
# 生成コマンド: openssl rand -hex 32
MCP_AUTH_TOKEN=your-secure-token-here

# 許可IPリスト（推奨）
ALLOWED_IPS=192.168.1.50,192.168.1.51

# ビルド許可パス（推奨）
ALLOWED_BUILD_PATHS=C:\\projects\\,D:\\builds\\
```

### NordVPN使用時の追加設定
```bash
# NordVPNメッシュネットワーク有効化
NORDVPN_ENABLED=true

# メッシュネットワークホストIP（カンマ区切り）
NORDVPN_HOSTS=10.5.0.2,10.5.0.3,10.5.0.4

# リモートWindows認証情報
REMOTE_USERNAME=Administrator
REMOTE_PASSWORD=your-password
```

## セットアップ手順

1. **ファイルのコピー**
   ```bash
   # 必要なファイルを新しいプロジェクトにコピー
   cp -r client/ /path/to/new/project/
   cp .env /path/to/new/project/
   ```

2. **環境変数の設定**
   ```bash
   cd /path/to/new/project
   # .envファイルを編集してWindows VMのIPアドレスを設定
   nano .env
   ```

3. **依存関係のインストール**
   ```bash
   cd /path/to/new/project/client
   npm install
   ```

4. **Claude Codeへの登録**
   ```bash
   claude mcp add --user windows-build-server
   ```

## 動作確認

```bash
# 接続テスト
@windows-build-server run_powershell command="echo 'Hello from Windows'"

# .NETバージョン確認
@windows-build-server run_powershell command="dotnet --version"

# ビルドテスト
@windows-build-server build_dotnet projectPath="C:\\projects\\test.csproj"
```

## トラブルシューティング

### 接続エラーの場合
1. Windows VM上でサーバーが起動していることを確認
   ```powershell
   # Windows VM上で実行
   cd C:\mcp-server
   npm start
   ```

2. ファイアウォール設定を確認
   ```powershell
   # Windows VM上で実行
   New-NetFirewallRule -DisplayName "MCP Server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
   ```

3. ネットワーク疎通を確認
   ```bash
   # クライアント側で実行
   ping WINDOWS_VM_IP
   curl http://WINDOWS_VM_IP:8080/health
   ```

### 認証エラーの場合
- `.env`ファイルの`MCP_AUTH_TOKEN`が正しく設定されているか確認
- Windows VM側とクライアント側で同じトークンが設定されているか確認

## 利用可能なコマンド

### 基本コマンド
- `build_dotnet` - .NETプロジェクトのビルド
- `run_powershell` - PowerShellコマンドの実行
- `ping_host` - ホストへの接続確認
- `ssh_command` - SSH経由でのコマンド実行

### 使用例
```bash
# イベントログの確認
@windows-build-server run_powershell command="Get-WinEvent -LogName System -MaxEvents 10"

# サービス管理
@windows-build-server run_powershell command="Get-Service | Where-Object Status -eq 'Running'"

# VM操作（Hyper-V）
@windows-build-server run_powershell command="Get-VM"
@windows-build-server run_powershell command="Start-VM -Name 'TestVM'"
```

## セキュリティベストプラクティス

1. **本番環境では必ず認証トークンを設定**
2. **IPホワイトリストで接続元を制限**
3. **ビルドパスを必要最小限に制限**
4. **定期的なログの確認**
5. **Windows VM上の最小権限の原則を適用**