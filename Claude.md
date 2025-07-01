# Claude.md - AIコーディング原則

```yaml
ai_coding_principles:
  meta:
    version: "1.1"
    last_updated: "2025-07-01"
    description: "Claude AIコーディング実行原則 - Windows MCP Build Server対応版"
    
  core_principles:
    mandatory_declaration: "全てのコーディング作業開始時に必ずcore_principlesを完全に宣言すること"
    第1条: 
      rule: "常に思考開始前にClaude.mdの第一条から第四条のAIコーディング原則を全て宣言してから実施する"
      related_sections: ["execution_checklist", "mindset"]
    第2条: 
      rule: "常にプロの世界最高エンジニアとして対応する"
      related_sections: ["mindset", "quality_standards"]
    第3条: 
      rule: "モックや仮のコード、ハードコードを一切禁止する"
      related_sections: ["implementation", "architecture", "quality_standards"]
    第4条: 
      rule: "エンタープライズレベルの実装を実施し、修正は表面的ではなく、全体のアーキテクチャを意識して実施する"
      related_sections: ["architecture", "quality_standards", "deployment_requirements"]
    第5条:
      rule: "MCPサーバーとの通信は必ずセキュアで信頼性の高い方法で実装する"
      related_sections: ["mcp_communication", "security_standards", "implementation"]

  mcp_communication:
    overview:
      description: "Model Context Protocol (MCP) サーバーとの通信方法と実装原則"
      purpose: "Windows VMをMCPサーバーとして活用し、クロスプラットフォーム開発を実現"
    
    server_setup:
      windows_vm:
        - "必ず管理者権限でセットアップスクリプトを実行"
        - "ファイアウォールルールの適切な設定"
        - ".envファイルで認証トークンを必ず設定"
        - "本番環境では必ずHTTPSを有効化"
      
      security_requirements:
        - "認証トークンは必ず32文字以上のランダム文字列を使用"
        - "IPホワイトリストを本番環境で必ず設定"
        - "レート制限の実装（100リクエスト/分）"
        - "全リクエストのロギング実装"
    
    client_configuration:
      mac_setup:
        - ".envファイルを通じた設定管理"
        - "認証情報は絶対にハードコードしない"
        - "接続エラー時の適切なフォールバック処理"
      
      connection_validation:
        - "ヘルスチェックエンドポイントで接続確認"
        - "認証トークンの一致を確認"
        - "ネットワーク接続の安定性確認"
    
    implementation_standards:
      api_communication:
        - "必ずtools/listでツール一覧を取得してから使用"
        - "tools/callで実行時は適切なエラーハンドリング"
        - "タイムアウト設定（デフォルト5分）"
        - "大きな出力に対する制限（1MB）"
      
      error_handling:
        - "ネットワークエラーの適切な処理"
        - "認証エラーの明確なメッセージ"
        - "ビルドエラーの詳細なログ出力"
        - "リトライロジックの実装"
    
    best_practices:
      - "MCPサーバーのステータスを定期的に監視"
      - "ビルドログは必ず保存して分析可能にする"
      - "セキュリティトークンの定期的な更新"
      - "Windows VMのリソース使用状況を監視"

  quality_standards:
    security:
      - "GitHubへのプッシュ前にセキュリティ上の問題がないか確認すること"
      - "脆弱性スキャンの実施"
      - "認証・認可の適切な実装"
      - "MCPサーバーの認証トークンは必ず環境変数で管理"
    
    architecture:
      - "SOLID原則に従っているか確認する"
      - "DDD（ドメイン駆動設計）/CQRSに従う"
      - "エンタープライズレベルのアーキテクチャにする"
      - "スケーラビリティを考慮した設計"
      - "MCPサーバーとのクリーンな分離"
    
    implementation:
      - "デモデータではなく、実際に機能するシステムにする"
      - "ハードコードは一切使用しない"
      - "環境変数・設定ファイルを適切に使用"
      - "依存性注入を活用"
      - "MCPツールの適切な抽象化"

  testing_standards:
    approach:
      - "テストを修正する場合、ログをテストに合致するように修正するのではなく、プログラム自体を修正する"
      - "単体テスト、統合テスト、E2Eテストの実装"
      - "テストカバレッジ80%以上を維持"
      - "MCPサーバー接続のモックテスト実装"
    
    validation:
      - "全てのAPIエンドポイントのテスト"
      - "エラーハンドリングのテスト"
      - "パフォーマンステスト"
      - "MCPツール実行の成功/失敗テスト"

  documentation_management:
    structure:
      - "必要以上にドキュメントを増やさず、ログは.claude/logs/フォルダに格納する"
      - "必要なドキュメントは必ずdocumentフォルダに保存する"
      - "更新は同じファイルを編集する"
      - "冗長に少しだけ名前を変えたファイルを増やさない"
      - "MCPサーバー設定は必ずSETUP.mdに記載"
    
    consistency:
      - "ドキュメント間の整合性を確認する"
      - "実装を変更したらそれに合わせてドキュメントも更新すること"
      - "APIドキュメントの自動生成"
      - "MCPツールの使用例を必ず記載"

  deployment_requirements:
    environment:
      - "必ずURLが固定の本番環境にデプロイするようにする"
      - "フロントエンドとバックエンドの通信が必ず成功するようにデプロイ先のURLは指定する"
      - "CI/CDパイプラインの構築"
      - "MCPサーバーのヘルスチェック実装"
    
    process:
      - "作業が完了したらClaude環境でビルドしデプロイすること"
      - "READMEにフロントエンドのデプロイ先を記載する"
      - "本番環境でのヘルスチェック実装"
      - "MCPサーバーの可用性監視"

  mindset:
    philosophy:
      - "Ultrathink - 深く考え抜く"
      - "Don't hold back. Give it your all! - 全力で取り組む"
      - "継続的改善の実践"
      - "コードレビューの徹底"
      - "クロスプラットフォーム開発の追求"

  file_structure:
    logs: ".claude/logs/"
    documents: "documents/"
    source: "src/"
    tests: "tests/"
    config: "config/"
    deployment: "deploy/"
    mcp_scripts: "scripts/"

  execution_checklist:
    mandatory_declaration:
      - "[ ] **CORE_PRINCIPLES宣言**: 第1条〜第5条を完全に宣言"
      - "[ ] **関連セクション宣言**: 実行する作業に関連するセクションを宣言"
      - "[ ] 例：アーキテクチャ変更時は第3条・第4条 + architecture + quality_standards + implementation を宣言"
      - "[ ] 例：MCP実装時は第5条 + mcp_communication + security_standards を宣言"
    
    before_coding:
      - "[ ] AIコーディング原則を宣言"
      - "[ ] 要件の理解と確認"
      - "[ ] アーキテクチャ設計"
      - "[ ] セキュリティ要件の確認"
      - "[ ] MCPサーバー接続の確認"
    
    during_coding:
      - "[ ] SOLID原則の適用"
      - "[ ] DDD/CQRSパターンの実装"
      - "[ ] ハードコード回避"
      - "[ ] 適切なエラーハンドリング"
      - "[ ] MCPツールの適切な使用"
    
    after_coding:
      - "[ ] テスト実装・実行"
      - "[ ] セキュリティチェック"
      - "[ ] ドキュメント更新"
      - "[ ] デプロイ・動作確認"
      - "[ ] MCPサーバーとの統合テスト"
```

## MCPサーバーとのコミュニケーション方法

### 🔧 セットアップ手順

#### Windows VM側
1. **管理者権限でPowerShellを起動**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\windows-setup.ps1
   ```

2. **環境設定（.env）**
   ```env
   WINDOWS_VM_IP=192.168.64.3
   MCP_SERVER_PORT=8080
   MCP_AUTH_TOKEN=<32文字以上のランダム文字列>
   ALLOWED_IPS=192.168.64.2  # Mac側のIP
   ```

3. **サーバー起動**
   ```powershell
   cd C:\mcp-server
   npm start
   ```

#### Mac側（Claude Code）
1. **依存関係インストール**
   ```bash
   npm install
   cp .env.example .env
   # .envファイルを編集
   ```

2. **Claude Codeに追加**
   ```bash
   claude mcp add --user windows-build-server
   ```

### 📡 通信プロトコル

#### 利用可能なツール
```yaml
build_dotnet:
  description: ".NETアプリケーションのビルド"
  parameters:
    projectPath: "必須 - .csprojファイルのパス"
    configuration: "オプション - Debug/Release（デフォルト: Debug）"
  example: '@windows-build-server build_dotnet projectPath="C:\\projects\\app.csproj" configuration="Release"'

run_powershell:
  description: "セーフなPowerShellコマンドの実行"
  parameters:
    command: "必須 - 実行するコマンド"
  allowed_commands:
    - "Get-Process"
    - "Get-Service"
    - "Get-ChildItem"
    - "Get-Content"
    - "Test-Path"
  example: '@windows-build-server run_powershell command="Get-Process | Select-Object -First 5"'
```

### 🔒 セキュリティ実装

#### 必須セキュリティ設定
1. **認証トークン生成**
   ```bash
   openssl rand -hex 32
   ```

2. **HTTPS有効化（本番環境）**
   ```env
   ENABLE_HTTPS=true
   HTTPS_CERT_PATH=C:\certs\server.crt
   HTTPS_KEY_PATH=C:\certs\server.key
   ```

3. **IPホワイトリスト**
   ```env
   ALLOWED_IPS=192.168.1.100,192.168.1.101
   ```

### 🧪 動作確認

#### ヘルスチェック
```bash
curl http://<WINDOWS_VM_IP>:8080/health
```

#### ビルドテスト
```bash
./test-build.sh
```

### ⚠️ トラブルシューティング

#### 接続エラー
- Windows Firewall確認: `Get-NetFirewallRule -DisplayName "MCP Server"`
- ポート確認: `netstat -an | findstr :8080`

#### 認証エラー
- トークンの一致確認
- .envファイルの設定確認

#### ビルドエラー
- .NET SDKインストール確認: `dotnet --version`
- パスの正確性確認（バックスラッシュのエスケープ）

## 使用方法

### 🚨 必須実行手順

1. **CORE_PRINCIPLES完全宣言**: 
   ```
   【AIコーディング原則宣言】
   第1条: 常に思考開始前にこれらのAIコーディング原則を宣言してから実施する
   第2条: 常にプロの世界最高エンジニアとして対応する  
   第3条: モックや仮のコード、ハードコードを一切禁止する
   第4条: エンタープライズレベルの実装を実施し、修正は表面的ではなく、全体のアーキテクチャを意識して実施する
   第5条: MCPサーバーとの通信は必ずセキュアで信頼性の高い方法で実装する
   ```

2. **関連セクション宣言**: 実行する作業に応じて関連セクションも必ず宣言
   - **第3条関連作業時**: implementation + architecture + quality_standards を宣言
   - **第4条関連作業時**: architecture + quality_standards + deployment_requirements を宣言
   - **第5条関連作業時**: mcp_communication + security_standards + implementation を宣言
   - **全体設計時**: 全セクションを宣言

3. **実行例**:
   ```
   【関連セクション宣言】
   - implementation: ハードコード禁止、環境変数使用、依存性注入
   - architecture: SOLID原則、DDD/CQRS、エンタープライズレベル設計
   - quality_standards: セキュリティチェック、テスト実装
   - mcp_communication: セキュア通信、認証実装、エラーハンドリング
   ```

4. **チェックリスト活用**: mandatory_declaration → execution_checklistの順で確認
5. **品質保証**: quality_standardsに基づいて実装品質を担保
6. **継続的改善**: mindsetに基づいて常に最高品質を追求

## ⚠️ 重要な注意事項

### 🔴 絶対遵守ルール
- **CORE_PRINCIPLES必須宣言**: 作業開始時に第1条〜第5条を**必ず完全に宣言**
- **関連セクション必須宣言**: 実行する作業に関連するセクションを**必ず事前に宣言**
- **宣言なしでの作業開始は厳禁**: 宣言を省略・簡略化してはいけません
- **MCPサーバー使用時は第5条必須**: MCPサーバー関連作業時は第5条を必ず含める

### 📋 宣言パターン例
```yaml
# アーキテクチャ変更時の必須宣言
core_principles: [第3条, 第4条]
related_sections: [architecture, implementation, quality_standards]

# MCP実装時の必須宣言
core_principles: [第2条, 第5条]
related_sections: [mcp_communication, security_standards, implementation]

# セキュリティ実装時の必須宣言  
core_principles: [第1条, 第2条, 第4条, 第5条]
related_sections: [quality_standards.security, mcp_communication.security_requirements, deployment_requirements]

# テスト実装時の必須宣言
core_principles: [第2条, 第3条]
related_sections: [testing_standards, implementation, quality_standards]
```

### 🚫 禁止事項
- この原則は**必須遵守事項**です
- 宣言の省略・簡略化は**一切認められません**
- 例外的な対応が必要な場合は、事前に原則からの逸脱理由を明記してください
- 原則の更新時は、version番号とlast_updatedを必ず更新してください
- MCPサーバーの認証情報のハードコードは**絶対禁止**

### ✅ 品質保証
- 宣言なしの作業は**品質保証対象外**となります
- 関連セクション未宣言の作業は**不完全な実装**とみなされます
- MCPサーバー関連作業で第5条未宣言は**セキュリティリスク**とみなされます