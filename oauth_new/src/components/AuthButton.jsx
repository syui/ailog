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
      <div className="auth-status">
        <div>ログイン中: <strong>{user.handle}</strong></div>
        <button onClick={onLogout} className="logout-btn">
          ログアウト
        </button>
        <style jsx>{`
          .auth-status {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background: #f9f9f9;
          }
          .logout-btn {
            margin-top: 5px;
            padding: 5px 10px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="auth-form">
      <h3>OAuth認証</h3>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          placeholder="Handle (e.g. your.handle.com)"
          disabled={isLoading}
          className="handle-input"
        />
        <button 
          type="submit" 
          disabled={isLoading || !handleInput.trim()}
          className="login-btn"
        >
          {isLoading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
      <style jsx>{`
        .auth-form {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
        }
        .handle-input {
          width: 200px;
          margin-right: 10px;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
        .login-btn {
          padding: 5px 10px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        .login-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}