import React from 'react'

export default function RecordList({ title, records, apiConfig, showTitle = true }) {
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
        <div key={i} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '10px' }}>
          {record.value.author?.avatar && (
            <img 
              src={record.value.author.avatar} 
              alt="avatar" 
              style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '10px' }} 
            />
          )}
          <div><strong>{record.value.author?.displayName || record.value.author?.handle}</strong></div>
          <div>
            Handle: 
            <a 
              href={`${apiConfig?.web}/profile/${record.value.author?.did}`} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ marginLeft: '5px' }}
            >
              {record.value.author?.handle}
            </a>
          </div>
          <div style={{ margin: '10px 0' }}>{record.value.text || record.value.content}</div>
          {record.value.post?.url && (
            <div>
              URL: 
              <a 
                href={record.value.post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ marginLeft: '5px' }}
              >
                {record.value.post.url}
              </a>
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            {new Date(record.value.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </section>
  )
}