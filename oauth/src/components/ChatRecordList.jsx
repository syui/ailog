import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

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

export default function ChatRecordList({ chatPairs, chatHasMore, onLoadMoreChat, apiConfig, user = null, agent = null, onRecordDeleted = null }) {
  const [expandedRecords, setExpandedRecords] = useState(new Set())
  
  // Sort chat pairs by creation time (oldest first) for chronological conversation flow
  const sortedChatPairs = Array.isArray(chatPairs) 
    ? [...chatPairs].sort((a, b) => {
        const dateA = new Date(a.createdAt)
        const dateB = new Date(b.createdAt)
        
        // If creation times are the same, sort by URI (which contains sequence info)
        if (dateA.getTime() === dateB.getTime()) {
          const uriA = a.question?.uri || ''
          const uriB = b.question?.uri || ''
          return uriA.localeCompare(uriB)
        }
        
        return dateA - dateB
      })
    : []
  

  const toggleJsonView = (key) => {
    const newExpanded = new Set(expandedRecords)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedRecords(newExpanded)
  }

  if (!sortedChatPairs || sortedChatPairs.length === 0) {
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
      {sortedChatPairs.map((chatPair, i) => (
        <div key={chatPair.rkey} className="chat-conversation">
          {/* Question */}
          {chatPair.question && (
            <div className="chat-message user-message comment-style">
              <div className="message-header">
                {chatPair.question.value.author?.avatar ? (
                  <img 
                    src={chatPair.question.value.author.avatar} 
                    alt={`${chatPair.question.value.author.displayName || chatPair.question.value.author.handle} avatar`}
                    className="avatar"
                  />
                ) : (
                  <div className="avatar">
                    {(chatPair.question.value.author?.displayName || chatPair.question.value.author?.handle || '?').charAt(0).toUpperCase()}
                  </div>
                )}
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
                    className={`btn btn-sm ${expandedRecords.has(`${chatPair.rkey}-question`) ? 'btn-outline' : 'btn-primary'}`}
                    title="Show/Hide JSON"
                  >
                    {expandedRecords.has(`${chatPair.rkey}-question`) ? 'hide' : 'json'}
                  </button>
                  {canDelete(chatPair) && (
                    <button
                      onClick={() => handleDelete(chatPair)}
                      className="btn btn-danger btn-sm"
                      title="Delete Conversation"
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
              {expandedRecords.has(`${chatPair.rkey}-question`) && (
                <div className="json-display">
                  <pre className="json-content">
                    {JSON.stringify(chatPair.question, null, 2)}
                  </pre>
                </div>
              )}
              <div className="message-content">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {chatPair.question.value.text}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Answer */}
          {chatPair.answer && (
            <div className="chat-message ai-message comment-style">
              <div className="message-header">
                {chatPair.answer.value.author?.avatar ? (
                  <img 
                    src={chatPair.answer.value.author.avatar} 
                    alt={`${chatPair.answer.value.author.displayName || chatPair.answer.value.author.handle} avatar`}
                    className="avatar"
                  />
                ) : (
                  <div className="avatar">
                    {(chatPair.answer.value.author?.displayName || chatPair.answer.value.author?.handle || 'AI').charAt(0).toUpperCase()}
                  </div>
                )}
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
                    className={`btn btn-sm ${expandedRecords.has(`${chatPair.rkey}-answer`) ? 'btn-outline' : 'btn-primary'}`}
                    title="Show/Hide JSON"
                  >
                    {expandedRecords.has(`${chatPair.rkey}-answer`) ? 'hide' : 'json'}
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
              <div className="message-content">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {chatPair.answer.value.text}
                </ReactMarkdown>
              </div>
            </div>
          )}

        </div>
      ))}
      
      {/* Load More Button */}
      {chatHasMore && onLoadMoreChat && (
        <div className="bluesky-footer">
          <i 
            className="fab fa-bluesky"
            onClick={onLoadMoreChat}
            style={{cursor: 'pointer'}}
            title="続きを読み込む"
          ></i>
        </div>
      )}
    </section>
  )
}