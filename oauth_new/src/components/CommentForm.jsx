import React, { useState } from 'react'
import { atproto } from '../api/atproto.js'
import { env } from '../config/env.js'

export default function CommentForm({ user, agent, onCommentPosted }) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || !url.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Create ai.syui.log record structure
      const record = {
        repo: user.did,
        collection: env.collection,
        rkey: `comment-${Date.now()}`,
        record: {
          $type: env.collection,
          url: url.trim(),
          comments: [
            {
              url: url.trim(),
              text: text.trim(),
              author: {
                did: user.did,
                handle: user.handle,
                displayName: user.displayName,
                avatar: user.avatar
              },
              createdAt: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString()
        }
      }

      // Post the record
      await atproto.putRecord(null, record, agent)

      // Clear form
      setText('')
      setUrl('')

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
      <div className="comment-form-placeholder">
        <p>ログインしてコメントを投稿</p>
      </div>
    )
  }

  return (
    <div className="comment-form">
      <h3>コメントを投稿</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="comment-url">ページURL:</label>
          <input
            id="comment-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://syui.ai/posts/example"
            required
            disabled={loading}
          />
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
            className="submit-btn"
          >
            {loading ? '投稿中...' : 'コメントを投稿'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .comment-form {
          border: 2px solid #007bff;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          background: #f8f9fa;
        }
        .comment-form-placeholder {
          border: 2px dashed #ddd;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          text-align: center;
          color: #666;
          background: #f8f9fa;
        }
        .comment-form h3 {
          margin-top: 0;
          color: #007bff;
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
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }
        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }
        .form-group input:disabled,
        .form-group textarea:disabled {
          background: #e9ecef;
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
        .form-actions {
          margin-top: 20px;
        }
        .submit-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .submit-btn:hover:not(:disabled) {
          background: #0056b3;
        }
        .submit-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}