# PDFコンバーターアプリケーション対応 - 要求分析書

## 📋 改善要求情報

### 基本情報
- **要求者**: PDFコンバーター開発チーム
- **日付**: 2025-07-04
- **優先度**: High（Phase 1は緊急）
- **影響範囲**: Server（execute_powershell機能の拡張）

### 要求内容
#### 🎯 目的・背景
- StandardTaxPdfConverter.UI.exe（185MB）のテスト実行
- 画像からPDFへの変換処理（3-5分必要）
- 現在2分でタイムアウトし、処理が完了できない
- CI/CD環境での自動テスト実現

#### 🔧 具体的な要求（優先順位順）

1. **タイムアウト延長**（Phase 1 - 緊急）
   - 現在: 120秒（2分）
   - 要求: 600秒（10分）
   - 理由: PDF生成処理に3-5分必要

2. **プロセス管理機能**（Phase 1 - 緊急）
   - Stop-Processコマンドの許可
   - または代替プロセス終了手段
   - セッション終了時の自動クリーンアップ

3. **実行状況確認API**（Phase 2）
   - 非同期実行モード
   - 実行IDによる状態確認
   - リアルタイム進捗表示

4. **日本語文字対応**（Phase 2）
   - UTF-8エンコーディング完全対応
   - Base64エンコード経由の実行サポート
   - JSONエスケープエラーの解消

## 🔧 実装計画

### Phase 1: 緊急対応（1週間以内）

#### 1.1 タイムアウト延長実装

**実装方針A**: 既存APIの拡張（推奨）
```javascript
// server.js: execute_powershellの拡張
case 'execute_powershell':
  try {
    const command = security.validatePowerShellCommand(args.command);
    
    // 新規: タイムアウトパラメータ対応
    const timeout = args.timeout ? 
      Math.min(parseInt(args.timeout) * 1000, 1800000) : // 最大30分
      getNumericEnv('COMMAND_TIMEOUT', 300000); // デフォルト5分
    
    const result = await executePowerShell(command, clientIP, remoteHost, timeout);
```

**環境変数追加**:
```env
# PDF処理用の長時間実行設定
PDF_PROCESSING_TIMEOUT=600000  # 10分
MAX_ALLOWED_TIMEOUT=1800000    # 30分（絶対上限）
```

#### 1.2 プロセス管理機能

**Stop-Process許可**:
```javascript
// security.js
this.allowedCommands = [
  // 既存コマンド...
  'stop-process',      // プロセス終了（条件付き）
  'get-process',       // 既存
  'wait-process',      // プロセス待機
];

// プロセス管理検証関数
validateProcessManagement(processName, action) {
  // セッションIDベースの管理
  // 自身が起動したプロセスのみ操作可能
}
```

### Phase 2: 重要機能（2週間以内）

#### 2.1 非同期実行API

**新ツール実装**: `execute_async`
```javascript
{
  name: 'execute_async',
  description: 'Execute long-running commands asynchronously',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      type: { type: 'string', enum: ['powershell', 'cmd'] },
      timeout: { type: 'number', minimum: 1, maximum: 1800 },
      sessionId: { type: 'string' }
    },
    required: ['command', 'type']
  }
}
```

**ステータス確認ツール**: `check_execution`
```javascript
{
  name: 'check_execution',
  description: 'Check status of async execution',
  inputSchema: {
    type: 'object',
    properties: {
      executionId: { type: 'string' },
      includeOutput: { type: 'boolean' }
    },
    required: ['executionId']
  }
}
```

#### 2.2 日本語文字対応

**実装方針**:
1. UTF-8 BOM付きエンコーディング対応
2. Base64エンコード経由の実行
3. PowerShell `-EncodedCommand` パラメータ活用

```javascript
// 日本語パス対応
function encodeJapaneseCommand(command) {
  // UTF-16LE + Base64（PowerShell標準）
  const utf16le = Buffer.from(command, 'utf16le');
  const base64 = utf16le.toString('base64');
  return `powershell -EncodedCommand ${base64}`;
}
```

## 🔒 セキュリティ設計

### セッションベース管理
```javascript
class ProcessSessionManager {
  constructor() {
    this.sessions = new Map();
    this.processLimit = 5; // セッションあたり最大5プロセス
  }
  
  registerProcess(sessionId, processId, command) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    
    const session = this.sessions.get(sessionId);
    if (session.size >= this.processLimit) {
      throw new Error('Process limit exceeded for session');
    }
    
    session.add({
      processId,
      command,
      startTime: Date.now(),
      maxLifetime: 1800000 // 30分
    });
  }
  
  canManageProcess(sessionId, processId) {
    const session = this.sessions.get(sessionId);
    return session && Array.from(session).some(p => p.processId === processId);
  }
}
```

### 実行ファイルホワイトリスト
```javascript
const ALLOWED_EXECUTABLES = [
  'StandardTaxPdfConverter.UI.exe',
  // 他の許可された実行ファイル
];

const ALLOWED_EXECUTABLE_PATHS = [
  'C:\\builds\\',
  'C:\\test-apps\\',
];
```

## 📊 テスト計画

### Phase 1テストケース

1. **タイムアウトテスト**
   - 5分実行のコマンド成功確認
   - 30分超過時の拒否確認
   - タイムアウト時のプロセス自動終了

2. **プロセス管理テスト**
   - Stop-Processの動作確認
   - セッション分離の検証
   - プロセス数上限の確認

### Phase 2テストケース

3. **非同期実行テスト**
   - 実行ID発行と状態確認
   - 複数並行実行
   - 進捗レポート精度

4. **日本語対応テスト**
   - 日本語パス実行確認
   - 各種エンコーディング対応
   - エラーメッセージの可読性

## 🚀 実装スケジュール

### Week 1（Phase 1）
- Day 1-2: テストケース作成（TDD）
- Day 3-4: タイムアウト延長実装
- Day 4-5: プロセス管理実装
- Day 6-7: 統合テスト・デプロイ

### Week 2-3（Phase 2）
- Day 8-10: 非同期実行API
- Day 11-12: 日本語対応
- Day 13-14: 総合テスト・ドキュメント更新

## 📈 期待される効果

### 定量的効果
- テスト実行成功率: 40% → 95%
- 開発サイクル時間: 80%短縮
- 手動介入必要性: 90%削減

### 定性的効果
- CI/CD環境の完全自動化実現
- エンタープライズ品質の担保
- 開発者体験の大幅改善

## 🤝 次のステップ

1. この分析に基づくフィードバック収集
2. Phase 1の詳細設計レビュー
3. テスト環境での事前検証
4. 段階的なロールアウト計画