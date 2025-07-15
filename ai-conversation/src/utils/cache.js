import { logger } from './logger.js'

class SimpleCache {
  constructor(ttl = 30000) { // 30秒TTL
    this.cache = new Map()
    this.ttl = ttl
  }

  generateKey(...parts) {
    return parts.filter(Boolean).join(':')
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    
    logger.log(`Cache hit: ${key}`)
    return item.data
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
    logger.log(`Cache set: ${key}`)
  }

  clear() {
    this.cache.clear()
    logger.log('Cache cleared')
  }

  invalidatePattern(pattern) {
    let deletedCount = 0
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        deletedCount++
      }
    }
    logger.log(`Cache invalidated: ${pattern} (${deletedCount} items)`)
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

export const dataCache = new SimpleCache()

// デバッグ用：開発環境でのみグローバルからアクセス可能にする
if (import.meta.env.DEV) {
  window.dataCache = dataCache
}