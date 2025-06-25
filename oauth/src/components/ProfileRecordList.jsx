import React from 'react'

export default function ProfileRecordList({ profileRecords, apiConfig, user = null, agent = null, onRecordDeleted = null }) {
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
    return user && agent && profile.uri && profile.value.author?.did === user.did
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
              <div className="handle">@{profile.value.author?.handle}</div>
              <div className="timestamp">{new Date(profile.value.createdAt).toLocaleString()}</div>
            </div>
            {canDelete(profile) && (
              <div className="record-actions">
                <button
                  onClick={() => handleDelete(profile)}
                  className="btn btn-danger btn-sm"
                  title="Delete Profile"
                >
                  delete
                </button>
              </div>
            )}
          </div>
          <div className="message-content">{profile.value.text}</div>
        </div>
      ))}
    </section>
  )
}