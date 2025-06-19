import React, { useState } from 'react'
import RecordList from './RecordList.jsx'
import ChatRecordList from './ChatRecordList.jsx'
import LoadingSkeleton from './LoadingSkeleton.jsx'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, userChatRecords, userChatLoading, baseRecords, apiConfig, pageContext, user = null, agent = null, onRecordDeleted = null }) {
  const [activeTab, setActiveTab] = useState('lang')

  // Filter records based on page context
  const filterRecords = (records) => {
    if (pageContext.isTopPage) {
      // Top page: show latest 3 records
      return records.slice(0, 3)
    } else {
      // Individual page: show records matching the URL
      return records.filter(record => {
        const recordUrl = record.value?.post?.url
        if (!recordUrl) return false
        
        try {
          const recordRkey = new URL(recordUrl).pathname.split('/').pop()?.replace(/\.html$/, '')
          return recordRkey === pageContext.rkey
        } catch {
          return false
        }
      })
    }
  }

  const filteredLangRecords = filterRecords(langRecords)
  const filteredCommentRecords = filterRecords(commentRecords)
  const filteredUserComments = filterRecords(userComments || [])
  const filteredChatRecords = filterRecords(chatRecords || [])
  const filteredBaseRecords = filterRecords(baseRecords || [])

  return (
    <div className="record-tabs">
      <div className="tab-header">
        <button 
          className={`tab-btn ${activeTab === 'lang' ? 'active' : ''}`}
          onClick={() => setActiveTab('lang')}
        >
          en ({filteredLangRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comment' ? 'active' : ''}`}
          onClick={() => setActiveTab('comment')}
        >
          feedback ({filteredCommentRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'collection' ? 'active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          chat ({userChatRecords?.length || 0})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          comment ({filteredUserComments.length})
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'lang' && (
          !langRecords ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title=""
              records={filteredLangRecords} 
              apiConfig={apiConfig} 
              user={user}
              agent={agent}
              onRecordDeleted={onRecordDeleted}
              showTitle={false}
            />
          )
        )}
        {activeTab === 'comment' && (
          !commentRecords ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title=""
              records={filteredCommentRecords} 
              apiConfig={apiConfig} 
              user={user}
              agent={agent}
              onRecordDeleted={onRecordDeleted}
              showTitle={false}
            />
          )
        )}
        {activeTab === 'collection' && (
          userChatLoading ? (
            <LoadingSkeleton count={2} showTitle={true} />
          ) : (
            <ChatRecordList 
              chatPairs={userChatRecords} 
              apiConfig={apiConfig} 
              user={user}
              agent={agent}
              onRecordDeleted={onRecordDeleted}
            />
          )
        )}
        {activeTab === 'users' && (
          !userComments ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <RecordList 
              title=""
              records={filteredUserComments} 
              apiConfig={apiConfig} 
              user={user}
              agent={agent}
              onRecordDeleted={onRecordDeleted}
              showTitle={false}
            />
          )
        )}
      </div>

    </div>
  )
}
