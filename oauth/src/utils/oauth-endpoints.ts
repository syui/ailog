/**
 * OAuth dynamic endpoint handlers
 */
import { OAuthKeyManager, generateClientMetadata } from './oauth-keys';

export class OAuthEndpointHandler {
  /**
   * Initialize OAuth endpoint handlers
   */
  static init() {
    // Intercept requests to client-metadata.json
    this.setupClientMetadataHandler();
    
    // Intercept requests to .well-known/jwks.json
    this.setupJWKSHandler();
  }

  private static setupClientMetadataHandler() {
    // Override fetch for client-metadata.json requests
    const originalFetch = window.fetch;
    
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      
      // Only intercept local OAuth endpoints
      try {
        const urlObj = new URL(url, window.location.origin);
        
        // Only intercept requests to the same origin
        if (urlObj.origin !== window.location.origin) {
          // Pass through external API calls unchanged
          return originalFetch(input, init);
        }
        
        // Handle local OAuth endpoints
        if (urlObj.pathname.endsWith('/client-metadata.json')) {
          const metadata = generateClientMetadata();
          return new Response(JSON.stringify(metadata, null, 2), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        if (urlObj.pathname.endsWith('/.well-known/jwks.json')) {
          try {
            const jwks = await OAuthKeyManager.getJWKS();
            return new Response(JSON.stringify(jwks, null, 2), {
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          } catch (error) {
            return new Response(JSON.stringify({ error: 'Failed to generate JWKS' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (e) {
        // If URL parsing fails, pass through to original fetch
      }
      
      // Pass through all other requests
      return originalFetch(input, init);
    };
  }

  private static setupJWKSHandler() {
    // This is handled in the fetch override above
  }

  /**
   * Generate a proper client assertion JWT for token requests
   */
  static async generateClientAssertion(tokenEndpoint: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const clientId = generateClientMetadata().client_id;

    const header = {
      alg: 'ES256',
      typ: 'JWT',
      kid: 'ai-card-oauth-key-1'
    };

    const payload = {
      iss: clientId,
      sub: clientId,
      aud: tokenEndpoint,
      iat: now,
      exp: now + 300, // 5 minutes
      jti: crypto.randomUUID()
    };

    return await OAuthKeyManager.signJWT(header, payload);
  }
}

/**
 * Service Worker alternative for intercepting requests
 * (This is a more robust solution for production)
 */
export function registerOAuthServiceWorker() {
  if ('serviceWorker' in navigator) {
    const swCode = `
      self.addEventListener('fetch', (event) => {
        const url = new URL(event.request.url);
        
        if (url.pathname.endsWith('/client-metadata.json')) {
          event.respondWith(
            new Response(JSON.stringify({
              client_id: url.origin + '/client-metadata.json',
              client_name: 'ai.card',
              client_uri: url.origin,
              redirect_uris: [url.origin + '/oauth/callback'],
              response_types: ['code'],
              grant_types: ['authorization_code', 'refresh_token'],
              token_endpoint_auth_method: 'private_key_jwt',
              scope: 'atproto transition:generic',
              subject_type: 'public',
              application_type: 'web',
              dpop_bound_access_tokens: true,
              jwks_uri: url.origin + '/.well-known/jwks.json'
            }, null, 2), {
              headers: { 'Content-Type': 'application/json' }
            })
          );
        }
      });
    `;
    
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    
  }
}