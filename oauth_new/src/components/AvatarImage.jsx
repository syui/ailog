import React, { useState, useEffect } from 'react'
import { getValidAvatar } from '../utils/avatarFetcher.js'
import { logger } from '../utils/logger.js'

export default function AvatarImage({ record, size = 40, className = "avatar" }) {
  const [avatarUrl, setAvatarUrl] = useState(record?.value?.author?.avatar)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const author = record?.value?.author
  const handle = author?.handle
  const displayName = author?.displayName || handle

  useEffect(() => {
    // record内のavatarが無い、またはエラーの場合に新しく取得
    if (!avatarUrl || error) {
      fetchValidAvatar()
    }
  }, [record, error])

  const fetchValidAvatar = async () => {
    if (!record || loading) return

    setLoading(true)
    try {
      const validAvatar = await getValidAvatar(record)
      setAvatarUrl(validAvatar)
      setError(false)
    } catch (err) {
      logger.error('Failed to fetch valid avatar:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleImageError = () => {
    setError(true)
    // エラー時に再取得を試行
    fetchValidAvatar()
  }

  const handleImageLoad = () => {
    setError(false)
  }

  // ローディング中のスケルトン
  if (loading) {
    return (
      <div 
        className={`${className} avatar-loading`}
        style={{
          width: size,
          height: size,
          backgroundColor: '#f0f0f0',
          borderRadius: '50%',
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        }}
      />
    )
  }

  // avatar URLがある場合
  if (avatarUrl && !error) {
    return (
      <img 
        src={avatarUrl}
        alt={`${displayName} avatar`}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover'
        }}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    )
  }

  // フォールバック: 初期文字のアバター
  const initial = displayName ? displayName.charAt(0).toUpperCase() : '?'
  return (
    <div 
      className={`${className} avatar-fallback`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#ddd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 'bold',
        color: '#666'
      }}
    >
      {initial}
    </div>
  )
}