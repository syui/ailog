import { useState, useEffect } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { getApiConfig } from '../utils/pds.js'
import { env } from '../config/env.js'
import { getErrorMessage } from '../utils/errorHandler.js'
import { logger } from '../utils/logger.js'

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
  const [chatCursor, setChatCursor] = useState(null)
  const [chatHasMore, setChatHasMore] = useState(true)
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
      
      // Load all data in parallel with error handling
      logger.log('useAdminData: Starting API calls...')
      const [records, lang, comment, chatResult] = await Promise.all([
        collections.getBase(apiConfig.pds, did, env.collection).catch(err => {
          logger.error('getBase error:', err)
          throw err
        }),
        collections.getLang(apiConfig.pds, did, env.collection).catch(err => {
          logger.error('getLang error:', err)
          throw err
        }),
        collections.getComment(apiConfig.pds, did, env.collection).catch(err => {
          logger.error('getComment error:', err)
          throw err
        }),
        collections.getChat(apiConfig.pds, did, env.collection, 100).catch(err => {
          logger.error('getChat error:', err)
          throw err
        })
      ])
      logger.log('useAdminData: API calls completed successfully')
      
      const chat = chatResult.records || chatResult
      const cursor = chatResult.cursor || null
      setChatCursor(cursor)
      setChatHasMore(!!cursor)

      logger.log('useAdminData: chatResult structure:', chatResult)
      logger.log('useAdminData: chat variable type:', typeof chat, 'isArray:', Array.isArray(chat))

      // Process chat records into question-answer pairs
      const chatPairs = []
      const recordMap = new Map()
      
      // Ensure chat is an array
      const chatArray = Array.isArray(chat) ? chat : []
      
      // First pass: organize records by base rkey
      chatArray.forEach(record => {
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
      chatPairs.sort((a, b) => {
        const dateA = new Date(a.createdAt)
        const dateB = new Date(b.createdAt)
        return dateA - dateB
      })

      logger.log('useAdminData: raw chat records:', chat.length)
      logger.log('useAdminData: processed chat pairs:', chatPairs.length, chatPairs)
      logger.log('useAdminData: setting state data:')
      logger.log('  - records:', records.length)
      logger.log('  - langRecords:', lang.length)
      logger.log('  - commentRecords:', comment.length, comment)
      logger.log('  - chatRecords:', chatPairs.length)

      setAdminData({ did, profile, records, apiConfig })
      setLangRecords(lang)
      setCommentRecords(comment)
      setChatRecords(chatPairs)
    } catch (err) {
      // Log the actual error for debugging
      logger.error('useAdminData: Error in loadAdminData:', err)
      setError('silent_failure')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreChat = async () => {
    if (!chatCursor || !chatHasMore) return
    
    try {
      const apiConfig = getApiConfig(`https://${env.pds}`)
      const did = await atproto.getDid(env.pds, env.admin)
      const chatResult = await collections.getChat(apiConfig.pds, did, env.collection, 100, chatCursor)
      
      const newChatRecords = chatResult.records || chatResult
      const newCursor = chatResult.cursor || null
      
      // Process new chat records into question-answer pairs
      const newChatPairs = []
      const recordMap = new Map()
      
      // Ensure newChatRecords is an array
      const newChatArray = Array.isArray(newChatRecords) ? newChatRecords : []
      
      // First pass: organize records by base rkey
      newChatArray.forEach(record => {
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
          newChatPairs.push({
            rkey,
            question: pair.question,
            answer: pair.answer,
            createdAt: pair.question.value.createdAt
          })
        }
      })
      
      // Sort new pairs by creation time (oldest first) - for chronological conversation flow
      newChatPairs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      
      // Append to existing chat records
      setChatRecords(prev => [...prev, ...newChatPairs])
      setChatCursor(newCursor)
      setChatHasMore(!!newCursor)
      
    } catch (err) {
      // Silently fail - no error logging
    }
  }

  return {
    adminData,
    langRecords,
    commentRecords,
    chatRecords,
    chatHasMore,
    loading,
    error,
    refresh: loadAdminData,
    loadMoreChat
  }
}