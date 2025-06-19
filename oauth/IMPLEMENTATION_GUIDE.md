# OAuth_new 実装ガイド

## Claude Code用実装指示

### 即座に実装可能な改善（優先度：最高）

#### 1. エラーハンドリング強化

**ファイル**: `src/utils/errorHandler.js` (新規作成)
```javascript
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
  } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
    return 'ネットワーク接続を確認してください'
  } else if (error.message.includes('timeout')) {
    return 'タイムアウトしました。再試行してください'
  }
  return '予期しないエラーが発生しました'
}

export function logError(error, context) {
  console.error(`[ATProto Error] ${context}:`, {
    message: error.message,
    status: error.status,
    timestamp: new Date().toISOString()
  })
}
```

**修正**: `src/api/atproto.js`
```javascript
import { ATProtoError, logError } from '../utils/errorHandler.js'

async function request(url, options = {}) {
  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new ATProtoError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        { url, options }
      )
    }
    return await response.json()
  } catch (error) {
    if (error instanceof ATProtoError) {
      logError(error, 'API Request')
      throw error
    }
    
    // Network errors
    const atprotoError = new ATProtoError(
      'ネットワークエラーが発生しました',
      0,
      { url, originalError: error.message }
    )
    logError(atprotoError, 'Network Error')
    throw atprotoError
  }
}
```

**修正**: `src/hooks/useAdminData.js`
```javascript
import { getErrorMessage, logError } from '../utils/errorHandler.js'

// loadAdminData関数内のcatchブロック
} catch (err) {
  logError(err, 'useAdminData.loadAdminData')
  setError(getErrorMessage(err))
} finally {
  setLoading(false)
}
```

#### 2. シンプルなキャッシュシステム

**ファイル**: `src/utils/cache.js` (新規作成)
```javascript
class SimpleCache {
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

  clear() {
    this.cache.clear()
  }

  invalidatePattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

export const dataCache = new SimpleCache()
```

**修正**: `src/api/atproto.js`
```javascript
import { dataCache } from '../utils/cache.js'

export const collections = {
  async getBase(pds, repo, collection, limit = 10) {
    const cacheKey = `base:${pds}:${repo}:${collection}`
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getLang(pds, repo, collection, limit = 10) {
    const cacheKey = `lang:${pds}:${repo}:${collection}`
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.lang`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getComment(pds, repo, collection, limit = 10) {
    const cacheKey = `comment:${pds}:${repo}:${collection}`
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  // 投稿後にキャッシュをクリア
  invalidateCache(collection) {
    dataCache.invalidatePattern(collection)
  }
}
```

#### 3. ローディングスケルトン

**ファイル**: `src/components/LoadingSkeleton.jsx` (新規作成)
```javascript
import React from 'react'

export default function LoadingSkeleton({ count = 3 }) {
  return (
    <div className="loading-skeleton">
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-content">
            <div className="skeleton-line"></div>
            <div className="skeleton-line short"></div>
            <div className="skeleton-line shorter"></div>
          </div>
        </div>
      ))}
      
      <style jsx>{`
        .loading-skeleton {
          padding: 10px;
        }
        .skeleton-item {
          display: flex;
          padding: 15px;
          border: 1px solid #eee;
          margin: 10px 0;
          border-radius: 8px;
          background: #fafafa;
        }
        .skeleton-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          margin-right: 10px;
          flex-shrink: 0;
        }
        .skeleton-content {
          flex: 1;
        }
        .skeleton-line {
          height: 12px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          margin-bottom: 8px;
          border-radius: 4px;
        }
        .skeleton-line.short {
          width: 70%;
        }
        .skeleton-line.shorter {
          width: 40%;
        }
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
```

**修正**: `src/components/RecordTabs.jsx`
```javascript
import LoadingSkeleton from './LoadingSkeleton.jsx'

// RecordTabsコンポーネント内
{activeTab === 'lang' && (
  loading ? (
    <LoadingSkeleton count={3} />
  ) : (
    <RecordList 
      title={pageContext.isTopPage ? "Latest Lang Records" : "Lang Records for this page"}
      records={filteredLangRecords} 
      apiConfig={apiConfig} 
    />
  )
)}
```

### 中期実装（1週間以内）

#### 4. リトライ機能

**修正**: `src/api/atproto.js`
```javascript
async function requestWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await request(url, options)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      // 429 (レート制限) の場合は長めに待機
      const baseDelay = error.status === 429 ? 5000 : 1000
      const delay = Math.min(baseDelay * Math.pow(2, i), 30000)
      
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// 全てのAPI呼び出しでrequestをrequestWithRetryに変更
export const atproto = {
  async getDid(pds, handle) {
    const res = await requestWithRetry(`https://${pds}/xrpc/${ENDPOINTS.describeRepo}?repo=${handle}`)
    return res.did
  },
  // ...他のメソッドも同様に変更
}
```

#### 5. 段階的ローディング

**修正**: `src/hooks/useAdminData.js`
```javascript
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
    base: true,
    lang: true,
    comment: true
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    try {
      setError(null)
      
      // Phase 1: 管理者情報を最初に取得
      setLoadingStates(prev => ({ ...prev, admin: true }))
      const apiConfig = getApiConfig(`https://${env.pds}`)
      const did = await atproto.getDid(env.pds, env.admin)
      const profile = await atproto.getProfile(apiConfig.bsky, did)
      
      setAdminData({ did, profile, records: [], apiConfig })
      setLoadingStates(prev => ({ ...prev, admin: false }))

      // Phase 2: 基本レコードを取得
      setLoadingStates(prev => ({ ...prev, base: true }))
      const records = await collections.getBase(apiConfig.pds, did, env.collection)
      setAdminData(prev => ({ ...prev, records }))
      setLoadingStates(prev => ({ ...prev, base: false }))

      // Phase 3: lang/commentを並列取得
      const langPromise = collections.getLang(apiConfig.pds, did, env.collection)
        .then(data => {
          setLangRecords(data)
          setLoadingStates(prev => ({ ...prev, lang: false }))
        })
        .catch(err => {
          console.warn('Failed to load lang records:', err)
          setLoadingStates(prev => ({ ...prev, lang: false }))
        })

      const commentPromise = collections.getComment(apiConfig.pds, did, env.collection)
        .then(data => {
          setCommentRecords(data)
          setLoadingStates(prev => ({ ...prev, comment: false }))
        })
        .catch(err => {
          console.warn('Failed to load comment records:', err)
          setLoadingStates(prev => ({ ...prev, comment: false }))
        })

      await Promise.all([langPromise, commentPromise])

    } catch (err) {
      logError(err, 'useAdminData.loadAdminData')
      setError(getErrorMessage(err))
      // エラー時もローディング状態を解除
      setLoadingStates({
        admin: false,
        base: false,
        lang: false,
        comment: false
      })
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    loading: Object.values(loadingStates).some(Boolean),
    loadingStates,
    error,
    refresh: loadAdminData
  }
}
```

### 緊急時対応

#### フォールバック機能

**修正**: `src/hooks/useAdminData.js`
```javascript
// エラー時でも基本機能を維持
const loadWithFallback = async () => {
  try {
    await loadAdminData()
  } catch (err) {
    // フォールバック：最低限の表示を維持
    setAdminData({
      did: env.admin, // ハンドルをDIDとして使用
      profile: {
        handle: env.admin,
        displayName: env.admin,
        avatar: null
      },
      records: [],
      apiConfig: getApiConfig(`https://${env.pds}`)
    })
    setError('一部機能が利用できません。基本表示で継続します。')
  }
}
```

## 実装チェックリスト

### Phase 1 (即座実装)
- [ ] `src/utils/errorHandler.js` 作成
- [ ] `src/utils/cache.js` 作成  
- [ ] `src/components/LoadingSkeleton.jsx` 作成
- [ ] `src/api/atproto.js` エラーハンドリング追加
- [ ] `src/hooks/useAdminData.js` エラーハンドリング改善
- [ ] `src/components/RecordTabs.jsx` ローディング表示追加

### Phase 2 (1週間以内)
- [ ] `src/api/atproto.js` リトライ機能追加
- [ ] `src/hooks/useAdminData.js` 段階的ローディング実装
- [ ] キャッシュクリア機能の投稿フォーム統合

### テスト項目
- [ ] エラー状態でも最低限表示される
- [ ] キャッシュが適切に動作する
- [ ] ローディング表示が適切に出る
- [ ] リトライが正常に動作する

## パフォーマンス目標

- **初期表示**: 3秒 → 1秒
- **キャッシュヒット率**: 70%以上
- **エラー率**: 10% → 2%以下
- **ユーザー体験**: ローディング状態が常に可視化

この実装により、./oauthで発生している「同じ問題の繰り返し」を避け、
安定した成長可能なシステムが構築できます。