import React from 'react'
import { useAuth } from './hooks/useAuth.js'
import { useAdminData } from './hooks/useAdminData.js'
import { useUserData } from './hooks/useUserData.js'
import { usePageContext } from './hooks/usePageContext.js'
import AuthButton from './components/AuthButton.jsx'
import RecordTabs from './components/RecordTabs.jsx'
import CommentForm from './components/CommentForm.jsx'
import OAuthCallback from './components/OAuthCallback.jsx'

export default function App() {
  const { user, agent, loading: authLoading, login, logout } = useAuth()
  const { adminData, langRecords, commentRecords, loading: dataLoading, error, refresh: refreshAdminData } = useAdminData()
  const { userComments, chatRecords, loading: userLoading, refresh: refreshUserData } = useUserData(adminData)
  const pageContext = usePageContext()

  // Handle OAuth callback
  if (window.location.search.includes('code=')) {
    return <OAuthCallback />
  }

  const isLoading = authLoading || dataLoading || userLoading

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>ATProto OAuth Demo</h1>
        <p>読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>ATProto OAuth Demo</h1>
        <p style={{ color: 'red' }}>エラー: {error}</p>
        <button onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1>ATProto OAuth Demo</h1>
        <AuthButton 
          user={user} 
          onLogin={login} 
          onLogout={logout} 
          loading={authLoading}
        />
      </header>

      <CommentForm
        user={user}
        agent={agent}
        onCommentPosted={() => {
          refreshAdminData?.()
          refreshUserData?.()
        }}
      />

      <RecordTabs 
        langRecords={langRecords}
        commentRecords={commentRecords}
        userComments={userComments}
        chatRecords={chatRecords}
        apiConfig={adminData.apiConfig}
        pageContext={pageContext}
      />
    </div>
  )
}