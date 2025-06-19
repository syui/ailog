import React from 'react'

export default function OAuthCallback() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '50vh',
      padding: '40px',
      textAlign: 'center' 
    }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #667eea',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '20px'
      }} />
      <h2 style={{ color: '#333', marginBottom: '12px' }}>OAuth認証処理中...</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>
        認証が完了しましたら自動で元のページに戻ります
      </p>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}