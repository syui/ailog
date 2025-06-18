# 環境変数による機能切り替え

## 概要

開発用機能（TestUI、デバッグログ）をenv変数で簡単に有効/無効化できるようになりました。

## 設定ファイル

### 開発環境用: `.env`
```bash
# Development/Debug features
VITE_ENABLE_TEST_UI=true
VITE_ENABLE_DEBUG=true
```

### 本番環境用: `.env.production`
```bash
# Production settings - Disable development features  
VITE_ENABLE_TEST_UI=false
VITE_ENABLE_DEBUG=false
```

## 制御される機能

### 1. TestUI コンポーネント
- **制御**: `VITE_ENABLE_TEST_UI`
- **true**: TestボタンとTestUI表示
- **false**: TestUI関連が完全に非表示

### 2. デバッグログ
- **制御**: `VITE_ENABLE_DEBUG`
- **true**: console.log等が有効
- **false**: すべてのlogが無効化

## 使い方

### 開発時
```bash
# .envで有効化されているので通常通り
npm run dev
npm run build
```

### 本番デプロイ時
```bash
# 自動的に .env.production が読み込まれる
npm run build

# または明示的に指定
NODE_ENV=production npm run build
```

### 手動切り替え
```bash
# 一時的にTestUIだけ無効化
VITE_ENABLE_TEST_UI=false npm run dev

# 一時的にデバッグだけ無効化
VITE_ENABLE_DEBUG=false npm run dev
```

## 実装詳細

### App.jsx
```jsx
// Environment-based feature flags
const ENABLE_TEST_UI = import.meta.env.VITE_ENABLE_TEST_UI === 'true'
const ENABLE_DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true'

// TestUI表示制御
{ENABLE_TEST_UI && showTestUI && (
  <div className="test-section">
    <TestUI />
  </div>
)}

// Testボタン表示制御
{ENABLE_TEST_UI && (
  <div className="bottom-actions">
    <button onClick={() => setShowTestUI(!showTestUI)}>
      {showTestUI ? 'close test' : 'test'}
    </button>
  </div>
)}
```

### logger.js
```jsx
class Logger {
  constructor() {
    this.isDev = import.meta.env.DEV || false
    this.debugEnabled = import.meta.env.VITE_ENABLE_DEBUG === 'true'
    this.isEnabled = this.isDev && this.debugEnabled
  }
}
```

## メリット

✅ **コード削除不要**: 機能を残したまま本番で無効化
✅ **簡単切り替え**: env変数だけで制御
✅ **自動化対応**: CI/CDで環境別自動ビルド可能
✅ **デバッグ容易**: 必要時に即座に有効化可能

## 本番デプロイチェックリスト

- [ ] `.env.production`でTestUI無効化確認
- [ ] `.env.production`でデバッグ無効化確認  
- [ ] 本番ビルドでTestボタン非表示確認
- [ ] 本番でconsole.log出力なし確認