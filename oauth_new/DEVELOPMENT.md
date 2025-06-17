# 開発ガイド

## 設計思想

このプロジェクトは以下の原則に基づいて設計されています：

### 1. 環境変数による設定の外部化
- ハードコードを避け、設定は全て環境変数で管理
- `src/config/env.js` で一元管理

### 2. PDS（Personal Data Server）の自動判定
- `VITE_HANDLE_LIST` と `VITE_PDS` による自動判定
- syu.is系とbsky.social系の自動振り分け

### 3. コンポーネントの責任分離
- Hooks: ビジネスロジック
- Components: UI表示のみ
- Services: 外部API連携
- Utils: 純粋関数

## アーキテクチャ詳細

### データフロー

```
User Input
    ↓
Hooks (useAuth, useAdminData, usePageContext)
    ↓
Services (OAuthService)
    ↓
API (atproto.js)
    ↓
ATProto Network
    ↓
Components (UI Display)
```

### 状態管理

React Hooksによる状態管理：
- `useAuth`: OAuth認証状態
- `useAdminData`: 管理者データ（プロフィール、レコード）
- `usePageContext`: ページ判定（トップ/個別）

### OAuth認証フロー

```
1. ユーザーがハンドル入力
2. PDS判定 (syu.is vs bsky.social)
3. 適切なOAuthClientを選択
4. 標準OAuth画面にリダイレクト
5. 認証完了後コールバック処理
6. セッション復元・保存
```

## 重要な実装詳細

### セッション管理

`@atproto/oauth-client-browser`が自動的に以下を処理：
- IndexedDBへのセッション保存
- トークンの自動更新
- DPoP（Demonstration of Proof of Possession）

**注意**: 手動でのセッション管理は複雑なため、公式ライブラリを使用すること。

### PDS判定アルゴリズム

```javascript
// src/utils/pds.js
function isSyuIsHandle(handle) {
  return env.handleList.includes(handle) || handle.endsWith(`.${env.pds}`)
}
```

1. `VITE_HANDLE_LIST` に含まれるハンドル → syu.is
2. `.syu.is` で終わるハンドル → syu.is  
3. その他 → bsky.social

### レコードフィルタリング

```javascript
// src/components/RecordTabs.jsx
const filterRecords = (records) => {
  if (pageContext.isTopPage) {
    return records.slice(0, 3) // 最新3件
  } else {
    // URL のrkey と record.value.post.url のrkey を照合
    return records.filter(record => {
      const recordRkey = new URL(record.value.post.url).pathname.split('/').pop()?.replace(/\.html$/, '')
      return recordRkey === pageContext.rkey
    })
  }
}
```

## 開発時の注意点

### 1. 環境変数の命名

- `VITE_` プレフィックス必須（Viteの制約）
- JSON形式の環境変数は文字列として定義

```bash
# ❌ 間違い
VITE_HANDLE_LIST=["ai.syui.ai"]

# ✅ 正しい  
VITE_HANDLE_LIST=["ai.syui.ai", "syui.syui.ai"]
```

### 2. API エラーハンドリング

```javascript
// src/api/atproto.js
async function request(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.json()
}
```

すべてのAPI呼び出しでエラーハンドリングを実装。

### 3. コンポーネント設計

```javascript
// ❌ Bad: ビジネスロジックがコンポーネント内
function MyComponent() {
  const [data, setData] = useState([])
  useEffect(() => {
    fetch('/api/data').then(setData)
  }, [])
  return <div>{data.map(...)}</div>
}

// ✅ Good: Hooksでロジック分離
function MyComponent() {
  const { data, loading, error } = useMyData()
  if (loading) return <Loading />
  if (error) return <Error />
  return <div>{data.map(...)}</div>
}
```

## デバッグ手法

### 1. OAuth デバッグ

```javascript
// ブラウザの開発者ツールで確認
localStorage.clear()          // セッションクリア
sessionStorage.clear()        // 一時データクリア

// IndexedDB確認（Application タブ）
// ATProtoの認証データが保存される
```

### 2. PDS判定デバッグ

```javascript
// src/utils/pds.js にログ追加
console.log('Handle:', handle)
console.log('Is syu.is:', isSyuIsHandle(handle))
console.log('API Config:', getApiConfig(pds))
```

### 3. レコードフィルタリングデバッグ

```javascript
// src/components/RecordTabs.jsx
console.log('Page Context:', pageContext)
console.log('All Records:', records.length)
console.log('Filtered Records:', filteredRecords.length)
```

## パフォーマンス最適化

### 1. 並列データ取得

```javascript
// src/hooks/useAdminData.js
const [records, lang, comment] = await Promise.all([
  collections.getBase(apiConfig.pds, did, env.collection),
  collections.getLang(apiConfig.pds, did, env.collection),
  collections.getComment(apiConfig.pds, did, env.collection)
])
```

### 2. 不要な再レンダリング防止

```javascript
// useMemo でフィルタリング結果をキャッシュ
const filteredRecords = useMemo(() => 
  filterRecords(records), 
  [records, pageContext]
)
```

## テスト戦略

### 1. 単体テスト推奨対象

- `src/utils/pds.js` - PDS判定ロジック
- `src/config/env.js` - 環境変数パース
- フィルタリング関数

### 2. 統合テスト推奨対象

- OAuth認証フロー
- API呼び出し
- レコード表示

## デプロイメント

### 1. 必要ファイル

```
public/
└── client-metadata.json    # OAuth設定ファイル

dist/                       # ビルド出力
├── index.html
└── assets/
    ├── comment-atproto-[hash].js
    └── comment-atproto-[hash].css
```

### 2. デプロイ手順

```bash
# 1. 環境変数設定
cp .env.example .env
# 2. 本番用設定を記入
# 3. ビルド
npm run build
# 4. dist/ フォルダをデプロイ
```

### 3. 本番環境チェックリスト

- [ ] `.env` ファイルの本番設定
- [ ] `client-metadata.json` の設置
- [ ] HTTPS 必須（OAuth要件）
- [ ] CSP（Content Security Policy）設定

## よくある問題と解決法

### 1. "OAuth initialization failed"

**原因**: client-metadata.json が見つからない、または形式が正しくない

**解決法**: 
```bash
# public/client-metadata.json の存在確認
ls -la public/client-metadata.json

# 形式確認（JSON validation）
jq . public/client-metadata.json
```

### 2. "Failed to load admin data"

**原因**: 管理者アカウントのDID解決に失敗

**解決法**:
```bash
# 手動でDID解決確認
curl "https://syu.is/xrpc/com.atproto.repo.describeRepo?repo=ai.syui.ai"
```

### 3. レコードが表示されない

**原因**: コレクション名の不一致、権限不足

**解決法**:
```bash
# コレクション確認
curl "https://syu.is/xrpc/com.atproto.repo.listRecords?repo=did:plc:xxx&collection=ai.syui.log.chat.lang"
```

## 機能拡張ガイド

### 1. 新しいコレクション追加

```javascript
// src/api/atproto.js に追加
export const collections = {
  // 既存...
  async getNewCollection(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, `${collection}.new`, limit)
  }
}
```

### 2. 新しいPDS対応

```javascript
// src/utils/pds.js を拡張
export function getApiConfig(pds) {
  if (pds.includes('syu.is')) {
    // 既存の syu.is 設定
  } else if (pds.includes('newpds.com')) {
    return {
      pds: `https://newpds.com`,
      bsky: `https://bsky.newpds.com`,
      plc: `https://plc.newpds.com`,
      web: `https://web.newpds.com`
    }
  }
  // デフォルト設定
}
```

### 3. リアルタイム更新追加

```javascript
// src/hooks/useRealtimeUpdates.js
export function useRealtimeUpdates(collection) {
  useEffect(() => {
    const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe')
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.collection === collection) {
        // 新しいレコードを追加
      }
    }
    return () => ws.close()
  }, [collection])
}
```