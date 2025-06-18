import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { Agent } from '@atproto/api'
import { env } from '../config/env.js'
import { isSyuIsHandle } from '../utils/pds.js'

export class OAuthService {
  constructor() {
    this.clientId = env.oauth.clientId || this.getClientId()
    this.clients = { bsky: null, syu: null }
    this.agent = null
    this.sessionInfo = null
    this.initPromise = null
  }

  getClientId() {
    const origin = window.location.origin
    return origin.includes('localhost') || origin.includes('127.0.0.1')
      ? undefined // Loopback client
      : `${origin}/client-metadata.json`
  }

  async initialize() {
    if (this.initPromise) return this.initPromise
    
    this.initPromise = this._initialize()
    return this.initPromise
  }

  async _initialize() {
    try {
      // Initialize OAuth clients
      this.clients.bsky = await BrowserOAuthClient.load({
        clientId: this.clientId,
        handleResolver: 'https://bsky.social',
        plcDirectoryUrl: 'https://plc.directory',
      })

      this.clients.syu = await BrowserOAuthClient.load({
        clientId: this.clientId,
        handleResolver: 'https://syu.is',
        plcDirectoryUrl: 'https://plc.syu.is',
      })

      // Try to restore session
      return await this.restoreSession()
    } catch (error) {
      console.error('OAuth initialization failed:', error)
      this.initPromise = null
      throw error
    }
  }

  async restoreSession() {
    // Try both clients
    for (const client of [this.clients.bsky, this.clients.syu]) {
      const result = await client.init()
      if (result?.session) {
        this.agent = new Agent(result.session)
        return this.processSession(result.session)
      }
    }
    return null
  }

  async processSession(session) {
    const did = session.sub || session.did
    let handle = session.handle || 'unknown'

    this.sessionInfo = { did, handle }

    // Resolve handle if missing
    if (handle === 'unknown' && this.agent) {
      try {
        const profile = await this.agent.getProfile({ actor: did })
        handle = profile.data.handle
        this.sessionInfo.handle = handle
      } catch (error) {
        console.log('Failed to resolve handle:', error)
      }
    }

    return { did, handle }
  }

  async login(handle) {
    await this.initialize()

    const client = isSyuIsHandle(handle) ? this.clients.syu : this.clients.bsky
    const authUrl = await client.authorize(handle, { scope: 'atproto' })
    
    window.location.href = authUrl.toString()
  }

  async checkAuth() {
    try {
      await this.initialize()
      if (this.sessionInfo) {
        return {
          user: this.sessionInfo,
          agent: this.agent
        }
      }
      return null
    } catch (error) {
      console.error('Auth check failed:', error)
      return null
    }
  }

  async logout() {
    try {
      // Sign out from session
      if (this.clients.bsky) {
        const result = await this.clients.bsky.init()
        if (result?.session?.signOut) {
          await result.session.signOut()
        }
      }

      // Clear state
      this.agent = null
      this.sessionInfo = null
      this.clients = { bsky: null, syu: null }
      this.initPromise = null

      // Clear storage
      localStorage.clear()
      sessionStorage.clear()

      // Reload page
      window.location.reload()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  getAgent() {
    return this.agent
  }

  getUser() {
    return this.sessionInfo
  }
}