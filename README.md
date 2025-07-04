# Windows MCP Build Server v1.0.11

汎用的なWindows操作をMCP（Model Context Protocol）経由で実行できるサーバーです。CI/CD自動化、ビルドプロセス、ファイル操作、プロセス管理など、様々なWindows環境での自動化ニーズに対応します。

## 🚀 最新機能 v1.0.11

### 📄 長時間実行プロセス対応
- **タイムアウト拡張**: 最大30分（1800秒）までのコマンド実行をサポート
- **プロセス管理強化**: Stop-Process, Wait-Processコマンドの追加
- **PDFコンバーター対応**: StandardTaxPdfConverter.UI.exeなどの長時間処理に対応
- **詳細なタイムアウトエラー**: ETIMEDOUTエラーコードとタイムアウト秒数を明示

## 新機能 v1.0.10

### 🔧 CI/CD自動化・開発ワークフロー最適化
- **ローカルサーバー接続許可** - localhost:8090-8099でのCI/CDテスト対応
- **基本ファイル操作コマンド拡張** - New-Item、Set-Content、Get-Content等を許可リストに追加
- **Here-String構文改善** - バッククォート検出の精度向上でfalse positive解消
- **コマンド長制限拡張** - 2048文字→8192+文字対応（MAX_COMMAND_LENGTH環境変数）
- **バッチ実行機能** - 複数コマンドの一括検証・実行サポート
- **詳細エラー情報** - 具体的な改善提案付きエラーメッセージ
- **開発モード拡張** - プロジェクト固有の操作許可とワークフロー検証

### 前回リリース v1.0.9

### 🚀 TDD第3フェーズ: モバイル・Web言語ビルドツール実装完了
- **4つの新ビルドツール**を完全実装（Kotlin、Swift、PHP、Ruby）
- **全11言語**のビルドツールサポート達成
- **モバイル開発**（Android、iOS）完全対応
- **Web開発**（Laravel、Rails）エコシステム統合

#### 新実装ツール（TDDアプローチ）
1. **build_kotlin** - Kotlin/Android完全対応（APK署名、Native、Multiplatform）
2. **build_swift** - Swift/iOS完全対応（SPM、マルチプラットフォーム、カバレッジ）
3. **build_php** - PHP/Laravel完全対応（Composer、PHPUnit、Artisan）
4. **build_ruby** - Ruby/Rails完全対応（Bundler、RSpec、Rails環境管理）

#### 技術的強化
- **暗号化サポート**: Android署名情報のAES-256-GCM暗号化
- **動的コマンド選択**: Gradle Wrapper、vendor/bin自動検出
- **環境管理**: Rails環境、PHP開発/本番モード切り替え
- **並列実行**: RSpec並列テスト、Swift並列ビルド

⚠️ **注意**: v1.0.9のツールはソースコード実装済み、サーバー更新後に利用可能です。

## 🎯 主なユースケース

### CI/CD自動化
- **Jenkins/GitHub Actions/GitLab CI** との統合
- **ビルド・テスト・デプロイの自動化**
- **ローカルホストでのテスト実行** (localhost:8090-8099)
- **長時間ビルドプロセスの管理**

### ファイル操作・データ処理
- **ファイル作成・編集** (New-Item, Set-Content)
- **設定ファイルの動的生成**
- **ログ解析・レポート生成**
- **バッチ処理の自動化**

### アプリケーション管理
- **Windowsサービスの監視・制御**
- **IISサイトの管理**
- **PDFコンバーターなどの長時間プロセス制御**
- **VMの管理** (Hyper-V)

### セキュリティ・コンプライアンス
- **証明書の管理・更新**
- **監査ログの収集**
- **セキュリティスキャンの実行**
- **コンプライアンスチェックの自動化**

## 機能

### 🟢 現在利用可能
- **リモート.NETビルド** - どのOSからでも.NETアプリケーションをビルド
- **PowerShellコマンド実行** - 安全なPowerShellコマンドの実行
- **バッチファイル実行** - 許可されたディレクトリ内のバッチファイルを安全に実行
- **プロセス管理** - Windowsプロセス・サービスの起動・停止・監視
- **ファイル同期** - Robocopyを使用した大容量ファイルの高速・確実な転送
- **自己管理機能** - MCPサーバー自体のビルド・テスト・更新
- **NordVPNメッシュネットワーク対応** - 複数のWindowsマシンを統合管理
- **SSH経由リモート実行** - SSHでWindows間を接続
- **セキュア通信** - トークンベース認証（本番環境用）
- **セキュリティ機能** - IPホワイトリスト、レート制限、パス制限
- **3つの実行モード** - 通常モード、開発モード、危険モード
- **詳細なログ** - リクエスト/レスポンスの記録、セキュリティイベント追跡
- **簡単セットアップ** - 自動インストールスクリプト付き
- **自動アップデート** - GitHubから最新版を取得可能
- **セルフデプロイ・再起動機能** - MCPサーバー自体の管理・更新・再起動
- **改善要求対応システム** - ユーザーからの機能要求を継続的に実装

### 🔄 将来の実装計画

#### 多言語・多環境ビルドサポート
- **Java/Maven/Gradle** - Spring Boot、Android アプリケーションのビルド
- **Python** - pip、conda、Poetry環境でのパッケージビルド・テスト
- **Node.js/npm/yarn** - TypeScript、React、Vue.js プロジェクトのビルド
- **Go** - モジュール管理とクロスコンパイル対応
- **Rust** - Cargoを使用したバイナリ・ライブラリビルド
- **C/C++** - Visual Studio、MinGW、MSBuild環境
- **Docker** - コンテナイメージのビルド・テスト・デプロイ

#### クラウド・デプロイメント統合
- **Azure DevOps** - パイプライン統合とデプロイメント
- **AWS CodeBuild/CodeDeploy** - クラウドビルド・デプロイ
- **GitHub Actions** - CI/CDワークフロー自動化
- **Docker Hub/Azure Container Registry** - コンテナレジストリ連携

#### 高度な開発ツール
- **静的解析** - SonarQube、ESLint、RuboCop統合
- **テスト自動化** - Playwright、Selenium、Jest、pytest
- **パフォーマンス監視** - メトリクス収集とモニタリング
- **セキュリティスキャン** - 脆弱性検出とコンプライアンス

## アーキテクチャ

汎用的なMCPサーバーとして、以下の2つの独立したコンポーネントで構成されています：

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

## MCP対応ツール一覧

Windows MCPサーバーでは、以下のMCPツールが利用可能です：

## 🔄 セルフデプロイ・再起動・更新機能

### 自動更新システム
```bash
# GitHubから最新版を取得して自動更新
npm run update

# ローカル更新（開発用）
npm run update-local

# サーバー再起動
npm start
```

### mcp_self_build ツール（v1.0.6実装済み）
MCPサーバー自体の完全な自己管理が可能：

| アクション | 説明 |
|----------|------|
| `build` | MCPサーバーをビルド |
| `test` | テスト実行（カバレッジ付き） |
| `install` | Windows VMへインストール |
| `update` | GitHubから最新版取得・自動アップデート |
| `start` | サーバー起動 |
| `stop` | サーバー停止 |
| `status` | 動作状況確認 |

```bash
# セルフ更新の例
@windows-build-server mcp_self_build action="update" options='{"autoStart": true}'

# ステータス確認
@windows-build-server mcp_self_build action="status"
```

### 🔧 ユーザー改善要求対応プロセス

1. **要求受付** - GitHub Issues または直接フィードバック
2. **分析・設計** - CLAUDE.mdの原則に基づく実装計画
3. **TDD実装** - テスト駆動開発による機能追加
4. **セキュリティ検証** - 多層防御の維持
5. **自動デプロイ** - mcp_self_buildによる更新
6. **ユーザー通知** - 新機能の詳細説明とマイグレーション手順

### 📈 継続的改善サイクル

```
ユーザー要求 → 実装 → テスト → デプロイ → フィードバック → 次の改善
     ↓           ↓       ↓        ↓         ↓          ↓
  GitHub Issues → TDD → CI/CD → セルフ更新 → 使用状況分析 → 機能強化
```

---

### 🟢 利用可能なツール（19種類）
現在のサーバーで実装済み：

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

##### 通常モード（デフォルト）
| カテゴリ | コマンド | 説明 |
|---------|----------|------|
| **開発ツール** | `dotnet`, `git`, `docker`, `kubectl` | 開発環境の管理 |
| **PowerShell基本** | `powershell`, `echo`, `Write-Host`, `Write-Output` | 基本的な出力コマンド |
| **システム情報** | `Get-Process`, `Get-Service`, `Get-WinEvent` | システム状態の確認 |
| **ファイル操作** | `Get-ChildItem`, `dir`, `ls`, `Remove-Item`, `Set-Location` | ファイル・ディレクトリ管理 |
| **ネットワーク** | `Test-Connection`, `ping`, `ipconfig` | ネットワーク診断 |
| **仮想化** | `Get-VM`, `Start-VM`, `Stop-VM`, `Checkpoint-VM` | Hyper-V管理 |
| **プロセス管理** | `Start-Process`, `Invoke-Command` | プロセスとコマンドの実行 |
| **その他** | `cmd`, `Find-RegKey`, `Format-Table` | その他のユーティリティ |

##### 開発モード（ENABLE_DEV_COMMANDS=true）
通常モードのコマンドに加えて以下が利用可能：

| カテゴリ | コマンド | 説明 |
|---------|----------|------|
| **プロセス監視** | `tasklist` | 実行中のタスク一覧 |
| **ネットワーク詳細** | `netstat` | ネットワーク接続状態 |
| **ファイル内容** | `type` | ファイル内容表示 |
| **プログラミング** | `python`, `pip`, `node`, `npm` | 各種プログラミング環境 |
| **バッチ処理** | `if`, `for`, `set`, `call`, `start` | バッチスクリプト関連 |
| **テキスト検索** | `findstr` | ファイル内文字列検索 |
| **ディレクトリ操作** | `cd` | ディレクトリ変更 |
| **コマンド連結** | `&&`, `\|\|`, `\|`, `;`, `&` | 複数コマンドの連結 |

##### 危険モード（ENABLE_DANGEROUS_MODE=true）
⚠️ **すべてのコマンドが制限なく実行可能** - 本番環境では絶対に使用しないでください

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

### 5. run_batch - バッチファイル実行

許可されたディレクトリ内のバッチファイルを安全に実行します

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `batchFile` | はい | バッチファイルのパス（許可されたディレクトリ内のみ） |
| `workingDirectory` | いいえ | 作業ディレクトリ（省略時はバッチファイルのディレクトリ） |

```bash
# AIServer起動スクリプトの実行
@windows-build-server run_batch batchFile="C:\\builds\\AIServer\\release\\start.bat"

# 作業ディレクトリを指定して実行
@windows-build-server run_batch batchFile="C:\\builds\\setup.bat" workingDirectory="C:\\builds\\AIServer"

# パブリックディレクトリのスクリプト実行
@windows-build-server run_batch batchFile="C:\\Users\\Public\\deploy.bat"

# 一時ディレクトリのセットアップスクリプト
@windows-build-server run_batch batchFile="C:\\temp\\install.bat"
```

**セキュリティ制限**：
- バッチファイルは`ALLOWED_BATCH_DIRS`環境変数で定義されたディレクトリ内のみ実行可能
- デフォルト許可ディレクトリ:
  - `C:\builds\`
  - `C:\builds\AIServer\`
  - `C:\Users\Public\`
  - `C:\temp\`
- .batおよび.cmdファイルのみ実行可能
- 実行時間は5分（COMMAND_TIMEOUT）でタイムアウト
- すべての実行がログに記録されます

**許可ディレクトリのカスタマイズ**：
```env
# .envファイルで設定（セミコロン区切り）
ALLOWED_BATCH_DIRS=C:\\builds\\;C:\\builds\\AIServer\\;C:\\custom\\scripts\\
```

---

### 🟡 開発完了・デプロイ待ち（11つのツール）
ソースコードに実装済み、サーバー更新後に利用可能：

### 6. mcp_self_build - MCPサーバー自己管理

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

MCPサーバー自体のビルド・テスト・インストール・更新を管理します

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `action` | はい | 実行するアクション（build/test/install/update/start/stop/status） |
| `targetPath` | いいえ | インストール先パス（デフォルト: C:\\mcp-server） |
| `options` | いいえ | オプション設定 |

```bash
# MCPサーバーをビルド
@windows-build-server mcp_self_build action="build"

# テスト実行（カバレッジ付き）
@windows-build-server mcp_self_build action="test"

# GitHubから最新版を取得してアップデート
@windows-build-server mcp_self_build action="update" targetPath="C:\\mcp-server" options='{"autoStart": true}'

# ステータス確認
@windows-build-server mcp_self_build action="status"
```

### 7. process_manager - プロセス管理

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Windowsプロセスとサービスの包括的な管理を行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `action` | はい | 実行するアクション（start/stop/restart/status/list/kill） |
| `processName` | 条件付き | プロセス名またはサービス名（kill時はPID） |
| `options` | いいえ | オプション設定 |

```bash
# プロセス起動
@windows-build-server process_manager action="start" processName="notepad"

# サービス停止
@windows-build-server process_manager action="stop" processName="TestService" options='{"asService": true}'

# 全プロセス一覧
@windows-build-server process_manager action="list"

# PIDで強制終了
@windows-build-server process_manager action="kill" processName="1234" options='{"force": true}'
```

### 8. file_sync - ファイル同期

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

大容量ファイル・ディレクトリの高速同期を行います（robocopy統合）

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `source` | はい | 同期元パス（ファイルまたはディレクトリ） |
| `destination` | はい | 同期先パス |
| `options` | いいえ | 同期オプション |

```bash
# ディレクトリ同期
@windows-build-server file_sync source="C:\\builds\\AIServer" destination="D:\\production\\AIServer" options='{"recursive": true, "verify": true}'

# 特定パターンのファイルのみ同期
@windows-build-server file_sync source="C:\\models" destination="D:\\models" options='{"pattern": "*.onnx", "overwrite": true}'

# 除外パターン付き同期
@windows-build-server file_sync source="C:\\source" destination="C:\\backup" options='{"recursive": true, "excludePattern": "*.tmp"}'
```

**file_syncの特徴**：
- robocopy統合による信頼性の高い転送
- 大容量ファイル対応
- 転送後の整合性検証オプション
- 自動リトライ機能（3回/10秒間隔）
- パターンフィルタと除外パターン対応

---

### 🟢 v1.0.8実装済み・デプロイ待ち（4つのツール）

#### 9. build_go - Go言語ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Go言語プロジェクトの包括的なビルド・テスト・管理を行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | Goプロジェクトのパス（go.modディレクトリ） |
| `action` | はい | 実行するアクション（build/test/run/install/clean/mod/vet/fmt） |
| `outputPath` | いいえ | ビルド出力パス |
| `targetOS` | いいえ | クロスコンパイル用OS（windows/linux/darwin/freebsd） |
| `targetArch` | いいえ | クロスコンパイル用アーキテクチャ（amd64/arm64/386/arm） |
| `buildFlags` | いいえ | ビルドフラグ配列 |
| `tags` | いいえ | ビルドタグ配列 |
| `coverage` | いいえ | テスト時のカバレッジ測定（true/false） |
| `verbose` | いいえ | 詳細出力（true/false） |
| `modAction` | いいえ | go modアクション（download/tidy/verify/vendor） |

```bash
# Go プロジェクトビルド
@windows-build-server build_go projectPath="C:\\projects\\mygoapp" action="build" outputPath="C:\\builds\\myapp.exe"

# クロスコンパイル（Linux用）
@windows-build-server build_go projectPath="C:\\projects\\mygoapp" action="build" targetOS="linux" targetArch="amd64" outputPath="C:\\builds\\myapp-linux"

# テスト実行（カバレッジ付き）
@windows-build-server build_go projectPath="C:\\projects\\mygoapp" action="test" coverage=true verbose=true

# Go modules管理
@windows-build-server build_go projectPath="C:\\projects\\mygoapp" action="mod" modAction="tidy"

# コードフォーマット
@windows-build-server build_go projectPath="C:\\projects\\mygoapp" action="fmt"
```

#### 10. build_rust - Rust/Cargoビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Rust/Cargoプロジェクトの包括的なビルド・テスト・管理を行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | Rustプロジェクトのパス（Cargo.tomlディレクトリ） |
| `action` | はい | 実行するアクション（build/test/run/check/clippy/fmt/doc/clean/update） |
| `release` | いいえ | リリースビルド（true/false） |
| `features` | いいえ | 有効にするフィーチャー配列 |
| `allFeatures` | いいえ | 全フィーチャー有効化（true/false） |
| `noDefaultFeatures` | いいえ | デフォルトフィーチャー無効化（true/false） |
| `target` | いいえ | ターゲットトリプル |
| `testName` | いいえ | 特定のテスト名 |
| `allTargets` | いいえ | 全ターゲット対象（true/false） |
| `denyWarnings` | いいえ | 警告をエラーとして扱う（true/false） |

```bash
# Cargo リリースビルド
@windows-build-server build_rust projectPath="C:\\projects\\myrust-app" action="build" release=true features='["feature1", "feature2"]'

# Cargo テスト
@windows-build-server build_rust projectPath="C:\\projects\\myrust-app" action="test" target="x86_64-pc-windows-msvc" testName="integration_tests"

# Clippy リンティング
@windows-build-server build_rust projectPath="C:\\projects\\myrust-app" action="clippy" allTargets=true denyWarnings=true

# コードフォーマット
@windows-build-server build_rust projectPath="C:\\projects\\myrust-app" action="fmt"

# ドキュメント生成
@windows-build-server build_rust projectPath="C:\\projects\\myrust-app" action="doc"
```

#### 11. build_cpp - C/C++ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

C/C++プロジェクトの複数ビルドシステム対応ビルドを行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | C++プロジェクトのパス |
| `buildSystem` | はい | ビルドシステム（cmake/msbuild/make/ninja） |
| `buildType` | いいえ | ビルドタイプ（Debug/Release/RelWithDebInfo/MinSizeRel） |
| `configuration` | いいえ | MSBuild用構成（Debug/Release） |
| `platform` | いいえ | MSBuild用プラットフォーム（Win32/x64/ARM/ARM64） |
| `generator` | いいえ | CMake用ジェネレータ |
| `buildDir` | いいえ | CMake用ビルドディレクトリ |
| `target` | いいえ | Make/Ninja用ターゲット |
| `parallel` | いいえ | 並列ビルド（true/false） |
| `jobs` | いいえ | 並列ジョブ数 |

```bash
# CMake ビルド
@windows-build-server build_cpp projectPath="C:\\projects\\mycpp-app" buildSystem="cmake" buildType="Release" generator="Visual Studio 17 2022" parallel=true

# MSBuild Visual Studioソリューション
@windows-build-server build_cpp projectPath="C:\\projects\\mycpp-app\\MyApp.sln" buildSystem="msbuild" configuration="Release" platform="x64" parallel=true

# Make ビルド
@windows-build-server build_cpp projectPath="C:\\projects\\mycpp-app" buildSystem="make" target="all" parallel=true jobs=8

# Ninja ビルド
@windows-build-server build_cpp projectPath="C:\\projects\\mycpp-app" buildSystem="ninja" buildType="Release" parallel=true
```

#### 12. build_docker - Dockerビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Dockerイメージの高度なビルド機能を提供します

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `contextPath` | はい | Dockerビルドコンテキストのパス |
| `imageName` | はい | 作成するイメージ名（タグ付き） |
| `dockerfile` | いいえ | Dockerfileのパス（デフォルト: Dockerfile） |
| `buildArgs` | いいえ | ビルド引数オブジェクト |
| `target` | いいえ | マルチステージビルドのターゲット |
| `platform` | いいえ | ターゲットプラットフォーム |
| `noCache` | いいえ | キャッシュ無効化（true/false） |
| `secrets` | いいえ | BuildKitシークレット配列 |
| `labels` | いいえ | イメージラベルオブジェクト |
| `progress` | いいえ | プログレス表示（auto/plain/tty） |

```bash
# Docker イメージビルド
@windows-build-server build_docker contextPath="C:\\projects\\myapp" imageName="myapp:latest" dockerfile="Dockerfile.prod" buildArgs='{"NODE_ENV": "production", "VERSION": "1.0.0"}' noCache=true

# マルチステージビルド
@windows-build-server build_docker contextPath="C:\\projects\\myapp" imageName="myapp:dev" target="development" platform="linux/amd64"

# BuildKitシークレット使用
@windows-build-server build_docker contextPath="C:\\projects\\myapp" imageName="myapp:secure" secrets='["id=mysecret,src=/path/to/secret"]' labels='{"version": "1.0.0", "maintainer": "dev-team"}'

# マルチプラットフォームビルド
@windows-build-server build_docker contextPath="C:\\projects\\myapp" imageName="myapp:multi" platform="linux/amd64,linux/arm64"
```

#### 13. build_kotlin - Kotlin/Android ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Kotlin/Android プロジェクトの包括的なビルド・デプロイを行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | Kotlin/Android プロジェクトのパス |
| `projectType` | はい | プロジェクトタイプ（android/jvm/native/multiplatform） |
| `buildVariant` | いいえ | Android ビルドバリアント（debug/release） |
| `tasks` | いいえ | 実行するGradleタスク配列 |
| `buildType` | いいえ | ネイティブビルドタイプ |
| `target` | いいえ | ターゲットプラットフォーム |
| `signingConfig` | いいえ | Android署名設定オブジェクト |
| `gradleOptions` | いいえ | 追加Gradleオプション配列 |

```bash
# Android リリースビルド
@windows-build-server build_kotlin projectPath="C:\\projects\\AndroidApp" projectType="android" buildVariant="release" tasks='["assembleRelease"]'

# Android署名付きAPK
@windows-build-server build_kotlin projectPath="C:\\projects\\AndroidApp" projectType="android" buildVariant="release" signingConfig='{"storeFile": "C:\\keys\\release.keystore", "storePassword": "encrypted:xxx", "keyAlias": "release", "keyPassword": "encrypted:yyy"}'

# Kotlin/Native クロスコンパイル
@windows-build-server build_kotlin projectPath="C:\\projects\\KotlinNative" projectType="native" target="mingwX64" buildType="release"

# Kotlin Multiplatform
@windows-build-server build_kotlin projectPath="C:\\projects\\KMP" projectType="multiplatform" tasks='["publishAllPublicationsToMavenLocalRepository"]'
```

#### 14. build_swift - Swift/iOS ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Swift Package Manager および iOS/macOS アプリのビルドを行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | Swift プロジェクトのパス |
| `action` | はい | 実行するアクション（build/test/run/package/clean） |
| `configuration` | いいえ | ビルド構成（debug/release） |
| `platform` | いいえ | ターゲットプラットフォーム |
| `arch` | いいえ | ターゲットアーキテクチャ |
| `enableCodeCoverage` | いいえ | テストカバレッジ有効化 |
| `parallel` | いいえ | 並列テスト実行 |
| `package` | いいえ | 特定パッケージ指定 |

```bash
# Swift パッケージビルド
@windows-build-server build_swift projectPath="C:\\projects\\SwiftPackage" action="build" configuration="release"

# Swift テスト（カバレッジ付き）
@windows-build-server build_swift projectPath="C:\\projects\\SwiftPackage" action="test" enableCodeCoverage=true parallel=true

# Swift パッケージ作成
@windows-build-server build_swift projectPath="C:\\projects\\SwiftLib" action="package" configuration="release"

# マルチプラットフォームビルド
@windows-build-server build_swift projectPath="C:\\projects\\SwiftApp" action="build" platform="windows" arch="x86_64"
```

#### 15. build_php - PHP/Laravel ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

PHP アプリケーションと Laravel プロジェクトの包括的な管理を行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | PHP プロジェクトのパス |
| `action` | はい | 実行するアクション（install/update/test/build/artisan/serve） |
| `packageManager` | いいえ | パッケージマネージャー（composer/pear） |
| `noDev` | いいえ | 開発依存関係をスキップ |
| `optimize` | いいえ | オートローダー最適化 |
| `testFramework` | いいえ | テストフレームワーク（phpunit/phpspec/codeception/behat） |
| `coverage` | いいえ | コードカバレッジ生成 |
| `testSuite` | いいえ | 特定テストスイート |
| `artisanCommand` | いいえ | Laravel Artisan コマンド |

```bash
# Composer 本番インストール
@windows-build-server build_php projectPath="C:\\projects\\PHPApp" action="install" noDev=true optimize=true

# PHPUnit テスト（カバレッジ付き）
@windows-build-server build_php projectPath="C:\\projects\\PHPApp" action="test" testFramework="phpunit" coverage=true testSuite="unit"

# Laravel Artisan コマンド
@windows-build-server build_php projectPath="C:\\projects\\LaravelApp" action="artisan" artisanCommand="migrate:fresh --seed"

# Laravel 開発サーバー起動
@windows-build-server build_php projectPath="C:\\projects\\LaravelApp" action="serve"
```

#### 16. build_ruby - Ruby/Rails ビルド

⚠️ **デプロイ待ち**: サーバー更新後に利用可能

Ruby/Rails アプリケーションの包括的なビルド・テスト・デプロイを行います

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `projectPath` | はい | Ruby プロジェクトのパス |
| `action` | はい | 実行するアクション（install/update/exec/test/build/rails/rake） |
| `withoutGroups` | いいえ | 除外するBundlerグループ配列 |
| `deployment` | いいえ | デプロイメントモード |
| `railsCommand` | いいえ | Rails コマンド |
| `railsEnv` | いいえ | Rails 環境（development/test/production） |
| `rakeTask` | いいえ | Rake タスク |
| `testFramework` | いいえ | テストフレームワーク（rspec/minitest/test-unit） |
| `parallel` | いいえ | 並列テスト実行 |
| `format` | いいえ | テスト出力フォーマット |
| `gemspec` | いいえ | Gemspec ファイル |

```bash
# Bundle 本番インストール
@windows-build-server build_ruby projectPath="C:\\projects\\RubyApp" action="install" withoutGroups='["development", "test"]' deployment=true

# Rails マイグレーション
@windows-build-server build_ruby projectPath="C:\\projects\\RailsApp" action="rails" railsCommand="db:migrate" railsEnv="production"

# RSpec テスト（並列実行）
@windows-build-server build_ruby projectPath="C:\\projects\\RailsApp" action="test" testFramework="rspec" parallel=true format="documentation"

# Ruby Gem ビルド
@windows-build-server build_ruby projectPath="C:\\projects\\MyGem" action="build" gemspec="mygem.gemspec"
```

---

### 🔮 将来実装予定ツール

#### 17. build_java - Java/Kotlinビルド
```bash
# Maven プロジェクトビルド
@windows-build-server build_java projectPath="C:\\projects\\MyApp\\pom.xml" buildTool="maven" profile="production"

# Gradle プロジェクトビルド
@windows-build-server build_java projectPath="C:\\projects\\MyApp\\build.gradle" buildTool="gradle" tasks="build,test"

# Android アプリビルド
@windows-build-server build_java projectPath="C:\\projects\\MyAndroidApp" buildTool="gradle" variant="release"
```

#### 18. build_python - Python環境ビルド
```bash
# pip環境でのパッケージビルド
@windows-build-server build_python projectPath="C:\\projects\\MyPythonApp" packageManager="pip" requirements="requirements.txt"

# conda環境でのビルド
@windows-build-server build_python projectPath="C:\\projects\\MLProject" packageManager="conda" environment="environment.yml"

# Poetry プロジェクトビルド
@windows-build-server build_python projectPath="C:\\projects\\MyPoetryApp" packageManager="poetry" target="wheel"
```

#### 19. build_node - Node.js/TypeScriptビルド
```bash
# npm プロジェクトビルド
@windows-build-server build_node projectPath="C:\\projects\\MyReactApp" packageManager="npm" script="build"

# yarn プロジェクトビルド
@windows-build-server build_node projectPath="C:\\projects\\MyVueApp" packageManager="yarn" script="build:production"

# TypeScript プロジェクトビルド
@windows-build-server build_node projectPath="C:\\projects\\MyTSApp" packageManager="npm" script="build" typecheck="true"
```

#### 20. deploy_cloud - クラウドデプロイメント
```bash
# Azure Web Apps デプロイ
@windows-build-server deploy_cloud provider="azure" service="webapp" resourceGroup="myapp-rg" appName="myapp"

# AWS Lambda デプロイ
@windows-build-server deploy_cloud provider="aws" service="lambda" functionName="myfunction" runtime="python3.9"

# GitHub Actions トリガー
@windows-build-server deploy_cloud provider="github" repository="myorg/myapp" workflow="deploy.yml" ref="main"
```

#### 21. test_automation - テスト自動化
```bash
# Playwright テスト実行
@windows-build-server test_automation framework="playwright" projectPath="C:\\projects\\e2e-tests" browser="chromium"

# Jest ユニットテスト
@windows-build-server test_automation framework="jest" projectPath="C:\\projects\\MyApp" coverage="true"

# pytest テスト実行
@windows-build-server test_automation framework="pytest" projectPath="C:\\projects\\MyPythonApp" markers="integration"
```

#### 22. security_scan - セキュリティスキャン
```bash
# 依存関係脆弱性スキャン
@windows-build-server security_scan type="dependency" projectPath="C:\\projects\\MyApp" tool="npm-audit"

# コード脆弱性スキャン
@windows-build-server security_scan type="code" projectPath="C:\\projects\\MyApp" tool="sonarqube"

# コンテナイメージスキャン
@windows-build-server security_scan type="container" image="myapp:latest" tool="trivy"
```

---

## セキュリティモード

Windows MCPサーバーは3つのセキュリティモードで動作します：

### 通常モード（デフォルト）
- 厳格なコマンド検証とパス制限
- 本番環境での使用を想定
- 限定された安全なコマンドのみ実行可能

### 開発モード
- `ENABLE_DEV_COMMANDS=true`で有効化
- 開発用コマンドを追加で許可
- パス制限は維持（`DEV_COMMAND_PATHS`で定義）
- バッチファイルの実行、プログラミング言語の使用が可能

### 危険モード（v1.0.6で機能強化）
- `ENABLE_DANGEROUS_MODE=true`で有効化
- **すべてのセキュリティ制限をバイパス**
- **レート制限完全無効化** - 大量ファイル操作制限なし
- **パス制限なし** - 全ディレクトリアクセス可能
- **プロセス管理無制限** - 任意のプロセス制御
- **ファイル同期無制限** - 任意の場所への同期
- ⚠️ **本番環境では絶対に使用しないでください**

**v1.0.6の改善点**：
- アプリエンジニアからの要望により、レート制限を完全無効化
- 大量ファイル操作やバックグラウンドプロセス管理の制限を解除
- AIServer Enterprise v2のような大規模開発に対応

---

## 必要要件

### 基本要件
- **Windows VM**: Windows 10/11、PowerShell 5.1以上
- **クライアント**: MCP対応ツール（Claude Code、Gemini-CLI等）がインストールされたmacOS/Linux
- **ネットワーク**: クライアントとWindows VM間の接続
- **権限**: Windows VMの管理者アクセス
- **オプション**: NordVPNメッシュネットワーク（リモートWindows用）

### 現在サポート中の開発環境
- **.NET**: .NET 6.0+、Visual Studio 2022、MSBuild
- **PowerShell**: PowerShell 5.1+、PowerShell Core 7+
- **SSH**: OpenSSH for Windows
- **Git**: Git for Windows

### 将来サポート予定の開発環境
- **Java**: JDK 8/11/17/21、Maven 3.6+、Gradle 7+
- **Python**: Python 3.8+、pip、conda、Poetry
- **Node.js**: Node.js 16+、npm、yarn、pnpm
- **Go**: Go 1.19+、Go modules
- **Rust**: Rust 1.65+、Cargo
- **Docker**: Docker Desktop、Docker Compose
- **C/C++**: Visual Studio Build Tools、MinGW、Clang
- **クラウドCLI**: Azure CLI、AWS CLI、GitHub CLI

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
| `ENABLE_DEV_COMMANDS` | 開発コマンドモード有効化 | いいえ | false |
| `ALLOWED_DEV_COMMANDS` | 許可する開発コマンド（カンマ区切り） | いいえ | tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd |
| `DEV_COMMAND_PATHS` | 開発コマンド実行許可パス（カンマ区切り） | いいえ | C:\\builds\\,C:\\projects\\,C:\\dev\\ |
| `ALLOWED_BATCH_DIRS` | バッチファイル実行許可ディレクトリ（セミコロン区切り） | いいえ | C:\\builds\\;C:\\builds\\AIServer\\;C:\\Users\\Public\\;C:\\temp\\ |
| `ENABLE_DANGEROUS_MODE` | ⚠️危険実行モード（全制限解除・レート制限無効化） | いいえ | false |

### v1.0.6で追加された環境変数

| 変数名 | 説明 | 必須 | デフォルト値 |
|--------|------|------|-------------|
| `MCP_SELF_BUILD_PATH` | mcp_self_buildツールの対象パス | いいえ | 現在のディレクトリ |
| `PROCESS_MANAGER_TIMEOUT` | プロセス管理操作のタイムアウト（秒） | いいえ | 30 |
| `FILE_SYNC_MAX_SIZE` | file_sync最大ファイルサイズ（バイト） | いいえ | 無制限 |
| `ROBOCOPY_RETRIES` | robocopyリトライ回数 | いいえ | 3 |
| `ROBOCOPY_WAIT_TIME` | robocopy待機時間（秒） | いいえ | 10 |

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

### v1.0.6 新機能の使用例

#### MCPサーバー自己管理
```bash
# MCPサーバー自体をテスト
@windows-build-server mcp_self_build action="test"

# 自己アップデート
@windows-build-server mcp_self_build action="update" targetPath="C:\\mcp-server" options='{"autoStart": true}'
```

#### プロセス管理
```bash
# AIServerバックエンドの起動
@windows-build-server process_manager action="start" processName="AIServer.Backend" options='{"asService": true}'

# プロセス状況確認
@windows-build-server process_manager action="list"
```

#### 大容量ファイル同期
```bash
# AIServerモデルファイルの同期
@windows-build-server file_sync source="C:\\builds\\AIServer\\models" destination="D:\\production\\models" options='{"recursive": true, "pattern": "*.onnx", "verify": true}'

# バックアップ作成
@windows-build-server file_sync source="C:\\production\\data" destination="C:\\backup\\data" options='{"recursive": true, "excludePattern": "*.tmp"}'
```

#### 危険モードでの無制限操作
```powershell
# 危険モード起動
set ENABLE_DANGEROUS_MODE=true
npm start

# 大量ファイル操作もレート制限なし
# 任意のディレクトリアクセス可能
# プロセス管理無制限
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

# 任意のバッチファイル実行（パス制限なし）
@windows-build-server run_batch batchFile="C:\\Windows\\System32\\cleanup.bat"
@windows-build-server run_batch batchFile="D:\\scripts\\dangerous-script.bat"
```

⚠️ **警告**: これらのコマンドはシステムに重大な影響を与える可能性があります。実行前に必ず内容を確認してください。

#### 開発モード（詳細ログ出力）
```powershell
npm run dev
```

#### 開発コマンドモード（安全な開発用コマンド実行）

開発コマンドモードは、危険モードよりも安全に、特定の開発用コマンドを許可するモードです。

**設定方法**：
```env
# .envファイルに追加
ENABLE_DEV_COMMANDS=true
ALLOWED_DEV_COMMANDS=tasklist,netstat,type,python,pip,node,npm,git,if,for,findstr,echo,set,call,start,cd
DEV_COMMAND_PATHS=C:\\builds\\,C:\\projects\\,C:\\dev\\
```

**利用可能なコマンド**：
| カテゴリ | コマンド | 説明 |
|---------|----------|------|
| **プロセス管理** | `tasklist`, `tasklist \| findstr` | プロセスの確認・検索 |
| **ネットワーク** | `netstat`, `netstat -an \| findstr` | ポート状態の確認 |
| **ファイル操作** | `type`, `cd`, `echo` | ファイル内容表示、ディレクトリ移動 |
| **開発ツール** | `python`, `pip`, `node`, `npm`, `git` | 各種開発ツールの実行 |
| **バッチ処理** | `if`, `for`, `set`, `call`, `start` | バッチファイル実行、条件分岐 |
| **コマンド連結** | `&&`, `\|\|`, `\|` | 複数コマンドの連結実行 |

**使用例**：
```bash
# プロセスの確認
@windows-build-server run_powershell command="tasklist | findstr python"
@windows-build-server run_powershell command="tasklist | findstr AIServer"

# ポート状態の確認
@windows-build-server run_powershell command="netstat -an | findstr :8080"
@windows-build-server run_powershell command="netstat -an | findstr LISTENING"

# バッチファイルの実行（許可されたパス内のみ）
@windows-build-server run_powershell command="cd C:\\builds\\AIServer\\release && start.bat"
@windows-build-server run_powershell command="Set-Location C:\\builds\\AIServer\\release; .\\start.bat"
@windows-build-server run_powershell command="& 'C:\\builds\\AIServer\\release\\start.bat'"

# またはrun_batchツールを使用（推奨）
@windows-build-server run_batch batchFile="C:\\builds\\AIServer\\release\\start.bat"

# ファイル内容の確認
@windows-build-server run_powershell command="type C:\\builds\\AIServer\\release\\config.json"
@windows-build-server run_powershell command="type C:\\builds\\logs\\latest.log | findstr ERROR"

# Python実行
@windows-build-server run_powershell command="python --version"
@windows-build-server run_powershell command="python C:\\builds\\scripts\\deploy.py"

# 条件付き実行
@windows-build-server run_powershell command="if exist C:\\builds\\ready.txt (echo Build is ready) else (echo Build not ready)"
```

**セキュリティ制限**：
- コマンドは`DEV_COMMAND_PATHS`で指定されたディレクトリ内でのみ実行可能
- システムファイルの削除、ユーザー管理、レジストリ変更などの危険なコマンドは引き続き制限
- バッチファイル（.bat, .cmd）も許可されたパス内のみ実行可能

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