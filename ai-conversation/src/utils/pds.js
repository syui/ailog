import { env } from '../config/env.js'

// PDS判定からAPI設定を取得 - 実際のPDSエンドポイントに基づいて設定
export function getApiConfig(pds) {
  // pdsからhttps://を除去してドメインのみ取得
  const cleanPds = pds.replace(/^https?:\/\//, '')
  
  if (cleanPds.includes(env.pds)) {
    return {
      pds: `https://${env.pds}`,
      bsky: `https://bsky.${env.pds}`,
      plc: `https://plc.${env.pds}`,
      web: `https://${env.pds}`
    }
  }
  return {
    pds: pds.startsWith('http') ? pds : `https://${pds}`,
    bsky: 'https://public.api.bsky.app',
    plc: 'https://plc.directory',
    web: 'https://bsky.app'
  }
}

// handleがsyu.is系かどうか判定
export function isSyuIsHandle(handle) {
  return env.handleList.includes(handle) || handle.endsWith(`.${env.pds}`)
}

// handleからPDS取得
export async function getPdsFromHandle(handle) {
  const initialPds = isSyuIsHandle(handle) 
    ? `https://${env.pds}` 
    : 'https://bsky.social'
  
  const data = await fetch(`${initialPds}/xrpc/com.atproto.repo.describeRepo?repo=${handle}`)
    .then(res => res.json())
  
  return data.didDoc?.service?.[0]?.serviceEndpoint || initialPds
}
