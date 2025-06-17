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
  private oauthClientSyuIs: BrowserOAuthClient | null = null;
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
      // Generate client ID based on current origin
      const clientId = this.getClientId();

      // Initialize both OAuth clients
      this.oauthClient = await BrowserOAuthClient.load({
        clientId: clientId,
        handleResolver: 'https://bsky.social',
        plcDirectoryUrl: 'https://plc.directory',
      });

      this.oauthClientSyuIs = await BrowserOAuthClient.load({
        clientId: clientId,
        handleResolver: 'https://syu.is',
        plcDirectoryUrl: 'https://plc.syu.is',
      });
      
      // Try to restore existing session from either client
      let result = await this.oauthClient.init();
      if (!result?.session) {
        result = await this.oauthClientSyuIs.init();
      }
      if (result?.session) {
        
        // Create Agent instance with proper configuration

        
        // Delete the old agent initialization code - we'll create it properly below
        
        // Set the session after creating the agent
        // The session object from BrowserOAuthClient appears to be a special object



        
        // Try to iterate over the session object
        if (result.session) {

          for (const key in result.session) {

          }
          
          // Check if session has methods
          const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(result.session));

        }
        
        // BrowserOAuthClient might return a Session object that needs to be used with the agent
        // Let's try to use the session object directly with the agent
        if (result.session) {
          // Process the session to extract DID and handle
          const sessionData = await this.processSession(result.session);

        }
        
      } else {

      }
      
    } catch (error) {

      this.initializePromise = null; // Reset on error to allow retry
      throw error;
    }
  }

  private async processSession(session: any): Promise<{ did: string; handle: string }> {
    const did = session.sub || session.did;
    let handle = session.handle || 'unknown';
    
    // Create Agent directly with session (per official docs)
    try {
      this.agent = new Agent(session);
    } catch (err) {
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

      
      // Method 1: Try using the agent to get profile
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        const profile = await this.agent.getProfile({ actor: did });
        if (profile.data.handle) {
          handle = profile.data.handle;
          (this as any)._sessionInfo.handle = handle;

          return { did, handle };
        }
      } catch (err) {

      }
      
      // Method 2: Try using describeRepo
      try {
        const repoDesc = await this.agent.com.atproto.repo.describeRepo({
          repo: did
        });
        if (repoDesc.data.handle) {
          handle = repoDesc.data.handle;
          (this as any)._sessionInfo.handle = handle;

          return { did, handle };
        }
      } catch (err) {

      }
      
      // Method 3: Fallback for admin DID
      const adminDid = import.meta.env.VITE_ADMIN_DID;
      if (did === adminDid) {
        const appHost = import.meta.env.VITE_APP_HOST || 'https://syui.ai';
        handle = new URL(appHost).hostname;
        (this as any)._sessionInfo.handle = handle;

      }
    }
    
    return { did, handle };
  }

  private getClientId(): string {
    // Use environment variable if available
    const envClientId = import.meta.env.VITE_OAUTH_CLIENT_ID;
    if (envClientId) {

      return envClientId;
    }
    
    const origin = window.location.origin;
    
    // For localhost development, use undefined for loopback client
    // The BrowserOAuthClient will handle this automatically
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {

      return undefined as any; // Loopback client
    }
    
    // Default: use origin-based client metadata
    return `${origin}/client-metadata.json`;
  }


  async initiateOAuthFlow(handle?: string): Promise<void> {
    try {
      if (!this.oauthClient || !this.oauthClientSyuIs) {
        await this.initialize();
      }

      if (!this.oauthClient || !this.oauthClientSyuIs) {
        throw new Error('Failed to initialize OAuth clients');
      }

      // If handle is not provided, prompt user
      if (!handle) {
        handle = prompt('ハンドルを入力してください (例: user.bsky.social または user.syu.is):');
        if (!handle) {
          throw new Error('Handle is required for authentication');
        }
      }

      // Determine which OAuth client to use
      const allowedHandlesStr = import.meta.env.VITE_ATPROTO_HANDLE_LIST || '[]';
      let allowedHandles: string[] = [];
      try {
        allowedHandles = JSON.parse(allowedHandlesStr);
      } catch {
        allowedHandles = [];
      }
      
      const usesSyuIs = handle.endsWith('.syu.is') || allowedHandles.includes(handle);
      const oauthClient = usesSyuIs ? this.oauthClientSyuIs : this.oauthClient;

      // Start OAuth authorization flow
      const authUrl = await oauthClient.authorize(handle, {
        scope: 'atproto transition:generic',
      });
      
      // Redirect to authorization server
      window.location.href = authUrl.toString();
      
    } catch (error) {
      throw new Error(`OAuth認証の開始に失敗しました: ${error}`);
    }
  }

  async handleOAuthCallback(): Promise<{ did: string; handle: string } | null> {
    try {




      
      // BrowserOAuthClient should automatically handle the callback
      // We just need to initialize it and it will process the current URL
      if (!this.oauthClient) {

        await this.initialize();
      }

      if (!this.oauthClient) {
        throw new Error('Failed to initialize OAuth client');
      }


      
      // Call init() again to process the callback URL
      const result = await this.oauthClient.init();

      
      if (result?.session) {
        // Process the session
        return this.processSession(result.session);
      }
      
      // If no session yet, wait a bit and try again

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to check session again
      const sessionCheck = await this.checkSession();
      if (sessionCheck) {

        return sessionCheck;
      }
      

      return null;
      
    } catch (error) {

      throw new Error(`OAuth認証の完了に失敗しました: ${error.message}`);
    }
  }

  async checkSession(): Promise<{ did: string; handle: string } | null> {
    try {
      if (!this.oauthClient) {
        await this.initialize();
      }

      if (!this.oauthClient) {
        return null;
      }

      const result = await this.oauthClient.init();
      
      if (result?.session) {
        // Use the common session processing method
        return this.processSession(result.session);
      }
      
      return null;
    } catch (error) {

      return null;
    }
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  getSession(): AtprotoSession | null {

    
    // First check if we have an agent with session
    if (this.agent?.session) {
      const session = {
        did: this.agent.session.did,
        handle: this.agent.session.handle || 'unknown',
        accessJwt: this.agent.session.accessJwt || '',
        refreshJwt: this.agent.session.refreshJwt || '',
      };

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

      return session;
    }
    

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
      // Clear Agent
      this.agent = null;
      
      // Clear BrowserOAuthClient session
      if (this.oauthClient) {
        try {
          // BrowserOAuthClient may have a revoke or signOut method
          if (typeof (this.oauthClient as any).signOut === 'function') {
            await (this.oauthClient as any).signOut();
          } else if (typeof (this.oauthClient as any).revoke === 'function') {
            await (this.oauthClient as any).revoke();
          }
        } catch (oauthError) {
          // Ignore logout errors
        }
        
        // Reset the OAuth client to force re-initialization
        this.oauthClient = null;
        this.initializePromise = null;
      }
      
      // Clear any stored session data
      localStorage.removeItem('atproto_session');
      sessionStorage.clear();
      
      // Clear all OAuth-related storage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('oauth') || key.includes('atproto') || key.includes('session'))) {
          localStorage.removeItem(key);
        }
      }
      
      // Clear internal session info
      (this as any)._sessionInfo = null;
      

      
      // Force page reload to ensure clean state
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {

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


      // Use Agent's com.atproto.repo.putRecord method
      const response = await this.agent.com.atproto.repo.putRecord({
        repo: did,
        collection: collection,
        rkey: rkey,
        record: record
      });


    } catch (error) {

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


      
      // Ensure we have a fresh agent
      if (!this.agent) {
        throw new Error('Agentが初期化されていません。');
      }
      
      const response = await this.agent.com.atproto.repo.getRecord({
        repo: did,
        collection: 'ai.card.box',
        rkey: 'self'
      });


      
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


      
      // Ensure we have a fresh agent
      if (!this.agent) {
        throw new Error('Agentが初期化されていません。');
      }
      
      const response = await this.agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: 'ai.card.box',
        rkey: 'self'
      });


    } catch (error) {

      throw error;
    }
  }

  // 手動でトークンを設定（開発・デバッグ用）
  setManualTokens(accessJwt: string, refreshJwt: string): void {


    
    // For backward compatibility, store in localStorage
    const adminDid = import.meta.env.VITE_ADMIN_DID || 'did:plc:unknown';
    const appHost = import.meta.env.VITE_APP_HOST || 'https://example.com';
    const session: AtprotoSession = {
      did: adminDid,
      handle: new URL(appHost).hostname,
      accessJwt: accessJwt,
      refreshJwt: refreshJwt
    };
    
    localStorage.setItem('atproto_session', JSON.stringify(session));

  }

  // 後方互換性のための従来関数
  saveSessionToStorage(session: AtprotoSession): void {

    localStorage.setItem('atproto_session', JSON.stringify(session));
  }

  async backupUserCards(userCards: any[]): Promise<void> {
    return this.saveCardToBox(userCards);
  }
}

export const atprotoOAuthService = new AtprotoOAuthService();
export type { AtprotoSession };
