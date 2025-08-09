import React, { useState, useEffect } from 'react'
import RecordList from './RecordList.jsx'
import ChatRecordList from './ChatRecordList.jsx'
import ProfileRecordList from './ProfileRecordList.jsx'
import LoadingSkeleton from './LoadingSkeleton.jsx'
import { logger } from '../utils/logger.js'
import { collections } from '../api/atproto.js'
import { getApiConfig } from '../utils/pds.js'
import { env } from '../config/env.js'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, chatHasMore, onLoadMoreChat, userChatRecords, userChatLoading, baseRecords, apiConfig, pageContext, user = null, agent = null, onRecordDeleted = null }) {
  // State for page-specific chat records
  const [pageSpecificChatRecords, setPageSpecificChatRecords] = useState([])
  const [pageSpecificLoading, setPageSpecificLoading] = useState(false)
  
  
  
  // Check if current page has matching chat records (AI posts always have chat records)
  const isAiPost = !pageContext.isTopPage && Array.isArray(chatRecords) && chatRecords.some(chatPair => {
    const recordUrl = chatPair.question?.value?.post?.url
    if (!recordUrl) return false
    
    try {
      const recordRkey = new URL(recordUrl).pathname.split('/').pop()?.replace(/\.html$/, '')
      return recordRkey === pageContext.rkey
    } catch {
      return false
    }
  })
  
  const [activeTab, setActiveTab] = useState(isAiPost ? 'collection' : 'profiles')

  // Fixed useEffect with proper dependency array
  useEffect(() => {
    if (!pageContext.isTopPage && pageContext.rkey) {
      
      const fetchPageSpecificChats = async () => {
        setPageSpecificLoading(true)
        try {
          const apiConfig = getApiConfig(`https://${env.pds}`)
          const { atproto } = await import('../api/atproto.js')
          const did = await atproto.getDid(env.pds, env.admin)
          
          const records = await collections.getChatForPost(
            apiConfig.pds, 
            did, 
            env.collection, 
            pageContext.rkey
          )
          setPageSpecificChatRecords(records)
        } catch (error) {
          setPageSpecificChatRecords([])
        } finally {
          setPageSpecificLoading(false)
        }
      }
      
      fetchPageSpecificChats()
    } else {
      setPageSpecificChatRecords([])
    }
  }, [pageContext.isTopPage, pageContext.rkey]) // Add proper dependencies
  

  // Filter records based on page context
  const filterRecords = (records, isProfile = false) => {
    // Ensure records is an array
    const recordsArray = Array.isArray(records) ? records : []
    
    
    if (pageContext.isTopPage) {
      // Top page: show latest 3 records
      return recordsArray.slice(0, 3)
    } else {
      // Individual page: show records matching the URL
      const filtered = recordsArray.filter(record => {
        // Profile records should always be shown
        if (isProfile || record.value?.type === 'profile') {
          return true
        }
        
        const recordUrl = record.value?.post?.url
        if (!recordUrl) {
          return false
        }
        
        try {
          const recordRkey = new URL(recordUrl).pathname.split('/').pop()?.replace(/\.html$/, '')
          return recordRkey === pageContext.rkey
        } catch {
          return false
        }
      })
      return filtered
    }
  }

  // Special filter for chat records (which are already processed into pairs)
  const filterChatRecords = (chatPairs) => {
    // Ensure chatPairs is an array
    const chatArray = Array.isArray(chatPairs) ? chatPairs : []
    
    
    if (pageContext.isTopPage) {
      // Top page: show latest 3 pairs
      return chatArray.slice(0, 3)
    } else {
      // Individual page: show pairs matching the URL (compare path only, ignore domain)
      const filtered = chatArray.filter(chatPair => {
        const recordUrl = chatPair.question?.value?.post?.url
        if (!recordUrl) {
          return false
        }
        
        try {
          // Extract path from URL and get the filename part
          const recordPath = new URL(recordUrl).pathname
          const recordRkey = recordPath.split('/').pop()?.replace(/\.html$/, '')
          
          // Compare with current page rkey
          return recordRkey === pageContext.rkey
        } catch (error) {
          return false
        }
      })
      
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
      {!isAiPost && (
      <div className="tab-header">
        <button 
          className={`tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
          onClick={() => setActiveTab('profiles')}
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
      )}

      <div className="tab-content">
        {activeTab === 'lang' && !isAiPost && (
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
        {activeTab === 'comment' && !isAiPost && (
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
          (userChatLoading || pageSpecificLoading) ? (
            <LoadingSkeleton count={2} showTitle={true} />
          ) : (() => {
            const chatPairsToUse = !pageContext.isTopPage && pageSpecificChatRecords.length > 0
              ? pageSpecificChatRecords
              : (filteredChatRecords.length > 0 ? filteredChatRecords : (Array.isArray(userChatRecords) ? userChatRecords : []))
            
            return (
              <ChatRecordList 
                chatPairs={chatPairsToUse} 
                chatHasMore={
                  !pageContext.isTopPage && pageSpecificChatRecords.length > 0
                    ? false  // Page-specific records don't use pagination
                    : (filteredChatRecords.length > 0 ? chatHasMore : false)
                }
                onLoadMoreChat={
                  !pageContext.isTopPage && pageSpecificChatRecords.length > 0
                    ? null   // Page-specific records don't use pagination
                    : (filteredChatRecords.length > 0 ? onLoadMoreChat : null)
                }
                apiConfig={apiConfig} 
                user={user}
                agent={agent}
                onRecordDeleted={onRecordDeleted}
              />
            )
          })()
        )}
        {activeTab === 'users' && !isAiPost && (
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
        {activeTab === 'profiles' && !isAiPost && (
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
