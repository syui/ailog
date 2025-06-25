// ATProto API client
import { ATProtoError, logError } from '../utils/errorHandler.js'

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
      logError(timeoutError, 'Request Timeout')
      throw timeoutError
    }
    
    if (error instanceof ATProtoError) {
      logError(error, 'API Request')
      throw error
    }
    
    // ネットワークエラーなど
    const networkError = new ATProtoError(
      'ネットワークエラーが発生しました',
      0,
      { url, originalError: error.message }
    )
    logError(networkError, 'Network Error')
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
      console.log('Skipping profile fetch for test DID:', actor)
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
      console.warn(`getProfile called with PDS endpoint ${bsky}, redirecting to public API`)
      apiEndpoint = 'https://public.api.bsky.app'
    }
    
    return await request(`${apiEndpoint}/xrpc/${ENDPOINTS.getProfile}?actor=${actor}`)
  },

  async getRecords(pds, repo, collection, limit = 10) {
    const res = await request(`${pds}/xrpc/${ENDPOINTS.listRecords}?repo=${repo}&collection=${collection}&limit=${limit}`)
    return res.records || []
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
    dataCache.set(cacheKey, data)
    return data
  },

  async getLang(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('lang', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.lang`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getComment(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('comment', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getChat(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('chat', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getUserList(pds, repo, collection, limit = 100) {
    const cacheKey = dataCache.generateKey('userlist', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.user`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getUserComments(pds, repo, collection, limit = 10) {
    const cacheKey = dataCache.generateKey('usercomments', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, collection, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  async getProfiles(pds, repo, collection, limit = 100) {
    const cacheKey = dataCache.generateKey('profiles', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const data = await atproto.getRecords(pds, repo, `${collection}.profile`, limit)
    dataCache.set(cacheKey, data)
    return data
  },

  // 投稿後にキャッシュを無効化
  invalidateCache(collection) {
    dataCache.invalidatePattern(collection)
  }
}