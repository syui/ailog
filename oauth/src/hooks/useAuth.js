import { useState, useEffect } from 'react'
import { OAuthService } from '../services/oauth.js'
import { logger } from '../utils/logger.js'

const oauthService = new OAuthService()

export function useAuth() {
  const [user, setUser] = useState(null)
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initAuth()
  }, [])

  const initAuth = async () => {
    try {
      const authResult = await oauthService.checkAuth()
      if (authResult) {
        setUser(authResult.user)
        setAgent(authResult.agent)
        
        // If we're on callback page and authentication succeeded, notify parent
        if (window.location.pathname === '/oauth/callback') {
          logger.log('OAuth callback completed, notifying parent window')
          
          // Get referrer or use stored return URL
          const returnUrl = sessionStorage.getItem('oauth_return_url') || 
                          document.referrer || 
                          window.location.origin
          
          sessionStorage.removeItem('oauth_return_url')
          
          // Notify parent window if in iframe, otherwise redirect directly
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'oauth_success',
              returnUrl: returnUrl,
              user: authResult.user
            }, '*')
          } else {
            // Set flag to skip loading screen after redirect
            sessionStorage.setItem('oauth_just_completed', 'true')
            // Direct redirect
            setTimeout(() => {
              window.location.href = returnUrl
            }, 1000)
          }
        }
      }
    } catch (error) {
      logger.error('Auth initialization failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (handle) => {
    // Store current page URL for post-auth redirect
    if (window.location.pathname !== '/oauth/callback') {
      sessionStorage.setItem('oauth_return_url', window.location.href)
    }
    
    await oauthService.login(handle)
  }

  const logout = async () => {
    await oauthService.logout()
    setUser(null)
    setAgent(null)
  }

  return {
    user,
    agent,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  }
}