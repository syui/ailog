/*
 * AT Protocol Configuration for syu.is environment
 */

export const AT_PROTOCOL_CONFIG = {
  // Primary PDS environment (syu.is)
  primary: {
    pds: 'https://syu.is',
    plc: 'https://plc.syu.is',
    bsky: 'https://bsky.syu.is',
    web: 'https://web.syu.is'
  },
  
  // Fallback PDS environment (bsky.social)
  fallback: {
    pds: 'https://bsky.social',
    plc: 'https://plc.directory',
    bsky: 'https://public.api.bsky.app',
    web: 'https://bsky.app'
  }
}

export const getPDSConfig = (pds) => {
  // Map PDS URL to appropriate config
  if (pds.includes('syu.is')) {
    return AT_PROTOCOL_CONFIG.primary
  } else if (pds.includes('bsky.social')) {
    return AT_PROTOCOL_CONFIG.fallback
  }
  
  // Default to primary for unknown PDS
  return AT_PROTOCOL_CONFIG.primary
}