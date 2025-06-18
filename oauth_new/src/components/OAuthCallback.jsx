import React, { useEffect, useState } from 'react'

export default function OAuthCallback({ onAuthSuccess }) {
  const [status, setStatus] = useState('OAuth認証処理中...')

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    try {
      // BrowserOAuthClientが自動的にコールバックを処理します
      // URLのパラメータを確認して成功を通知
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const error = urlParams.get('error')

      if (error) {
        throw new Error(`OAuth error: ${error}`)
      }

      if (code) {
        setStatus('認証成功！メインページに戻ります...')
        
        // 少し待ってからメインページにリダイレクト
        setTimeout(() => {
          window.location.href = '/'
        }, 1500)
      } else {
        setStatus('認証情報が見つかりません')
      }

    } catch (error) {
      console.error('Callback error:', error)
      setStatus('認証エラー: ' + error.message)
    }
  }

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>OAuth認証</h2>
      <p>{status}</p>
      {status.includes('エラー') && (
        <button onClick={() => window.location.href = '/'}>
          メインページに戻る
        </button>
      )}
    </div>
  )
}