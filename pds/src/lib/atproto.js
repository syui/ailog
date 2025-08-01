/*
 * Based on frontpage/atproto-browser
 * Copyright (c) 2025 The Frontpage Authors
 * MIT License
 */

import { AtpBaseClient } from '@atproto/api'
import { AtUri } from '@atproto/syntax'
import { isDid } from '@atproto/did'
import { AT_PROTOCOL_CONFIG } from '../config.js'

// Identity resolution cache
const identityCache = new Map()

// Create AT Protocol client
export const createAtpClient = (pds) => {
  return new AtpBaseClient({
    service: pds.startsWith('http') ? pds : `https://${pds}`
  })
}

// Resolve identity (DID/Handle)
export const resolveIdentity = async (identifier) => {
  if (identityCache.has(identifier)) {
    return identityCache.get(identifier)
  }

  try {
    let did = identifier
    
    // If it's a handle, resolve to DID
    if (!isDid(identifier)) {
      // Try syu.is first, then fallback to bsky.social
      let resolved = false
      
      try {
        const client = createAtpClient(AT_PROTOCOL_CONFIG.primary.pds)
        const response = await client.com.atproto.repo.describeRepo({ repo: identifier })
        did = response.data.did
        resolved = true
      } catch (error) {
      }
      
      if (!resolved) {
        try {
          const client = createAtpClient(AT_PROTOCOL_CONFIG.fallback.pds)
          const response = await client.com.atproto.repo.describeRepo({ repo: identifier })
          did = response.data.did
        } catch (error) {
          throw new Error(`Failed to resolve handle: ${identifier}`)
        }
      }
    }

    // Get DID document to find PDS
    // Try plc.syu.is first, then fallback to plc.directory
    let didDoc = null
    let plcResponse = null
    
    try {
      plcResponse = await fetch(`${AT_PROTOCOL_CONFIG.primary.plc}/${did}`)
      if (plcResponse.ok) {
        didDoc = await plcResponse.json()
      }
    } catch (error) {
    }
    
    // If plc.syu.is fails, try plc.directory
    if (!didDoc) {
      try {
        plcResponse = await fetch(`${AT_PROTOCOL_CONFIG.fallback.plc}/${did}`)
        if (plcResponse.ok) {
          didDoc = await plcResponse.json()
        }
      } catch (error) {
      }
    }
    
    if (!didDoc) {
      throw new Error(`Failed to resolve DID document from any PLC server`)
    }
    
    // Find PDS service endpoint
    const pdsService = didDoc.service?.find(service => 
      service.type === 'AtprotoPersonalDataServer' ||
      service.id === '#atproto_pds'
    )
    
    if (!pdsService) {
      throw new Error('No PDS service found in DID document')
    }

    const result = {
      success: true,
      didDocument: didDoc,
      pdsUrl: pdsService.serviceEndpoint
    }

    identityCache.set(identifier, result)
    return result
  } catch (error) {
    const result = {
      success: false,
      error: error.message
    }
    identityCache.set(identifier, result)
    return result
  }
}

// Get record from AT Protocol
export const getRecord = async (did, collection, rkey) => {
  try {
    const identityResult = await resolveIdentity(did)
    
    if (!identityResult.success) {
      return { success: false, error: identityResult.error }
    }

    const pdsUrl = identityResult.pdsUrl
    
    const client = createAtpClient(pdsUrl)

    const response = await client.com.atproto.repo.getRecord({
      repo: did,
      collection,
      rkey
    })

    return {
      success: true,
      data: response.data,
      pdsUrl
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Parse AT URI
export const parseAtUri = (uri) => {
  try {
    return new AtUri(uri)
  } catch (error) {
    return null
  }
}

// Check if string is AT URI
export const isAtUri = (str) => {
  return str.startsWith('at://') && str.split(' ').length === 1
}