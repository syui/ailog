import React, { useState, useEffect } from 'react'
import { useAdminData } from './hooks/useAdminData.js'
import { usePageContext } from './hooks/usePageContext.js'
import ChatRecordList from './components/ChatRecordList.jsx'

export default function App() {
  const { adminData, chatRecords: adminChatRecords, loading, error } = useAdminData()
  const pageContext = usePageContext()
  const [filteredChatRecords, setFilteredChatRecords] = useState([])

  // Filter chat records for current post URL
  useEffect(() => {
    if (!adminChatRecords || adminChatRecords.length === 0) {
      setFilteredChatRecords([])
      return
    }

    // Get current page URL
    const currentUrl = window.location.href
      .replace('http://localhost:8000', 'https://syui.ai')
      .replace('http://127.0.0.1:4173', 'https://syui.ai')
      .replace('http://localhost:4173', 'https://syui.ai')

    console.log('Current URL:', currentUrl)
    console.log('Admin chat records:', adminChatRecords.length)
    console.log('All chat pairs:', adminChatRecords.map(pair => ({
      rkey: pair.rkey,
      questionText: pair.question?.value?.text?.substring(0, 50) + '...',
      cid: pair.question?.cid,
      url: pair.question?.value?.post?.url
    })))

    // Filter records for this specific URL
    const filtered = adminChatRecords.filter(chatPair => {
      const recordUrl = chatPair.question?.value?.post?.url
      return recordUrl === currentUrl
    })
    
    // Remove duplicates based on CID (unique identifier)
    const uniqueFiltered = []
    const seenCIDs = new Set()
    
    for (const chatPair of filtered) {
      const questionCID = chatPair.question?.cid
      const answerCID = chatPair.answer?.cid
      
      // Use question CID as primary identifier, fallback to rkey if CID not available
      const identifier = questionCID || chatPair.rkey
      
      if (!seenCIDs.has(identifier)) {
        seenCIDs.add(identifier)
        uniqueFiltered.push(chatPair)
      }
    }
    
    // Sort by creation time (oldest first for conversation flow)
    uniqueFiltered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    console.log('Filtered chat records:', uniqueFiltered.length)
    console.log('Final filtered pairs:', uniqueFiltered.map(pair => ({
      rkey: pair.rkey,
      questionText: pair.question?.value?.text?.substring(0, 50) + '...',
      cid: pair.question?.cid
    })))
    setFilteredChatRecords(uniqueFiltered)
  }, [adminChatRecords])

  if (loading) {
    return (
      <div className="ai-conversation-app">
        <div className="loading-container">
          <p>💬 Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ai-conversation-app">
        <div className="error-container">
          <p>❌ Failed to load conversation</p>
        </div>
      </div>
    )
  }

  if (filteredChatRecords.length === 0) {
    return (
      <div className="ai-conversation-app">
        <div className="empty-container">
          <p>No conversation records found for this post.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-conversation-app">
      <ChatRecordList 
        chatPairs={filteredChatRecords}
        apiConfig={adminData.apiConfig}
        pageContext={pageContext}
        user={null}
        agent={null}
        onRecordDeleted={null}
      />
    </div>
  )
}