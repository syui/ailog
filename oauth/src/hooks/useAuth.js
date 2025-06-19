import { useState, useEffect } from 'react'
import { OAuthService } from '../services/oauth.js'

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
      }
    } catch (error) {
      console.error('Auth initialization failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (handle) => {
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