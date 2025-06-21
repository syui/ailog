import React, { useState, useEffect } from 'react'
import { atproto } from './api/atproto.js'
import { useAuth } from './hooks/useAuth.js'
import { useAdminData } from './hooks/useAdminData.js'
import { useUserData } from './hooks/useUserData.js'
import { usePageContext } from './hooks/usePageContext.js'
import AuthButton from './components/AuthButton.jsx'
import RecordTabs from './components/RecordTabs.jsx'
import CommentForm from './components/CommentForm.jsx'
import AskAI from './components/AskAI.jsx'
import TestUI from './components/TestUI.jsx'
import OAuthCallback from './components/OAuthCallback.jsx'

export default function App() {
  const { user, agent, loading: authLoading, login, logout } = useAuth()
  const { adminData, langRecords, commentRecords, loading: dataLoading, error, retryCount, refresh: refreshAdminData } = useAdminData()
  const { userComments, chatRecords, loading: userLoading, refresh: refreshUserData } = useUserData(adminData)
  const [userChatRecords, setUserChatRecords] = useState([])
  const [userChatLoading, setUserChatLoading] = useState(false)
  const pageContext = usePageContext()
  const [showAskAI, setShowAskAI] = useState(false)
  const [showTestUI, setShowTestUI] = useState(false)
  
  // Environment-based feature flags
  const ENABLE_TEST_UI = import.meta.env.VITE_ENABLE_TEST_UI === 'true'
  const ENABLE_DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true'

  // Fetch user's own chat records
  const fetchUserChatRecords = async () => {
    if (!user || !agent) return
    
    setUserChatLoading(true)
    try {
      const records = await agent.api.com.atproto.repo.listRecords({
        repo: user.did,
        collection: 'ai.syui.log.chat',
        limit: 50
      })
      
      // Group questions and answers together
      const chatPairs = []
      const recordMap = new Map()
      
      // First pass: organize records by base rkey
      records.data.records.forEach(record => {
        const rkey = record.uri.split('/').pop()
        const baseRkey = rkey.replace('-answer', '')
        
        if (!recordMap.has(baseRkey)) {
          recordMap.set(baseRkey, { question: null, answer: null })
        }
        
        if (record.value.type === 'question') {
          recordMap.get(baseRkey).question = record
        } else if (record.value.type === 'answer') {
          recordMap.get(baseRkey).answer = record
        }
      })
      
      // Second pass: create chat pairs
      recordMap.forEach((pair, rkey) => {
        if (pair.question) {
          chatPairs.push({
            rkey,
            question: pair.question,
            answer: pair.answer,
            createdAt: pair.question.value.createdAt
          })
        }
      })
      
      // Sort by creation time (newest first)
      chatPairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      
      setUserChatRecords(chatPairs)
    } catch (error) {
      console.error('Failed to fetch user chat records:', error)
      setUserChatRecords([])
    } finally {
      setUserChatLoading(false)
    }
  }

  // Fetch user chat records when user/agent changes
  useEffect(() => {
    fetchUserChatRecords()
  }, [user, agent])

  // Event listeners for blog communication
  useEffect(() => {
    // Clear OAuth completion flag once app is loaded
    if (sessionStorage.getItem('oauth_just_completed') === 'true') {
      setTimeout(() => {
        sessionStorage.removeItem('oauth_just_completed')
      }, 1000)
    }

    const handleAIQuestion = async (event) => {
      const { question } = event.detail
      if (question && adminData && user && agent) {
        try {
          console.log('Processing AI question:', question)
          
          // AI設定
          const aiConfig = {
            host: import.meta.env.VITE_AI_HOST || 'https://ollama.syui.ai',
            model: import.meta.env.VITE_AI_MODEL || 'gemma3:1b',
            systemPrompt: import.meta.env.VITE_AI_SYSTEM_PROMPT || 'あなたは6歳の女の子アイです。明るく元気で、ちょっとおっちょこちょい。自分のことは「アイ」って呼びます。'
          }

          const prompt = `${aiConfig.systemPrompt}

Question: ${question}

Answer:`

          // Ollamaに直接リクエスト
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)
          
          const response = await fetch(`${aiConfig.host}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'https://syui.ai',
            },
            body: JSON.stringify({
              model: aiConfig.model,
              prompt: prompt,
              stream: false,
              options: {
                temperature: 0.9,
                top_p: 0.9,
                num_predict: 200,
                repeat_penalty: 1.1,
              }
            }),
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`)
          }

          const data = await response.json()
          const answer = data.response || 'エラーが発生しました'
          
          console.log('AI response received:', answer)

          // Save conversation to ATProto
          try {
            const now = new Date()
            const timestamp = now.toISOString()
            const rkey = timestamp.replace(/[:.]/g, '-')
            
            // Extract post metadata from current page
            const currentUrl = window.location.href
            const postSlug = currentUrl.match(/\/posts\/([^/]+)/)?.[1] || ''
            const postTitle = document.title.replace(' - syui.ai', '') || ''
            
            // 1. Save question record
            const questionRecord = {
              $type: 'ai.syui.log.chat',
              post: {
                url: currentUrl,
                slug: postSlug,
                title: postTitle,
                date: timestamp,
                tags: [],
                language: "ja"
              },
              type: "question",
              text: question,
              author: {
                did: user.did,
                handle: user.handle,
                displayName: user.displayName || user.handle,
                avatar: user.avatar
              },
              createdAt: timestamp
            }

            await agent.api.com.atproto.repo.putRecord({
              repo: user.did,
              collection: 'ai.syui.log.chat',
              rkey: rkey,
              record: questionRecord
            })
            
            // 2. Save answer record
            const answerRkey = rkey + '-answer'
            const answerRecord = {
              $type: 'ai.syui.log.chat',
              post: {
                url: currentUrl,
                slug: postSlug,
                title: postTitle,
                date: timestamp,
                tags: [],
                language: "ja"
              },
              type: "answer",
              text: answer,
              author: {
                did: adminData.did,
                handle: adminData.profile?.handle,
                displayName: adminData.profile?.displayName,
                avatar: adminData.profile?.avatar
              },
              createdAt: timestamp
            }

            await agent.api.com.atproto.repo.putRecord({
              repo: user.did,
              collection: 'ai.syui.log.chat',
              rkey: answerRkey,
              record: answerRecord
            })
            
            console.log('Question and answer saved to ATProto')
            
            // Refresh chat records after saving
            setTimeout(() => {
              fetchUserChatRecords()
            }, 1000)
          } catch (saveError) {
            console.error('Failed to save conversation:', saveError)
          }

          // Send response to blog
          window.dispatchEvent(new CustomEvent('aiResponseReceived', {
            detail: {
              question: question,
              answer: answer,
              timestamp: new Date().toISOString(),
              aiProfile: adminData?.profile ? {
                did: adminData.did,
                handle: adminData.profile.handle,
                displayName: adminData.profile.displayName,
                avatar: adminData.profile.avatar
              } : null
            }
          }))
          
        } catch (error) {
          console.error('Failed to process AI question:', error)
          // Send error response to blog
          window.dispatchEvent(new CustomEvent('aiResponseReceived', {
            detail: {
              question: question,
              answer: 'エラーが発生しました。もう一度お試しください。',
              timestamp: new Date().toISOString(),
              aiProfile: adminData?.profile ? {
                did: adminData.did,
                handle: adminData.profile.handle,
                displayName: adminData.profile.displayName,
                avatar: adminData.profile.avatar
              } : null
            }
          }))
        }
      }
    }

    const dispatchAIProfileLoaded = () => {
      if (adminData?.profile) {
        window.dispatchEvent(new CustomEvent('aiProfileLoaded', {
          detail: {
            did: adminData.did,
            handle: adminData.profile.handle,
            displayName: adminData.profile.displayName,
            avatar: adminData.profile.avatar
          }
        }))
      }
    }

    // Listen for questions from blog
    window.addEventListener('postAIQuestion', handleAIQuestion)

    // Dispatch AI profile when adminData is available
    if (adminData?.profile) {
      dispatchAIProfileLoaded()
    }

    return () => {
      window.removeEventListener('postAIQuestion', handleAIQuestion)
    }
  }, [adminData, user, agent])

  // Handle OAuth callback
  if (window.location.search.includes('code=')) {
    return <OAuthCallback />
  }

  const isLoading = authLoading || dataLoading || userLoading

  // Don't show loading if we just completed OAuth callback
  const isOAuthReturn = window.location.pathname === '/oauth/callback' || 
                       sessionStorage.getItem('oauth_just_completed') === 'true'

  if (isLoading && !isOAuthReturn) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        minHeight: '200px',
        padding: '40px',
        textAlign: 'center' 
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #667eea',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <p style={{ color: '#666', margin: 0 }}>読み込み中...</p>
        
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>エラー</h1>
        <div style={{ 
          background: '#fee', 
          color: '#c33', 
          padding: '15px', 
          borderRadius: '5px',
          margin: '20px auto',
          maxWidth: '500px',
          border: '1px solid #fcc'
        }}>
          <p><strong>エラー:</strong> {error}</p>
          {retryCount > 0 && (
            <p><small>自動リトライ中... ({retryCount}/3)</small></p>
          )}
        </div>
        <button 
          onClick={refreshAdminData}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          再読み込み
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="oauth-app-header">
        <div className="oauth-header-content">
          {user && (
            <div className="oauth-user-profile">
              <div className="profile-avatar-section">
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.displayName || user.handle} 
                    className="profile-avatar"
                  />
                ) : (
                  <div className="profile-avatar-fallback">
                    {(user.displayName || user.handle || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="profile-info">
                <div className="profile-display-name">
                  {user.displayName || user.handle}
                </div>
                <div className="profile-handle">
                  @{user.handle}
                </div>
                <div className="profile-did">
                  {user.did}
                </div>
              </div>
            </div>
          )}
          <div className="oauth-header-actions">
            <AuthButton 
              user={user} 
              onLogin={login} 
              onLogout={logout} 
              loading={authLoading}
            />
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="content-area">

          {user && (
            <div className="comment-form">
              <CommentForm
                user={user}
                agent={agent}
                onCommentPosted={() => {
                  refreshAdminData?.()
                  refreshUserData?.()
                }}
              />
            </div>
          )}

          <RecordTabs 
            langRecords={langRecords}
            commentRecords={commentRecords}
            userComments={userComments}
            chatRecords={chatRecords}
            userChatRecords={userChatRecords}
            userChatLoading={userChatLoading}
            baseRecords={adminData.records}
            apiConfig={adminData.apiConfig}
            pageContext={pageContext}
            user={user}
            agent={agent}
            onRecordDeleted={() => {
              refreshAdminData?.()
              refreshUserData?.()
              fetchUserChatRecords?.()
            }}
          />

          {ENABLE_TEST_UI && showTestUI && (
            <div className="test-section">
              <TestUI />
            </div>
          )}

          {ENABLE_TEST_UI && (
            <div className="bottom-actions">
              <button
                onClick={() => setShowTestUI(!showTestUI)}
                className={`btn ${showTestUI ? 'btn-danger' : 'btn-outline'} btn-sm`}
              >
                {showTestUI ? 'close test' : 'test'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}