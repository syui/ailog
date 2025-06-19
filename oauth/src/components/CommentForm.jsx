import React, { useState } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { env } from '../config/env.js'

export default function CommentForm({ user, agent, onCommentPosted, pageContext }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Get current URL automatically, but exclude OAuth callback URLs
  const getCurrentUrl = () => {
    const currentPath = window.location.href
    
    // If on OAuth callback page, get the stored return URL or use root
    if (currentPath.includes('/oauth/callback')) {
      return sessionStorage.getItem('oauth_return_url') || window.location.origin
    }
    
    // Remove hash fragments for clean URLs
    return currentPath.split('#')[0]
  }
  
  const currentUrl = getCurrentUrl()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return

    setLoading(true)
    setError(null)

    try {
      const timestamp = new Date().toISOString()
      
      // Create ai.syui.log record structure (new unified format)
      const record = {
        repo: user.did,
        collection: env.collection,
        rkey: `comment-${Date.now()}`,
        record: {
          $type: env.collection,
          url: currentUrl, // Keep for backward compatibility
          post: {
            url: currentUrl,
            date: timestamp,
            slug: new URL(currentUrl).pathname.split('/').pop()?.replace(/\.html$/, '') || '',
            tags: [],
            title: document.title || 'Comment',
            language: 'ja'
          },
          text: text.trim(),
          type: 'comment',
          author: {
            did: user.did,
            handle: user.handle,
            displayName: user.displayName,
            avatar: user.avatar
          },
          createdAt: timestamp
        }
      }

      // Post the record
      await atproto.putRecord(null, record, agent)

      // キャッシュを無効化
      collections.invalidateCache(env.collection)

      // Clear form
      setText('')

      // Notify parent component
      if (onCommentPosted) {
        onCommentPosted()
      }

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        color: 'var(--text-secondary)'
      }}>
        <p>ログインしてコメントを投稿</p>
      </div>
    )
  }

  return (
    <div>
      <h3>コメントを投稿</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-secondary)' }}>
          <span>ページ: {currentUrl}</span>
        </div>

        <div className="form-group">
          <label htmlFor="comment-text">コメント:</label>
          <textarea
            id="comment-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="コメントを入力してください..."
            rows={4}
            required
            disabled={loading}
            className="form-input form-textarea"
          />
        </div>

        {error && (
          <div className="error-message">
            エラー: {error}
          </div>
        )}

        <div className="form-actions">
          <button 
            type="submit" 
            disabled={loading || !text.trim() || !url.trim()}
            className="btn btn-primary"
          >
            {loading ? '投稿中...' : 'コメントを投稿'}
          </button>
        </div>
      </form>
    </div>
  )
}