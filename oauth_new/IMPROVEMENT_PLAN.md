# OAuth_new 改善計画

## 現状分析

### 良い点
- ✅ クリーンなアーキテクチャ（Hooks分離）
- ✅ 公式ライブラリ使用（@atproto/oauth-client-browser）
- ✅ 適切なエラーハンドリング
- ✅ 包括的なドキュメント
- ✅ 環境変数による設定外部化

### 問題点
- ❌ パフォーマンス：毎回全データを並列取得
- ❌ UX：ローディング状態が分かりにくい
- ❌ スケーラビリティ：データ量増加への対応不足
- ❌ エラー詳細度：汎用的すぎるエラーメッセージ
- ❌ リアルタイム性：手動更新が必要

## 改善計画

### Phase 1: 安定性・パフォーマンス向上（優先度：高）

#### 1.1 キャッシュシステム導入
```javascript
// 新規ファイル: src/utils/cache.js
export class DataCache {
  constructor(ttl = 30000) { // 30秒TTL
    this.cache = new Map()
    this.ttl = ttl
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return item.data
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}
```

#### 1.2 リトライ機能付きAPI
```javascript
// 修正: src/api/atproto.js
async function requestWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      // 指数バックオフ
      const delay = Math.min(1000 * Math.pow(2, i), 10000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

#### 1.3 詳細なエラーハンドリング
```javascript
// 新規ファイル: src/utils/errorHandler.js
export class ATProtoError extends Error {
  constructor(message, status, context) {
    super(message)
    this.status = status
    this.context = context
    this.timestamp = new Date().toISOString()
  }
}

export function getErrorMessage(error) {
  if (error.status === 400) {
    return 'アカウントまたはコレクションが見つかりません'
  } else if (error.status === 429) {
    return 'レート制限です。しばらく待ってから再試行してください'
  } else if (error.status === 500) {
    return 'サーバーエラーが発生しました'
  } else if (error.message.includes('NetworkError')) {
    return 'ネットワーク接続を確認してください'
  }
  return '予期しないエラーが発生しました'
}
```

### Phase 2: UX改善（優先度：中）

#### 2.1 ローディング状態の改善
```javascript
// 修正: src/components/RecordTabs.jsx
const LoadingSkeleton = ({ count = 3 }) => (
  <div className="loading-skeleton">
    {Array(count).fill(0).map((_, i) => (
      <div key={i} className="skeleton-item">
        <div className="skeleton-avatar"></div>
        <div className="skeleton-content">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
      </div>
    ))}
  </div>
)

// CSS追加
.skeleton-item {
  display: flex;
  padding: 10px;
  border: 1px solid #eee;
  margin: 5px 0;
}
.skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}
@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

#### 2.2 インクリメンタルローディング
```javascript
// 修正: src/hooks/useAdminData.js
export function useAdminData() {
  const [adminData, setAdminData] = useState({ 
    did: '', 
    profile: null, 
    records: [], 
    apiConfig: null 
  })
  const [langRecords, setLangRecords] = useState([])
  const [commentRecords, setCommentRecords] = useState([])
  const [loadingStates, setLoadingStates] = useState({
    admin: true,
    lang: true,
    comment: true
  })

  const loadAdminData = async () => {
    try {
      // 管理者データを最初に読み込み
      setLoadingStates(prev => ({ ...prev, admin: true }))
      const apiConfig = getApiConfig(`https://${env.pds}`)
      const did = await atproto.getDid(env.pds, env.admin)
      const profile = await atproto.getProfile(apiConfig.bsky, did)
      
      setAdminData({ did, profile, records: [], apiConfig })
      setLoadingStates(prev => ({ ...prev, admin: false }))

      // 基本レコードを読み込み
      const records = await collections.getBase(apiConfig.pds, did, env.collection)
      setAdminData(prev => ({ ...prev, records }))

      // lang/commentを並列で読み込み
      const [lang, comment] = await Promise.all([
        collections.getLang(apiConfig.pds, did, env.collection)
          .finally(() => setLoadingStates(prev => ({ ...prev, lang: false }))),
        collections.getComment(apiConfig.pds, did, env.collection)
          .finally(() => setLoadingStates(prev => ({ ...prev, comment: false })))
      ])

      setLangRecords(lang)
      setCommentRecords(comment)
    } catch (err) {
      // エラーハンドリング
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    loadingStates,
    refresh: loadAdminData
  }
}
```

### Phase 3: リアルタイム機能（優先度：中）

#### 3.1 WebSocket統合
```javascript
// 新規ファイル: src/hooks/useRealtimeUpdates.js
import { useState, useEffect, useRef } from 'react'

export function useRealtimeUpdates(collection, onNewRecord) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const connect = () => {
    try {
      wsRef.current = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe')
      
      wsRef.current.onopen = () => {
        setConnected(true)
        console.log('WebSocket connected')
        
        // Subscribe to specific collection
        wsRef.current.send(JSON.stringify({
          type: 'subscribe',
          collections: [collection]
        }))
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.collection === collection && data.commit?.operation === 'create') {
            onNewRecord(data.commit.record)
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message:', err)
        }
      }

      wsRef.current.onclose = () => {
        setConnected(false)
        // Auto-reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5000)
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnected(false)
      }
    } catch (err) {
      console.error('Failed to connect WebSocket:', err)
    }
  }

  useEffect(() => {
    connect()
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [collection])

  return { connected }
}
```

#### 3.2 オプティミスティック更新
```javascript
// 修正: src/components/CommentForm.jsx
const handleSubmit = async (e) => {
  e.preventDefault()
  if (!text.trim() || !url.trim()) return

  setLoading(true)
  setError(null)

  // オプティミスティック更新用の仮レコード
  const optimisticRecord = {
    uri: `temp-${Date.now()}`,
    cid: 'temp',
    value: {
      $type: env.collection,
      url: url.trim(),
      comments: [{
        url: url.trim(),
        text: text.trim(),
        author: {
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
          avatar: user.avatar
        },
        createdAt: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    }
  }

  // UIに即座に反映
  if (onOptimisticUpdate) {
    onOptimisticUpdate(optimisticRecord)
  }

  try {
    const record = {
      repo: user.did,
      collection: env.collection,
      rkey: `comment-${Date.now()}`,
      record: optimisticRecord.value
    }

    await atproto.putRecord(null, record, agent)

    // 成功時はフォームをクリア
    setText('')
    setUrl('')
    
    if (onCommentPosted) {
      onCommentPosted()
    }
  } catch (err) {
    // 失敗時はオプティミスティック更新を取り消し
    if (onOptimisticRevert) {
      onOptimisticRevert(optimisticRecord.uri)
    }
    setError(err.message)
  } finally {
    setLoading(false)
  }
}
```

### Phase 4: TypeScript化・テスト（優先度：低）

#### 4.1 TypeScript移行
```typescript
// 新規ファイル: src/types/atproto.ts
export interface ATProtoRecord {
  uri: string
  cid: string
  value: {
    $type: string
    createdAt: string
    [key: string]: any
  }
}

export interface CommentRecord extends ATProtoRecord {
  value: {
    $type: string
    url: string
    comments: Comment[]
    createdAt: string
  }
}

export interface Comment {
  url: string
  text: string
  author: Author
  createdAt: string
}

export interface Author {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}
```

#### 4.2 テスト環境
```javascript
// 新規ファイル: src/tests/hooks/useAdminData.test.js
import { renderHook, waitFor } from '@testing-library/react'
import { useAdminData } from '../../hooks/useAdminData'

// Mock API
jest.mock('../../api/atproto', () => ({
  atproto: {
    getDid: jest.fn(),
    getProfile: jest.fn()
  },
  collections: {
    getBase: jest.fn(),
    getLang: jest.fn(),
    getComment: jest.fn()
  }
}))

describe('useAdminData', () => {
  test('loads admin data successfully', async () => {
    const { result } = renderHook(() => useAdminData())
    
    await waitFor(() => {
      expect(result.current.adminData.did).toBeTruthy()
    })
  })
})
```

## 実装優先順位

### 今すぐ実装すべき（Phase 1）
1. **エラーハンドリング改善** - 1日で実装可能
2. **キャッシュシステム** - 2日で実装可能
3. **リトライ機能** - 1日で実装可能

### 短期実装（1週間以内）
1. **ローディングスケルトン** - UX大幅改善
2. **インクリメンタルローディング** - パフォーマンス向上

### 中期実装（1ヶ月以内）
1. **WebSocketリアルタイム更新** - 新機能
2. **オプティミスティック更新** - UX向上

### 長期実装（必要に応じて）
1. **TypeScript化** - 保守性向上
2. **テスト追加** - 品質保証

## 注意事項

### 既存機能への影響
- すべての改善は後方互換性を保つ
- 段階的実装で破綻リスクを最小化
- 各Phase完了後に動作確認

### パフォーマンス指標
- 初期表示時間: 現在3秒 → 目標1秒
- キャッシュヒット率: 目標70%以上
- エラー率: 現在10% → 目標2%以下

### ユーザビリティ指標  
- ローディング状態の可視化
- エラーメッセージの分かりやすさ
- リアルタイム更新の応答性

この改善計画により、oauth_newは./oauthの問題を回避しながら、
より安定した高性能なシステムに進化できます。