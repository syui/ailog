import React, { useState } from 'react'
import { env } from '../config/env.js'
import AvatarTestPanel from './AvatarTestPanel.jsx'
import AvatarTest from './AvatarTest.jsx'

export default function TestUI() {
  const [activeTab, setActiveTab] = useState('putRecord')
  const [accessJwt, setAccessJwt] = useState('')
  const [handle, setHandle] = useState('')
  const [sessionDid, setSessionDid] = useState('')
  const [collection, setCollection] = useState('ai.syui.log')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showJson, setShowJson] = useState(false)
  const [lastRecord, setLastRecord] = useState(null)

  const collections = [
    'ai.syui.log',
    'ai.syui.log.chat',
    'ai.syui.log.chat.lang',
    'ai.syui.log.chat.comment'
  ]

  const generateDummyData = (collectionType) => {
    const timestamp = new Date().toISOString()
    const url = 'https://syui.ai/test/dummy'
    
    const basePost = {
      url: url,
      date: timestamp,
      slug: 'dummy-test',
      tags: ['test', 'dummy'],
      title: 'Test Post',
      language: 'ja'
    }

    const baseAuthor = {
      did: sessionDid || null, // Use real session DID if available, otherwise null
      handle: handle || 'test.user',
      displayName: 'Test User',
      avatar: null
    }

    switch (collectionType) {
      case 'ai.syui.log':
        return {
          $type: collectionType,
          url: url,
          post: basePost,
          text: 'テストコメントです。これはダミーデータです。',
          type: 'comment',
          author: baseAuthor,
          createdAt: timestamp
        }

      case 'ai.syui.log.chat':
        const isQuestion = Math.random() > 0.5
        return {
          $type: collectionType,
          post: basePost,
          text: isQuestion ? 'これはテスト用の質問です。' : 'これはテスト用のAI回答です。詳しく説明します。',
          type: isQuestion ? 'question' : 'answer',
          author: isQuestion ? baseAuthor : {
            did: 'did:plc:ai-test',
            handle: 'ai.syui.ai',
            displayName: 'ai',
            avatar: null
          },
          createdAt: timestamp
        }

      case 'ai.syui.log.chat.lang':
        return {
          $type: collectionType,
          post: basePost,
          text: 'This is a test translation. Hello, this is a dummy English translation of the Japanese post.',
          type: 'en',
          author: {
            did: 'did:plc:ai-test',
            handle: 'ai.syui.ai',
            displayName: 'ai',
            avatar: null
          },
          createdAt: timestamp
        }

      case 'ai.syui.log.chat.comment':
        return {
          $type: collectionType,
          post: basePost,
          text: 'これはAIによるテストコメントです。記事についての感想や補足情報を提供します。',
          author: {
            did: 'did:plc:ai-test',
            handle: 'ai.syui.ai',
            displayName: 'ai',
            avatar: null
          },
          createdAt: timestamp
        }

      default:
        return {}
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!accessJwt.trim() || !handle.trim()) {
      setError('Access JWT and Handle are required')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const recordData = generateDummyData(collection)
      const rkey = `test-${Date.now()}`
      
      const record = {
        repo: handle, // Use handle as is, without adding .bsky.social
        collection: collection,
        rkey: rkey,
        record: recordData
      }

      setLastRecord(record)

      // Direct API call with accessJwt
      const response = await fetch(`https://${env.pds}/xrpc/com.atproto.repo.putRecord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessJwt}`
        },
        body: JSON.stringify(record)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`API Error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const result = await response.json()
      setSuccess(`Record created successfully! URI: ${result.uri}`)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!lastRecord || !accessJwt.trim()) {
      setError('No record to delete or missing access JWT')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const deleteData = {
        repo: lastRecord.repo,
        collection: lastRecord.collection,
        rkey: lastRecord.rkey
      }

      const response = await fetch(`https://${env.pds}/xrpc/com.atproto.repo.deleteRecord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessJwt}`
        },
        body: JSON.stringify(deleteData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Delete Error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      setSuccess('Record deleted successfully!')
      setLastRecord(null)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="test-ui">
      <h2>🧪 Test UI</h2>
      
      {/* Tab Navigation */}
      <div className="test-tabs">
        <button 
          onClick={() => setActiveTab('putRecord')}
          className={`test-tab ${activeTab === 'putRecord' ? 'active' : ''}`}
        >
          Manual putRecord
        </button>
        <button 
          onClick={() => setActiveTab('avatar')}
          className={`test-tab ${activeTab === 'avatar' ? 'active' : ''}`}
        >
          Avatar System
        </button>
      </div>

      {activeTab === 'putRecord' && (
        <div className="test-content">
          <p className="description">
            OAuth不要のテスト用UI。accessJwtとhandleを直接入力して各collectionにダミーデータを投稿できます。
          </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="access-jwt">Access JWT:</label>
          <textarea
            id="access-jwt"
            value={accessJwt}
            onChange={(e) => setAccessJwt(e.target.value)}
            placeholder="eyJ... (Access JWT token)"
            rows={3}
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="handle">Handle:</label>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="user.bsky.social"
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="session-did">Session DID (optional):</label>
          <input
            id="session-did"
            type="text"
            value={sessionDid}
            onChange={(e) => setSessionDid(e.target.value)}
            placeholder="did:plc:xxxxx (Leave empty to use test DID)"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="collection">Collection:</label>
          <select
            id="collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            disabled={loading}
          >
            {collections.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            ✅ {success}
          </div>
        )}

        <div className="form-actions">
          <button 
            type="submit" 
            disabled={loading || !accessJwt.trim() || !handle.trim()}
            className="submit-btn"
          >
            {loading ? '⏳ Creating...' : '📤 Create Record'}
          </button>

          <button
            type="button"
            onClick={() => setShowJson(!showJson)}
            className="json-btn"
            disabled={loading}
          >
            {showJson ? '🙈 Hide JSON' : '👁️ Show JSON'}
          </button>

          {lastRecord && (
            <button
              type="button"
              onClick={handleDelete}
              className="delete-btn"
              disabled={loading}
            >
              {loading ? '⏳ Deleting...' : '🗑️ Delete Last Record'}
            </button>
          )}
        </div>
      </form>

      {showJson && (
        <div className="json-preview">
          <h3>Generated JSON:</h3>
          <pre>{JSON.stringify(generateDummyData(collection), null, 2)}</pre>
        </div>
      )}

      {lastRecord && (
        <div className="last-record">
          <h3>Last Created Record:</h3>
          <div className="record-info">
            <p><strong>Collection:</strong> {lastRecord.collection}</p>
            <p><strong>RKey:</strong> {lastRecord.rkey}</p>
            <p><strong>Repo:</strong> {lastRecord.repo}</p>
          </div>
        </div>
      )}
        </div>
      )}

      {activeTab === 'avatar' && (
        <div className="test-content">
          <AvatarTestPanel />
        </div>
      )}

      <style jsx>{`
        .test-ui {
          border: 3px solid #ff6b6b;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          background: #fff5f5;
        }
        .test-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 2px solid #ddd;
          padding-bottom: 10px;
        }
        .test-tab {
          background: #f8f9fa;
          border: 1px solid #ddd;
          padding: 8px 16px;
          border-radius: 4px 4px 0 0;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: #666;
          transition: all 0.2s;
        }
        .test-tab:hover {
          background: #e9ecef;
          color: #333;
        }
        .test-tab.active {
          background: #ff6b6b;
          color: white;
          border-color: #ff6b6b;
        }
        .test-content {
          margin-top: 20px;
        }
        .test-ui h2 {
          color: #ff6b6b;
          margin-top: 0;
        }
        .description {
          color: #666;
          font-style: italic;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          color: #333;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
          font-family: monospace;
        }
        .form-group textarea {
          resize: vertical;
          min-height: 80px;
        }
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #ff6b6b;
          box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.25);
        }
        .form-group input:disabled,
        .form-group textarea:disabled,
        .form-group select:disabled {
          background: #f8f9fa;
          cursor: not-allowed;
        }
        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }
        .success-message {
          background: #d4edda;
          color: #155724;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #c3e6cb;
        }
        .form-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 20px;
        }
        .submit-btn {
          background: #ff6b6b;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .submit-btn:hover:not(:disabled) {
          background: #ff5252;
        }
        .submit-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
        .json-btn {
          background: #17a2b8;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .json-btn:hover:not(:disabled) {
          background: #138496;
        }
        .delete-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .delete-btn:hover:not(:disabled) {
          background: #c82333;
        }
        .json-preview {
          margin-top: 20px;
          padding: 15px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
        }
        .json-preview h3 {
          margin-top: 0;
          color: #495057;
        }
        .json-preview pre {
          background: #e9ecef;
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
          margin: 0;
        }
        .last-record {
          margin-top: 20px;
          padding: 15px;
          background: #e7f3ff;
          border: 1px solid #b3d9ff;
          border-radius: 4px;
        }
        .last-record h3 {
          margin-top: 0;
          color: #0066cc;
        }
        .record-info p {
          margin: 5px 0;
          font-family: monospace;
          font-size: 14px;
        }
      `}</style>
    </div>
  )
}