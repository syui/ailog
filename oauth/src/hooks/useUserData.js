import { useState, useEffect } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { getApiConfig, isSyuIsHandle, getPdsFromHandle } from '../utils/pds.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export function useUserData(adminData) {
  const [userComments, setUserComments] = useState([])
  const [chatRecords, setChatRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!adminData?.did || !adminData?.apiConfig) return

    const fetchUserData = async () => {
      setLoading(true)
      setError(null)

      try {
        // 1. Get user list from admin account
        const userListRecords = await collections.getUserList(
          adminData.apiConfig.pds, 
          adminData.did, 
          env.collection
        )

        // 2. Get chat records from ai.syui.log.chat and process into pairs
        const chatResult = await collections.getChat(
          adminData.apiConfig.pds,
          adminData.did,
          env.collection
        )
        
        const chatRecords = chatResult.records || chatResult
        logger.log('useUserData: raw chatRecords:', chatRecords.length, chatRecords)
        
        // Process chat records into question-answer pairs
        const chatPairs = []
        const recordMap = new Map()
        
        // First pass: organize records by base rkey
        chatRecords.forEach(record => {
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
        
        // Sort by creation time (newest first)
        chatPairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        
        logger.log('useUserData: processed chatPairs:', chatPairs.length, chatPairs)
        setChatRecords(chatPairs)

        // 3. Get base collection records which contain user comments
        const baseRecords = await collections.getBase(
          adminData.apiConfig.pds,
          adminData.did,
          env.collection
        )

        // Extract comments from base records
        const allUserComments = []
        
        for (const record of baseRecords) {
          if (record.value?.comments && Array.isArray(record.value.comments)) {
            // Each comment already has author info, so we can use it directly
            const commentsWithMeta = record.value.comments.map(comment => ({
              uri: record.uri,
              cid: record.cid,
              value: {
                ...comment,
                post: {
                  url: record.value.url
                }
              }
            }))
            allUserComments.push(...commentsWithMeta)
          }
        }

        // Also try to get individual user records from the user list
        // Currently skipping user list processing since users contain placeholder DIDs
        if (userListRecords.length > 0 && userListRecords[0].value?.users) {
          logger.log('User list found, but skipping placeholder users for now')
          
          // Filter out placeholder users
          const realUsers = userListRecords[0].value.users.filter(user => 
            user.handle && 
            user.did && 
            !user.did.includes('placeholder') &&
            !user.did.includes('example')
          )
          
          if (realUsers.length > 0) {
            logger.log(`Processing ${realUsers.length} real users`)
            
            for (const user of realUsers) {
              const userHandle = user.handle
              
              try {
                // Get user's DID and PDS using PDS detection logic
                let userDid, userPds, userApiConfig
                
                if (user.did && user.pds) {
                  // Use DID and PDS from user record
                  userDid = user.did
                  userPds = user.pds.replace('https://', '')
                  userApiConfig = getApiConfig(userPds)
                } else {
                  // Always get actual PDS from describeRepo first
                  try {
                    // Try bsky.social first for most handles
                    const bskyPds = 'bsky.social'
                    userDid = await atproto.getDid(bskyPds, userHandle)
                    
                    // Get the actual PDS endpoint from DID
                    const realPds = await getPdsFromHandle(userHandle)
                    userPds = realPds.replace('https://', '')
                    userApiConfig = getApiConfig(realPds)
                  } catch (error) {
                    // Fallback to syu.is if bsky.social fails
                    logger.warn(`Failed to get PDS for ${userHandle} from bsky.social, trying syu.is:`, error)
                    userPds = env.pds
                    userApiConfig = getApiConfig(env.pds)
                    userDid = await atproto.getDid(userPds, userHandle)
                  }
                }

                // Get user's own ai.syui.log records
                const userRecords = await collections.getUserComments(
                  userApiConfig.pds,
                  userDid,
                  env.collection
                )

                // Skip if no records found
                if (!userRecords || userRecords.length === 0) {
                  continue
                }

                // Get user's profile for enrichment
                let profile = null
                try {
                  profile = await atproto.getProfile(userApiConfig.bsky, userDid)
                } catch (profileError) {
                  logger.warn(`Failed to get profile for ${userHandle}:`, profileError)
                }

                // Add profile info to each record
                const enrichedRecords = userRecords.map(record => ({
                  ...record,
                  value: {
                    ...record.value,
                    author: {
                      did: userDid,
                      handle: profile?.data?.handle || userHandle,
                      displayName: profile?.data?.displayName || userHandle,
                      avatar: profile?.data?.avatar || null
                    }
                  }
                }))

                allUserComments.push(...enrichedRecords)
              } catch (userError) {
                logger.warn(`Failed to fetch data for user ${userHandle}:`, userError)
              }
            }
          } else {
            logger.log('No real users found in user list - all appear to be placeholders')
          }
        }

        setUserComments(allUserComments)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [adminData])

  const refresh = () => {
    if (adminData?.did && adminData?.apiConfig) {
      // Re-trigger the effect by clearing and re-setting adminData
      const currentAdminData = adminData
      setUserComments([])
      setChatRecords([])
      // The useEffect will automatically run again
    }
  }

  return { userComments, chatRecords, loading, error, refresh }
}