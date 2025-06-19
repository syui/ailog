import React, { useState, useEffect } from 'react'
import { getAvatar } from '../utils/avatar.js'

/**
 * Avatar component with intelligent fallback
 * 
 * @param {Object} props
 * @param {Object} props.record - Record object containing avatar data
 * @param {string} props.handle - User handle
 * @param {string} props.did - User DID
 * @param {string} props.alt - Alt text for image
 * @param {string} props.className - CSS class name
 * @param {number} props.size - Avatar size in pixels
 * @param {boolean} props.showFallback - Show fallback UI if no avatar
 * @param {Function} props.onLoad - Callback when avatar loads
 * @param {Function} props.onError - Callback when avatar fails to load
 */
export default function Avatar({ 
  record, 
  handle, 
  did, 
  alt = 'avatar',
  className = 'avatar',
  size = 40,
  showFallback = true,
  onLoad,
  onError
}) {
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAvatar() {
      try {
        setLoading(true)
        setError(null)
        setImageError(false)

        const url = await getAvatar({ record, handle, did })
        
        if (!cancelled) {
          setAvatarUrl(url)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
          if (onError) onError(err)
        }
      }
    }

    loadAvatar()

    return () => {
      cancelled = true
    }
  }, [record, handle, did])

  const handleImageError = async () => {
    setImageError(true)
    if (onError) onError(new Error('Image failed to load'))
    
    // Try to fetch fresh avatar if the current one failed
    if (!loading && avatarUrl) {
      try {
        const freshUrl = await getAvatar({ handle, did, forceFresh: true })
        if (freshUrl && freshUrl !== avatarUrl) {
          setAvatarUrl(freshUrl)
          setImageError(false)
        }
      } catch {
        // Ignore errors in retry
      }
    }
  }

  const handleImageLoad = () => {
    setImageError(false)
    if (onLoad) onLoad()
  }

  // Determine what to render
  if (loading) {
    return (
      <div 
        className={`${className} avatar-loading`}
        style={{ width: size, height: size }}
        aria-label="Loading avatar..."
      />
    )
  }

  if (error || !avatarUrl || imageError) {
    if (!showFallback) return null
    
    // Fallback avatar
    const initial = (handle || 'U')[0].toUpperCase()
    return (
      <div 
        className={`${className} avatar-fallback`}
        style={{ 
          width: size, 
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#e1e1e1',
          borderRadius: '50%',
          fontSize: size * 0.4
        }}
        aria-label={alt}
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      src={avatarUrl}
      alt={alt}
      className={className}
      style={{ width: size, height: size }}
      onError={handleImageError}
      onLoad={handleImageLoad}
      loading="lazy"
    />
  )
}

/**
 * Avatar with hover card showing user info
 */
export function AvatarWithCard({ 
  record, 
  handle, 
  did,
  displayName,
  apiConfig,
  ...avatarProps 
}) {
  const [showCard, setShowCard] = useState(false)
  
  return (
    <div 
      className="avatar-container"
      onMouseEnter={() => setShowCard(true)}
      onMouseLeave={() => setShowCard(false)}
    >
      <Avatar 
        record={record}
        handle={handle}
        did={did}
        {...avatarProps}
      />
      
      {showCard && (
        <div className="avatar-card">
          <Avatar 
            record={record}
            handle={handle}
            did={did}
            size={80}
            className="avatar-card-image"
          />
          <div className="avatar-card-info">
            <div className="avatar-card-name">{displayName || handle}</div>
            <a 
              href={`${apiConfig?.web || 'https://bsky.app'}/profile/${did || handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="avatar-card-handle"
            >
              @{handle}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Avatar list component for displaying multiple avatars
 */
export function AvatarList({ users, maxDisplay = 5, size = 30 }) {
  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = Math.max(0, users.length - maxDisplay)
  
  return (
    <div className="avatar-list">
      {displayUsers.map((user, index) => (
        <div 
          key={user.handle || index} 
          className="avatar-list-item"
          style={{ marginLeft: index > 0 ? -10 : 0, zIndex: displayUsers.length - index }}
        >
          <Avatar
            handle={user.handle}
            did={user.did}
            record={user.record}
            size={size}
            showFallback={true}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div 
          className="avatar-list-more"
          style={{ 
            width: size, 
            height: size,
            marginLeft: -10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#666',
            color: '#fff',
            borderRadius: '50%',
            fontSize: size * 0.4
          }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  )
}