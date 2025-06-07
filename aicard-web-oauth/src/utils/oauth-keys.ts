/**
 * OAuth JWKS key generation and management
 */

export interface JWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
  d?: string;
  use: string;
  kid: string;
  alg: string;
}

export interface JWKS {
  keys: JWK[];
}

export class OAuthKeyManager {
  private static keyPair: CryptoKeyPair | null = null;
  private static jwks: JWKS | null = null;

  /**
   * Generate or retrieve existing ECDSA key pair for OAuth
   */
  static async getKeyPair(): Promise<CryptoKeyPair> {
    if (this.keyPair) {
      return this.keyPair;
    }

    // Try to load from localStorage first
    const storedKey = localStorage.getItem('oauth_private_key');
    if (storedKey) {
      try {
        const keyData = JSON.parse(storedKey);
        this.keyPair = await this.importKeyPair(keyData);
        return this.keyPair;
      } catch (error) {
        console.warn('Failed to load stored key, generating new one:', error);
        localStorage.removeItem('oauth_private_key');
      }
    }

    // Generate new key pair
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Store private key for persistence
    await this.storeKeyPair(this.keyPair);

    return this.keyPair;
  }

  /**
   * Get JWKS (JSON Web Key Set) for public key distribution
   */
  static async getJWKS(): Promise<JWKS> {
    if (this.jwks) {
      return this.jwks;
    }

    const keyPair = await this.getKeyPair();
    const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    this.jwks = {
      keys: [
        {
          kty: publicKey.kty!,
          crv: publicKey.crv!,
          x: publicKey.x!,
          y: publicKey.y!,
          use: 'sig',
          kid: 'ai-card-oauth-key-1',
          alg: 'ES256'
        }
      ]
    };

    return this.jwks;
  }

  /**
   * Sign a JWT with the private key
   */
  static async signJWT(header: any, payload: any): Promise<string> {
    const keyPair = await this.getKeyPair();
    
    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
    const message = `${headerB64}.${payloadB64}`;
    
    const signature = await window.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(message)
    );
    
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return `${message}.${signatureB64}`;
  }

  private static async storeKeyPair(keyPair: CryptoKeyPair): Promise<void> {
    try {
      const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      localStorage.setItem('oauth_private_key', JSON.stringify(privateKey));
    } catch (error) {
      console.error('Failed to store private key:', error);
    }
  }

  private static async importKeyPair(keyData: any): Promise<CryptoKeyPair> {
    const privateKey = await window.crypto.subtle.importKey(
      'jwk',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    // Derive public key from private key
    const publicKeyData = { ...keyData };
    delete publicKeyData.d; // Remove private component

    const publicKey = await window.crypto.subtle.importKey(
      'jwk',
      publicKeyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    return { privateKey, publicKey };
  }

  /**
   * Clear stored keys (for testing/reset)
   */
  static clearKeys(): void {
    localStorage.removeItem('oauth_private_key');
    this.keyPair = null;
    this.jwks = null;
  }
}

/**
 * Generate dynamic client metadata based on current URL
 */
export function generateClientMetadata(): any {
  const origin = window.location.origin;
  const clientId = `${origin}/client-metadata.json`;

  // Use static production metadata for xxxcard.syui.ai
  if (origin === 'https://xxxcard.syui.ai') {
    return {
      client_id: 'https://xxxcard.syui.ai/client-metadata.json',
      client_name: 'ai.card',
      client_uri: 'https://xxxcard.syui.ai',
      logo_uri: 'https://xxxcard.syui.ai/favicon.ico',
      tos_uri: 'https://xxxcard.syui.ai/terms',
      policy_uri: 'https://xxxcard.syui.ai/privacy',
      redirect_uris: ['https://xxxcard.syui.ai/oauth/callback'],
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      scope: 'atproto transition:generic',
      subject_type: 'public',
      application_type: 'web',
      dpop_bound_access_tokens: true,
      jwks_uri: 'https://xxxcard.syui.ai/.well-known/jwks.json'
    };
  }

  // Dynamic metadata for development
  return {
    client_id: clientId,
    client_name: 'ai.card',
    client_uri: origin,
    logo_uri: `${origin}/favicon.ico`,
    tos_uri: `${origin}/terms`,
    policy_uri: `${origin}/privacy`,
    redirect_uris: [`${origin}/oauth/callback`],
    response_types: ['code'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    scope: 'atproto transition:generic',
    subject_type: 'public',
    application_type: 'web',
    dpop_bound_access_tokens: true,
    jwks_uri: `${origin}/.well-known/jwks.json`
  };
}