// ATProto API client
import { ATProtoError } from '../utils/errorHandler.js'

const ENDPOINTS = {
  describeRepo: 'com.atproto.repo.describeRepo',
  getProfile: 'app.bsky.actor.getProfile',
  listRecords: 'com.atproto.repo.listRecords',
  putRecord: 'com.atproto.repo.putRecord'
}

async function request(url, options = {}) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒タイムアウト
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new ATProtoError(
        `Request failed: ${response.statusText}`,
        response.status,
        { url, method: options.method || 'GET' }
      )
    }
    
    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new ATProtoError(
        'リクエストがタイムアウトしました',
        408,
        { url }
      )
      throw timeoutError
    }
    
    if (error instanceof ATProtoError) {
      throw error
    }
    
    // ネットワークエラーなど
    const networkError = new ATProtoError(
      'ネットワークエラーが発生しました',
      0,
      { url, originalError: error.message }
    )
    throw networkError
  }
}

export const atproto = {
  async getDid(pds, handle) {
    const endpoint = pds.startsWith('http') ? pds : `https://${pds}`
    const res = await request(`${endpoint}/xrpc/${ENDPOINTS.describeRepo}?repo=${handle}`)
    return res.did
  },

  async getProfile(bsky, actor) {
    // Skip test DIDs
    if (actor && actor.includes('test-')) {
      return {
        did: actor,
        handle: 'test.user',
        displayName: 'Test User',
        avatar: null
      }
    }
    
    // Check if endpoint supports getProfile
    let apiEndpoint = bsky
    
    // Allow public.api.bsky.app and bsky.syu.is, redirect other PDS endpoints
    if (!bsky.includes('public.api.bsky.app') && !bsky.includes('bsky.syu.is')) {
      // If it's a PDS endpoint that doesn't support getProfile, redirect to public API
      apiEndpoint = 'https://public.api.bsky.app'
    }
    
    return await request(`${apiEndpoint}/xrpc/${ENDPOINTS.getProfile}?actor=${actor}`)
  },

  async getRecords(pds, repo, collection, limit = 10, cursor = null, reverse = false) {
    let url = `${pds}/xrpc/${ENDPOINTS.listRecords}?repo=${repo}&collection=${collection}&limit=${limit}`
    if (cursor) {
      url += `&cursor=${cursor}`
    }
    if (reverse) {
      url += `&reverse=true`
    }
    const res = await request(url)
    return {
      records: res.records || [],
      cursor: res.cursor || null
    }
  },

  async searchPlc(plc, did) {
    try {
      const data = await request(`${plc}/${did}`)
      return {
        success: true,
        endpoint: data?.service?.[0]?.serviceEndpoint || null,
        handle: data?.alsoKnownAs?.[0]?.replace('at://', '') || null
      }
    } catch {
      return { success: false, endpoint: null, handle: null }
    }
  },

  async putRecord(pds, record, agent) {
    if (!agent) {
      throw new Error('Agent required for putRecord')
    }
    
    // Use Agent's putRecord method instead of direct fetch
    return await agent.com.atproto.repo.putRecord(record)
  }
}

import { dataCache } from '../utils/cache.js'

// Collection specific methods
export const collections = {
  async getBase(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('base', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getLang(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('lang', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.lang`, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getComment(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('comment', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit, null, true) // reverse=true for chronological order
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getChat(pds, repo, collection, limit = 10, cursor = null) {
    // Don't use cache for pagination requests
    if (cursor) {
      const result = await atproto.getRecords(pds, repo, `${collection}.chat`, limit, cursor, true) // reverse=true for chronological order
      return result
    }
    
    const cacheKey = dataCache.generateKey('chat', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) {
      // Ensure cached data has the correct structure
      return Array.isArray(cached) ? { records: cached, cursor: null } : cached
    }
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat`, limit, null, true) // reverse=true for chronological order
    // Cache only the records array for backward compatibility
    dataCache.set(cacheKey, data.records || data)
    return data
  },

  async getUserList(pds, repo, collection, limit = 100) {
    const cacheKey = dataCache.generateKey('userlist', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.user`, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getUserComments(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('usercomments', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getProfiles(pds, repo, collection, limit = 100) {
    const cacheKey = dataCache.generateKey('profiles', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.profile`, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  // 投稿後にキャッシュを無効化
  invalidateCache(collection) {
    dataCache.invalidatePattern(collection)
  }
}