import { xrpcUrl, comAtprotoIdentity, comAtprotoRepo } from '../lexicons'
import type { AppConfig, Networks, Profile, Post, ListRecordsResponse, ChatMessage, CardCollection } from '../types'

// Fetch with timeout (default 10 seconds)
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

// Cache
let configCache: AppConfig | null = null
let networksCache: Networks | null = null

// Load config.json
export async function getConfig(): Promise<AppConfig> {
  if (configCache) return configCache
  const res = await fetch('/config.json')
  configCache = await res.json()
  return configCache!
}

// Load networks.json
export async function getNetworks(): Promise<Networks> {
  if (networksCache) return networksCache
  const res = await fetch('/networks.json')
  networksCache = await res.json()
  return networksCache!
}

// Resolve handle to DID (try all networks)
export async function resolveHandle(handle: string): Promise<string | null> {
  const networks = await getNetworks()

  // Try each network until one succeeds
  for (const network of Object.values(networks)) {
    try {
      const host = network.bsky.replace('https://', '')
      const url = `${xrpcUrl(host, comAtprotoIdentity.resolveHandle)}?handle=${handle}`
      const res = await fetchWithTimeout(url, {}, 5000)
      if (res.ok) {
        const data = await res.json()
        return data.did
      }
    } catch {
      // Try next network (timeout or error)
    }
  }
  return null
}

// Get PDS endpoint for DID (try all networks)
export async function getPds(did: string): Promise<string | null> {
  const networks = await getNetworks()

  for (const network of Object.values(networks)) {
    try {
      const res = await fetchWithTimeout(`${network.plc}/${did}`, {}, 5000)
      if (res.ok) {
        const didDoc = await res.json()
        const service = didDoc.service?.find((s: { type: string }) => s.type === 'AtprotoPersonalDataServer')
        if (service?.serviceEndpoint) {
          return service.serviceEndpoint
        }
      }
    } catch {
      // Try next network (timeout or error)
    }
  }
  return null
}

// Check if response is JSON
function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type')
  return contentType?.includes('application/json') ?? false
}

// Load local profile
async function getLocalProfile(did: string): Promise<Profile | null> {
  try {
    const res = await fetch(`/content/${did}/app.bsky.actor.profile/self.json`)
    if (res.ok && isJsonResponse(res)) return res.json()
  } catch {
    // Not found
  }
  return null
}

// Load profile (local only for admin, remote for others)
export async function getProfile(did: string, localOnly = false): Promise<Profile | null> {
  // Try local first
  const local = await getLocalProfile(did)
  if (local) return local

  // If local only mode, don't call API
  if (localOnly) return null

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=app.bsky.actor.profile&rkey=self`
    const res = await fetchWithTimeout(url, {}, 8000)
    if (res.ok) return res.json()
  } catch {
    // Failed or timeout
  }
  return null
}

// Get avatar URL (local only for admin, remote for others)
export function getAvatarUrl(did: string, profile: Profile, localOnly = false): string | null {
  if (!profile.value.avatar) return null

  const cid = profile.value.avatar.ref.$link

  // Local mode: use local blob path (sync command downloads this)
  if (localOnly) {
    return `/content/${did}/blob/${cid}`
  }

  // Remote mode: use PDS blob URL (requires getPds call from caller if needed)
  return null
}

// Get avatar URL with PDS lookup (async, for remote users)
export async function getAvatarUrlRemote(did: string, profile: Profile): Promise<string | null> {
  if (!profile.value.avatar) return null

  const pds = await getPds(did)
  if (!pds) return null

  return `${pds}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${profile.value.avatar.ref.$link}`
}

// Load local posts
async function getLocalPosts(did: string, collection: string): Promise<Post[]> {
  try {
    const indexRes = await fetch(`/content/${did}/${collection}/index.json`)
    if (indexRes.ok && isJsonResponse(indexRes)) {
      const rkeys: string[] = await indexRes.json()
      const posts: Post[] = []
      for (const rkey of rkeys) {
        const res = await fetch(`/content/${did}/${collection}/${rkey}.json`)
        if (res.ok && isJsonResponse(res)) posts.push(await res.json())
      }
      return posts.sort((a, b) =>
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      )
    }
  } catch {
    // Not found
  }
  return []
}

// Load posts (local only for admin, remote for others)
export async function getPosts(did: string, collection: string, localOnly = false): Promise<Post[]> {
  // Try local first
  const local = await getLocalPosts(did, collection)
  if (local.length > 0) return local

  // If local only mode, don't call API
  if (localOnly) return []

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return []

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.listRecords)}?repo=${did}&collection=${collection}&limit=100`
    const res = await fetch(url)
    if (res.ok) {
      const data: ListRecordsResponse<Post> = await res.json()
      return data.records.sort((a, b) =>
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      )
    }
  } catch {
    // Failed
  }
  return []
}

// Get single post (local only for admin, remote for others)
export async function getPost(did: string, collection: string, rkey: string, localOnly = false): Promise<Post | null> {
  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/${rkey}.json`)
    if (res.ok && isJsonResponse(res)) return res.json()
  } catch {
    // Not found
  }

  // If local only mode, don't call API
  if (localOnly) return null

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=${rkey}`
    const res = await fetch(url)
    if (res.ok) return res.json()
  } catch {
    // Failed
  }
  return null
}

// Describe repo - get collections list
export async function describeRepo(did: string): Promise<string[]> {
  // Try local first
  try {
    const res = await fetch(`/content/${did}/describe.json`)
    if (res.ok && isJsonResponse(res)) {
      const data = await res.json()
      return data.collections || []
    }
  } catch {
    // Not found
  }

  // Remote
  const pds = await getPds(did)
  if (!pds) return []

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.describeRepo)}?repo=${did}`
    const res = await fetchWithTimeout(url, {}, 8000)
    if (res.ok) {
      const data = await res.json()
      return data.collections || []
    }
  } catch {
    // Failed or timeout
  }
  return []
}

// List records from any collection
export async function listRecords(did: string, collection: string, limit = 50): Promise<{ uri: string; cid: string; value: unknown }[]> {
  const pds = await getPds(did)
  if (!pds) return []

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.listRecords)}?repo=${did}&collection=${collection}&limit=${limit}`
    const res = await fetchWithTimeout(url, {}, 8000)
    if (res.ok) {
      const data = await res.json()
      return data.records || []
    }
  } catch {
    // Failed or timeout
  }
  return []
}

// Get single record from any collection
export async function getRecord(did: string, collection: string, rkey: string): Promise<{ uri: string; cid: string; value: unknown } | null> {
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=${rkey}`
    const res = await fetchWithTimeout(url, {}, 8000)
    if (res.ok) return res.json()
  } catch {
    // Failed or timeout
  }
  return null
}

// Constants for search
const SEARCH_TIMEOUT_MS = 5000

// Get current network config
export async function getCurrentNetwork(): Promise<{ plc: string; bsky: string; web: string }> {
  const config = await getConfig()
  const networks = await getNetworks()
  const networkKey = config.network || 'bsky.social'
  const network = networks[networkKey]
  return {
    plc: network?.plc || 'https://plc.directory',
    bsky: network?.bsky || 'https://public.api.bsky.app',
    web: network?.web || 'https://bsky.app'
  }
}

// Get search endpoint for current network
async function getSearchEndpoint(): Promise<string> {
  const network = await getCurrentNetwork()
  return network.bsky
}

// Search posts that link to a URL
export async function searchPostsForUrl(url: string): Promise<SearchPost[]> {
  // Use current network's endpoint for search
  const endpoint = await getSearchEndpoint()

  // Extract search-friendly patterns from URL
  // Note: Search API doesn't index paths well, so search by domain and filter client-side
  const searchQueries: string[] = []

  try {
    const urlObj = new URL(url)
    // Search by domain only (paths with / don't return results)
    searchQueries.push(urlObj.host)
  } catch {
    searchQueries.push(url)
  }

  const allPosts: SearchPost[] = []
  const seenUris = new Set<string>()

  for (const query of searchQueries) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

      const res = await fetch(
        `${endpoint}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=20`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)

      if (!res.ok) continue

      const data = await res.json()
      const posts = (data.posts || []).filter((post: SearchPost) => {
        const embedUri = (post.record as { embed?: { external?: { uri?: string } } })?.embed?.external?.uri
        const text = (post.record as { text?: string })?.text || ''
        return embedUri === url || text.includes(url) || embedUri?.includes(url.replace(/\/$/, ''))
      })

      for (const post of posts) {
        if (!seenUris.has(post.uri)) {
          seenUris.add(post.uri)
          allPosts.push(post)
        }
      }
    } catch {
      // Timeout or network error
    }
  }

  // Sort by date (newest first)
  allPosts.sort((a, b) => {
    const aDate = (a.record as { createdAt?: string })?.createdAt || ''
    const bDate = (b.record as { createdAt?: string })?.createdAt || ''
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })

  return allPosts
}

// Search post type
export interface SearchPost {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  record: unknown
}

// Load chat messages from both user and bot repos
export async function getChatMessages(
  userDid: string,
  botDid: string,
  collection: string = 'ai.syui.log.chat'
): Promise<ChatMessage[]> {
  // Load messages for a single DID
  async function loadForDid(did: string): Promise<ChatMessage[]> {
    // Try local first
    try {
      const res = await fetch(`/content/${did}/${collection}/index.json`)
      if (res.ok && isJsonResponse(res)) {
        const rkeys: string[] = await res.json()
        // Load all messages in parallel
        const msgPromises = rkeys.map(async (rkey) => {
          const msgRes = await fetch(`/content/${did}/${collection}/${rkey}.json`)
          if (msgRes.ok && isJsonResponse(msgRes)) {
            return msgRes.json() as Promise<ChatMessage>
          }
          return null
        })
        const results = await Promise.all(msgPromises)
        return results.filter((m): m is ChatMessage => m !== null)
      }
    } catch {
      // Try remote
    }

    // Remote fallback
    const pds = await getPds(did)
    if (!pds) return []

    try {
      const host = pds.replace('https://', '')
      const url = `${xrpcUrl(host, comAtprotoRepo.listRecords)}?repo=${did}&collection=${collection}&limit=100`
      const res = await fetch(url)
      if (res.ok) {
        const data: ListRecordsResponse<ChatMessage> = await res.json()
        return data.records
      }
    } catch {
      // Failed
    }
    return []
  }

  // Load from both DIDs in parallel
  const [userMessages, botMessages] = await Promise.all([
    loadForDid(userDid),
    loadForDid(botDid)
  ])

  const messages = [...userMessages, ...botMessages]

  // Sort by createdAt
  return messages.sort((a, b) =>
    new Date(a.value.createdAt).getTime() - new Date(b.value.createdAt).getTime()
  )
}

// ============================================
// api.syui.ai migration functions
// ============================================

const API_SYUI_AI = 'https://api.syui.ai'

// Old API user type
export interface OldApiUser {
  id: number
  username: string
  did: string
  member: boolean
  book: boolean
  manga: boolean
  badge: boolean
  bsky: boolean
  mastodon: boolean
  delete: boolean
  handle: boolean
  created_at: string
  updated_at: string
  raid_at: string
  server_at: string
  egg_at: string
  luck: number
  luck_at: string
  like: number
  like_rank: number
  like_at: string
  fav: number
  ten: boolean
  ten_su: number
  ten_kai: number
  aiten: number
  ten_card: string
  ten_delete: string
  ten_post: string
  ten_get: string
  ten_at: string
  next: string
  room: number
  model: boolean
  model_at: string
  model_attack: number
  model_limit: number
  model_skill: number
  model_mode: number
  model_critical: number
  model_critical_d: number
  game: boolean
  game_test: boolean
  game_end: boolean
  game_account: boolean
  game_lv: number
  game_exp: number
  game_story: number
  game_limit: boolean
  coin: number
  coin_open: boolean
  coin_at: string
  planet: number
  planet_at: string
  login: boolean
  login_at: string
  location_x: number
  location_y: number
  location_z: number
  location_n: number
}

// Old API card type
export interface OldApiCard {
  id: number
  card: number
  skill: string
  status: string
  cp: number
  url: string
  count: number
  author: string
  created_at: string
}

// Check if user exists in api.syui.ai by DID
export async function getOldApiUserByDid(did: string): Promise<OldApiUser | null> {
  try {
    const res = await fetch(`${API_SYUI_AI}/users?itemsPerPage=2500`)
    if (!res.ok) return null
    const users: OldApiUser[] = await res.json()
    return users.find(u => u.did === did) || null
  } catch {
    return null
  }
}

// Get user's cards from api.syui.ai
export async function getOldApiCards(userId: number): Promise<OldApiCard[]> {
  try {
    const res = await fetch(`${API_SYUI_AI}/users/${userId}/card?itemsPerPage=5000`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

// Check if ai.syui.card.old record exists and return the rkey
export async function getCardOldRecordKey(did: string): Promise<string | null> {
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.listRecords)}?repo=${did}&collection=ai.syui.card.old&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.records && data.records.length > 0) {
      // Extract rkey from URI: at://did/collection/rkey
      const uri = data.records[0].uri as string
      const rkey = uri.split('/').pop()
      return rkey || null
    }
    return null
  } catch {
    return null
  }
}

// Check if ai.syui.card.old record exists
export async function hasCardOldRecord(did: string): Promise<boolean> {
  const rkey = await getCardOldRecordKey(did)
  return rkey !== null
}

// Generate checksum for verification
export function generateChecksum(user: OldApiUser, cards: OldApiCard[]): string {
  const sum = user.id + user.aiten + user.fav + cards.reduce((acc, c) => acc + c.id + c.cp + c.card, 0)
  return btoa(String(sum))
}

// Get user's card collection (ai.syui.card.user)
export async function getCards(
  did: string,
  collection: string = 'ai.syui.card.user'
): Promise<CardCollection | null> {
  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/self.json`)
    if (res.ok && isJsonResponse(res)) {
      const record = await res.json()
      return record.value as CardCollection
    }
  } catch {
    // Try remote
  }

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=self`
    const res = await fetch(url)
    if (res.ok) {
      const record = await res.json()
      return record.value as CardCollection
    }
  } catch {
    // Failed
  }
  return null
}

// RSE collection type
export interface RseItem {
  id: number
  cp: number
  mode: number
  shiny: boolean
  unique: boolean
}

export interface RseCollection {
  item: RseItem[]
  character: RseItem[]
  createdAt: string
  updatedAt: string
}

// Get user's RSE collection (ai.syui.rse.user)
export async function getRse(did: string): Promise<RseCollection | null> {
  const collection = 'ai.syui.rse.user'

  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/self.json`)
    if (res.ok && isJsonResponse(res)) {
      const record = await res.json()
      return record.value as RseCollection
    }
  } catch {
    // Try remote
  }

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=self`
    const res = await fetch(url)
    if (res.ok) {
      const record = await res.json()
      return record.value as RseCollection
    }
  } catch {
    // Failed
  }
  return null
}

// Link item type
export interface LinkItem {
  service: 'github' | 'youtube' | 'x'
  username: string
}

// Link collection type
export interface LinkCollection {
  links: LinkItem[]
  createdAt: string
  updatedAt?: string
}

// Card admin data types
export interface CardAdminEntry {
  id: number
  character: number
  name: { ja: string; en: string }
  text: { ja: string; en: string }
  cp: string
  effect: string
  key?: string | null
}

export interface CardAdminData {
  gacha: { pickup: number; rate: { rare: number; pickup: number } }
  card: CardAdminEntry[]
}

// Get card admin data (ai.syui.card.admin)
export async function getCardAdmin(did: string): Promise<CardAdminData | null> {
  const collection = 'ai.syui.card.admin'

  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/self.json`)
    if (res.ok && isJsonResponse(res)) {
      const record = await res.json()
      return record.value as CardAdminData
    }
  } catch {
    // Try remote
  }

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=self`
    const res = await fetch(url)
    if (res.ok) {
      const record = await res.json()
      return record.value as CardAdminData
    }
  } catch {
    // Failed
  }
  return null
}

// RSE admin data types
export interface RseAdminItem {
  id: number
  name: string
  text: { ja: string; en: string }
}

export interface RseAdminData {
  item: RseAdminItem[]
  ability: unknown[]
  character: unknown[]
  system: unknown[]
  collection: unknown[]
  createdAt: string
  updatedAt: string
}

// Get RSE admin data (ai.syui.rse.admin)
export async function getRseAdmin(did: string): Promise<RseAdminData | null> {
  const collection = 'ai.syui.rse.admin'

  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/self.json`)
    if (res.ok && isJsonResponse(res)) {
      const record = await res.json()
      return record.value as RseAdminData
    }
  } catch {
    // Try remote
  }

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=self`
    const res = await fetch(url)
    if (res.ok) {
      const record = await res.json()
      return record.value as RseAdminData
    }
  } catch {
    // Failed
  }
  return null
}

// Get user's links (ai.syui.at.link)
export async function getLinks(did: string): Promise<LinkCollection | null> {
  const collection = 'ai.syui.at.link'

  // Try local first
  try {
    const res = await fetch(`/content/${did}/${collection}/self.json`)
    if (res.ok && isJsonResponse(res)) {
      const record = await res.json()
      return record.value as LinkCollection
    }
  } catch {
    // Try remote
  }

  // Remote fallback
  const pds = await getPds(did)
  if (!pds) return null

  try {
    const host = pds.replace('https://', '')
    const url = `${xrpcUrl(host, comAtprotoRepo.getRecord)}?repo=${did}&collection=${collection}&rkey=self`
    const res = await fetch(url)
    if (res.ok) {
      const record = await res.json()
      return record.value as LinkCollection
    }
  } catch {
    // Failed
  }
  return null
}
