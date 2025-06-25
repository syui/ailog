import React from 'react'

export default function ChatRecordList({ chatPairs, apiConfig, user = null, agent = null, onRecordDeleted = null }) {
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
                  <div className="display-name">{chatPair.question.value.author?.displayName || chatPair.question.value.author?.handle}</div>
                </div>
                {canDelete(chatPair) && (
                  <div className="record-actions">
                    <button
                      onClick={() => handleDelete(chatPair)}
                      className="btn btn-danger btn-sm"
                      title="Delete Conversation"
                    >
                      delete
                    </button>
                  </div>
                )}
              </div>
              <div className="message-content">{chatPair.question.value.text}</div>
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
                  <div className="display-name">{chatPair.answer.value.author?.displayName || chatPair.answer.value.author?.handle}</div>
                </div>
              </div>
              <div className="message-content">{chatPair.answer.value.text}</div>
            </div>
          )}

          {/* Post metadata */}
          {chatPair.question?.value.post?.url && (
            <div className="record-meta">
              <a 
                href={chatPair.question.value.post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="record-url"
              >
                {chatPair.question.value.post.url}
              </a>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}