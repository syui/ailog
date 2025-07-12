import React, { useState } from 'react'
import RecordList from './RecordList.jsx'
import ChatRecordList from './ChatRecordList.jsx'
import ProfileRecordList from './ProfileRecordList.jsx'
import LoadingSkeleton from './LoadingSkeleton.jsx'
import { logger } from '../utils/logger.js'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, userChatRecords, userChatLoading, baseRecords, apiConfig, pageContext, user = null, agent = null, onRecordDeleted = null }) {
  const [activeTab, setActiveTab] = useState('profiles')
  
  logger.log('RecordTabs: activeTab is', activeTab)

  // Filter records based on page context
  const filterRecords = (records, isProfile = false) => {
    if (pageContext.isTopPage) {
      // Top page: show latest 3 records
      return records.slice(0, 3)
    } else {
      // Individual page: show records matching the URL
      return records.filter(record => {
        // Profile records should always be shown
        if (isProfile || record.value?.type === 'profile') {
          return true
        }
        
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
  
  // Filter profile records from baseRecords
  const profileRecords = (baseRecords || []).filter(record => record.value?.type === 'profile')
  const sortedProfileRecords = profileRecords.sort((a, b) => {
    if (a.value.profileType === 'admin' && b.value.profileType !== 'admin') return -1
    if (a.value.profileType !== 'admin' && b.value.profileType === 'admin') return 1
    return 0
  })
  const filteredProfileRecords = filterRecords(sortedProfileRecords, true)

  return (
    <div className="record-tabs">
      <div className="tab-header">
        <button 
          className={`tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
          onClick={() => {
            logger.log('RecordTabs: Profiles tab clicked')
            setActiveTab('profiles')
          }}
        >
          about ({filteredProfileRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'collection' ? 'active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          chat ({userChatRecords?.length || 0})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comment' ? 'active' : ''}`}
          onClick={() => setActiveTab('comment')}
        >
          feedback ({filteredCommentRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          comment ({filteredUserComments.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'lang' ? 'active' : ''}`}
          onClick={() => setActiveTab('lang')}
        >
          en ({filteredLangRecords.length})
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
        {activeTab === 'profiles' && (
          !baseRecords ? (
            <LoadingSkeleton count={3} showTitle={true} />
          ) : (
            <ProfileRecordList 
              profileRecords={filteredProfileRecords}
              apiConfig={apiConfig} 
              user={user}
              agent={agent}
              onRecordDeleted={onRecordDeleted}
            />
          )
        )}
      </div>

    </div>
  )
}
