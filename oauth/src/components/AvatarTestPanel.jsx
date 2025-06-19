import React, { useState } from 'react'
import AvatarImage from './AvatarImage.jsx'
import { getValidAvatar, clearAvatarCache, getAvatarCacheStats } from '../utils/avatarFetcher.js'

export default function AvatarTestPanel() {
  const [testHandle, setTestHandle] = useState('ai.syui.ai')
  const [testResult, setTestResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cacheStats, setCacheStats] = useState(null)

  // ダミーレコードを作成（実際の投稿したレコード形式）
  const createTestRecord = (handle, brokenAvatar = false) => ({
    value: {
      author: {
        did: null, // DIDはnullにして、handleから取得させる
        handle: handle,
        displayName: "Test User",
        avatar: brokenAvatar ? "https://broken.example.com/avatar.jpg" : null
      },
      text: "テストコメント",
      createdAt: new Date().toISOString()
    }
  })

  const testAvatarFetch = async (useBrokenAvatar = false) => {
    setLoading(true)
    setTestResult(null)

    try {
      const testRecord = createTestRecord(testHandle, useBrokenAvatar)
      const avatarUrl = await getValidAvatar(testRecord)
      
      setTestResult({
        success: true,
        avatarUrl,
        handle: testHandle,
        brokenTest: useBrokenAvatar,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      setTestResult({
        success: false,
        error: error.message,
        handle: testHandle,
        brokenTest: useBrokenAvatar
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClearCache = () => {
    clearAvatarCache()
    setCacheStats(null)
    alert('Avatar cache cleared!')
  }

  const handleShowCacheStats = () => {
    const stats = getAvatarCacheStats()
    setCacheStats(stats)
  }

  return (
    <div className="test-ui">
      <h2>🖼️ Avatar Test Panel</h2>
      <p className="description">
        Avatar取得システムのテスト。投稿済みのdummy recordを使用してavatar取得処理を確認できます。
      </p>

      <div className="form-group">
        <label htmlFor="test-handle">Test Handle:</label>
        <input
          id="test-handle"
          type="text"
          value={testHandle}
          onChange={(e) => setTestHandle(e.target.value)}
          placeholder="ai.syui.ai"
          disabled={loading}
        />
      </div>

      <div className="form-actions">
        <button
          onClick={() => testAvatarFetch(false)}
          disabled={loading || !testHandle.trim()}
          className="btn btn-primary"
        >
          {loading ? '⏳ Testing...' : '🔄 Test Avatar Fetch'}
        </button>

        <button
          onClick={() => testAvatarFetch(true)}
          disabled={loading || !testHandle.trim()}
          className="btn btn-outline"
        >
          {loading ? '⏳ Testing...' : '💥 Test Broken Avatar'}
        </button>

        <button
          onClick={handleClearCache}
          disabled={loading}
          className="btn btn-danger btn-sm"
        >
          🗑️ Clear Cache
        </button>

        <button
          onClick={handleShowCacheStats}
          disabled={loading}
          className="btn btn-outline btn-sm"
        >
          📊 Cache Stats
        </button>
      </div>

      {testResult && (
        <div className="test-result">
          <h3>Test Result:</h3>
          {testResult.success ? (
            <div className="success-message">
              ✅ Avatar fetched successfully!
              <div className="result-details">
                <p><strong>Handle:</strong> {testResult.handle}</p>
                <p><strong>Broken Test:</strong> {testResult.brokenTest ? 'Yes' : 'No'}</p>
                <p><strong>Avatar URL:</strong> {testResult.avatarUrl || 'None'}</p>
                <p><strong>Timestamp:</strong> {testResult.timestamp}</p>
                
                {testResult.avatarUrl && (
                  <div className="avatar-preview">
                    <p><strong>Preview:</strong></p>
                    <img 
                      src={testResult.avatarUrl} 
                      alt="Avatar preview" 
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #ddd'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="error-message">
              ❌ Test failed: {testResult.error}
            </div>
          )}
        </div>
      )}

      {cacheStats && (
        <div className="cache-stats">
          <h3>Cache Statistics:</h3>
          <p><strong>Entries:</strong> {cacheStats.size}</p>
          {cacheStats.entries.length > 0 && (
            <div className="cache-entries">
              <h4>Cached Avatars:</h4>
              {cacheStats.entries.map((entry, i) => (
                <div key={i} className="cache-entry">
                  <p><strong>Key:</strong> {entry.key}</p>
                  <p><strong>Age:</strong> {Math.floor(entry.age / 1000)}s</p>
                  <p><strong>Profile:</strong> {entry.profile?.displayName} (@{entry.profile?.handle})</p>
                  {entry.avatar && (
                    <img 
                      src={entry.avatar} 
                      alt="Cached avatar" 
                      style={{ width: 30, height: 30, borderRadius: '50%' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="live-demo">
        <h3>Live Avatar Component Demo:</h3>
        <p>実際のAvatarImageコンポーネントの動作確認:</p>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px' }}>
          <AvatarImage record={createTestRecord(testHandle, false)} size={40} />
          <span>Normal avatar test</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px' }}>
          <AvatarImage record={createTestRecord(testHandle, true)} size={40} />
          <span>Broken avatar test (should fetch fresh)</span>
        </div>
      </div>

      <style jsx>{`
        .test-result {
          margin-top: 20px;
          padding: 16px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #f9f9f9;
        }
        .result-details {
          margin-top: 12px;
          font-size: 14px;
        }
        .result-details p {
          margin: 4px 0;
        }
        .avatar-preview {
          margin-top: 12px;
          padding: 12px;
          border: 1px solid #eee;
          border-radius: 4px;
          background: white;
        }
        .cache-stats {
          margin-top: 20px;
          padding: 16px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #f0f8ff;
        }
        .cache-entries {
          margin-top: 12px;
        }
        .cache-entry {
          padding: 8px;
          margin: 8px 0;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          font-size: 12px;
        }
        .cache-entry p {
          margin: 2px 0;
        }
        .live-demo {
          margin-top: 20px;
          padding: 16px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #f8f9fa;
        }
      `}</style>
    </div>
  )
}