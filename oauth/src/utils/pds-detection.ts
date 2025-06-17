// PDS Detection and API URL mapping utilities

import { isValidDid, isValidHandle } from './validation';

export interface NetworkConfig {
  pdsApi: string;
  plcApi: string;
  bskyApi: string;
  webUrl: string;
}

// Detect PDS from handle
export function detectPdsFromHandle(handle: string): string {
  // Get allowed handles from environment
  const allowedHandlesStr = import.meta.env.VITE_ATPROTO_HANDLE_LIST || '[]';
  let allowedHandles: string[] = [];
  try {
    allowedHandles = JSON.parse(allowedHandlesStr);
  } catch {
    allowedHandles = [];
  }
  
  // Get configured PDS from environment
  const configuredPds = import.meta.env.VITE_ATPROTO_PDS || 'syu.is';
  
  // Check if handle is in allowed list
  if (allowedHandles.includes(handle)) {
    return configuredPds;
  }
  
  // Check if handle ends with .syu.is or .syui.ai
  if (handle.endsWith('.syu.is') || handle.endsWith('.syui.ai')) {
    return 'syu.is';
  }
  
  // Check if handle ends with .bsky.social or .bsky.app
  if (handle.endsWith('.bsky.social') || handle.endsWith('.bsky.app')) {
    return 'bsky.social';
  }
  
  // Default to Bluesky for unknown domains
  return 'bsky.social';
}

// Map PDS endpoint to network configuration
export function getNetworkConfigFromPdsEndpoint(pdsEndpoint: string): NetworkConfig {
  try {
    const url = new URL(pdsEndpoint);
    const hostname = url.hostname;
    
    // Map based on actual PDS endpoint
    if (hostname === 'syu.is') {
      return {
        pdsApi: 'https://syu.is',           // PDS API (repo operations)
        plcApi: 'https://plc.syu.is',       // PLC directory
        bskyApi: 'https://bsky.syu.is',     // Bluesky API (getProfile, etc.)
        webUrl: 'https://web.syu.is'        // Web interface
      };
    } else if (hostname.includes('bsky.network') || hostname === 'bsky.social' || hostname.includes('host.bsky.network')) {
      // All Bluesky infrastructure (including *.host.bsky.network)
      return {
        pdsApi: pdsEndpoint,                      // Use actual PDS endpoint (e.g., shiitake.us-east.host.bsky.network)
        plcApi: 'https://plc.directory',          // Standard PLC directory
        bskyApi: 'https://public.api.bsky.app',   // Bluesky public API (NOT PDS)
        webUrl: 'https://bsky.app'                // Bluesky web interface
      };
    } else {
      // Unknown PDS, assume Bluesky-compatible but use PDS for repo operations
      return {
        pdsApi: pdsEndpoint,                      // Use actual PDS for repo ops
        plcApi: 'https://plc.directory',          // Default PLC
        bskyApi: 'https://public.api.bsky.app',   // Default to Bluesky API
        webUrl: 'https://bsky.app'                // Default web interface
      };
    }
  } catch (error) {
    // Fallback for invalid URLs
    return {
      pdsApi: 'https://bsky.social',
      plcApi: 'https://plc.directory',
      bskyApi: 'https://public.api.bsky.app',
      webUrl: 'https://bsky.app'
    };
  }
}

// Legacy function for backwards compatibility
export function getNetworkConfig(pds: string): NetworkConfig {
  // This now assumes pds is a hostname
  return getNetworkConfigFromPdsEndpoint(`https://${pds}`);
}

// Get appropriate API URL for a user based on their handle
export function getApiUrlForUser(handle: string): string {
  const pds = detectPdsFromHandle(handle);
  const config = getNetworkConfig(pds);
  return config.bskyApi;
}

// Resolve handle/DID to actual PDS endpoint using PLC API first
export async function resolvePdsFromRepo(handleOrDid: string): Promise<{ pds: string; did: string; handle: string }> {
  // Validate input
  if (!handleOrDid || (!isValidDid(handleOrDid) && !isValidHandle(handleOrDid))) {
    throw new Error(`Invalid identifier: ${handleOrDid}`);
  }
  
  let targetDid = handleOrDid;
  let targetHandle = handleOrDid;
  
  // If handle provided, resolve to DID first using identity.resolveHandle
  if (!handleOrDid.startsWith('did:')) {
    try {
      // Try multiple endpoints for handle resolution
      const resolveEndpoints = ['https://public.api.bsky.app', 'https://bsky.syu.is', 'https://syu.is'];
      let resolved = false;
      
      for (const endpoint of resolveEndpoints) {
        try {
          const resolveResponse = await fetch(`${endpoint}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`);
          if (resolveResponse.ok) {
            const resolveData = await resolveResponse.json();
            targetDid = resolveData.did;
            resolved = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }
      
      if (!resolved) {
        throw new Error('Handle resolution failed from all endpoints');
      }
    } catch (error) {
      throw new Error(`Failed to resolve handle ${handleOrDid} to DID: ${error}`);
    }
  }
  
  // First, try PLC API to get the authoritative DID document
  const plcApis = ['https://plc.directory', 'https://plc.syu.is'];
  
  for (const plcApi of plcApis) {
    try {
      const plcResponse = await fetch(`${plcApi}/${targetDid}`);
      if (plcResponse.ok) {
        const didDocument = await plcResponse.json();
        
        // Find PDS service in DID document
        const pdsService = didDocument.service?.find((s: any) => 
          s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
        );
        
        if (pdsService && pdsService.serviceEndpoint) {
          return {
            pds: pdsService.serviceEndpoint,
            did: targetDid,
            handle: targetHandle
          };
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  // Fallback: use com.atproto.repo.describeRepo to get PDS from known PDS endpoints
  const pdsEndpoints = ['https://bsky.social', 'https://syu.is'];
  
  for (const pdsEndpoint of pdsEndpoints) {
    try {
      const response = await fetch(`${pdsEndpoint}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(targetDid)}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Extract PDS from didDoc.service
        const services = data.didDoc?.service || [];
        const pdsService = services.find((s: any) => 
          s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
        );
        
        if (pdsService) {
          return {
            pds: pdsService.serviceEndpoint,
            did: data.did || targetDid,
            handle: data.handle || targetHandle
          };
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  throw new Error(`Failed to resolve PDS for ${handleOrDid} from any endpoint`);
}

// Resolve DID to actual PDS endpoint using com.atproto.repo.describeRepo
export async function resolvePdsFromDid(did: string): Promise<string> {
  const resolved = await resolvePdsFromRepo(did);
  return resolved.pds;
}

// Enhanced resolve handle to DID with proper PDS detection
export async function resolveHandleToDid(handle: string): Promise<{ did: string; pds: string }> {
  try {
    // First, try to resolve the handle to DID using multiple methods
    const apiUrl = getApiUrlForUser(handle);
    const response = await fetch(`${apiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
    
    if (!response.ok) {
      throw new Error(`Failed to resolve handle: ${response.status}`);
    }
    
    const data = await response.json();
    const did = data.did;
    
    // Now resolve the actual PDS from the DID
    const actualPds = await resolvePdsFromDid(did);
    
    return {
      did: did,
      pds: actualPds
    };
  } catch (error) {
    // Failed to resolve handle
    
    // Fallback to handle-based detection
    const fallbackPds = detectPdsFromHandle(handle);
    throw error;
  }
}

// Get profile using appropriate API for the user with accurate PDS resolution
export async function getProfileForUser(handleOrDid: string, knownPdsEndpoint?: string): Promise<any> {
  try {
    let apiUrl: string;
    
    if (knownPdsEndpoint) {
      // If we already know the user's PDS endpoint, use it directly
      const config = getNetworkConfigFromPdsEndpoint(knownPdsEndpoint);
      apiUrl = config.bskyApi;
    } else {
      // Resolve the user's actual PDS using describeRepo
      try {
        const resolved = await resolvePdsFromRepo(handleOrDid);
        const config = getNetworkConfigFromPdsEndpoint(resolved.pds);
        apiUrl = config.bskyApi;
      } catch {
        // Fallback to handle-based detection
        apiUrl = getApiUrlForUser(handleOrDid);
      }
    }
    
    const response = await fetch(`${apiUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handleOrDid)}`);
    if (!response.ok) {
      throw new Error(`Failed to get profile: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    // Failed to get profile
    
    // Final fallback: try with default Bluesky API
    try {
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handleOrDid)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Ignore fallback errors
    }
    
    throw error;
  }
}

// Test and verify PDS detection methods
export async function verifyPdsDetection(handleOrDid: string): Promise<void> {
  try {
    // Method 1: com.atproto.repo.describeRepo (PRIMARY METHOD)
    try {
      const resolved = await resolvePdsFromRepo(handleOrDid);
      const config = getNetworkConfigFromPdsEndpoint(resolved.pds);
    } catch (error) {
      // describeRepo failed
    }
    
    // Method 2: com.atproto.identity.resolveHandle (for comparison)
    if (!handleOrDid.startsWith('did:')) {
      try {
        const resolveResponse = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`);
        if (resolveResponse.ok) {
          const resolveData = await resolveResponse.json();
        }
      } catch (error) {
        // Error resolving handle
      }
    }
    
    // Method 3: PLC Directory lookup (if we have a DID)
    let targetDid = handleOrDid;
    if (!handleOrDid.startsWith('did:')) {
      try {
        const profile = await getProfileForUser(handleOrDid);
        targetDid = profile.did;
      } catch {
        return;
      }
    }
    
    try {
      const plcResponse = await fetch(`https://plc.directory/${targetDid}`);
      if (plcResponse.ok) {
        const didDocument = await plcResponse.json();
        
        // Find PDS service
        const pdsService = didDocument.service?.find((s: any) => 
          s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
        );
        
        if (pdsService) {
          // Try to detect if this is a known network
          const pdsUrl = pdsService.serviceEndpoint;
          const hostname = new URL(pdsUrl).hostname;
          const detectedNetwork = detectPdsFromHandle(`user.${hostname}`);
          const networkConfig = getNetworkConfig(hostname);
        }
      }
    } catch (error) {
      // Error fetching from PLC directory
    }
    
    // Method 4: Our enhanced resolution
    try {
      if (handleOrDid.startsWith('did:')) {
        const pdsEndpoint = await resolvePdsFromDid(handleOrDid);
      } else {
        const resolved = await resolveHandleToDid(handleOrDid);
      }
    } catch (error) {
      // Enhanced resolution failed
    }
    
  } catch (error) {
    // Overall verification failed
  }
}