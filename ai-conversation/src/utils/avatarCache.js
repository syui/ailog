import { dataCache } from './cache.js'

/**
 * Avatar-specific cache utilities
 * Extends the base cache system with avatar-specific functionality
 */

// Cache keys
const CACHE_PREFIX = 'avatar:'
const METADATA_KEY = 'avatar:metadata'

/**
 * Get cache metadata for avatars
 * @returns {Object} Metadata about avatar cache
 */
export function getAvatarCacheMetadata() {
  return dataCache.get(METADATA_KEY) || {
    totalCount: 0,
    lastCleanup: Date.now(),
    cacheHits: 0,
    cacheMisses: 0
  }
}

/**
 * Update cache metadata
 * @param {Object} updates - Updates to apply to metadata
 */
function updateMetadata(updates) {
  const current = getAvatarCacheMetadata()
  const updated = { ...current, ...updates }
  dataCache.set(METADATA_KEY, updated)
}

/**
 * Track cache hit
 */
export function trackCacheHit() {
  const metadata = getAvatarCacheMetadata()
  updateMetadata({ cacheHits: metadata.cacheHits + 1 })
}

/**
 * Track cache miss
 */
export function trackCacheMiss() {
  const metadata = getAvatarCacheMetadata()
  updateMetadata({ cacheMisses: metadata.cacheMisses + 1 })
}

/**
 * Get all cached avatar handles
 * @returns {Array<string>} List of cached handles
 */
export function getCachedAvatarHandles() {
  // This would require enumerating cache keys
  // For now, we'll track this in metadata
  const metadata = getAvatarCacheMetadata()
  return metadata.handles || []
}

/**
 * Add handle to cached list
 * @param {string} handle - Handle to add
 */
export function addCachedHandle(handle) {
  const metadata = getAvatarCacheMetadata()
  const handles = metadata.handles || []
  if (!handles.includes(handle)) {
    handles.push(handle)
    updateMetadata({ 
      handles,
      totalCount: handles.length
    })
  }
}

/**
 * Remove handle from cached list
 * @param {string} handle - Handle to remove
 */
export function removeCachedHandle(handle) {
  const metadata = getAvatarCacheMetadata()
  const handles = (metadata.handles || []).filter(h => h !== handle)
  updateMetadata({ 
    handles,
    totalCount: handles.length
  })
}

/**
 * Clean up expired avatar cache entries
 * @param {number} maxAge - Maximum age in milliseconds (default: 30 minutes)
 * @returns {number} Number of entries cleaned
 */
export function cleanupExpiredAvatars(maxAge = 30 * 60 * 1000) {
  const now = Date.now()
  const metadata = getAvatarCacheMetadata()
  const handles = metadata.handles || []
  let cleanedCount = 0

  handles.forEach(handle => {
    const cacheKey = `${CACHE_PREFIX}${handle}`
    const entry = dataCache.get(cacheKey, true) // Get with metadata
    
    if (entry && entry.timestamp && (now - entry.timestamp) > maxAge) {
      dataCache.delete(cacheKey)
      cleanedCount++
    }
  })

  // Update metadata
  if (cleanedCount > 0) {
    const remainingHandles = handles.filter(handle => {
      const cacheKey = `${CACHE_PREFIX}${handle}`
      return dataCache.get(cacheKey) !== null
    })
    
    updateMetadata({
      handles: remainingHandles,
      totalCount: remainingHandles.length,
      lastCleanup: now
    })
  }

  return cleanedCount
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export function getAvatarCacheStats() {
  const metadata = getAvatarCacheMetadata()
  const totalRequests = metadata.cacheHits + metadata.cacheMisses
  const hitRate = totalRequests > 0 ? (metadata.cacheHits / totalRequests * 100) : 0

  return {
    totalCached: metadata.totalCount || 0,
    cacheHits: metadata.cacheHits || 0,
    cacheMisses: metadata.cacheMisses || 0,
    hitRate: Math.round(hitRate * 100) / 100,
    lastCleanup: metadata.lastCleanup ? new Date(metadata.lastCleanup) : null
  }
}

/**
 * Clear all avatar cache data
 * @returns {number} Number of entries cleared
 */
export function clearAllAvatarCache() {
  const metadata = getAvatarCacheMetadata()
  const handles = metadata.handles || []
  
  handles.forEach(handle => {
    const cacheKey = `${CACHE_PREFIX}${handle}`
    dataCache.delete(cacheKey)
  })

  // Clear metadata
  dataCache.delete(METADATA_KEY)
  
  return handles.length
}

/**
 * Preload avatars for a list of handles
 * @param {Array<string>} handles - Handles to preload
 * @param {Function} getAvatar - Avatar fetching function
 * @returns {Promise<Map>} Map of handle -> avatar URL results
 */
export async function preloadAvatars(handles, getAvatar) {
  const results = new Map()
  const BATCH_SIZE = 3 // Smaller batch for preloading

  for (let i = 0; i < handles.length; i += BATCH_SIZE) {
    const batch = handles.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (handle) => {
      try {
        const avatar = await getAvatar({ handle })
        return { handle, avatar, success: true }
      } catch (error) {
        return { handle, avatar: null, success: false, error: error.message }
      }
    })

    const batchResults = await Promise.all(promises)
    batchResults.forEach(({ handle, avatar, success }) => {
      results.set(handle, { avatar, success })
      if (success) {
        addCachedHandle(handle)
      }
    })

    // Small delay between batches to avoid overwhelming the API
    if (i + BATCH_SIZE < handles.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

/**
 * Validate cached avatar URLs
 * Check if cached avatar URLs are still valid
 * @param {number} sampleSize - Number of cached avatars to validate (default: 5)
 * @returns {Promise<Object>} Validation results
 */
export async function validateCachedAvatars(sampleSize = 5) {
  const metadata = getAvatarCacheMetadata()
  const handles = metadata.handles || []
  
  if (handles.length === 0) {
    return { validCount: 0, invalidCount: 0, totalChecked: 0 }
  }

  // Sample random handles to check
  const samplesToCheck = handles
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize)

  let validCount = 0
  let invalidCount = 0

  for (const handle of samplesToCheck) {
    const cacheKey = `${CACHE_PREFIX}${handle}`
    const avatarUrl = dataCache.get(cacheKey)
    
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http')) {
      try {
        const response = await fetch(avatarUrl, { method: 'HEAD' })
        if (response.ok) {
          validCount++
        } else {
          invalidCount++
          // Remove invalid cached avatar
          dataCache.delete(cacheKey)
          removeCachedHandle(handle)
        }
      } catch {
        invalidCount++
        // Remove invalid cached avatar
        dataCache.delete(cacheKey)
        removeCachedHandle(handle)
      }
    } else {
      invalidCount++
      // Remove invalid cache entry
      dataCache.delete(cacheKey)
      removeCachedHandle(handle)
    }
  }

  return {
    validCount,
    invalidCount,
    totalChecked: samplesToCheck.length,
    validationRate: samplesToCheck.length > 0 ? 
      Math.round((validCount / samplesToCheck.length) * 100) : 0
  }
}