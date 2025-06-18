// ATProto API client
const ENDPOINTS = {
  describeRepo: 'com.atproto.repo.describeRepo',
  getProfile: 'app.bsky.actor.getProfile',
  listRecords: 'com.atproto.repo.listRecords',
  putRecord: 'com.atproto.repo.putRecord'
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.json()
}

export const atproto = {
  async getDid(pds, handle) {
    const res = await request(`https://${pds}/xrpc/${ENDPOINTS.describeRepo}?repo=${handle}`)
    return res.did
  },

  async getProfile(bsky, actor) {
    return await request(`${bsky}/xrpc/${ENDPOINTS.getProfile}?actor=${actor}`)
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

// Collection specific methods
export const collections = {
  async getBase(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, collection, limit)
  },

  async getLang(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, `${collection}.chat.lang`, limit)
  },

  async getComment(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, `${collection}.chat.comment`, limit)
  },

  async getChat(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, `${collection}.chat`, limit)
  },

  async getUserList(pds, repo, collection, limit = 100) {
    return await atproto.getRecords(pds, repo, `${collection}.user`, limit)
  },

  async getUserComments(pds, repo, collection, limit = 10) {
    return await atproto.getRecords(pds, repo, collection, limit)
  }
}