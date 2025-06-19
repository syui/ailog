import React, { useState } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { env } from '../config/env.js'

export default function CommentForm({ user, agent, onCommentPosted }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return

    setLoading(true)
    setError(null)

    try {
      const currentUrl = window.location.href
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
            slug: currentUrl.match(/\/posts\/([^/]+)/)?.[1] || new URL(currentUrl).pathname.split('/').pop()?.replace(/\.html$/, '') || '',
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

      // Post the record using the same API as ask-AI
      await agent.api.com.atproto.repo.putRecord({
        repo: record.repo,
        collection: record.collection,
        rkey: record.rkey,
        record: record.record
      })

      // キャッシュを無効化
      collections.invalidateCache(env.collection)

      // Clear form
      setText('')

      // Notify parent component
      if (onCommentPosted) {
        onCommentPosted()
      }
      
      // Show success message briefly
      setText('✓ ')
      setTimeout(() => {
        setText('')
      }, 2000)

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
        <p>atproto login</p>
      </div>
    )
  }

  return (
    <div>
      <h3>post</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'var(--background-secondary)', borderRadius: '4px', fontSize: '0.9em' }}>
          <strong>url:</strong> {window.location.href}
        </div>

        <div className="form-group">
          <label htmlFor="comment-text">comment:</label>
          <textarea
            id="comment-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="text..."
            rows={4}
            required
            disabled={loading}
            className="form-input form-textarea"
          />
        </div>

        {error && (
          <div className="error-message">
            err: {error}
          </div>
        )}

        <div className="form-actions">
          <button 
            type="submit" 
            disabled={loading || !text.trim()}
            className={`btn ${loading ? 'btn-outline' : 'btn-primary'}`}
          >
            {loading ? 'posting...' : 'post comment'}
          </button>
        </div>
      </form>
    </div>
  )
}
