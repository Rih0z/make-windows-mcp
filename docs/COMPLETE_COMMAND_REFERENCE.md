# Windows MCP Server - 完全コマンドリファレンス v1.0.6

## 📋 概要

Windows MCP Serverで利用可能な全8つのMCPツールの完全なコマンドリファレンスです。各ツールの詳細な使用方法、パラメータ、実行例、エラーハンドリングを網羅しています。

## 🔧 ツール一覧

| # | ツール名 | 主要機能 | セキュリティレベル |
|---|----------|----------|------------------|
| 1 | `build_dotnet` | .NETプロジェクトのビルド | 通常/開発/危険 |
| 2 | `run_powershell` | PowerShellコマンド実行 | 通常/開発/危険 |
| 3 | `ping_host` | ネットワーク接続テスト | 通常/開発/危険 |
| 4 | `ssh_command` | SSH経由リモート実行 | 通常/開発/危険 |
| 5 | `run_batch` | バッチファイル実行 | 通常/開発/危険 |
| 6 | `mcp_self_build` | MCPサーバー自己管理 | 開発/危険 |
| 7 | `process_manager` | プロセス・サービス管理 | 開発/危険 |
| 8 | `file_sync` | 高速ファイル同期 | 開発/危険 |

---

## 1. build_dotnet - .NETアプリケーションビルド

### 基本情報
- **目的**: .NETプロジェクトのビルド実行
- **対応形式**: .csproj, .sln, .vbproj, .fsproj
- **ビルドエンジン**: dotnet CLI
- **実行時間制限**: 300秒（COMMAND_TIMEOUT設定可能）

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `projectPath` | string | ✅ | - | プロジェクトファイルまたはソリューションファイルのパス |
| `configuration` | string | ❌ | "Debug" | ビルド構成（Debug/Release/Custom） |
| `remoteHost` | string | ❌ | - | NordVPNメッシュネットワーク経由でのリモートビルド用IPアドレス |

### 使用例

#### 基本的なビルド
```bash
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp\\MyApp.csproj"
```

#### Releaseビルド
```bash
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp\\MyApp.csproj" configuration="Release"
```

#### ソリューションビルド
```bash
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp\\MyApp.sln" configuration="Release"
```

#### リモートビルド（NordVPNメッシュ）
```bash
@windows-build-server build_dotnet projectPath="C:\\projects\\MyApp\\MyApp.csproj" remoteHost="10.5.0.2" configuration="Release"
```

### エラーハンドリング

| エラーケース | 対処法 |
|-------------|-------|
| プロジェクトファイルが見つからない | パスを確認、アクセス権限をチェック |
| ビルドエラー（コンパイルエラー） | ログを確認、ソースコードを修正 |
| パス制限エラー | ALLOWED_BUILD_PATHSに該当パスを追加 |
| タイムアウトエラー | COMMAND_TIMEOUTを増加 |

---

## 2. run_powershell - PowerShellコマンド実行

### 基本情報
- **目的**: 安全なPowerShellコマンドの実行
- **セキュリティ**: 3段階のセキュリティモード対応
- **ログ**: 全実行がセキュリティログに記録
- **文字制限**: 2048文字まで

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `command` | string | ✅ | - | 実行するPowerShellコマンド |
| `remoteHost` | string | ❌ | - | SSH経由でのリモート実行用IPアドレス |

### セキュリティモード別許可コマンド

#### 通常モード（デフォルト）
```bash
# 基本コマンド
@windows-build-server run_powershell command="Get-Process | Select-Object -First 10"
@windows-build-server run_powershell command="Get-Service | Where-Object Status -eq 'Running'"
@windows-build-server run_powershell command="Get-ChildItem C:\\projects"

# 開発ツール
@windows-build-server run_powershell command="dotnet --version"
@windows-build-server run_powershell command="git status"
@windows-build-server run_powershell command="docker ps"
```

#### 開発モード（ENABLE_DEV_COMMANDS=true）
```bash
# プロセス詳細
@windows-build-server run_powershell command="tasklist /svc"
@windows-build-server run_powershell command="netstat -an"

# プログラミング環境
@windows-build-server run_powershell command="python --version"
@windows-build-server run_powershell command="npm list -g --depth=0"

# バッチ処理
@windows-build-server run_powershell command="if (Test-Path C:\\temp) { Write-Host 'exists' }"
```

#### 危険モード（ENABLE_DANGEROUS_MODE=true）
```bash
# システム詳細情報
@windows-build-server run_powershell command="Get-ComputerInfo | Select-Object WindowsProductName, TotalPhysicalMemory"

# レジストリアクセス
@windows-build-server run_powershell command="Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion"

# システム制御
@windows-build-server run_powershell command="Get-WmiObject Win32_Service | Where-Object Name -eq 'Spooler'"
```

---

## 3. ping_host - ネットワーク接続テスト

### 基本情報
- **目的**: ホストへの接続性確認
- **プロトコル**: ICMP ping
- **タイムアウト**: 5秒
- **パケット数**: 4パケット

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `host` | string | ✅ | - | テスト対象のIPアドレスまたはホスト名 |

### 使用例

```bash
# 公開DNSサーバーへのping
@windows-build-server ping_host host="8.8.8.8"

# ローカルネットワーク内ホスト
@windows-build-server ping_host host="192.168.1.100"

# ドメイン名でのping
@windows-build-server ping_host host="google.com"

# NordVPNメッシュネットワーク
@windows-build-server ping_host host="10.5.0.2"
```

### レスポンス例

```json
{
  "host": "8.8.8.8",
  "alive": true,
  "time": "12.3",
  "min": "11.2",
  "max": "13.8",
  "avg": "12.3",
  "packetLoss": "0%"
}
```

---

## 4. ssh_command - SSH経由コマンド実行

### 基本情報
- **目的**: SSH経由でのリモートWindows操作
- **暗号化**: パスワードはAES-256-GCMで暗号化
- **接続タイムアウト**: 30秒（SSH_TIMEOUT設定可能）
- **対応**: OpenSSH for Windows

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `host` | string | ✅ | - | SSH接続先IPアドレス |
| `username` | string | ✅ | - | SSHユーザー名 |
| `password` | string | ✅ | - | SSHパスワード（暗号化して保存） |
| `command` | string | ✅ | - | リモートで実行するコマンド |

### 使用例

```bash
# リモートでの.NETバージョン確認
@windows-build-server ssh_command host="10.5.0.2" username="Administrator" password="SecurePass123" command="dotnet --version"

# リモートビルド実行
@windows-build-server ssh_command host="10.5.0.2" username="builduser" password="BuildPass456" command="dotnet build C:\\projects\\MyApp.csproj"

# リモートサービス確認
@windows-build-server ssh_command host="10.5.0.3" username="admin" password="AdminPass789" command="Get-Service | Where-Object Status -eq 'Running'"
```

---

## 5. run_batch - バッチファイル実行

### 基本情報
- **目的**: 許可されたディレクトリ内のバッチファイル実行
- **対応拡張子**: .bat, .cmd
- **セキュリティ**: ディレクトリトラバーサル対策済み
- **ログ**: 実行ファイルと作業ディレクトリを記録

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `batchFile` | string | ✅ | - | バッチファイルのフルパス |
| `workingDirectory` | string | ❌ | バッチファイルのディレクトリ | 実行時の作業ディレクトリ |

### 許可ディレクトリ設定

#### デフォルト許可ディレクトリ
- `C:\builds\`
- `C:\builds\AIServer\`
- `C:\Users\Public\`
- `C:\temp\`

#### カスタム設定（.env）
```env
ALLOWED_BATCH_DIRS=C:\builds\;C:\custom\scripts\;D:\deploy\
```

### 使用例

```bash
# AIServer起動スクリプト
@windows-build-server run_batch batchFile="C:\\builds\\AIServer\\release\\start.bat"

# デプロイスクリプト実行
@windows-build-server run_batch batchFile="C:\\builds\\deploy.bat" workingDirectory="C:\\builds\\AIServer"

# セットアップスクリプト
@windows-build-server run_batch batchFile="C:\\temp\\setup.cmd"

# パブリックスクリプト
@windows-build-server run_batch batchFile="C:\\Users\\Public\\maintenance.bat"
```

---

## 6. mcp_self_build - MCPサーバー自己管理

### 基本情報
- **目的**: MCPサーバー自体の管理・更新
- **機能**: ビルド・テスト・インストール・更新・起動・停止
- **要件**: 危険モード（一部機能）
- **ログ**: 全操作が詳細にログ記録

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `action` | string | ✅ | - | 実行アクション（build/test/install/update/start/stop/status） |
| `targetPath` | string | ❌ | "C:\\mcp-server" | インストール/更新先パス |
| `options` | object | ❌ | {} | 追加オプション |

### アクション詳細

#### build - ビルド実行
```bash
@windows-build-server mcp_self_build action="build"
```
- NPMの`build:all`スクリプトを実行
- 全依存関係のインストール
- プロジェクト構成の検証

#### test - テスト実行
```bash
@windows-build-server mcp_self_build action="test"

# テストスキップ
@windows-build-server mcp_self_build action="test" options='{"skipTests": true}'
```
- Jestテストスイート実行
- カバレッジレポート生成
- テスト結果の詳細出力

#### install/update - インストール・更新
```bash
# 新規インストール
@windows-build-server mcp_self_build action="install" targetPath="C:\\mcp-server-new"

# 既存サーバーの更新
@windows-build-server mcp_self_build action="update" options='{"autoStart": true}'
```
- ⚠️ **危険モード必須**
- GitHubから最新版をダウンロード
- 既存設定の保持
- 自動起動オプション

#### start/stop - サービス制御
```bash
# サーバー起動
@windows-build-server mcp_self_build action="start"

# サーバー停止
@windows-build-server mcp_self_build action="stop"
```

#### status - 状態確認
```bash
@windows-build-server mcp_self_build action="status"
```
- プロセスの実行状態確認
- ポートの使用状況
- 最終起動時刻

---

## 7. process_manager - プロセス・サービス管理

### 基本情報
- **目的**: Windowsプロセスとサービスの包括管理
- **対応**: 実行ファイル、Windowsサービス
- **権限**: 管理者権限でのサービス制御対応
- **安全性**: 強制終了オプション付き

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `action` | string | ✅ | - | 実行アクション（start/stop/restart/status/list/kill） |
| `processName` | string | 条件付き | - | プロセス名/サービス名（listでは不要） |
| `options` | object | ❌ | {} | 追加オプション |

### アクション詳細

#### start - プロセス/サービス起動
```bash
# アプリケーション起動
@windows-build-server process_manager action="start" processName="notepad"

# サービス起動
@windows-build-server process_manager action="start" processName="Spooler" options='{"asService": true}'

# 特定ディレクトリで起動
@windows-build-server process_manager action="start" processName="MyApp.exe" options='{"workingDir": "C:\\apps"}'
```

#### stop - プロセス/サービス停止
```bash
# プロセス停止
@windows-build-server process_manager action="stop" processName="notepad"

# サービス停止
@windows-build-server process_manager action="stop" processName="Spooler" options='{"asService": true}'

# 強制停止
@windows-build-server process_manager action="stop" processName="hanged_app" options='{"force": true}'
```

#### restart - サービス再起動
```bash
# サービス再起動
@windows-build-server process_manager action="restart" processName="IIS" options='{"asService": true}'

# 待機時間付き再起動
@windows-build-server process_manager action="restart" processName="MyService" options='{"asService": true, "waitTime": 5}'
```

#### list - プロセス/サービス一覧
```bash
# 全プロセス一覧
@windows-build-server process_manager action="list"

# 全サービス一覧
@windows-build-server process_manager action="list" options='{"asService": true}'
```

#### status - 状態確認
```bash
# プロセス状態確認
@windows-build-server process_manager action="status" processName="chrome"

# サービス状態確認
@windows-build-server process_manager action="status" processName="W3SVC" options='{"asService": true}'
```

#### kill - PIDでの強制終了
```bash
# PIDで強制終了
@windows-build-server process_manager action="kill" processName="1234" options='{"force": true}'

# 通常終了試行
@windows-build-server process_manager action="kill" processName="5678"
```

---

## 8. file_sync - 高速ファイル同期

### 基本情報
- **目的**: 大容量ファイル・ディレクトリの高速同期
- **エンジン**: robocopy統合
- **特徴**: 整合性検証、自動リトライ、パターンフィルタ
- **パフォーマンス**: 通常のcopyの10倍高速

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|----|----|----------|------|
| `source` | string | ✅ | - | 同期元パス（ファイルまたはディレクトリ） |
| `destination` | string | ✅ | - | 同期先パス |
| `options` | object | ❌ | {} | 同期オプション |

### オプション詳細

| オプション | 型 | デフォルト | 説明 |
|-----------|----|---------|----|
| `recursive` | boolean | false | サブディレクトリを含む再帰的コピー |
| `overwrite` | boolean | true | 既存ファイルの上書き |
| `verify` | boolean | false | コピー後の整合性検証 |
| `pattern` | string | "*.*" | ファイルパターンフィルタ |
| `excludePattern` | string | - | 除外ファイルパターン |

### 使用例

#### 基本的なディレクトリ同期
```bash
@windows-build-server file_sync source="C:\\builds\\AIServer" destination="D:\\production\\AIServer" options='{"recursive": true, "verify": true}'
```

#### 特定ファイルパターンの同期
```bash
# モデルファイルのみ同期
@windows-build-server file_sync source="C:\\models" destination="D:\\models" options='{"pattern": "*.onnx", "recursive": true}'

# ドキュメントファイル同期
@windows-build-server file_sync source="C:\\docs" destination="\\\\server\\docs" options='{"pattern": "*.{md,pdf,docx}", "recursive": true}'
```

#### 除外パターン付き同期
```bash
@windows-build-server file_sync source="C:\\source" destination="C:\\backup" options='{"recursive": true, "excludePattern": "*.{tmp,log,cache}"}'
```

#### 大容量ファイル同期（検証付き）
```bash
@windows-build-server file_sync source="C:\\database\\backup.bak" destination="D:\\archive\\backup.bak" options='{"verify": true, "overwrite": false}'
```

### robocopyオプション詳細

| 内部オプション | 説明 |
|---------------|------|
| `/E` | 空のサブディレクトリを含む全ディレクトリをコピー |
| `/V` | 詳細出力（ファイル転送の検証） |
| `/R:3` | 失敗時に3回リトライ |
| `/W:10` | リトライ間隔10秒 |
| `/XC` `/XN` `/XO` | 変更済み・新しい・古いファイルを除外 |
| `/XF` | 指定パターンのファイルを除外 |

---

## 🔒 セキュリティ考慮事項

### アクセス制御
- 全ツールでBearer token認証必須
- IPアドレス制限（ALLOWED_IPS設定）
- レート制限（通常：60req/分、危険モード：無制限）

### ログ記録
- アクセスログ：`access.log`
- セキュリティログ：`security.log`
- アプリケーションログ：`app.log`
- エラーログ：`error.log`

### 暗号化
- SSHパスワード：AES-256-GCM暗号化
- 通信：HTTPS（本番環境推奨）
- ログ：機密情報のハッシュ化

---

## ⚠️ 危険モードでの注意事項

### 有効化方法
```env
ENABLE_DANGEROUS_MODE=true
```

### 危険モードでの変更点
- **セキュリティ制限解除**: 全コマンド実行可能
- **レート制限無効**: 無制限リクエスト
- **パス制限解除**: 全ディレクトリアクセス可能
- **プロセス制御拡張**: システムプロセス操作可能

### 使用禁止環境
- ❌ 本番環境
- ❌ 公開ネットワーク
- ❌ 重要データを含むシステム

### 使用推奨環境
- ✅ 開発環境
- ✅ 隔離されたテスト環境
- ✅ 個人開発マシン

---

## 🆘 トラブルシューティング

### よくあるエラーと対処法

| エラー | 原因 | 対処法 |
|-------|------|-------|
| "Invalid authorization token" | 認証トークン不一致 | クライアント・サーバー両方のMCP_AUTH_TOKENを確認 |
| "Command not allowed" | セキュリティ制限 | 開発モードまたは危険モードの有効化を検討 |
| "Path not in allowed directories" | パス制限 | ALLOWED_BUILD_PATHSまたはALLOWED_BATCH_DIRSに追加 |
| "Rate limit exceeded" | レート制限超過 | 危険モードまたはRATE_LIMIT_REQUESTSの調整 |
| "Connection timeout" | ネットワーク問題 | ファイアウォール設定とネットワーク接続を確認 |

### パフォーマンス最適化

#### ファイル同期の高速化
- 大容量ファイルは`file_sync`ツールを使用
- ネットワーク帯域に応じてパターンフィルタを活用
- 検証オプション（`verify`）は必要時のみ使用

#### プロセス管理の効率化
- `process_manager`の`list`アクションでプロセス監視
- サービス再起動時は`waitTime`オプションで安定性向上
- 強制終了は最終手段として使用

---

## 📚 参考資料

- [Windows MCP Server README](../README.md)
- [セットアップガイド](./SETUP.md)
- [アーキテクチャドキュメント](./CLAUDE.md)
- [変更履歴](../CHANGELOG.md)

---

**Windows MCP Server v1.0.6**  
**更新日: 2025-07-04**  
**エンタープライズレベルの実装で、AIServer Enterprise v2の開発効率を劇的に向上させます。**