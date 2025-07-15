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

export default function ProfileRecordList({ profileRecords, apiConfig, user = null, agent = null, onRecordDeleted = null }) {
  const [expandedRecords, setExpandedRecords] = useState(new Set())

  const toggleJsonView = (uri) => {
    const newExpanded = new Set(expandedRecords)
    if (newExpanded.has(uri)) {
      newExpanded.delete(uri)
    } else {
      newExpanded.add(uri)
    }
    setExpandedRecords(newExpanded)
  }
  if (!profileRecords || profileRecords.length === 0) {
    return (
      <section>
        <p>プロフィールがありません</p>
      </section>
    )
  }

  const handleDelete = async (profile) => {
    if (!user || !agent || !profile.uri) return
    
    const confirmed = window.confirm('このプロフィールを削除しますか？')
    if (!confirmed) return

    try {
      const uriParts = profile.uri.split('/')
      await agent.api.com.atproto.repo.deleteRecord({
        repo: uriParts[2],
        collection: uriParts[3],
        rkey: uriParts[4]
      })

      if (onRecordDeleted) {
        onRecordDeleted()
      }
    } catch (error) {
      alert(`削除に失敗しました: ${error.message}`)
    }
  }

  const canDelete = (profile) => {
    if (!user || !agent || !profile.uri) return false
    
    // Check if the record is in the current user's repository
    const recordRepoDid = profile.uri.split('/')[2]
    return recordRepoDid === user.did
  }

  return (
    <section>
      {profileRecords.map((profile) => (
        <div key={profile.uri} className="chat-message comment-style">
          <div className="message-header">
            {profile.value.author?.avatar ? (
              <img 
                src={profile.value.author.avatar} 
                alt={`${profile.value.author.displayName || profile.value.author.handle} avatar`}
                className="avatar"
              />
            ) : (
              <div className="avatar">
                {(profile.value.author?.displayName || profile.value.author?.handle || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="user-info">
              <div className="display-name">
                {profile.value.author?.displayName || profile.value.author?.handle}
                {profile.value.profileType === 'admin' && (
                  <span className="admin-badge"> Admin</span>
                )}
              </div>
              <div className="handle">
                <a 
                  href={`${getCorrectWebUrl(profile.value.author?.avatar)}/profile/${profile.value.author?.did}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="handle-link"
                >
                  @{profile.value.author?.handle}
                </a>
              </div>
            </div>
            <div className="record-actions">
              <button
                onClick={() => toggleJsonView(profile.uri)}
                className={`btn btn-sm ${expandedRecords.has(profile.uri) ? 'btn-outline' : 'btn-primary'}`}
                title="Show/Hide JSON"
              >
                {expandedRecords.has(profile.uri) ? 'hide' : 'json'}
              </button>
              {canDelete(profile) && (
                <button
                  onClick={() => handleDelete(profile)}
                  className="btn btn-danger btn-sm"
                  title="Delete Profile"
                >
                  delete
                </button>
              )}
            </div>
          </div>
          {expandedRecords.has(profile.uri) && (
            <div className="json-display">
              <pre className="json-content">
                {JSON.stringify(profile, null, 2)}
              </pre>
            </div>
          )}
          <div className="message-content">{profile.value.text}</div>
        </div>
      ))}
    </section>
  )
}