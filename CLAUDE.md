# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Claude.md - Windows MCP Build Server AIコーディング原則

```yaml
ai_coding_principles:
  meta:
    version: "2.0"
    last_updated: "2025-07-04"
    description: "Windows MCP Build Server専用AIコーディング実行原則"
    
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
      related_sections: ["implementation", "architecture", "quality_standards", "security_implementation"]
    第4条: 
      rule: "エンタープライズレベルの実装を実施し、修正は表面的ではなく、全体のアーキテクチャを意識して実施する"
      related_sections: ["architecture", "quality_standards", "deployment_requirements", "security_architecture"]
    第5条: 
      rule: "問題に詰まったら、まずCLAUDE.mdやプロジェクトドキュメント内に解決策がないか確認する"
    第6条: 
      rule: "push前にアップロードするべきではない情報が含まれていないか確認する。特に認証トークン、パスワード、内部IPアドレスに注意"

  project_specific_standards:
    mcp_protocol:
      - "MCPツール定義は`server/src/server.js`の`tools`配列に追加"
      - "新しいツールには必ずセキュリティ検証を実装"
      - "ツールのinputSchemaでパラメータ検証を厳密に定義"
    
    security_modes:
      normal_mode:
        - "デフォルトモード：厳格なコマンド検証とパス制限"
        - "`allowedCommands`配列にあるコマンドのみ実行可能"
      development_mode:
        - "`ENABLE_DEV_COMMANDS=true`で有効化"
        - "`devCommands`配列の追加コマンドを許可"
        - "パス制限は維持（`DEV_COMMAND_PATHS`）"
      dangerous_mode:
        - "`ENABLE_DANGEROUS_MODE=true`で有効化"
        - "全セキュリティ制限をバイパス（本番環境厳禁）"
        - "起動時に大きな警告表示が必須"

  quality_standards:
    security:
      - "GitHubへのプッシュ前に.envファイル、認証トークン、パスワードが含まれていないか確認"
      - "コマンドインジェクション対策：`shell: true`の使用禁止"
      - "すべての外部入力をセキュリティバリデーターで検証"
      - "`dangerousPatterns`配列の更新は慎重に"
    
    architecture:
      - "クライアント-サーバー分離アーキテクチャの維持"
      - "セキュリティレイヤーの多層防御（認証→IP制限→レート制限→コマンド検証）"
      - "ユーティリティモジュールの単一責任原則"
      - "エラーハンドリングは`helpers.js`の共通関数を使用"
    
    implementation:
      - "環境変数は`.env`ファイルで管理（ハードコード禁止）"
      - "新しい環境変数は`.env.example`にも追加"
      - "コマンドタイムアウトは`COMMAND_TIMEOUT`を使用"
      - "すべてのログは構造化ログ（logger.js）を使用"

  testing_standards:
    approach:
      - "新機能には必ずテストを追加（`tests/`ディレクトリ）"
      - "テストカバレッジ100%を目標（現在91%+）"
      - "セキュリティエッジケースのテストを重視"
    
    test_execution:
      - "`npm test` - 全テスト実行"
      - "`npm run test:coverage` - カバレッジレポート付き"
      - "`npm run test:watch` - 開発中の監視モード"

  documentation_management:
    structure:
      - "ログは`server/src/logs/`に自動保存（手動作成不要）"
      - "APIドキュメントはREADME.mdのMCPツールセクションに記載"
      - "セキュリティ関連の変更は必ずCHANGELOG.mdに記載"
      - "統合ドキュメントは`docs/`ディレクトリに格納"
    
    version_management:
      principle: "セマンティックバージョニング（MAJOR.MINOR.PATCH）に従う"
      update_rules:
        - "MAJOR: 破壊的変更（API変更、互換性なし）"
        - "MINOR: 新機能追加（後方互換性あり）"
        - "PATCH: バグ修正、セキュリティ修正"
      mandatory_updates:
        - "バージョン更新時は全package.json（root, server, client）を同時更新"
        - "README.mdのバージョン番号を更新"
        - "CHANGELOG.mdに変更内容を詳細記載"
        - "サーバー起動時にバージョンが表示される"
      version_history:
        - "v1.0.5: run_batchツール環境変数化とセキュリティ強化"
        - "v1.0.4: run_batchツール危険モード対応"
        - "v1.0.3: run_batchツール基本実装"
        - "v1.0.2: アップデートスクリプト修正"
        - "v1.0.1: 開発モード追加"

  deployment_requirements:
    windows_vm:
      - "C:\\mcp-serverディレクトリで動作"
      - "ビルド出力は`C:\\build\\<project-name>\\release\\`に固定"
      - "管理者権限でPowerShellスクリプトを実行"
    
    update_process:
      - "`npm run update` - GitHubから最新版を取得"
      - ".envと認証トークンは自動的に保持される"
      - "バックアップが自動作成される"

  security_implementation:
    command_validation:
      file: "server/src/utils/security.js"
      key_arrays:
        - "allowedCommands[] - 通常モードで許可されるコマンド"
        - "devCommands[] - 開発モードで追加許可されるコマンド"
        - "dangerousPatterns[] - 常にブロックされるパターン（危険モード除く）"
    
    authentication_flow:
      - "Bearer token認証（MCP_AUTH_TOKEN）"
      - "トークンは32文字のランダム文字列"
      - "本番環境では必須設定"
    
    logging_strategy:
      - "アクセスログ：`access.log`"
      - "エラーログ：`error.log`"
      - "セキュリティイベント：`security.log`"
      - "アプリケーションログ：`app.log`"

  mindset:
    philosophy:
      - "セキュリティファースト - すべての実装でセキュリティを最優先"
      - "ゼロトラスト - すべての入力を検証"
      - "防御的プログラミング - 想定外の入力に対する堅牢性"
      - "監査証跡 - すべての操作をログに記録"

  common_commands:
    development:
      - "npm run install:all - 全依存関係インストール"
      - "npm test - テスト実行"
      - "npm run test:coverage - カバレッジ確認"
    
    server_operations:
      - "npm start - 通常モード起動"
      - "npm run dev - 開発モード（詳細ログ）"
      - "npm run dangerous - 危険モード（制限なし）"
      - "npm run update - GitHub更新"

  key_files:
    server:
      - "server/src/server.js - MCPサーバー実装、ツール定義"
      - "server/src/utils/security.js - コマンド検証、セキュリティパターン"
      - "server/src/utils/rate-limiter.js - レート制限実装"
      - "server/src/utils/logger.js - 構造化ログ、ローテーション"
    
    client:
      - "client/src/mcp-client.js - MCPクライアントラッパー"

  execution_checklist:
    mandatory_declaration:
      - "[ ] **CORE_PRINCIPLES宣言**: 第1条〜第4条を完全に宣言"
      - "[ ] **関連セクション宣言**: 実行する作業に関連するセクションを宣言"
      - "[ ] 例：セキュリティ変更時は第3条・第4条 + security_implementation + security_modes を宣言"
    
    before_coding:
      - "[ ] AIコーディング原則を宣言"
      - "[ ] 既存のセキュリティ実装を確認"
      - "[ ] 影響範囲の特定（クライアント/サーバー）"
      - "[ ] テスト計画の立案"
    
    during_coding:
      - "[ ] セキュリティバリデーションの実装"
      - "[ ] 環境変数の使用（ハードコード回避）"
      - "[ ] 構造化ログの実装"
      - "[ ] エラーハンドリング"
    
    after_coding:
      - "[ ] テスト実装・実行（カバレッジ確認）"
      - "[ ] セキュリティレビュー"
      - "[ ] バージョン更新（必要時）"
      - "[ ] ドキュメント更新"
```

## 使用方法

### 🚨 必須実行手順

1. **CORE_PRINCIPLES完全宣言**: 
   ```
   【AIコーディング原則宣言】
   第1条: 常に思考開始前にこれらのAIコーディング原則を宣言してから実施する
   第2条: 常にプロの世界最高エンジニアとして対応する  
   第3条: モックや仮のコード、ハードコードを一切禁止する
   第4条: エンタープライズレベルの実装を実施し、修正は表面的ではなく、全体のアーキテクチャを意識して実施する
   ```

2. **関連セクション宣言**: 実行する作業に応じて関連セクションも必ず宣言
   - **セキュリティ変更時**: security_implementation + security_modes + quality_standards.security
   - **新ツール追加時**: project_specific_standards.mcp_protocol + security_implementation
   - **テスト実装時**: testing_standards + execution_checklist

## Windows MCP特有の注意事項

### セキュリティモードの理解
- **通常モード**: プロダクション環境用。厳格なセキュリティ
- **開発モード**: 開発用コマンドを追加許可。パス制限は維持
- **危険モード**: 全制限解除。本番環境では絶対に使用しない

### コマンド追加時の手順
1. セキュリティモードを決定（通常/開発）
2. `security.js`の適切な配列に追加
3. 危険なパターンでないか確認
4. テストケースを追加
5. README.mdのコマンド一覧を更新

### 環境変数の追加
1. `.env.example`に追加（デフォルト値付き）
2. README.mdの環境変数一覧を更新
3. `validateEnvironment()`関数で検証追加（必要時）
4. アップデートスクリプト（update-from-git.ps1）に新変数を追加

### run_batchツールの設定
- `ALLOWED_BATCH_DIRS`: バッチファイル実行を許可するディレクトリ（セミコロン区切り）
- デフォルト: `C:\builds\;C:\builds\AIServer\;C:\Users\Public\;C:\temp\`
- パス検証は大文字小文字を区別しない
- .batと.cmdファイルのみ実行可能

### テスト作成のポイント
- セキュリティエッジケースを必ずテスト
- モックは適切に設定（実際の動作を模倣）
- カバレッジ100%を目指す
- 統合テストでMCPプロトコル全体をテスト

## トラブルシューティング

### "Invalid authorization token" エラー
- サーバーとクライアントの`MCP_AUTH_TOKEN`が一致しているか確認
- トークンの前後に空白や引用符がないか確認
- セットアップスクリプトを再実行

### コマンドが許可されない
- 開発モードが必要か確認：`ENABLE_DEV_COMMANDS=true`
- `security.js`の許可リストを確認
- パスが`ALLOWED_BUILD_PATHS`内か確認

### レート制限エラー
- デフォルト：60リクエスト/分
- `RATE_LIMIT_REQUESTS`で調整
- 開発時は0に設定可能（非推奨）