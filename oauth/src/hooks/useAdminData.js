import { useState, useEffect } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { getApiConfig } from '../utils/pds.js'
import { env } from '../config/env.js'
import { getErrorMessage, logError } from '../utils/errorHandler.js'

export function useAdminData() {
  const [adminData, setAdminData] = useState({ 
    did: '', 
    profile: null, 
    records: [], 
    apiConfig: null 
  })
  const [langRecords, setLangRecords] = useState([])
  const [commentRecords, setCommentRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    try {
      setLoading(true)
      setError(null)

      const apiConfig = getApiConfig(`https://${env.pds}`)
      const did = await atproto.getDid(env.pds, env.admin)
      const profile = await atproto.getProfile(apiConfig.bsky, did)
      
      // Load all data in parallel
      const [records, lang, comment] = await Promise.all([
        collections.getBase(apiConfig.pds, did, env.collection),
        collections.getLang(apiConfig.pds, did, env.collection),
        collections.getComment(apiConfig.pds, did, env.collection)
      ])

      setAdminData({ did, profile, records, apiConfig })
      setLangRecords(lang)
      setCommentRecords(comment)
      setRetryCount(0) // 成功時はリトライカウントをリセット
    } catch (err) {
      logError(err, 'useAdminData.loadAdminData')
      setError(getErrorMessage(err))
      
      // 自動リトライ（最大3回）
      if (retryCount < 3) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          loadAdminData()
        }, Math.pow(2, retryCount) * 1000) // 1s, 2s, 4s
      }
    } finally {
      setLoading(false)
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    loading,
    error,
    retryCount,
    refresh: loadAdminData
  }
}