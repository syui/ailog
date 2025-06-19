# Avatar System Usage Examples

This document provides practical examples of how to use the avatar fetching system in your components.

## Basic Usage

### Simple Avatar Display

```jsx
import Avatar from './components/Avatar.jsx'

function UserProfile({ user }) {
  return (
    <div className="user-profile">
      <Avatar
        handle={user.handle}
        did={user.did}
        size={80}
        alt={`${user.displayName}'s avatar`}
      />
      <h3>{user.displayName}</h3>
    </div>
  )
}
```

### Avatar from Record Data

```jsx
function CommentItem({ record }) {
  return (
    <div className="comment">
      <Avatar
        record={record}
        size={40}
        showFallback={true}
      />
      <div className="comment-content">
        <strong>{record.value.author.displayName}</strong>
        <p>{record.value.text}</p>
      </div>
    </div>
  )
}
```

### Avatar with Hover Card

```jsx
import { AvatarWithCard } from './components/Avatar.jsx'

function UserList({ users, apiConfig }) {
  return (
    <div className="user-list">
      {users.map(user => (
        <AvatarWithCard
          key={user.handle}
          handle={user.handle}
          did={user.did}
          displayName={user.displayName}
          apiConfig={apiConfig}
          size={50}
        />
      ))}
    </div>
  )
}
```

## Advanced Usage

### Programmatic Avatar Fetching

```jsx
import { useEffect, useState } from 'react'
import { getAvatar, batchFetchAvatars } from './utils/avatar.js'

function useUserAvatars(users) {
  const [avatars, setAvatars] = useState(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchAvatars() {
      setLoading(true)
      try {
        const avatarMap = await batchFetchAvatars(users)
        setAvatars(avatarMap)
      } catch (error) {
        console.error('Failed to fetch avatars:', error)
      } finally {
        setLoading(false)
      }
    }

    if (users.length > 0) {
      fetchAvatars()
    }
  }, [users])

  return { avatars, loading }
}

// Usage
function TeamDisplay({ team }) {
  const { avatars, loading } = useUserAvatars(team.members)
  
  if (loading) return <div>Loading team...</div>
  
  return (
    <div className="team">
      {team.members.map(member => (
        <img 
          key={member.handle}
          src={avatars.get(member.handle) || '/default-avatar.png'}
          alt={member.displayName}
        />
      ))}
    </div>
  )
}
```

### Force Refresh Avatar

```jsx
import { useState } from 'react'
import Avatar from './components/Avatar.jsx'
import { getAvatar, clearAvatarCache } from './utils/avatar.js'

function RefreshableAvatar({ handle, did }) {
  const [key, setKey] = useState(0)
  
  const handleRefresh = async () => {
    // Clear cache for this user
    clearAvatarCache(handle)
    
    // Force re-render of Avatar component
    setKey(prev => prev + 1)
    
    // Optionally, prefetch fresh avatar
    try {
      await getAvatar({ handle, did, forceFresh: true })
    } catch (error) {
      console.error('Failed to refresh avatar:', error)
    }
  }
  
  return (
    <div className="refreshable-avatar">
      <Avatar 
        key={key}
        handle={handle}
        did={did}
        size={60}
      />
      <button onClick={handleRefresh}>
        Refresh Avatar
      </button>
    </div>
  )
}
```

### Avatar List with Overflow

```jsx
import { AvatarList } from './components/Avatar.jsx'

function ParticipantsList({ participants, maxVisible = 5 }) {
  return (
    <div className="participants">
      <h4>Participants ({participants.length})</h4>
      <AvatarList 
        users={participants}
        maxDisplay={maxVisible}
        size={32}
      />
      {participants.length > maxVisible && (
        <span className="overflow-text">
          and {participants.length - maxVisible} more...
        </span>
      )}
    </div>
  )
}
```

## Error Handling

### Custom Error Handling

```jsx
import { useState } from 'react'
import Avatar from './components/Avatar.jsx'

function RobustAvatar({ handle, did, fallbackSrc }) {
  const [hasError, setHasError] = useState(false)
  
  const handleError = (error) => {
    console.warn(`Avatar failed for ${handle}:`, error)
    setHasError(true)
  }
  
  if (hasError && fallbackSrc) {
    return (
      <img 
        src={fallbackSrc}
        alt="Fallback avatar"
        className="avatar"
        onError={() => setHasError(false)} // Reset on fallback error
      />
    )
  }
  
  return (
    <Avatar
      handle={handle}
      did={did}
      onError={handleError}
      showFallback={!hasError}
    />
  )
}
```

### Loading States

```jsx
import { useState, useEffect } from 'react'
import { getAvatar } from './utils/avatar.js'

function AvatarWithCustomLoading({ handle, did }) {
  const [avatar, setAvatar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    async function loadAvatar() {
      try {
        setLoading(true)
        setError(null)
        const avatarUrl = await getAvatar({ handle, did })
        setAvatar(avatarUrl)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    loadAvatar()
  }, [handle, did])
  
  if (loading) {
    return <div className="avatar-loading-spinner">Loading...</div>
  }
  
  if (error) {
    return <div className="avatar-error">Failed to load avatar</div>
  }
  
  if (!avatar) {
    return <div className="avatar-placeholder">No avatar</div>
  }
  
  return <img src={avatar} alt="Avatar" className="avatar" />
}
```

## Optimization Patterns

### Preloading Strategy

```jsx
import { useEffect } from 'react'
import { prefetchAvatar } from './utils/avatar.js'

function UserCard({ user, isVisible }) {
  // Preload avatar when component becomes visible
  useEffect(() => {
    if (isVisible && user.handle) {
      prefetchAvatar(user.handle)
    }
  }, [isVisible, user.handle])
  
  return (
    <div className="user-card">
      {isVisible && (
        <Avatar handle={user.handle} did={user.did} />
      )}
      <h4>{user.displayName}</h4>
    </div>
  )
}
```

### Lazy Loading with Intersection Observer

```jsx
import { useState, useEffect, useRef } from 'react'
import Avatar from './components/Avatar.jsx'

function LazyAvatar({ handle, did, ...props }) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef()
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    
    if (ref.current) {
      observer.observe(ref.current)
    }
    
    return () => observer.disconnect()
  }, [])
  
  return (
    <div ref={ref}>
      {isVisible ? (
        <Avatar handle={handle} did={did} {...props} />
      ) : (
        <div className="avatar-placeholder" style={{ 
          width: props.size || 40, 
          height: props.size || 40 
        }} />
      )}
    </div>
  )
}
```

## Cache Management

### Cache Statistics Display

```jsx
import { useEffect, useState } from 'react'
import { getAvatarCacheStats, cleanupExpiredAvatars } from './utils/avatarCache.js'

function CacheStatsPanel() {
  const [stats, setStats] = useState(null)
  
  useEffect(() => {
    const updateStats = () => {
      setStats(getAvatarCacheStats())
    }
    
    updateStats()
    const interval = setInterval(updateStats, 5000) // Update every 5 seconds
    
    return () => clearInterval(interval)
  }, [])
  
  const handleCleanup = async () => {
    const cleaned = cleanupExpiredAvatars()
    alert(`Cleaned ${cleaned} expired cache entries`)
    setStats(getAvatarCacheStats())
  }
  
  if (!stats) return null
  
  return (
    <div className="cache-stats">
      <h4>Avatar Cache Stats</h4>
      <p>Cached avatars: {stats.totalCached}</p>
      <p>Cache hit rate: {stats.hitRate}%</p>
      <p>Cache hits: {stats.cacheHits}</p>
      <p>Cache misses: {stats.cacheMisses}</p>
      <button onClick={handleCleanup}>
        Clean Expired Cache
      </button>
    </div>
  )
}
```

## Testing Helpers

### Mock Avatar for Testing

```jsx
// For testing environments
const MockAvatar = ({ handle, size = 40, showFallback = true }) => {
  if (!showFallback) return null
  
  const initial = (handle || 'U')[0].toUpperCase()
  
  return (
    <div 
      className="avatar-mock"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#e1e1e1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        color: '#666'
      }}
    >
      {initial}
    </div>
  )
}

// Use in tests
export default process.env.NODE_ENV === 'test' ? MockAvatar : Avatar
```

These examples demonstrate the flexibility and power of the avatar system while maintaining good performance and user experience practices.