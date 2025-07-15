import { useState, useEffect } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { getApiConfig } from '../utils/pds.js'
import { env } from '../config/env.js'
import { getErrorMessage } from '../utils/errorHandler.js'

export function useAdminData() {
  const [adminData, setAdminData] = useState({ 
    did: '', 
    profile: null, 
    records: [], 
    apiConfig: null 
  })
  const [langRecords, setLangRecords] = useState([])
  const [commentRecords, setCommentRecords] = useState([])
  const [chatRecords, setChatRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      const [records, lang, comment, chat] = await Promise.all([
        collections.getBase(apiConfig.pds, did, env.collection),
        collections.getLang(apiConfig.pds, did, env.collection),
        collections.getComment(apiConfig.pds, did, env.collection),
        collections.getChat(apiConfig.pds, did, env.collection)
      ])

      // Profile records are in the main collection, not separate profile collection
      const profileRecords = records.filter(record => record.value.type === 'profile')

      // Create profile map for enhanced author information
      const profileMap = new Map()
      profileRecords.forEach(record => {
        if (record.value.type === 'profile') {
          profileMap.set(record.value.author?.did, record.value.author)
        }
      })

      // Get user profile from profile collection (syui.syui.ai)
      const userProfile = profileRecords.find(record => 
        record.value.type === 'profile' && record.value.author?.handle === 'syui.syui.ai'
      )?.value.author
      
      // Get AI profile from admin account (ai.syui.ai)
      const aiProfile = {
        did: did,
        handle: env.admin,
        displayName: profile.displayName || "ai",
        avatar: profile.avatar || `https://bsky.syu.is/img/avatar/plain/${did}/default@jpeg`
      }

      // Process chat records into question-answer pairs
      const chatPairs = []
      const recordMap = new Map()
      
      // First pass: organize records by base rkey
      chat.forEach(record => {
        const rkey = record.uri.split('/').pop()
        const baseRkey = rkey.replace('-answer', '')
        
        if (!recordMap.has(baseRkey)) {
          recordMap.set(baseRkey, { question: null, answer: null })
        }
        
        // Override author information based on record type
        if (record.value.type === 'question' && userProfile) {
          // Questions should show user profile (syui.syui.ai)
          record.value.author = userProfile
        } else if (record.value.type === 'answer') {
          // Answers should show AI profile (ai.syui.ai)
          record.value.author = aiProfile
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
      
      // Sort by creation time (oldest first for conversation flow)
      chatPairs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

      console.log('useAdminData: raw chat records:', chat.length)
      console.log('useAdminData: processed chat pairs:', chatPairs.length, chatPairs)
      console.log('useAdminData: profile map:', profileMap)
      console.log('useAdminData: profile records:', profileRecords)

      setAdminData({ did, profile, records, apiConfig })
      setLangRecords(lang)
      setCommentRecords(comment)
      setChatRecords(chatPairs)
    } catch (err) {
      // Silently fail - no error logging or retry attempts
      setError('silent_failure')
    } finally {
      setLoading(false)
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    chatRecords,
    loading,
    error,
    refresh: loadAdminData
  }
}