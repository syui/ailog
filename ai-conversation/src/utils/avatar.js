import React from 'react'
import { atproto } from '../api/atproto.js'
import { getPdsFromHandle, getApiConfig } from './pds.js'
import { dataCache } from './cache.js'
import { logError } from './errorHandler.js'

// Cache duration for avatar URLs (30 minutes)
const AVATAR_CACHE_DURATION = 30 * 60 * 1000

/**
 * Avatar fetching utility with fallback mechanism
 * 
 * Strategy:
 * 1. First check if avatar exists in the record
 * 2. If avatar is missing/broken, fetch fresh data from ATProto
 * 3. Cache results to avoid excessive API calls
 */

/**
 * Extract avatar URL from record if available
 * @param {Object} record - The record object
 * @returns {string|null} Avatar URL or null
 */
function getAvatarFromRecord(record) {
  const avatar = record?.value?.author?.avatar
  if (avatar && typeof avatar === 'string' && avatar.startsWith('http')) {
    return avatar
  }
  return null
}

/**
 * Fetch fresh avatar data from ATProto
 * @param {string} handle - User handle
 * @param {string} did - User DID (optional, will fetch if not provided)
 * @returns {Promise<string|null>} Avatar URL or null
 */
async function fetchFreshAvatar(handle, did = null) {
  try {
    // Step 1: Get PDS from handle
    const pds = await getPdsFromHandle(handle)
    const apiConfig = getApiConfig(pds)
    
    // Step 2: Get DID if not provided
    if (!did) {
      const pdsHost = pds.replace(/^https?:\/\//, '')
      const repoData = await atproto.getDid(pdsHost, handle)
      did = repoData
    }
    
    // Step 3: Get profile from bsky API
    const profile = await atproto.getProfile(apiConfig.bsky, did)
    
    // Return avatar URL
    return profile?.avatar || null
  } catch (error) {
    logError(error, 'Avatar Fetch')
    return null
  }
}

/**
 * Get avatar with intelligent fallback
 * @param {Object} options - Options object
 * @param {Object} options.record - Record object (optional)
 * @param {string} options.handle - User handle (required if no record)
 * @param {string} options.did - User DID (optional)
 * @param {boolean} options.forceFresh - Force fresh fetch even if cached
 * @returns {Promise<string|null>} Avatar URL or null
 */
export async function getAvatar({ record, handle, did, forceFresh = false }) {
  // Extract handle and DID from record if available
  if (record && !handle) {
    handle = record.value?.author?.handle
    did = record.value?.author?.did
  }
  
  if (!handle) {
    throw new Error('Handle is required to fetch avatar')
  }
  
  // Generate cache key
  const cacheKey = `avatar:${handle}`
  
  // Check cache first (unless forceFresh)
  if (!forceFresh) {
    const cached = dataCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }
  
  // Try to get avatar from record first
  if (record) {
    const recordAvatar = getAvatarFromRecord(record)
    if (recordAvatar) {
      // Validate that the avatar URL is still accessible
      try {
        const response = await fetch(recordAvatar, { method: 'HEAD' })
        if (response.ok) {
          dataCache.set(cacheKey, recordAvatar, AVATAR_CACHE_DURATION)
          return recordAvatar
        }
      } catch {
        // Avatar URL is broken, proceed to fetch fresh
      }
    }
  }
  
  // Fetch fresh avatar data
  const freshAvatar = await fetchFreshAvatar(handle, did)
  
  if (freshAvatar) {
    dataCache.set(cacheKey, freshAvatar, AVATAR_CACHE_DURATION)
  }
  
  return freshAvatar
}

/**
 * Batch fetch avatars for multiple users
 * @param {Array<Object>} users - Array of user objects with handle/did
 * @returns {Promise<Map>} Map of handle -> avatar URL
 */
export async function batchFetchAvatars(users) {
  const avatarMap = new Map()
  
  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (user) => {
      const avatar = await getAvatar({
        handle: user.handle,
        did: user.did
      })
      return { handle: user.handle, avatar }
    })
    
    const results = await Promise.all(promises)
    results.forEach(({ handle, avatar }) => {
      avatarMap.set(handle, avatar)
    })
  }
  
  return avatarMap
}

/**
 * Prefetch and cache avatar for a handle
 * @param {string} handle - User handle
 * @returns {Promise<void>}
 */
export async function prefetchAvatar(handle) {
  await getAvatar({ handle })
}

/**
 * Clear avatar cache for a specific handle
 * @param {string} handle - User handle
 */
export function clearAvatarCache(handle) {
  if (handle) {
    dataCache.delete(`avatar:${handle}`)
  }
}

/**
 * Clear all avatar caches
 */
export function clearAllAvatarCaches() {
  dataCache.invalidatePattern('avatar:')
}

/**
 * React hook for avatar management
 * @param {Object} options - Options for avatar fetching
 * @returns {Object} { avatar, loading, error, refetch }
 */
export function useAvatar({ record, handle, did }) {
  const [state, setState] = React.useState({
    avatar: null,
    loading: true,
    error: null
  })
  
  const fetchAvatar = React.useCallback(async (forceFresh = false) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const avatarUrl = await getAvatar({ record, handle, did, forceFresh })
      setState({ avatar: avatarUrl, loading: false, error: null })
    } catch (error) {
      setState({ avatar: null, loading: false, error: error.message })
    }
  }, [record, handle, did])
  
  React.useEffect(() => {
    fetchAvatar()
  }, [fetchAvatar])
  
  return {
    ...state,
    refetch: () => fetchAvatar(true)
  }
}