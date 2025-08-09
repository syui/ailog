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

  async getRecords(pds, repo, collection, limit = 10, cursor = null) {
    let url = `${pds}/xrpc/${ENDPOINTS.listRecords}?repo=${repo}&collection=${collection}&limit=${limit}`
    if (cursor) {
      url += `&cursor=${cursor}`
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
  },

  // Find all records for a specific post by paginating through all records
  async findRecordsForPost(pds, repo, collection, targetRkey) {
    let cursor = null
    let allMatchingRecords = []
    let pageCount = 0
    const maxPages = 50 // Safety limit to prevent infinite loops
    
    do {
      pageCount++
      if (pageCount > maxPages) {
        console.warn(`Reached max pages (${maxPages}) while searching for ${targetRkey}`)
        break
      }
      
      const result = await this.getRecords(pds, repo, collection, 100, cursor)
      
      // Filter records that match the target post
      const matchingRecords = result.records.filter(record => {
        const postUrl = record.value?.post?.url
        if (!postUrl) return false
        
        try {
          // Extract rkey from URL
          const recordRkey = new URL(postUrl).pathname.split('/').pop()?.replace(/\.html$/, '')
          return recordRkey === targetRkey
        } catch {
          return false
        }
      })
      
      allMatchingRecords.push(...matchingRecords)
      cursor = result.cursor
      
      // Optional: Stop early if we found some records (uncomment if desired)
      // if (allMatchingRecords.length > 0) break
      
    } while (cursor)
    
    console.log(`Found ${allMatchingRecords.length} records for ${targetRkey} after searching ${pageCount} pages`)
    return allMatchingRecords
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
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit)
    // Extract records array for backward compatibility
    const records = data.records || data
    dataCache.set(cacheKey, records)
    return records
  },

  async getChat(pds, repo, collection, limit = 10, cursor = null) {
    // Don't use cache for pagination requests
    if (cursor) {
      const result = await atproto.getRecords(pds, repo, `${collection}.chat`, limit, cursor)
      return result
    }
    
    const cacheKey = dataCache.generateKey('chat', pds, repo, collection, limit)
    const cached = dataCache.get(cacheKey)
    if (cached) {
      // Ensure cached data has the correct structure
      return Array.isArray(cached) ? { records: cached, cursor: null } : cached
    }
    
    const data = await atproto.getRecords(pds, repo, `${collection}.chat`, limit)
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

  // Find chat records for a specific post using pagination
  async getChatForPost(pds, repo, collection, targetRkey) {
    const cacheKey = dataCache.generateKey('chatForPost', pds, repo, collection, targetRkey)
    const cached = dataCache.get(cacheKey)
    if (cached) return cached
    
    const records = await atproto.findRecordsForPost(pds, repo, `${collection}.chat`, targetRkey)
    
    // Process into chat pairs like the original getChat function
    const chatPairs = []
    const recordMap = new Map()
    
    // First pass: organize records by base rkey
    records.forEach(record => {
      const rkey = record.uri.split('/').pop()
      const baseRkey = rkey.replace('-answer', '')
      
      if (!recordMap.has(baseRkey)) {
        recordMap.set(baseRkey, { question: null, answer: null })
      }
      
      if (record.value.type === 'question') {
        recordMap.get(baseRkey).question = record
      } else if (record.value.type === 'answer') {
        recordMap.get(baseRkey).answer = record
      }
    })
    
    // Second pass: create chat pairs
    recordMap.forEach((pair, rkey) => {
      if (pair.question) {
        chatPairs.push({
          rkey,
          question: pair.question,
          answer: pair.answer,
          createdAt: pair.question.value.createdAt
        })
      }
    })
    
    // Sort by creation time (oldest first) - for chronological conversation flow
    chatPairs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    
    dataCache.set(cacheKey, chatPairs)
    return chatPairs
  },

  // 投稿後にキャッシュを無効化
  invalidateCache(collection) {
    dataCache.invalidatePattern(collection)
  }
}