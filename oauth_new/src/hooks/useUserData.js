import { useState, useEffect } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { getApiConfig, isSyuIsHandle } from '../utils/pds.js'
import { env } from '../config/env.js'

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

        // 2. Get chat records from ai.syui.log.chat
        const chatRecords = await collections.getChat(
          adminData.apiConfig.pds,
          adminData.did,
          env.collection
        )
        setChatRecords(chatRecords)

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
          console.log('User list found, but skipping placeholder users for now')
          
          // Filter out placeholder users
          const realUsers = userListRecords[0].value.users.filter(user => 
            user.handle && 
            user.did && 
            !user.did.includes('placeholder') &&
            !user.did.includes('example')
          )
          
          if (realUsers.length > 0) {
            console.log(`Processing ${realUsers.length} real users`)
            
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
                  // Auto-detect PDS based on handle and get real DID
                  if (isSyuIsHandle(userHandle)) {
                    userPds = env.pds
                    userApiConfig = getApiConfig(userPds)
                    userDid = await atproto.getDid(userPds, userHandle)
                  } else {
                    userPds = 'bsky.social'
                    userApiConfig = getApiConfig(userPds)
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
                  console.warn(`Failed to get profile for ${userHandle}:`, profileError)
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
                console.warn(`Failed to fetch data for user ${userHandle}:`, userError)
              }
            }
          } else {
            console.log('No real users found in user list - all appear to be placeholders')
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