import React, { useState } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const ProfileForm = ({ user, agent, apiConfig, onProfilePosted }) => {
  const [text, setText] = useState('')
  const [type, setType] = useState('user')
  const [handle, setHandle] = useState('')
  const [rkey, setRkey] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!text.trim() || !handle.trim() || !rkey.trim()) {
      setError('すべてのフィールドを入力してください')
      return
    }

    setPosting(true)
    setError('')

    try {
      // Get handle information
      let authorData
      try {
        const handleDid = await atproto.getDid(apiConfig.pds, handle)
        // Use agent to get profile with authentication
        const profileResponse = await agent.api.app.bsky.actor.getProfile({ actor: handleDid })
        authorData = profileResponse.data
      } catch (err) {
        throw new Error('ハンドルが見つかりません')
      }

      // Create record using the same pattern as CommentForm
      const timestamp = new Date().toISOString()
      const record = {
        repo: user.did,
        collection: env.collection,
        rkey: rkey,
        record: {
          $type: env.collection,
          text: text,
          type: 'profile',
          profileType: type, // admin or user
          author: {
            did: authorData.did,
            handle: authorData.handle,
            displayName: authorData.displayName || authorData.handle,
            avatar: authorData.avatar || null
          },
          createdAt: timestamp,
          post: {
            url: window.location.origin,
            date: timestamp,
            slug: '',
            tags: [],
            title: 'Profile',
            language: 'ja'
          }
        }
      }

      // Post the record using agent like CommentForm
      await agent.api.com.atproto.repo.putRecord(record)
      
      // Invalidate cache and refresh
      collections.invalidateCache(env.collection)
      
      // Reset form
      setText('')
      setType('user')
      setHandle('')
      setRkey('')
      
      if (onProfilePosted) {
        onProfilePosted()
      }
      
    } catch (err) {
      logger.error('Failed to create profile:', err)
      setError(err.message || 'プロフィールの作成に失敗しました')
    } finally {
      setPosting(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="profile-form-container">
      <h3>プロフィール投稿</h3>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="handle">ハンドル</label>
            <input
              type="text"
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="例: syui.ai"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="rkey">Rkey</label>
            <input
              type="text"
              id="rkey"
              value={rkey}
              onChange={(e) => setRkey(e.target.value)}
              placeholder="例: syui"
              required
            />
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="type">タイプ</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="text">プロフィールテキスト</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="プロフィールの説明を入力してください"
            rows={4}
            required
          />
        </div>
        
        <button 
          type="submit" 
          disabled={posting || !text.trim() || !handle.trim() || !rkey.trim()}
          className="submit-btn"
        >
          {posting ? '投稿中...' : '投稿'}
        </button>
      </form>
    </div>
  )
}

export default ProfileForm