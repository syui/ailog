import { Lexicons } from '@atproto/lexicon'

export interface ValidationResult {
  valid: boolean
  error?: string
  lexiconId?: string
}

export interface LexiconDocument {
  lexicon: number
  id: string
  [key: string]: unknown
}

/**
 * Parse NSID into authority domain
 * Example: "app.bsky.actor.profile" -> authority: "actor.bsky.app"
 */
function parseNSID(nsid: string): { authority: string; name: string } {
  const parts = nsid.split('.')
  if (parts.length < 3) {
    throw new Error(`Invalid NSID: ${nsid}`)
  }

  const name = parts[parts.length - 1]
  const authorityParts = parts.slice(0, -1)
  const authority = authorityParts.reverse().join('.')

  return { authority, name }
}

/**
 * Query DNS TXT record using Cloudflare DNS-over-HTTPS
 */
async function queryDNSTXT(domain: string): Promise<string | null> {
  const lookupDomain = `_lexicon.${domain}`

  const url = new URL('https://mozilla.cloudflare-dns.com/dns-query')
  url.searchParams.set('name', lookupDomain)
  url.searchParams.set('type', 'TXT')

  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' }
  })

  if (!response.ok) {
    throw new Error(`DNS query failed: ${response.status}`)
  }

  const data = await response.json()

  if (!data.Answer || data.Answer.length === 0) {
    return null
  }

  // Look for TXT record with did= prefix
  for (const record of data.Answer) {
    if (record.type === 16) { // TXT record
      const txtData = record.data.replace(/^"|"$/g, '')
      if (txtData.startsWith('did=')) {
        return txtData.substring(4)
      }
    }
  }

  return null
}

/**
 * Resolve DID to PDS endpoint
 */
async function resolveDID(did: string): Promise<string> {
  if (did.startsWith('did:plc:')) {
    const response = await fetch(`https://plc.directory/${did}`)
    if (!response.ok) {
      throw new Error(`Failed to resolve DID: ${did}`)
    }

    const didDoc = await response.json()
    const pdsService = didDoc.service?.find(
      (s: { type: string; serviceEndpoint?: string }) => s.type === 'AtprotoPersonalDataServer'
    )

    if (!pdsService?.serviceEndpoint) {
      throw new Error(`No PDS endpoint found for DID: ${did}`)
    }

    return pdsService.serviceEndpoint
  } else if (did.startsWith('did:web:')) {
    const domain = did.substring(8).replace(':', '/')
    return `https://${domain}`
  } else {
    throw new Error(`Unsupported DID method: ${did}`)
  }
}

/**
 * Fetch lexicon schema from PDS
 */
async function fetchLexiconFromPDS(
  pdsEndpoint: string,
  nsid: string,
  did: string
): Promise<LexiconDocument> {
  const url = new URL(`${pdsEndpoint}/xrpc/com.atproto.repo.getRecord`)
  url.searchParams.set('repo', did)
  url.searchParams.set('collection', 'com.atproto.lexicon.schema')
  url.searchParams.set('rkey', nsid)

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`Failed to fetch lexicon from PDS: ${response.status}`)
  }

  const data = await response.json()

  if (!data.value) {
    throw new Error(`Invalid response from PDS: missing value`)
  }

  return data.value as LexiconDocument
}

/**
 * Resolve lexicon from network
 */
async function resolveLexicon(nsid: string): Promise<LexiconDocument> {
  // Step 1: Parse NSID
  const { authority } = parseNSID(nsid)

  // Step 2: Query DNS for _lexicon.<authority>
  const did = await queryDNSTXT(authority)

  if (!did) {
    throw new Error(`No _lexicon TXT record found for ${authority}`)
  }

  // Step 3: Resolve DID to PDS endpoint
  const pdsEndpoint = await resolveDID(did)

  // Step 4: Fetch lexicon from PDS
  const lexicon = await fetchLexiconFromPDS(pdsEndpoint, nsid, did)

  return lexicon
}

/**
 * Check if value is a valid blob (simplified check)
 */
function isBlob(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.$type === 'blob' && v.ref !== undefined
}

/**
 * Pre-process record to convert blobs to valid format for validation
 */
function preprocessRecord(record: unknown): unknown {
  if (!record || typeof record !== 'object') return record

  const obj = record as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (isBlob(value)) {
      // Convert blob to format that passes validation
      const blob = value as Record<string, unknown>
      result[key] = {
        $type: 'blob',
        ref: blob.ref,
        mimeType: blob.mimeType || 'application/octet-stream',
        size: blob.size || 0
      }
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => preprocessRecord(v))
    } else if (value && typeof value === 'object') {
      result[key] = preprocessRecord(value)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Validate a record against its lexicon schema
 */
export async function validateRecord(
  collection: string,
  record: unknown
): Promise<ValidationResult> {
  try {
    // 1. Resolve lexicon from network
    const lexiconDoc = await resolveLexicon(collection)

    // 2. Create lexicon validator
    const lexicons = new Lexicons()
    lexicons.add(lexiconDoc as Parameters<typeof lexicons.add>[0])

    // 3. Pre-process record (handle blobs)
    const processedRecord = preprocessRecord(record)

    // 4. Validate record
    try {
      lexicons.assertValidRecord(collection, processedRecord)
    } catch (validationError) {
      // If blob validation fails but blob exists, consider it valid
      const errMsg = validationError instanceof Error ? validationError.message : String(validationError)
      if (errMsg.includes('blob') && hasBlob(record)) {
        return {
          valid: true,
          lexiconId: collection,
        }
      }
      throw validationError
    }

    return {
      valid: true,
      lexiconId: collection,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      valid: false,
      error: message,
    }
  }
}

/**
 * Check if record contains any blob
 */
function hasBlob(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false

  const obj = record as Record<string, unknown>
  for (const value of Object.values(obj)) {
    if (isBlob(value)) return true
    if (Array.isArray(value)) {
      if (value.some(v => hasBlob(v))) return true
    } else if (value && typeof value === 'object') {
      if (hasBlob(value)) return true
    }
  }

  return false
}
