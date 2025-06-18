import React, { useState, useEffect, useRef } from 'react'
import { useAskAI } from '../hooks/useAskAI.js'
import LoadingSkeleton from './LoadingSkeleton.jsx'

export default function AskAI({ adminData, user, agent, onClose }) {
  const { askQuestion, loading, error, chatHistory, clearChatHistory, loadChatHistory } = useAskAI(adminData, user, agent)
  const [question, setQuestion] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    // チャット履歴を読み込み
    loadChatHistory()
  }, [loadChatHistory])

  useEffect(() => {
    // 新しいメッセージが追加されたら一番下にスクロール
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim() || loading) return

    try {
      await askQuestion(question)
      setQuestion('')
    } catch (err) {
      // エラーはuseAskAIで処理済み
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSubmit(e)
    }
    if (e.key === 'Escape') {
      onClose?.()
    }
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderMessage = (entry, index) => (
    <div key={entry.id || index} className="chat-message">
      {/* ユーザーの質問 */}
      <div className="user-message">
        <div className="message-header">
          <div className="avatar">
            {entry.user?.avatar ? (
              <img src={entry.user.avatar} alt={entry.user.displayName} className="profile-avatar" />
            ) : (
              '👤'
            )}
          </div>
          <div className="user-info">
            <div className="display-name">{entry.user?.displayName || 'You'}</div>
            <div className="handle">@{entry.user?.handle || 'user'}</div>
            <div className="timestamp">{formatTimestamp(entry.timestamp)}</div>
          </div>
        </div>
        <div className="message-content">{entry.question}</div>
      </div>

      {/* AIの回答 */}
      <div className="ai-message">
        <div className="message-header">
          <div className="avatar">
            {adminData?.profile?.avatar ? (
              <img src={adminData.profile.avatar} alt={adminData.profile.displayName} className="profile-avatar" />
            ) : (
              '🤖'
            )}
          </div>
          <div className="user-info">
            <div className="display-name">{adminData?.profile?.displayName || 'AI'}</div>
            <div className="handle">@{adminData?.profile?.handle || 'ai'}</div>
            <div className="timestamp">{formatTimestamp(entry.timestamp)}</div>
          </div>
        </div>
        <div className="message-content">{entry.answer}</div>
      </div>
    </div>
  )

  return (
    <div className="ask-ai-container">
      <div className="ask-ai-header">
        <h3>Ask AI</h3>
        <div className="header-actions">
          <button onClick={clearChatHistory} className="clear-btn" title="履歴をクリア">
            🗑️
          </button>
          <button onClick={onClose} className="close-btn" title="閉じる">
            ✕
          </button>
        </div>
      </div>

      <div className="chat-container">
        {chatHistory.length === 0 && !loading ? (
          <div className="welcome-message">
            <div className="ai-message">
              <div className="message-header">
                <div className="avatar">
                  {adminData?.profile?.avatar ? (
                    <img src={adminData.profile.avatar} alt={adminData.profile.displayName} className="profile-avatar" />
                  ) : (
                    '🤖'
                  )}
                </div>
                <div className="user-info">
                  <div className="display-name">{adminData?.profile?.displayName || 'AI'}</div>
                  <div className="handle">@{adminData?.profile?.handle || 'ai'}</div>
                </div>
              </div>
              <div className="message-content">
                こんにちは！このブログの内容について何でも質問してください。記事の詳細や関連する話題について説明できます。
              </div>
            </div>
          </div>
        ) : (
          chatHistory.map(renderMessage)
        )}

        {loading && (
          <div className="ai-loading">
            <div className="message-header">
              <div className="avatar">🤖</div>
              <div className="user-info">
                <div className="display-name">考え中...</div>
              </div>
            </div>
            <LoadingSkeleton count={1} />
          </div>
        )}

        {error && (
          <div className="error-message">
            <div className="message-content">
              エラー: {error}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="question-form">
        <div className="input-container">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="質問を入力してください..."
            rows={2}
            disabled={loading || !user}
            className="question-input"
          />
          <button
            type="submit"
            disabled={loading || !question.trim() || !user}
            className="send-btn"
          >
            {loading ? '⏳' : '📤'}
          </button>
        </div>
        {!user && (
          <div className="auth-notice">
            ログインしてください
          </div>
        )}
      </form>

      <style jsx>{`
        .ask-ai-container {
          width: 100%;
          max-width: 600px;
          height: 500px;
          display: flex;
          flex-direction: column;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
          overflow: hidden;
        }

        .ask-ai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          border-bottom: 1px solid #eee;
          background: #f8f9fa;
        }

        .ask-ai-header h3 {
          margin: 0;
          color: #333;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .clear-btn, .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 5px;
          border-radius: 4px;
          font-size: 14px;
        }

        .clear-btn:hover, .close-btn:hover {
          background: #e9ecef;
        }

        .chat-container {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .chat-message {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .user-message, .ai-message, .welcome-message {
          display: flex;
          flex-direction: column;
        }

        .user-message {
          align-self: flex-end;
          max-width: 80%;
        }

        .ai-message, .welcome-message {
          align-self: flex-start;
          max-width: 90%;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        }

        .avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .display-name {
          font-weight: bold;
          font-size: 12px;
          color: #333;
        }

        .handle {
          font-size: 11px;
          color: #666;
        }

        .timestamp {
          font-size: 10px;
          color: #999;
        }

        .message-content {
          background: #f1f3f4;
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.4;
          white-space: pre-wrap;
        }

        .user-message .message-content {
          background: #007bff;
          color: white;
        }

        .ai-message .message-content {
          background: #e9ecef;
          color: #333;
        }

        .ai-loading {
          align-self: flex-start;
          max-width: 90%;
        }

        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #f5c6cb;
        }

        .question-form {
          padding: 15px;
          border-top: 1px solid #eee;
          background: #f8f9fa;
        }

        .input-container {
          display: flex;
          gap: 8px;
          align-items: end;
        }

        .question-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          resize: none;
          font-family: inherit;
        }

        .question-input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .question-input:disabled {
          background: #e9ecef;
          cursor: not-allowed;
        }

        .send-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: background 0.2s;
        }

        .send-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .send-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .auth-notice {
          text-align: center;
          font-size: 12px;
          color: #666;
          margin-top: 8px;
        }
      `}</style>
    </div>
  )
}