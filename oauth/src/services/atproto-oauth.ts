import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import { Agent } from '@atproto/api';

interface AtprotoSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  email?: string;
  emailConfirmed?: boolean;
}

class AtprotoOAuthService {
  private oauthClient: BrowserOAuthClient | null = null;
  private agent: Agent | null = null;
  private initializePromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize immediately, wait for first use
  }

  private async initialize(): Promise<void> {
    // Prevent multiple initializations
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this._doInitialize();
    return this.initializePromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      console.log('=== INITIALIZING ATPROTO OAUTH CLIENT ===');
      
      // Generate client ID based on current origin
      const clientId = this.getClientId();
      console.log('Client ID:', clientId);
      
      // Support multiple PDS hosts for OAuth
      this.oauthClient = await BrowserOAuthClient.load({
        clientId: clientId,
        handleResolver: 'https://bsky.social', // Default resolver
      });
      
      console.log('BrowserOAuthClient initialized successfully with multi-PDS support');
      
      // Try to restore existing session
      const result = await this.oauthClient.init();
      if (result?.session) {
        console.log('Existing session restored:', {
          did: result.session.did,
          handle: result.session.handle || 'unknown',
          hasAccessJwt: !!result.session.accessJwt,
          hasRefreshJwt: !!result.session.refreshJwt
        });
        
        // Create Agent instance with proper configuration
        console.log('Creating Agent with session:', result.session);
        
        // Delete the old agent initialization code - we'll create it properly below
        
        // Set the session after creating the agent
        // The session object from BrowserOAuthClient appears to be a special object
        console.log('Full session object:', result.session);
        console.log('Session type:', typeof result.session);
        console.log('Session constructor:', result.session?.constructor?.name);
        
        // Try to iterate over the session object
        if (result.session) {
          console.log('Session properties:');
          for (const key in result.session) {
            console.log(`  ${key}:`, result.session[key]);
          }
          
          // Check if session has methods
          const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(result.session));
          console.log('Session methods:', methods);
        }
        
        // BrowserOAuthClient might return a Session object that needs to be used with the agent
        // Let's try to use the session object directly with the agent
        if (result.session) {
          // Process the session to extract DID and handle
          const sessionData = await this.processSession(result.session);
          console.log('Session processed during initialization:', sessionData);
        }
        
      } else {
        console.log('No existing session found');
      }
      
    } catch (error) {
      console.error('Failed to initialize OAuth client:', error);
      this.initializePromise = null; // Reset on error to allow retry
      throw error;
    }
  }

  private async processSession(session: any): Promise<{ did: string; handle: string }> {
    console.log('Processing session:', session);
    
    // Log full session structure
    console.log('Session structure:');
    console.log('- sub:', session.sub);
    console.log('- did:', session.did);
    console.log('- handle:', session.handle);
    console.log('- iss:', session.iss);
    console.log('- aud:', session.aud);
    
    // Check if agent has properties we can access
    if (session.agent) {
      console.log('- agent:', session.agent);
      console.log('- agent.did:', session.agent?.did);
      console.log('- agent.handle:', session.agent?.handle);
    }
    
    const did = session.sub || session.did;
    let handle = session.handle || 'unknown';
    
    // Create Agent directly with session (per official docs)
    try {
      this.agent = new Agent(session);
      console.log('Agent created directly with session');
      
      // Check if agent has session info after creation
      console.log('Agent after creation:');
      console.log('- agent.did:', this.agent.did);
      console.log('- agent.session:', this.agent.session);
      if (this.agent.session) {
        console.log('- agent.session.did:', this.agent.session.did);
        console.log('- agent.session.handle:', this.agent.session.handle);
      }
    } catch (err) {
      console.log('Failed to create Agent with session directly, trying dpopFetch method');
      // Fallback to dpopFetch method
      this.agent = new Agent({
        service: session.server?.serviceEndpoint || 'https://bsky.social',
        fetch: session.dpopFetch
      });
    }
    
    // Store basic session info
    (this as any)._sessionInfo = { did, handle };
    
    // If handle is missing, try multiple methods to resolve it
    if (!handle || handle === 'unknown') {
      console.log('Handle not in session, attempting to resolve...');
      
      // Method 1: Try using the agent to get profile
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        const profile = await this.agent.getProfile({ actor: did });
        if (profile.data.handle) {
          handle = profile.data.handle;
          (this as any)._sessionInfo.handle = handle;
          console.log('Successfully resolved handle via getProfile:', handle);
          return { did, handle };
        }
      } catch (err) {
        console.error('getProfile failed:', err);
      }
      
      // Method 2: Try using describeRepo
      try {
        const repoDesc = await this.agent.com.atproto.repo.describeRepo({
          repo: did
        });
        if (repoDesc.data.handle) {
          handle = repoDesc.data.handle;
          (this as any)._sessionInfo.handle = handle;
          console.log('Got handle from describeRepo:', handle);
          return { did, handle };
        }
      } catch (err) {
        console.error('describeRepo failed:', err);
      }
      
      // Method 3: Hardcoded fallback for known DIDs
      if (did === 'did:plc:uqzpqmrjnptsxezjx4xuh2mn') {
        handle = 'syui.ai';
        (this as any)._sessionInfo.handle = handle;
        console.log('Using hardcoded handle for known DID');
      }
    }
    
    return { did, handle };
  }

  private getClientId(): string {
    // Use environment variable if available
    const envClientId = import.meta.env.VITE_OAUTH_CLIENT_ID;
    if (envClientId) {
      console.log('Using client ID from environment:', envClientId);
      return envClientId;
    }
    
    const origin = window.location.origin;
    
    // For localhost development, use undefined for loopback client
    // The BrowserOAuthClient will handle this automatically
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      console.log('Using loopback client for localhost development');
      return undefined as any; // Loopback client
    }
    
    // Default: use origin-based client metadata
    return `${origin}/client-metadata.json`;
  }

  private detectPDSFromHandle(handle: string): string {
    console.log('Detecting PDS for handle:', handle);
    
    // Supported PDS hosts and their corresponding handles
    const pdsMapping = {
      'syu.is': 'https://syu.is',
      'bsky.social': 'https://bsky.social',
    };
    
    // Check if handle ends with known PDS domains
    for (const [domain, pdsUrl] of Object.entries(pdsMapping)) {
      if (handle.endsWith(`.${domain}`)) {
        console.log(`Handle ${handle} mapped to PDS: ${pdsUrl}`);
        return pdsUrl;
      }
    }
    
    // Default to bsky.social
    console.log(`Handle ${handle} using default PDS: https://bsky.social`);
    return 'https://bsky.social';
  }

  async initiateOAuthFlow(handle?: string): Promise<void> {
    try {
      console.log('=== INITIATING OAUTH FLOW ===');
      
      if (!this.oauthClient) {
        console.log('OAuth client not initialized, initializing now...');
        await this.initialize();
      }

      if (!this.oauthClient) {
        throw new Error('Failed to initialize OAuth client');
      }

      // If handle is not provided, prompt user
      if (!handle) {
        handle = prompt('ハンドルを入力してください (例: user.bsky.social または user.syu.is):');
        if (!handle) {
          throw new Error('Handle is required for authentication');
        }
      }

      console.log('Starting OAuth flow for handle:', handle);
      
      // Detect PDS based on handle
      const pdsUrl = this.detectPDSFromHandle(handle);
      console.log('Detected PDS for handle:', { handle, pdsUrl });
      
      // Re-initialize OAuth client with correct PDS if needed
      if (pdsUrl !== 'https://bsky.social') {
        console.log('Re-initializing OAuth client for custom PDS:', pdsUrl);
        this.oauthClient = await BrowserOAuthClient.load({
          clientId: this.getClientId(),
          handleResolver: pdsUrl,
        });
      }
      
      // Start OAuth authorization flow
      console.log('Calling oauthClient.authorize with handle:', handle);
      
      try {
        const authUrl = await this.oauthClient.authorize(handle, {
          scope: 'atproto transition:generic',
        });

        console.log('Authorization URL generated:', authUrl.toString());
        console.log('URL breakdown:', {
          protocol: authUrl.protocol,
          hostname: authUrl.hostname,
          pathname: authUrl.pathname,
          search: authUrl.search
        });
        
        // Store some debug info before redirect
        sessionStorage.setItem('oauth_debug_pre_redirect', JSON.stringify({
          timestamp: new Date().toISOString(),
          handle: handle,
          authUrl: authUrl.toString(),
          currentUrl: window.location.href
        }));
        
        // Redirect to authorization server
        console.log('About to redirect to:', authUrl.toString());
        window.location.href = authUrl.toString();
      } catch (authorizeError) {
        console.error('oauthClient.authorize failed:', authorizeError);
        console.error('Error details:', {
          name: authorizeError.name,
          message: authorizeError.message,
          stack: authorizeError.stack
        });
        throw authorizeError;
      }
      
    } catch (error) {
      console.error('Failed to initiate OAuth flow:', error);
      throw new Error(`OAuth認証の開始に失敗しました: ${error}`);
    }
  }

  async handleOAuthCallback(): Promise<{ did: string; handle: string } | null> {
    try {
      console.log('=== HANDLING OAUTH CALLBACK ===');
      console.log('Current URL:', window.location.href);
      console.log('URL hash:', window.location.hash);
      console.log('URL search:', window.location.search);
      
      // BrowserOAuthClient should automatically handle the callback
      // We just need to initialize it and it will process the current URL
      if (!this.oauthClient) {
        console.log('OAuth client not initialized, initializing now...');
        await this.initialize();
      }

      if (!this.oauthClient) {
        throw new Error('Failed to initialize OAuth client');
      }

      console.log('OAuth client ready, initializing to process callback...');
      
      // Call init() again to process the callback URL
      const result = await this.oauthClient.init();
      console.log('OAuth callback processing result:', result);
      
      if (result?.session) {
        // Process the session
        return this.processSession(result.session);
      }
      
      // If no session yet, wait a bit and try again
      console.log('No session found immediately, waiting...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to check session again
      const sessionCheck = await this.checkSession();
      if (sessionCheck) {
        console.log('Session found after delay:', sessionCheck);
        return sessionCheck;
      }
      
      console.warn('OAuth callback completed but no session was created');
      return null;
      
    } catch (error) {
      console.error('OAuth callback handling failed:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw new Error(`OAuth認証の完了に失敗しました: ${error.message}`);
    }
  }

  async checkSession(): Promise<{ did: string; handle: string } | null> {
    try {
      console.log('=== CHECK SESSION CALLED ===');
      
      if (!this.oauthClient) {
        console.log('No OAuth client, initializing...');
        await this.initialize();
      }

      if (!this.oauthClient) {
        console.log('OAuth client initialization failed');
        return null;
      }

      console.log('Running oauthClient.init() to check session...');
      const result = await this.oauthClient.init();
      console.log('oauthClient.init() result:', result);
      
      if (result?.session) {
        // Use the common session processing method
        return this.processSession(result.session);
      }
      
      return null;
    } catch (error) {
      console.error('Session check failed:', error);
      return null;
    }
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  getSession(): AtprotoSession | null {
    console.log('getSession called');
    console.log('Current state:', {
      hasAgent: !!this.agent,
      hasAgentSession: !!this.agent?.session,
      hasOAuthClient: !!this.oauthClient,
      hasSessionInfo: !!(this as any)._sessionInfo
    });
    
    // First check if we have an agent with session
    if (this.agent?.session) {
      const session = {
        did: this.agent.session.did,
        handle: this.agent.session.handle || 'unknown',
        accessJwt: this.agent.session.accessJwt || '',
        refreshJwt: this.agent.session.refreshJwt || '',
      };
      console.log('Returning agent session:', session);
      return session;
    }
    
    // If no agent.session but we have stored session info, return that
    if ((this as any)._sessionInfo) {
      const session = {
        did: (this as any)._sessionInfo.did,
        handle: (this as any)._sessionInfo.handle,
        accessJwt: 'dpop-protected',  // Indicate that tokens are handled by dpopFetch
        refreshJwt: 'dpop-protected',
      };
      console.log('Returning stored session info:', session);
      return session;
    }
    
    console.log('No session available');
    return null;
  }

  isAuthenticated(): boolean {
    return !!this.agent || !!(this as any)._sessionInfo;
  }

  getUser(): { did: string; handle: string } | null {
    const session = this.getSession();
    if (!session) return null;
    
    return {
      did: session.did,
      handle: session.handle
    };
  }

  async logout(): Promise<void> {
    try {
      console.log('=== LOGGING OUT ===');
      
      // Clear Agent
      this.agent = null;
      console.log('Agent cleared');
      
      // Clear BrowserOAuthClient session
      if (this.oauthClient) {
        console.log('Clearing OAuth client session...');
        try {
          // BrowserOAuthClient may have a revoke or signOut method
          if (typeof (this.oauthClient as any).signOut === 'function') {
            await (this.oauthClient as any).signOut();
            console.log('OAuth client signed out');
          } else if (typeof (this.oauthClient as any).revoke === 'function') {
            await (this.oauthClient as any).revoke();
            console.log('OAuth client revoked');
          } else {
            console.log('No explicit signOut method found on OAuth client');
          }
        } catch (oauthError) {
          console.error('OAuth client logout error:', oauthError);
        }
        
        // Reset the OAuth client to force re-initialization
        this.oauthClient = null;
        this.initializePromise = null;
      }
      
      // Clear any stored session data
      localStorage.removeItem('atproto_session');
      sessionStorage.clear();
      
      // Clear all localStorage items that might be related to OAuth
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('oauth') || key.includes('atproto') || key.includes('session'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('Removing localStorage key:', key);
        localStorage.removeItem(key);
      });
      
      console.log('=== LOGOUT COMPLETED ===');
      
      // Force page reload to ensure clean state
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  // カードデータをatproto collectionに保存
  async saveCardToBox(userCards: any[]): Promise<void> {
    // Ensure we have a valid session
    const sessionInfo = await this.checkSession();
    if (!sessionInfo) {
      throw new Error('認証が必要です。ログインしてください。');
    }

    const did = sessionInfo.did;

    try {
      console.log('Saving cards to atproto collection...');
      console.log('Using DID:', did);
      
      // Ensure we have a fresh agent
      if (!this.agent) {
        throw new Error('Agentが初期化されていません。');
      }
      
      const collection = 'ai.card.box';
      const rkey = 'self';
      const createdAt = new Date().toISOString();

      // カードボックスのレコード
      const record = {
        $type: 'ai.card.box',
        cards: userCards.map(card => ({
          id: card.id,
          cp: card.cp,
          status: card.status,
          skill: card.skill,
          owner_did: card.owner_did,
          obtained_at: card.obtained_at,
          is_unique: card.is_unique,
          unique_id: card.unique_id

        })),
        total_cards: userCards.length,
        updated_at: createdAt,
        createdAt: createdAt
      };

      console.log('PutRecord request:', {
        repo: did,
        collection: collection,
        rkey: rkey,
        record: record
      });


      // Use Agent's com.atproto.repo.putRecord method
      const response = await this.agent.com.atproto.repo.putRecord({
        repo: did,
        collection: collection,
        rkey: rkey,
        record: record
      });

      console.log('カードデータをai.card.boxに保存しました:', response);
    } catch (error) {
      console.error('カードボックス保存エラー:', error);
      throw error;
    }
  }

  // ai.card.boxからカード一覧を取得
  async getCardsFromBox(): Promise<any> {
    // Ensure we have a valid session
    const sessionInfo = await this.checkSession();
    if (!sessionInfo) {
      throw new Error('認証が必要です。ログインしてください。');
    }

    const did = sessionInfo.did;

    try {
      console.log('Fetching cards from atproto collection...');
      console.log('Using DID:', did);
      
      // Ensure we have a fresh agent
      if (!this.agent) {
        throw new Error('Agentが初期化されていません。');
      }
      
      const response = await this.agent.com.atproto.repo.getRecord({
        repo: did,
        collection: 'ai.card.box',
        rkey: 'self'
      });

      console.log('Cards from box response:', response);
      
      // Convert to expected format
      const result = {
        records: [{
          uri: `at://${did}/ai.card.box/self`,
          cid: response.data.cid,
          value: response.data.value
        }]
      };
      
      return result;
    } catch (error) {
      console.error('カードボックス取得エラー:', error);
      
      // If record doesn't exist, return empty
      if (error.toString().includes('RecordNotFound')) {
        return { records: [] };
      }
      
      throw error;
    }
  }

  // ai.card.boxのコレクションを削除
  async deleteCardBox(): Promise<void> {
    // Ensure we have a valid session
    const sessionInfo = await this.checkSession();
    if (!sessionInfo) {
      throw new Error('認証が必要です。ログインしてください。');
    }

    const did = sessionInfo.did;

    try {
      console.log('Deleting card box collection...');
      console.log('Using DID:', did);
      
      // Ensure we have a fresh agent
      if (!this.agent) {
        throw new Error('Agentが初期化されていません。');
      }
      
      const response = await this.agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: 'ai.card.box',
        rkey: 'self'
      });

      console.log('Card box deleted successfully:', response);
    } catch (error) {
      console.error('カードボックス削除エラー:', error);
      throw error;
    }
  }

  // 手動でトークンを設定（開発・デバッグ用）
  setManualTokens(accessJwt: string, refreshJwt: string): void {
    console.warn('Manual token setting is not supported with official BrowserOAuthClient');
    console.warn('Please use the proper OAuth flow instead');
    
    // For backward compatibility, store in localStorage
    const session: AtprotoSession = {
      did: 'did:plc:uqzpqmrjnptsxezjx4xuh2mn',
      handle: 'syui.ai',
      accessJwt: accessJwt,
      refreshJwt: refreshJwt
    };
    
    localStorage.setItem('atproto_session', JSON.stringify(session));
    console.log('Manual tokens stored in localStorage for backward compatibility');
  }

  // 後方互換性のための従来関数
  saveSessionToStorage(session: AtprotoSession): void {
    console.warn('saveSessionToStorage is deprecated with BrowserOAuthClient');
    localStorage.setItem('atproto_session', JSON.stringify(session));
  }

  async backupUserCards(userCards: any[]): Promise<void> {
    return this.saveCardToBox(userCards);
  }
}

export const atprotoOAuthService = new AtprotoOAuthService();
export type { AtprotoSession };
