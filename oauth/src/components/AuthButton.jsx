import React, { useState } from 'react'

export default function AuthButton({ user, onLogin, onLogout, loading }) {
  const [handleInput, setHandleInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!handleInput.trim() || isLoading) return

    setIsLoading(true)
    try {
      await onLogin(handleInput.trim())
    } catch (error) {
      console.error('Login failed:', error)
      alert('ログインに失敗しました: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return <div>認証状態を確認中...</div>
  }

  if (user) {
    return (
      <div className="user-section" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {user.avatar && (
          <img 
            src={user.avatar} 
            alt="Profile" 
            className="user-avatar"
            style={{ width: '24px', height: '24px' }}
          />
        )}
        <div>
          <div className="user-display-name" style={{ fontSize: '14px', fontWeight: '700' }}>
            {user.displayName}
          </div>
          <div className="user-handle" style={{ fontSize: '12px' }}>
            @{user.handle}
          </div>
        </div>
        <button onClick={onLogout} className="btn btn-danger btn-sm">
          ログアウト
        </button>
      </div>
    )
  }

  return (
    <div className="auth-section search-bar-layout">
      <input
        type="text"
        value={handleInput}
        onChange={(e) => setHandleInput(e.target.value)}
        placeholder="your.handle.com"
        disabled={isLoading}
        className="handle-input"
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            handleSubmit(e)
          }
        }}
      />
      <button 
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || !handleInput.trim()}
        className="auth-button"
      >
        {isLoading ? '認証中...' : <i className="fab fa-bluesky"></i>}
      </button>
    </div>
  )
}