# Phase 1: 即座実装可能な修正

## 1. エラーハンドリング強化（30分で実装）

### ファイル作成: `src/utils/errorHandler.js`
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
  if (!error) return '不明なエラー'
  
  if (error.status === 400) {
    return 'アカウントまたはレコードが見つかりません'
  } else if (error.status === 401) {
    return '認証が必要です。ログインしてください'
  } else if (error.status === 403) {
    return 'アクセス権限がありません'
  } else if (error.status === 429) {
    return 'アクセスが集中しています。しばらく待ってから再試行してください'
  } else if (error.status === 500) {
    return 'サーバーでエラーが発生しました'
  } else if (error.message?.includes('fetch')) {
    return 'ネットワーク接続を確認してください'
  } else if (error.message?.includes('timeout')) {
    return 'タイムアウトしました。再試行してください'
  }
  
  return `エラーが発生しました: ${error.message || '不明'}`
}

export function logError(error, context = 'Unknown') {
  const errorInfo = {
    context,
    message: error.message,
    status: error.status,
    timestamp: new Date().toISOString(),
    url: window.location.href
  }
  
  console.error(`[ATProto Error] ${context}:`, errorInfo)
  
  // 本番環境では外部ログサービスに送信することも可能
  // if (import.meta.env.PROD) {
  //   sendToLogService(errorInfo)
  // }
}
```

### 修正: `src/api/atproto.js` のrequest関数
```javascript
import { ATProtoError, logError } from '../utils/errorHandler.js'

async function request(url, options = {}) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒タイムアウト
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new ATProtoError(
        `Request failed: ${response.statusText}`,
        response.status,
        { url, method: options.method || 'GET' }
      )
    }
    
    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new ATProtoError(
        'リクエストがタイムアウトしました',
        408,
        { url }
      )
      logError(timeoutError, 'Request Timeout')
      throw timeoutError
    }
    
    if (error instanceof ATProtoError) {
      logError(error, 'API Request')
      throw error
    }
    
    // ネットワークエラーなど
    const networkError = new ATProtoError(
      'ネットワークエラーが発生しました',
      0,
      { url, originalError: error.message }
    )
    logError(networkError, 'Network Error')
    throw networkError
  }
}
```

### 修正: `src/hooks/useAdminData.js`
```javascript
import { getErrorMessage, logError } from '../utils/errorHandler.js'

export function useAdminData() {
  // 既存のstate...
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  const loadAdminData = async () => {
    try {
      setLoading(true)
      setError(null)

      const apiConfig = getApiConfig(`https://${env.pds}`)
      const did = await atproto.getDid(env.pds, env.admin)
      const profile = await atproto.getProfile(apiConfig.bsky, did)
      
      // Load all data in parallel
      const [records, lang, comment] = await Promise.all([
        collections.getBase(apiConfig.pds, did, env.collection),
        collections.getLang(apiConfig.pds, did, env.collection),
        collections.getComment(apiConfig.pds, did, env.collection)
      ])

      setAdminData({ did, profile, records, apiConfig })
      setLangRecords(lang)
      setCommentRecords(comment)
      setRetryCount(0) // 成功時はリトライカウントをリセット
    } catch (err) {
      logError(err, 'useAdminData.loadAdminData')
      setError(getErrorMessage(err))
      
      // 自動リトライ（最大3回）
      if (retryCount < 3) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          loadAdminData()
        }, Math.pow(2, retryCount) * 1000) // 1s, 2s, 4s
      }
    } finally {
      setLoading(false)
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    loading,
    error,
    retryCount,
    refresh: loadAdminData
  }
}
```

## 2. シンプルキャッシュ（15分で実装）

### ファイル作成: `src/utils/cache.js`
```javascript
class SimpleCache {
  constructor(ttl = 30000) { // 30秒TTL
    this.cache = new Map()
    this.ttl = ttl
  }

  generateKey(...parts) {
    return parts.filter(Boolean).join(':')
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    
    console.log(`Cache hit: ${key}`)
    return item.data
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
    console.log(`Cache set: ${key}`)
  }

  clear() {
    this.cache.clear()
    console.log('Cache cleared')
  }

  invalidatePattern(pattern) {
    let deletedCount = 0
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        deletedCount++
      }
    }
    console.log(`Cache invalidated: ${pattern} (${deletedCount} items)`)
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

export const dataCache = new SimpleCache()

// デバッグ用：グローバルからアクセス可能にする
if (import.meta.env.DEV) {
  window.dataCache = dataCache
}
```

### 修正: `src/api/atproto.js` のcollections
```javascript
import { dataCache } from '../utils/cache.js'

export const collections = {
  async getBase(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('base', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getLang(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('lang', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.lang`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getComment(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('comment', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getChat(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('chat', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getUserList(pds, repo, collection, limit = 100) {
    const cacheKey = dataCache.generateKey('userlist', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.user`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getUserComments(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('usercomments', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  // 投稿後にキャッシュを無効化
  invalidateCache(collection) {
    dataCache.invalidatePattern(collection)
  }
}
```

### 修正: `src/components/CommentForm.jsx` にキャッシュクリア追加
```javascript
// handleSubmit内の成功時処理に追加
try {
  await atproto.putRecord(null, record, agent)

  // キャッシュを無効化
  collections.invalidateCache(env.collection)

  // Clear form
  setText('')
  setUrl('')

  // Notify parent component
  if (onCommentPosted) {
    onCommentPosted()
  }
} catch (err) {
  setError(err.message)
}
```

## 3. ローディング改善（20分で実装）

### ファイル作成: `src/components/LoadingSkeleton.jsx`
```javascript
import React from 'react'

export default function LoadingSkeleton({ count = 3, showTitle = false }) {
  return (
    <div className="loading-skeleton">
      {showTitle && (
        <div className="skeleton-title">
          <div className="skeleton-line title"></div>
        </div>
      )}
      
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-content">
            <div className="skeleton-line name"></div>
            <div className="skeleton-line text"></div>
            <div className="skeleton-line text short"></div>
            <div className="skeleton-line meta"></div>
          </div>
        </div>
      ))}
      
      <style jsx>{`
        .loading-skeleton {
          padding: 10px;
        }
        
        .skeleton-title {
          margin-bottom: 20px;
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
          animation: skeleton-loading 1.5s infinite;
          margin-right: 12px;
          flex-shrink: 0;
        }
        
        .skeleton-content {
          flex: 1;
          min-width: 0;
        }
        
        .skeleton-line {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          margin-bottom: 8px;
          border-radius: 4px;
        }
        
        .skeleton-line.title {
          height: 20px;
          width: 30%;
        }
        
        .skeleton-line.name {
          height: 14px;
          width: 25%;
        }
        
        .skeleton-line.text {
          height: 12px;
          width: 90%;
        }
        
        .skeleton-line.text.short {
          width: 60%;
        }
        
        .skeleton-line.meta {
          height: 10px;
          width: 40%;
          margin-bottom: 0;
        }
        
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
```

### 修正: `src/components/RecordTabs.jsx`
```javascript
import LoadingSkeleton from './LoadingSkeleton.jsx'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, apiConfig, pageContext }) {
  const [activeTab, setActiveTab] = useState('lang')

  // ... 既存のロジック

  return (
    <div className="record-tabs">
      <div className="tab-header">
        <button 
          className={`tab-btn ${activeTab === 'lang' ? 'active' : ''}`}
          onClick={() => setActiveTab('lang')}
        >
          Lang Records ({filteredLangRecords?.length || 0})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comment' ? 'active' : ''}`}
          onClick={() => setActiveTab('comment')}
        >
          Comment Records ({filteredCommentRecords?.length || 0})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'collection' ? 'active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          Collection ({filteredChatRecords?.length || 0})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Comments ({filteredUserComments?.length || 0})
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'lang' && (
          !langRecords ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title={pageContext.isTopPage ? "Latest Lang Records" : "Lang Records for this page"}
              records={filteredLangRecords} 
              apiConfig={apiConfig} 
            />
          )
        )}
        
        {activeTab === 'comment' && (
          !commentRecords ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title={pageContext.isTopPage ? "Latest Comment Records" : "Comment Records for this page"}
              records={filteredCommentRecords} 
              apiConfig={apiConfig} 
            />
          )
        )}
        
        {activeTab === 'collection' && (
          !chatRecords ? (
            <LoadingSkeleton count={2} showTitle={true} />
          ) : (
            <RecordList 
              title={pageContext.isTopPage ? "Latest Collection Records" : "Collection Records for this page"}
              records={filteredChatRecords} 
              apiConfig={apiConfig} 
            />
          )
        )}
        
        {activeTab === 'users' && (
          !userComments ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title={pageContext.isTopPage ? "Latest User Comments" : "User Comments for this page"}
              records={filteredUserComments} 
              apiConfig={apiConfig} 
            />
          )
        )}
      </div>

      {/* 既存のstyle... */}
    </div>
  )
}
```

### 修正: `src/App.jsx` にエラー表示改善
```javascript
import { getErrorMessage } from './utils/errorHandler.js'

export default function App() {
  const { user, agent, loading: authLoading, login, logout } = useAuth()
  const { adminData, langRecords, commentRecords, loading: dataLoading, error, retryCount, refresh: refreshAdminData } = useAdminData()
  const { userComments, chatRecords, loading: userLoading, refresh: refreshUserData } = useUserData(adminData)
  const pageContext = usePageContext()

  // ... 既存のロジック

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>ATProto OAuth Demo</h1>
        <div style={{ 
          background: '#fee', 
          color: '#c33', 
          padding: '15px', 
          borderRadius: '5px',
          margin: '20px 0',
          border: '1px solid #fcc'
        }}>
          <p><strong>エラー:</strong> {error}</p>
          {retryCount > 0 && (
            <p><small>自動リトライ中... ({retryCount}/3)</small></p>
          )}
        </div>
        <button 
          onClick={refreshAdminData}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          再読み込み
        </button>
      </div>
    )
  }

  // ... 既存のレンダリング
}
```

## 実装チェックリスト

### ✅ Phase 1A: エラーハンドリング（30分）
- [ ] `src/utils/errorHandler.js` 作成
- [ ] `src/api/atproto.js` の `request` 関数修正
- [ ] `src/hooks/useAdminData.js` エラーハンドリング追加
- [ ] `src/App.jsx` エラー表示改善

### ✅ Phase 1B: キャッシュ（15分）
- [ ] `src/utils/cache.js` 作成
- [ ] `src/api/atproto.js` の `collections` にキャッシュ追加
- [ ] `src/components/CommentForm.jsx` にキャッシュクリア追加

### ✅ Phase 1C: ローディングUI（20分）
- [ ] `src/components/LoadingSkeleton.jsx` 作成
- [ ] `src/components/RecordTabs.jsx` にローディング表示追加

### テスト
- [ ] エラー状態でも適切にメッセージが表示される
- [ ] キャッシュがコンソールログで確認できる
- [ ] ローディング中にスケルトンが表示される
- [ ] 投稿後にキャッシュがクリアされる

**実装時間目安**: 65分（エラーハンドリング30分 + キャッシュ15分 + ローディング20分）

これらの修正により、oauth_newは./oauthで頻発している問題を回避し、
より安定したユーザー体験を提供できます。