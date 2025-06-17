// Validation utilities for atproto identifiers

export function isValidDid(did: string): boolean {
  if (!did || typeof did !== 'string') return false;
  
  // Basic DID format: did:method:identifier
  const didRegex = /^did:[a-z]+:[a-zA-Z0-9._%-]+$/;
  return didRegex.test(did);
}

export function isValidHandle(handle: string): boolean {
  if (!handle || typeof handle !== 'string') return false;
  
  // Basic handle format: subdomain.domain.tld
  const handleRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return handleRegex.test(handle);
}

export function isValidAtprotoIdentifier(identifier: string): boolean {
  return isValidDid(identifier) || isValidHandle(identifier);
}