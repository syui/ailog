import React, { useState } from 'react'

// Helper function to get correct web URL based on avatar URL
function getCorrectWebUrl(avatarUrl) {
  if (!avatarUrl) return 'https://bsky.app'
  
  // If avatar is from bsky.app (main Bluesky), use bsky.app
  if (avatarUrl.includes('cdn.bsky.app') || avatarUrl.includes('bsky.app')) {
    return 'https://bsky.app'
  }
  
  // If avatar is from syu.is, use web.syu.is
  if (avatarUrl.includes('bsky.syu.is') || avatarUrl.includes('syu.is')) {
    return 'https://syu.is'
  }
  
  // Default to bsky.app
  return 'https://bsky.app'
}

export default function ChatRecordList({ chatPairs, apiConfig, user = null, agent = null, onRecordDeleted = null }) {
  const [expandedRecords, setExpandedRecords] = useState(new Set())

  const toggleJsonView = (key) => {
    const newExpanded = new Set(expandedRecords)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedRecords(newExpanded)
  }

  if (!chatPairs || chatPairs.length === 0) {
    return (
      <section>
        <p>チャット履歴がありません</p>
      </section>
    )
  }

  const handleDelete = async (chatPair) => {
    if (!user || !agent || !chatPair.question?.uri) return
    
    const confirmed = window.confirm('この会話を削除しますか？')
    if (!confirmed) return

    try {
      // Delete question record
      if (chatPair.question?.uri) {
        const questionUriParts = chatPair.question.uri.split('/')
        await agent.api.com.atproto.repo.deleteRecord({
          repo: questionUriParts[2],
          collection: questionUriParts[3],
          rkey: questionUriParts[4]
        })
      }

      // Delete answer record if exists
      if (chatPair.answer?.uri) {
        const answerUriParts = chatPair.answer.uri.split('/')
        await agent.api.com.atproto.repo.deleteRecord({
          repo: answerUriParts[2],
          collection: answerUriParts[3],
          rkey: answerUriParts[4]
        })
      }

      if (onRecordDeleted) {
        onRecordDeleted()
      }
    } catch (error) {
      alert(`削除に失敗しました: ${error.message}`)
    }
  }

  const canDelete = (chatPair) => {
    return user && agent && chatPair.question?.uri && chatPair.question.value.author?.did === user.did
  }

  return (
    <section>
      {chatPairs.map((chatPair, i) => (
        <div key={`${chatPair.rkey}-${i}`} className="chat-conversation">
          {/* Question */}
          {chatPair.question && (
            <div className="chat-message user-message comment-style">
              <div className="message-header">
                <div className="avatar">
                  {chatPair.question.value.author?.avatar ? (
                    <img 
                      src={chatPair.question.value.author.avatar} 
                      alt={`${chatPair.question.value.author.displayName || chatPair.question.value.author.handle} avatar`}
                      className="profile-avatar"
                    />
                  ) : (
                    <div className="avatar-fallback">
                      {(chatPair.question.value.author?.displayName || chatPair.question.value.author?.handle || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="user-info">
                  <div className="display-name">
                    {chatPair.question.value.author?.displayName || chatPair.question.value.author?.handle}
                    {chatPair.question.value.author?.handle === 'syui' && <span className="admin-badge"> Admin</span>}
                  </div>
                  <div className="handle">
                    <a 
                      href={`${getCorrectWebUrl(chatPair.question.value.author?.avatar)}/profile/${chatPair.question.value.author?.did}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="handle-link"
                    >
                      @{chatPair.question.value.author?.handle}
                    </a>
                  </div>
                </div>
                <div className="record-actions">
                  <button 
                    onClick={() => toggleJsonView(`${chatPair.rkey}-question`)}
                    className="json-toggle-btn"
                  >
                    JSON
                  </button>
                </div>
              </div>
              {expandedRecords.has(`${chatPair.rkey}-question`) && (
                <div className="json-display">
                  <pre className="json-content">
                    {JSON.stringify(chatPair.question, null, 2)}
                  </pre>
                </div>
              )}
              <div className="message-content">{chatPair.question.value.text}</div>
            </div>
          )}

          {/* Answer */}
          {chatPair.answer && (
            <div className="chat-message ai-message comment-style">
              <div className="message-header">
                <div className="avatar">
                  {chatPair.answer.value.author?.avatar ? (
                    <img 
                      src={chatPair.answer.value.author.avatar} 
                      alt={`${chatPair.answer.value.author.displayName || chatPair.answer.value.author.handle} avatar`}
                      className="profile-avatar"
                    />
                  ) : (
                    <div className="avatar-fallback">
                      {(chatPair.answer.value.author?.displayName || chatPair.answer.value.author?.handle || 'AI').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="user-info">
                  <div className="display-name">
                    {chatPair.answer.value.author?.displayName || chatPair.answer.value.author?.handle}
                  </div>
                  <div className="handle">
                    <a 
                      href={`${getCorrectWebUrl(chatPair.answer.value.author?.avatar)}/profile/${chatPair.answer.value.author?.did}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="handle-link"
                    >
                      @{chatPair.answer.value.author?.handle}
                    </a>
                  </div>
                </div>
                <div className="record-actions">
                  <button 
                    onClick={() => toggleJsonView(`${chatPair.rkey}-answer`)}
                    className="json-toggle-btn"
                  >
                    JSON
                  </button>
                </div>
              </div>
              {expandedRecords.has(`${chatPair.rkey}-answer`) && (
                <div className="json-display">
                  <pre className="json-content">
                    {JSON.stringify(chatPair.answer, null, 2)}
                  </pre>
                </div>
              )}
              <div className="message-content">{chatPair.answer.value.text}</div>
            </div>
          )}

        </div>
      ))}
    </section>
  )
}