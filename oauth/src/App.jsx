import React, { useState, useEffect } from 'react'
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
  const pageContext = usePageContext()
  const [showAskAI, setShowAskAI] = useState(false)
  const [showTestUI, setShowTestUI] = useState(false)
  
  // Environment-based feature flags
  const ENABLE_TEST_UI = import.meta.env.VITE_ENABLE_TEST_UI === 'true'
  const ENABLE_DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true'

  // Event listeners for blog communication
  useEffect(() => {
    const handleAIQuestion = (event) => {
      const { question } = event.detail
      if (question && adminData && user && agent) {
        // Automatically open Ask AI panel and submit question
        setShowAskAI(true)
        // We'll need to pass this to the AskAI component
        // For now, let's just open the panel
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

  if (isLoading) {
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

          <RecordTabs 
            langRecords={langRecords}
            commentRecords={commentRecords}
            userComments={userComments}
            chatRecords={chatRecords}
            baseRecords={adminData.records}
            apiConfig={adminData.apiConfig}
            pageContext={pageContext}
            user={user}
            agent={agent}
            onRecordDeleted={() => {
              refreshAdminData?.()
              refreshUserData?.()
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