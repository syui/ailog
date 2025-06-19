import React, { useState } from 'react'
import { atproto } from '../api/atproto.js'
import { getPdsFromHandle, getApiConfig } from '../utils/pds.js'

export default function UserLookup() {
  const [handleInput, setHandleInput] = useState('')
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!handleInput.trim() || loading) return

    setLoading(true)
    try {
      const userPds = await getPdsFromHandle(handleInput)
      const apiConfig = getApiConfig(userPds)
      const did = await atproto.getDid(userPds.replace('https://', ''), handleInput)
      const profile = await atproto.getProfile(apiConfig.bsky, did)

      setUserInfo({
        handle: handleInput,
        pds: userPds,
        did,
        profile,
        config: apiConfig
      })
    } catch (error) {
      console.error('User lookup failed:', error)
      setUserInfo({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="user-lookup">
      <h3>ユーザー検索</h3>
      <form onSubmit={handleSubmit}>
        <input 
          type="text" 
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          placeholder="Enter handle (e.g. syui.syui.ai)"
          disabled={loading}
          className="search-input"
        />
        <button 
          type="submit" 
          disabled={loading || !handleInput.trim()}
          className="search-btn"
        >
          {loading ? '検索中...' : '検索'}
        </button>
      </form>
      
      {userInfo && (
        <div className="user-result">
          <h4>ユーザー情報:</h4>
          {userInfo.error ? (
            <div className="error">エラー: {userInfo.error}</div>
          ) : (
            <div className="user-details">
              <div>Handle: {userInfo.handle}</div>
              <div>PDS: {userInfo.pds}</div>
              <div>DID: {userInfo.did}</div>
              <div>Display Name: {userInfo.profile?.displayName}</div>
              <div>PDS API: {userInfo.config?.pds}</div>
              <div>Bsky API: {userInfo.config?.bsky}</div>
              <div>Web: {userInfo.config?.web}</div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .user-lookup {
          margin: 20px 0;
        }
        .search-input {
          width: 200px;
          margin-right: 10px;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
        .search-btn {
          padding: 5px 10px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        .search-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .user-result {
          margin-top: 15px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          background: #f9f9f9;
        }
        .error {
          color: #dc3545;
        }
        .user-details div {
          margin: 5px 0;
        }
      `}</style>
    </section>
  )
}