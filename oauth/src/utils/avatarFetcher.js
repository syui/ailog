import { getPdsFromHandle, getApiConfig } from './pds.js'
import { logger } from './logger.js'

// Avatar取得の状態管理
const avatarCache = new Map()
const CACHE_DURATION = 30 * 60 * 1000 // 30分

// Avatar URLが有効かチェック
async function isAvatarValid(avatarUrl) {
  if (!avatarUrl) return false
  
  try {
    const response = await fetch(avatarUrl, { method: 'HEAD' })
    return response.ok
  } catch (error) {
    logger.warn('Avatar URL check failed:', error)
    return false
  }
}

// handleからDIDを取得
async function getDid(handle) {
  try {
    const pds = await getPdsFromHandle(handle)
    const response = await fetch(`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`)
    const data = await response.json()
    return data.did
  } catch (error) {
    logger.error('Failed to get DID for handle:', handle, error)
    throw error
  }
}

// DIDからプロフィール情報を取得
async function getProfile(did, handle) {
  // Skip test DIDs
  if (did && did.includes('test-')) {
    logger.log('Skipping profile fetch for test DID:', did)
    return null
  }
  
  try {
    // Determine which public API to use based on handle
    const pds = await getPdsFromHandle(handle)
    const apiConfig = getApiConfig(pds)
    
    // Use the appropriate public API endpoint
    const publicApiUrl = apiConfig.bsky
    
    logger.log('Getting profile for DID:', did, 'using public API:', publicApiUrl)
    const response = await fetch(`${publicApiUrl}/xrpc/app.bsky.actor.getProfile?actor=${did}`)
    
    if (!response.ok) {
      throw new Error(`Profile API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    logger.log('Profile data received:', data)
    return data
  } catch (error) {
    logger.error('Failed to get profile for DID:', did, error)
    throw error
  }
}

// 新しいavatar URLを取得
async function fetchFreshAvatar(handle, did) {
  const cacheKey = `${handle}:${did || 'no-did'}`
  const cached = avatarCache.get(cacheKey)
  
  // キャッシュチェック
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.log('Using cached avatar for:', handle)
    return cached.avatar
  }

  try {
    logger.log('Fetching fresh avatar for handle:', handle, 'with DID:', did)
    
    // DIDが不明な場合は取得
    let actualDid = did
    if (!actualDid) {
      logger.log('No DID provided, fetching from handle:', handle)
      actualDid = await getDid(handle)
      logger.log('Got DID from handle:', actualDid)
    }
    
    // プロフィール取得
    const profile = await getProfile(actualDid, handle)
    if (!profile) {
      // Test DID or profile fetch failed
      return null
    }
    
    const avatarUrl = profile.avatar || null
    
    // キャッシュに保存
    avatarCache.set(cacheKey, {
      avatar: avatarUrl,
      timestamp: Date.now(),
      profile: {
        displayName: profile.displayName,
        handle: profile.handle
      }
    })
    
    logger.log('Fresh avatar fetched for:', handle, 'Avatar URL:', avatarUrl)
    return avatarUrl
    
  } catch (error) {
    logger.error('Failed to fetch fresh avatar for:', handle, 'Error:', error)
    return null
  }
}

// メイン関数: avatarを取得（recordから → 新規取得）
export async function getValidAvatar(record) {
  const author = record?.value?.author
  if (!author?.handle) {
    logger.warn('No handle found in record author')
    return null
  }

  const { handle, did, avatar: recordAvatar } = author

  // 1. record内のavatarをチェック
  if (recordAvatar) {
    const isValid = await isAvatarValid(recordAvatar)
    if (isValid) {
      logger.log('Using avatar from record:', recordAvatar)
      return recordAvatar
    } else {
      logger.log('Record avatar is broken, fetching fresh:', recordAvatar)
    }
  }

  // 2. 新しいavatarを取得
  return await fetchFreshAvatar(handle, did)
}

// キャッシュクリア
export function clearAvatarCache() {
  avatarCache.clear()
  logger.log('Avatar cache cleared')
}

// キャッシュ統計
export function getAvatarCacheStats() {
  return {
    size: avatarCache.size,
    entries: Array.from(avatarCache.entries()).map(([key, value]) => ({
      key,
      avatar: value.avatar,
      age: Date.now() - value.timestamp,
      profile: value.profile
    }))
  }
}