import React, { useState } from 'react'
import AvatarImage from './AvatarImage.jsx'
import Avatar from './Avatar.jsx'

export default function RecordList({ title, records, apiConfig, showTitle = true, user = null, agent = null, onRecordDeleted = null }) {
  const [expandedRecords, setExpandedRecords] = useState(new Set())
  const [deletingRecords, setDeletingRecords] = useState(new Set())

  const toggleJsonView = (index) => {
    const newExpanded = new Set(expandedRecords)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRecords(newExpanded)
  }

  const handleDelete = async (record, index) => {
    if (!user || !agent || !record.uri) return
    
    const confirmed = window.confirm('このレコードを削除しますか？')
    if (!confirmed) return

    setDeletingRecords(prev => new Set([...prev, index]))

    try {
      // Extract repo, collection, rkey from URI
      const uriParts = record.uri.split('/')
      const repo = uriParts[2]
      const collection = uriParts[3]
      const rkey = uriParts[4]

      await agent.com.atproto.repo.deleteRecord({
        repo: repo,
        collection: collection,
        rkey: rkey
      })

      if (onRecordDeleted) {
        onRecordDeleted()
      }
    } catch (error) {
      alert(`削除に失敗しました: ${error.message}`)
    } finally {
      setDeletingRecords(prev => {
        const newSet = new Set(prev)
        newSet.delete(index)
        return newSet
      })
    }
  }

  const canDelete = (record) => {
    return user && agent && record.uri && record.value.author?.did === user.did
  }
  if (!records || records.length === 0) {
    return (
      <section>
        {showTitle && <h3>{title} (0)</h3>}
        <p>レコードがありません</p>
      </section>
    )
  }

  return (
    <section>
      {showTitle && <h3>{title} ({records.length})</h3>}
      {records.map((record, i) => (
        <div key={i} className="record-item">
          <div className="record-header">
            <AvatarImage record={record} size={40} />
            <div className="user-info">
              <div className="display-name">{record.value.author?.displayName || record.value.author?.handle}</div>
              <div className="handle">
                <a 
                  href={`${apiConfig?.web || 'https://bsky.app'}/profile/${record.value.author?.did}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="handle-link"
                >
                  @{record.value.author?.handle}
                </a>
              </div>
              <div className="timestamp">{new Date(record.value.createdAt).toLocaleString()}</div>
            </div>
            
            <div className="record-actions">
              <button
                onClick={() => toggleJsonView(i)}
                className={`btn btn-sm ${expandedRecords.has(i) ? 'btn-outline' : 'btn-primary'}`}
                title="Show/Hide JSON"
              >
                {expandedRecords.has(i) ? 'hide' : 'json'}
              </button>
              
              {canDelete(record) && (
                <button
                  onClick={() => handleDelete(record, i)}
                  disabled={deletingRecords.has(i)}
                  className="btn btn-danger btn-sm"
                  title="Delete Record"
                >
                  {deletingRecords.has(i) ? 'deleting...' : 'delete'}
                </button>
              )}
            </div>
          </div>
          
          {expandedRecords.has(i) && (
            <div className="json-display">
              <div className="json-header">json data</div>
              <pre className="json-content">
                {JSON.stringify(record, null, 2)}
              </pre>
            </div>
          )}
          
          <div className="record-content">{record.value.text || record.value.content}</div>
          
          <div className="record-meta">
            {record.value.post?.url && (
              <a 
                href={record.value.post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="record-url"
              >
                {record.value.post.url}
              </a>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}