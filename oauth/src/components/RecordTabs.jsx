import React, { useState } from 'react'
import RecordList from './RecordList.jsx'
import ChatRecordList from './ChatRecordList.jsx'
import ProfileRecordList from './ProfileRecordList.jsx'
import LoadingSkeleton from './LoadingSkeleton.jsx'
import { logger } from '../utils/logger.js'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, chatHasMore, onLoadMoreChat, userChatRecords, userChatLoading, baseRecords, apiConfig, pageContext, user = null, agent = null, onRecordDeleted = null }) {
  const [activeTab, setActiveTab] = useState('profiles')
  
  logger.log('RecordTabs: activeTab is', activeTab)

  // Filter records based on page context
  const filterRecords = (records, isProfile = false) => {
    // Ensure records is an array
    const recordsArray = Array.isArray(records) ? records : []
    
    if (pageContext.isTopPage) {
      // Top page: show latest 3 records
      return recordsArray.slice(0, 3)
    } else {
      // Individual page: show records matching the URL
      return recordsArray.filter(record => {
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

  // Special filter for chat records (which are already processed into pairs)
  const filterChatRecords = (chatPairs) => {
    // Ensure chatPairs is an array
    const chatArray = Array.isArray(chatPairs) ? chatPairs : []
    
    console.log('filterChatRecords called:', { 
      isTopPage: pageContext.isTopPage, 
      rkey: pageContext.rkey, 
      chatPairsLength: chatArray.length,
      chatPairsType: typeof chatPairs,
      isArray: Array.isArray(chatPairs)
    })
    
    if (pageContext.isTopPage) {
      // Top page: show latest 3 pairs
      const result = chatArray.slice(0, 3)
      console.log('Top page: returning', result.length, 'pairs')
      return result
    } else {
      // Individual page: show pairs matching the URL (compare path only, ignore domain)
      const filtered = chatArray.filter(chatPair => {
        const recordUrl = chatPair.question?.value?.post?.url
        if (!recordUrl) {
          console.log('No recordUrl for chatPair:', chatPair)
          return false
        }
        
        try {
          // Extract path from URL and get the filename part
          const recordPath = new URL(recordUrl).pathname
          const recordRkey = recordPath.split('/').pop()?.replace(/\.html$/, '')
          
          console.log('Comparing:', { recordRkey, pageRkey: pageContext.rkey, recordUrl })
          
          // Compare with current page rkey
          const matches = recordRkey === pageContext.rkey
          if (matches) {
            console.log('Found matching chat pair!')
          }
          return matches
        } catch (error) {
          console.log('Error processing recordUrl:', recordUrl, error)
          return false
        }
      })
      
      console.log('Individual page: returning', filtered.length, 'filtered pairs')
      return filtered
    }
  }

  const filteredLangRecords = filterRecords(Array.isArray(langRecords) ? langRecords : [])
  const filteredCommentRecords = filterRecords(Array.isArray(commentRecords) ? commentRecords : [])
  const filteredUserComments = filterRecords(Array.isArray(userComments) ? userComments : [])
  const filteredChatRecords = filterChatRecords(Array.isArray(chatRecords) ? chatRecords : [])
  const filteredBaseRecords = filterRecords(Array.isArray(baseRecords) ? baseRecords : [])
  
  // Filter profile records from baseRecords
  const profileRecords = (Array.isArray(baseRecords) ? baseRecords : []).filter(record => record.value?.type === 'profile')
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
          chat ({filteredChatRecords.length > 0 ? filteredChatRecords.length : (userChatRecords?.length || 0)})
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
              chatPairs={filteredChatRecords.length > 0 ? filteredChatRecords : (Array.isArray(userChatRecords) ? userChatRecords : [])} 
              chatHasMore={filteredChatRecords.length > 0 ? chatHasMore : false}
              onLoadMoreChat={filteredChatRecords.length > 0 ? onLoadMoreChat : null}
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
