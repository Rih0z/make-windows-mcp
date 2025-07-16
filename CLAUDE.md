# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Claude.md - Windows MCP Build Server AIコーディング原則

```yaml
ai_coding_principles:
  meta:
    version: "2.1"
    last_updated: "2025-07-14"
    description: "Windows MCP Build Server専用AIコーディング実行原則"
    current_version: "v1.0.33"
    current_status: "PRODUCTION_READY_PYTHON_VENV_SUPPORT"
    
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
    第7条:
      rule: "リモートアップデート機能はmcp_self_buildツールのupdateアクションを使用し、危険モードでのみ実行可能"
      related_sections: ["project_specific_standards.mcp_protocol", "security_implementation", "update_process"]
    第8条:
      rule: "バージョン更新時は必ず複数のpackage.json（root, server, client）とサーバー起動時のバージョン表示部分を同時に更新する"
      related_sections: ["version_management", "deployment_requirements"]
    第9条:
      rule: "アップデートは必ずupdate-from-git.ps1（npm run update）を使用する。個別の緊急修正スクリプトは作成しない"
      related_sections: ["deployment_requirements", "update_process"]
    第10条:
      rule: "作業完了したら必ずGitHubにpushする。コミットだけでなく、必ずgit pushを実行して変更をリモートリポジトリに反映させる"
      related_sections: ["version_management", "execution_checklist"]
    第11条:
      rule: "機能追加やバグ修正などコードを変更したら必ずバージョン情報を更新する。package.json（root, server, client）とCHANGELOG.mdを更新する"
      related_sections: ["version_management", "documentation_management", "execution_checklist"]
    第12条:
      rule: "不要なスクリプトは増やさない。スクリプト作成時は常に既存のスクリプトで使用可能なものがないか以下のセクションを確認する、スクリプトを作成したらscriptsフォルダに格納する。"
      related_sections: ["how_to_use_scripts"]
    第13条:
      rule: "MCP接続成功時にすべての機能の使い方をクライアントに伝え、新機能追加時も即座に更新する。動的ヘルプシステムで常に最新の機能案内を提供する"
      related_sections: ["dynamic_help_system", "user_experience", "mcp_protocol"]
    第14条:
      rule: "一時報告書やメッセージファイルはdocs/messages/フォルダに保存し、使用終了後は削除する"
      related_sections: ["documentation_management", "execution_checklist"]

  project_specific_standards:
    mcp_protocol:
      - "MCPツール定義は`server/src/server.js`の`tools`配列に追加"
      - "新しいツールには必ずセキュリティ検証を実装"
      - "ツールのinputSchemaでパラメータ検証を厳密に定義"
      
    remote_update_functionality:
      - "リモートアップデートは`mcp_self_build`ツールの`update`アクションで実行"
      - "危険モード（`ENABLE_DANGEROUS_MODE=true`）でのみ利用可能"
      - "GitHubリポジトリから最新版を自動取得・適用"
      - "既存の環境設定（.env）は自動的に保持される"
      - "autoStartオプションで更新後の自動再起動が可能"
      - "実行コマンド: `@windows-build-server mcp_self_build action=\"update\" options='{\"autoStart\": true}'`"
    
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
        - "レート制限完全無効化（v1.0.6）"
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
      - "テストカバレッジ86.51%達成（2025-07-04時点）"
      - "セキュリティエッジケースのテストを重視"
      - "実機テスト実施済み（基本5ツール動作確認、新3ツールはデプロイ待ち）"
    
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
      - "一時報告書は`docs/messages/`に保存し、使用終了後は削除する"
    
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
        - "v1.0.33: Python仮想環境サポート - エンタープライズPython開発対応"
        - "v1.0.32: CRITICAL P0回帰バグ修正 - PowerShell実行完全復旧"
        - "v1.0.31: バグレポート緊急対応 - タイムアウト・エンコード・テスト強化"
        - "v1.0.30: AIServer Enterprise v2.0 Critical Fixes - JSON・UTF-8・ストリーミング"
        - "v1.0.29: 動的ヘルプシステム実装 - MCP第13条対応"
        - "v1.0.28: エンタープライズ認証システム強化"
        - "v1.0.27: PDF Base64エンコードツール実装"
        - "v1.0.26: スマートサーバー発見システム"
        - "v1.0.25: スマートポート管理システム"
        - "v1.0.5-24: 各種ツール・セキュリティ強化履歴"

  deployment_requirements:
    windows_vm:
      - "C:\\mcp-serverディレクトリで動作"
      - "ビルド出力は`C:\\build\\<project-name>\\release\\`に固定"
      - "管理者権限でPowerShellスクリプトを実行"
    
    update_process:
      - "`npm run update` - GitHubから最新版を取得（ローカル実行）"
      - "リモート更新: `@windows-build-server mcp_self_build action=\"update\" options='{\"autoStart\": true}'`"
      - ".envと認証トークンは自動的に保持される"
      - "危険モードでのみリモート更新が可能"
      - "バックアップが自動作成される"
      - "個別の緊急修正スクリプトは作成・使用しない"
      - "すべてのバグ修正はGitHubにプッシュしてから`npm run update`で適用"

  current_status_v1033:
    critical_features_added:
      - "Python仮想環境: 自動作成・管理・パッケージインストール"
      - "テスト実行: pytest等のテストフレームワーク完全サポート"
      - "環境変数拡張: すべてのハードコード値を設定可能に"
      - "クロスプラットフォーム: Windows/macOS/Linux仮想環境対応"
      - "自動検出: requirements.txt等の依存関係ファイル自動認識"
    
    enhanced_capabilities:
      - "build_python: 完全な仮想環境ワークフロー実装"
      - "設定管理: タイムアウト・ポート・パスの柔軟な設定"
      - "ヘルプシステム: Python仮想環境の使用例追加"
      - "後方互換性: 既存の設定を維持しながら機能拡張"
    
    production_readiness:
      - "エンタープライズPython開発: CI/CDワークフロー完全対応"
      - "AIServer Enterprise v2.0: Python環境での完全動作確認"
      - "テスト自動化: 隔離環境でのテスト実行サポート"
      - "開発効率: 仮想環境の自動管理による生産性向上"

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
      - "npm run build:all - 全コンポーネントビルド"
      - "npm test - テスト実行"
      - "npm run test:coverage - カバレッジ確認"
    
    server_operations:
      - "npm start - 通常モード起動"
      - "npm run dev - 開発モード（詳細ログ）"
      - "npm run dangerous - 危険モード（制限なし）"
      - "npm run update - GitHub更新"

  key_files:
    server:
      - "server/src/server.js - MCPサーバー実装、8つのツール定義（v1.0.6で3つ追加）"
      - "server/src/utils/security.js - コマンド検証、セキュリティパターン"
      - "server/src/utils/rate-limiter.js - レート制限実装（危険モードで無効化）"
      - "server/src/utils/logger.js - 構造化ログ、ローテーション"
      - "server/src/utils/helpers.js - 共通ユーティリティ関数"
      - "server/src/utils/crypto.js - 暗号化・復号化（100%カバレッジ）"
    
    client:
      - "client/src/mcp-client.js - MCPクライアントラッパー"
    
    new_tools_v106:
      - "mcp_self_build - MCPサーバー自己管理（ビルド・テスト・更新）"
      - "process_manager - Windowsプロセス・サービス管理"
      - "file_sync - 大容量ファイル同期（robocopy統合）"

  how_to_use_scripts:
    existing_scripts:
      server_setup:
        - "server/setup/windows-setup.ps1 - Windows環境初期セットアップ"
        - "server/setup/update-from-git.ps1 - GitHubから最新版取得・更新（npm run update）"
        - "server/setup/auto-restart-server.ps1 - サーバー自動再起動"
        - "server/setup/update-server.ps1 - ローカル環境サーバー更新（npm run update-local）"
        - "server/setup/encrypt-password.js - パスワード暗号化ユーティリティ"
      client_setup:
        - "client/setup/production-setup.js - 本番環境設定生成"
      project_scripts:
        - "scripts/clean-env.ps1 - 環境変数クリーンアップ"
        - "scripts/install-all.sh - 全パッケージインストール（macOS/Linux用）"
        - "scripts/update-server.sh - サーバー更新スクリプト（macOS/Linux用）"
    script_creation_rules:
      - "既存スクリプトで対応可能か必ず確認"
      - "update-from-git.ps1で解決できる問題は新規スクリプト作成禁止"
      - "新規作成時は適切なディレクトリに配置："
      - "  - サーバー関連: server/setup/"
      - "  - クライアント関連: client/setup/"
      - "  - プロジェクト全体: scripts/"
      - "  - テスト関連: tests/helpers/"
      - "一時的な修正スクリプトは作成しない（GitHubへプッシュして正式更新）"

  execution_checklist:
    mandatory_declaration:
      - "[ ] **CORE_PRINCIPLES宣言**: 第1条〜第12条を完全に宣言"
      - "[ ] **関連セクション宣言**: 実行する作業に関連するセクションを宣言"
      - "[ ] 例：セキュリティ変更時は第3条・第4条 + security_implementation + security_modes を宣言"
    
    before_coding:
      - "[ ] AIコーディング原則を宣言（第1条〜第12条）"
      - "[ ] 既存のセキュリティ実装を確認"
      - "[ ] 影響範囲の特定（クライアント/サーバー）"
      - "[ ] テスト計画の立案"
      - "[ ] リモートアップデート機能使用時は第7条の確認"
      - "[ ] スクリプト作成前に第12条とhow_to_use_scriptsセクションを確認"
    
    during_coding:
      - "[ ] セキュリティバリデーションの実装"
      - "[ ] 環境変数の使用（ハードコード回避）"
      - "[ ] 構造化ログの実装"
      - "[ ] エラーハンドリング"
    
    after_coding:
      - "[ ] テスト実装・実行（カバレッジ確認）"
      - "[ ] セキュリティレビュー"
      - "[ ] **バージョン更新（第11条）- package.jsonとCHANGELOG.md**"
      - "[ ] ドキュメント更新"
      - "[ ] **GitHubへのpush実行（第10条）**"
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
   第5条: 問題に詰まったら、まずCLAUDE.mdやプロジェクトドキュメント内に解決策がないか確認する
   第6条: push前にアップロードするべきではない情報が含まれていないか確認する
   第7条: バージョン更新時は必ず複数のpackage.jsonを同時に更新する
   第8条: アップデートは必ずupdate-from-git.ps1（npm run update）を使用する。個別の緊急修正スクリプトは作成しない
   第9条: 作業完了したら必ずGitHubにpushする。コミットだけでなく、必ずgit pushを実行する
   第10条: 作業完了したら必ずGitHubにpushする
   第11条: コードを変更したら必ずバージョン情報を更新する
   第12条: 不要なスクリプトは増やさない。既存スクリプトで対応可能か確認する
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

## 動的ヘルプシステム（Dynamic Help System）

### 概要
MCP接続成功時とtools/list実行時に、利用可能なすべての機能とその使用例を自動的にクライアントに提供するシステム。

### 機能要件
- **接続時ウェルカムメッセージ**: 全機能概要と基本的な使用方法
- **詳細ヘルプAPI**: `/help/tools` - 全ツールの詳細説明と使用例
- **カテゴリ別ヘルプ**: `/help/category/{category}` - カテゴリごとの機能説明
- **新機能通知**: 新しいツール追加時の自動案内メッセージ

### 実装箇所
- `server/src/server.js`: ヘルプエンドポイントとウェルカムメッセージ
- `server/src/utils/help-generator.js`: 動的ヘルプコンテンツ生成
- MCP initialize レスポンスに機能概要を含める

### ヘルプカテゴリ
- **build**: .NET, Java, Python, Node.js, Go, Rust, C++, Docker等のビルドツール
- **system**: PowerShell実行、バッチファイル実行、プロセス管理
- **files**: ファイル同期、Base64エンコード、ファイル操作
- **network**: SSH接続、リモートホスト操作、ping
- **management**: サーバー管理、認証、設定検証
- **auth**: 認証状態確認、デバッグ、セッション管理

### 使用例フォーマット
各ツールに対して：
- 基本的な使用例
- よく使われるオプション
- エラー処理例
- 関連ツールとの組み合わせ

### 新機能追加時の更新
1. ツール追加時に自動的にヘルプコンテンツを生成
2. カテゴリ分類の自動判定
3. 使用例テンプレートの自動生成
4. バージョン情報との連携