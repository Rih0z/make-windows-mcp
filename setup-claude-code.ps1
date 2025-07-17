# Windows MCP Server - Claude Code 自動セットアップスクリプト
# This script automatically configures Windows MCP Server for Claude Code

param(
    [string]$AuthToken = "",
    [string]$ServerPort = "8080",
    [string]$AllowedPaths = "C:\builds\;C:\projects\;C:\temp\",
    [string]$Scope = "mcp",
    [switch]$Force = $false,
    [switch]$DangerousMode = $false
)

# スクリプトの設定
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# カラー出力関数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# エラーハンドリング関数
function Write-ErrorMessage {
    param([string]$Message)
    Write-ColorOutput "❌ エラー: $Message" "Red"
}

# 成功メッセージ関数
function Write-SuccessMessage {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" "Green"
}

# 警告メッセージ関数
function Write-WarningMessage {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" "Yellow"
}

# 情報メッセージ関数
function Write-InfoMessage {
    param([string]$Message)
    Write-ColorOutput "ℹ️  $Message" "Cyan"
}

# ヘッダー表示
function Show-Header {
    Write-ColorOutput "╔═══════════════════════════════════════════════════════════════════════════════╗" "Blue"
    Write-ColorOutput "║                Windows MCP Server - Claude Code セットアップ                 ║" "Blue"
    Write-ColorOutput "║                           v1.0.40                                            ║" "Blue"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════════════════════════╝" "Blue"
    Write-Host ""
}

# 前提条件チェック
function Test-Prerequisites {
    Write-InfoMessage "前提条件をチェック中..."
    
    # Node.js のチェック
    try {
        $nodeVersion = node --version
        Write-SuccessMessage "Node.js: $nodeVersion"
    } catch {
        Write-ErrorMessage "Node.js が見つかりません。Node.js v18以上をインストールしてください。"
        exit 1
    }
    
    # PowerShell バージョンチェック
    $psVersion = $PSVersionTable.PSVersion
    if ($psVersion.Major -lt 5) {
        Write-ErrorMessage "PowerShell 5.1以上が必要です。現在のバージョン: $psVersion"
        exit 1
    }
    Write-SuccessMessage "PowerShell: $psVersion"
    
    # 管理者権限チェック
    if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
        Write-WarningMessage "管理者権限で実行されていません。一部の機能が制限される可能性があります。"
    }
    
    Write-SuccessMessage "前提条件チェック完了"
}

# 認証トークン生成
function New-AuthToken {
    Write-InfoMessage "認証トークンを生成中..."
    
    $token = -join ((1..32) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) })
    
    Write-SuccessMessage "認証トークンを生成しました: $token"
    return $token
}

# 環境変数ファイルの作成
function New-EnvironmentFile {
    param(
        [string]$Token,
        [string]$Port,
        [string]$Paths
    )
    
    Write-InfoMessage "環境変数ファイルを作成中..."
    
    $envContent = @"
# 🔑 Windows MCP Server 認証設定
MCP_AUTH_TOKEN=$Token

# 🌐 サーバー設定
MCP_SERVER_PORT=$Port
MCP_SERVER_HOST=localhost

# 📁 ビルドパス設定
ALLOWED_BUILD_PATHS=$Paths

# ⏱️ タイムアウト設定
COMMAND_TIMEOUT=30000
SSH_TIMEOUT=5000

# 🚦 レート制限設定
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60000

# 🔒 セキュリティ設定
ENABLE_DEV_COMMANDS=false
ENABLE_DANGEROUS_MODE=$(if ($DangerousMode) { "true" } else { "false" })

# 📊 ログ設定
LOG_LEVEL=info
LOG_ROTATION_SIZE=10485760
LOG_ROTATION_FILES=5

# 🌍 リモートホスト設定
REMOTE_USERNAME=
REMOTE_PASSWORD=
NORDVPN_ENABLED=false
NORDVPN_HOSTS=
"@

    $envPath = Join-Path $PWD ".env"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8
    
    Write-SuccessMessage "環境変数ファイルを作成しました: $envPath"
}

# Claude Code設定ファイルの作成
function New-ClaudeCodeConfig {
    param(
        [string]$Token,
        [string]$Port,
        [string]$Paths,
        [string]$Scope
    )
    
    Write-InfoMessage "Claude Code設定ファイルを作成中..."
    
    # 現在のディレクトリを取得
    $currentDir = $PWD.Path
    $serverPath = Join-Path $currentDir "server\src\server.js"
    
    # 設定ファイルの内容
    $config = @{
        mcpServers = @{
            "windows-build-server" = @{
                type = "stdio"
                command = "node"
                args = @($serverPath)
                env = @{
                    MCP_AUTH_TOKEN = $Token
                    MCP_SERVER_PORT = $Port
                    ALLOWED_BUILD_PATHS = $Paths
                    COMMAND_TIMEOUT = "30000"
                    RATE_LIMIT_REQUESTS = "60"
                    RATE_LIMIT_WINDOW = "60000"
                    ENABLE_DEV_COMMANDS = "false"
                    ENABLE_DANGEROUS_MODE = if ($DangerousMode) { "true" } else { "false" }
                    LOG_LEVEL = "info"
                }
            }
        }
    }
    
    # 設定ファイルの保存場所を決定
    $configPath = ""
    switch ($Scope) {
        "user" {
            $configPath = Join-Path $env:USERPROFILE ".claude.json"
        }
        "project" {
            $configPath = Join-Path $PWD ".claude.json"
        }
        "local" {
            $configPath = Join-Path $PWD ".claude\settings.local.json"
            $configDir = Split-Path $configPath -Parent
            if (!(Test-Path $configDir)) {
                New-Item -ItemType Directory -Path $configDir -Force | Out-Null
            }
        }
        "mcp" {
            $configPath = Join-Path $PWD ".mcp.json"
        }
        default {
            $configPath = Join-Path $PWD ".mcp.json"
        }
    }
    
    # 既存の設定ファイルをバックアップ
    if ((Test-Path $configPath) -and !$Force) {
        $backupPath = "$configPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $configPath $backupPath
        Write-WarningMessage "既存の設定ファイルをバックアップしました: $backupPath"
    }
    
    # 設定ファイルを作成
    $configJson = $config | ConvertTo-Json -Depth 10
    $configJson | Out-File -FilePath $configPath -Encoding UTF8
    
    Write-SuccessMessage "Claude Code設定ファイルを作成しました: $configPath"
}

# 依存関係のインストール
function Install-Dependencies {
    Write-InfoMessage "依存関係をインストール中..."
    
    try {
        # メインの依存関係をインストール
        npm install
        
        # サーバーの依存関係をインストール
        if (Test-Path "server") {
            Set-Location "server"
            npm install
            Set-Location ".."
        }
        
        # クライアントの依存関係をインストール
        if (Test-Path "client") {
            Set-Location "client"
            npm install
            Set-Location ".."
        }
        
        Write-SuccessMessage "依存関係のインストールが完了しました"
    } catch {
        Write-ErrorMessage "依存関係のインストールに失敗しました: $($_.Exception.Message)"
        exit 1
    }
}

# 接続テスト
function Test-Connection {
    param(
        [string]$Token,
        [string]$Port
    )
    
    Write-InfoMessage "接続テストを実行中..."
    
    try {
        # サーバーを起動
        Write-InfoMessage "サーバーを起動中..."
        $serverProcess = Start-Process -FilePath "node" -ArgumentList "server\src\server.js" -PassThru -NoNewWindow
        
        # 少し待機
        Start-Sleep -Seconds 3
        
        # 接続テスト
        $testUrl = "http://localhost:$Port/health"
        $response = Invoke-WebRequest -Uri $testUrl -Method GET -Headers @{Authorization = "Bearer $Token"} -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            Write-SuccessMessage "接続テストが成功しました"
        } else {
            Write-ErrorMessage "接続テストに失敗しました: Status Code $($response.StatusCode)"
        }
        
        # サーバーを停止
        if ($serverProcess -and !$serverProcess.HasExited) {
            $serverProcess.Kill()
        }
        
    } catch {
        Write-ErrorMessage "接続テストに失敗しました: $($_.Exception.Message)"
        
        # サーバーを停止
        if ($serverProcess -and !$serverProcess.HasExited) {
            $serverProcess.Kill()
        }
    }
}

# 使用方法の表示
function Show-Usage {
    Write-ColorOutput "🎯 Windows MCP Server セットアップ完了！" "Green"
    Write-Host ""
    Write-ColorOutput "📋 使用方法:" "Yellow"
    Write-Host ""
    Write-ColorOutput "1. Claude Codeで新しいチャットを開始" "White"
    Write-ColorOutput "2. 以下のコマンドを試してみてください:" "White"
    Write-Host ""
    Write-ColorOutput "   @windows-build-server tools/list" "Cyan"
    Write-ColorOutput "   @windows-build-server build_dotnet projectPath=\"C:\projects\MyApp.csproj\"" "Cyan"
    Write-ColorOutput "   @windows-build-server run_powershell command=\"Get-Date\"" "Cyan"
    Write-Host ""
    Write-ColorOutput "🔧 利用可能なツール:" "Yellow"
    Write-ColorOutput "   • build_dotnet    - .NETプロジェクトビルド" "White"
    Write-ColorOutput "   • build_java      - Javaプロジェクトビルド" "White"
    Write-ColorOutput "   • build_python    - Pythonプロジェクトビルド" "White"
    Write-ColorOutput "   • run_powershell  - PowerShellコマンド実行" "White"
    Write-ColorOutput "   • run_batch       - バッチファイル実行" "White"
    Write-ColorOutput "   • process_manager - プロセス管理" "White"
    Write-ColorOutput "   • file_sync       - ファイル同期" "White"
    Write-ColorOutput "   • mcp_self_build  - サーバー自己管理" "White"
    Write-Host ""
    Write-ColorOutput "📚 詳細なドキュメント: CLAUDE_CODE_SETUP.md" "Yellow"
    Write-Host ""
}

# メイン実行関数
function Main {
    Show-Header
    
    try {
        # 前提条件チェック
        Test-Prerequisites
        
        # 認証トークン生成
        if (!$AuthToken) {
            $AuthToken = New-AuthToken
        }
        
        # 依存関係のインストール
        Install-Dependencies
        
        # 環境変数ファイルの作成
        New-EnvironmentFile -Token $AuthToken -Port $ServerPort -Paths $AllowedPaths
        
        # Claude Code設定ファイルの作成
        New-ClaudeCodeConfig -Token $AuthToken -Port $ServerPort -Paths $AllowedPaths -Scope $Scope
        
        # 接続テスト
        Test-Connection -Token $AuthToken -Port $ServerPort
        
        # 使用方法の表示
        Show-Usage
        
    } catch {
        Write-ErrorMessage "セットアップに失敗しました: $($_.Exception.Message)"
        Write-ErrorMessage "詳細: $($_.Exception.StackTrace)"
        exit 1
    }
}

# ヘルプメッセージ
function Show-Help {
    Write-Host ""
    Write-ColorOutput "Windows MCP Server - Claude Code セットアップスクリプト" "Blue"
    Write-Host ""
    Write-ColorOutput "使用方法:" "Yellow"
    Write-ColorOutput "  .\setup-claude-code.ps1 [オプション]" "White"
    Write-Host ""
    Write-ColorOutput "オプション:" "Yellow"
    Write-ColorOutput "  -AuthToken <string>     認証トークン (自動生成される場合は省略可)" "White"
    Write-ColorOutput "  -ServerPort <string>    サーバーポート (デフォルト: 8080)" "White"
    Write-ColorOutput "  -AllowedPaths <string>  許可パス (デフォルト: C:\builds\;C:\projects\;C:\temp\)" "White"
    Write-ColorOutput "  -Scope <string>         設定スコープ (user/project/local, デフォルト: user)" "White"
    Write-ColorOutput "  -Force                  既存の設定を強制上書き" "White"
    Write-ColorOutput "  -DangerousMode          危険モードを有効化 (非推奨)" "White"
    Write-ColorOutput "  -Help                   このヘルプを表示" "White"
    Write-Host ""
    Write-ColorOutput "例:" "Yellow"
    Write-ColorOutput "  .\setup-claude-code.ps1" "Cyan"
    Write-ColorOutput "  .\setup-claude-code.ps1 -Scope project -Force" "Cyan"
    Write-ColorOutput "  .\setup-claude-code.ps1 -AuthToken 'your-token' -ServerPort 8080" "Cyan"
    Write-Host ""
}

# パラメータチェック
if ($args -contains "-Help" -or $args -contains "-h" -or $args -contains "--help") {
    Show-Help
    exit 0
}

# メイン実行
Main