# MCP サーバー改善要求テンプレート

## 📋 改善要求情報

### 基本情報
- **要求者**: [ユーザー名]
- **日付**: [YYYY-MM-DD]
- **優先度**: [High/Medium/Low]
- **影響範囲**: [Server/Client/Both/Documentation]

### 要求内容
#### 🎯 目的・背景
```
なぜこの改善が必要か？
現在何が不便なのか？
どのような効果を期待しているか？
```

#### 🔧 具体的な要求
```
どのような機能・改善を求めているか？
具体的な動作・挙動の説明
```

#### 📝 使用例・シナリオ
```bash
# 期待する使用方法の例
@windows-build-server [tool_name] [parameters]
```

### 技術要件
- **セキュリティレベル**: [Normal/Development/Dangerous]
- **互換性要件**: [既存機能との互換性]
- **パフォーマンス要求**: [応答時間・リソース使用量]

### 実装方針提案
#### アーキテクチャ影響
- [ ] server.js の変更が必要
- [ ] security.js の更新が必要
- [ ] 新しいユーティリティ関数が必要
- [ ] テストケースの追加が必要
- [ ] ドキュメント更新が必要

#### セキュリティ考慮事項
```
新機能のセキュリティリスク評価
必要な検証・制限事項
```

---

## 🔄 実装プロセス（AIコーディング原則準拠）

### Phase 1: 分析・設計
- [ ] **CLAUDE.md原則宣言**: 第1-4条 + 関連セクション
- [ ] **要求分析**: 機能要件・非機能要件の明確化
- [ ] **セキュリティ設計**: 多層防御の維持
- [ ] **テスト計画**: TDDアプローチの設計

### Phase 2: 実装
- [ ] **テスト先行作成**: comprehensive test cases
- [ ] **セキュリティ実装**: validation functions
- [ ] **機能実装**: core functionality
- [ ] **統合テスト**: MCP protocol compatibility

### Phase 3: 検証・デプロイ
- [ ] **カバレッジ確認**: 100%目標
- [ ] **セキュリティレビュー**: エッジケース検証
- [ ] **パフォーマンステスト**: 応答時間・リソース使用量
- [ ] **セルフデプロイ**: mcp_self_build による更新

### Phase 4: ドキュメント・通知
- [ ] **README.md更新**: 新機能説明
- [ ] **CHANGELOG.md追加**: 詳細な変更履歴
- [ ] **使用例作成**: practical examples
- [ ] **ユーザー通知**: 改善完了の報告

---

## 📊 評価基準

### 実装品質
- [ ] **エンタープライズレベル**: 表面的でない根本的な実装
- [ ] **セキュリティファースト**: 全入力の検証
- [ ] **ゼロトラスト**: 想定外入力への堅牢性
- [ ] **監査証跡**: 全操作のログ記録

### コード品質
- [ ] **モック・ハードコード禁止**: 動的設定・環境変数使用
- [ ] **アーキテクチャ整合性**: 既存パターンとの一貫性
- [ ] **エラーハンドリング**: 詳細な提案付きエラーメッセージ
- [ ] **テストカバレッジ**: 新機能100%カバレッジ

### ユーザビリティ
- [ ] **直感的な操作**: 既存ツールとの一貫性
- [ ] **詳細なヘルプ**: 使用例・エラー対処法
- [ ] **段階的学習**: 基本→応用の学習パス
- [ ] **後方互換性**: 既存ワークフローへの影響最小化

---

## 🤝 コミュニケーション

### 進捗報告
- **開始時**: 実装方針・スケジュールの共有
- **中間報告**: 技術的課題・設計変更の相談
- **完了時**: 機能説明・使用方法のレクチャー

### フィードバック収集
- **ベータテスト**: 限定的な先行公開
- **使用感調査**: 実際の業務での使用評価
- **継続改善**: フィードバックに基づく機能強化

---

## 🏷️ テンプレート使用例

```markdown
## 📋 改善要求情報

### 基本情報
- **要求者**: エンジニアチーム
- **日付**: 2025-07-04
- **優先度**: High
- **影響範囲**: Server

### 要求内容
#### 🎯 目的・背景
CI/CDパイプラインでローカルサーバーへのテスト接続が必要。
現在localhost接続が制限されているため自動テストが実行できない。

#### 🔧 具体的な要求
localhost:8090-8099への接続を許可する機能

#### 📝 使用例・シナリオ
```bash
# ローカルサーバーテスト
@windows-build-server ping_host host="127.0.0.1"
```

### 技術要件
- **セキュリティレベル**: Normal
- **互換性要件**: 既存IP制限機能との共存
- **パフォーマンス要求**: 既存と同等の応答時間

[実装プロセス続く...]
```